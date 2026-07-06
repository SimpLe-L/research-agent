import { Inject, Injectable, Logger } from "@nestjs/common";
import type { MemoryEntry, SearchMemoryInput } from "@sp-agent/shared";
import { resolve } from "node:path";
import { MemoryEmbeddingService, type MemoryEmbeddingResult } from "./memory-embedding.service.js";

type LanceDbModule = typeof import("@lancedb/lancedb");
type LanceConnection = Awaited<ReturnType<LanceDbModule["connect"]>>;
type LanceTable = Awaited<ReturnType<LanceConnection["openTable"]>>;

type MemoryVectorRow = {
  id: string;
  vector: number[];
  content: string;
  embeddingProvider: string;
  embeddingModel: string;
  kind: MemoryEntry["kind"];
  scope: MemoryEntry["scope"];
  sessionId: string;
  status: MemoryEntry["status"];
  sensitivity: MemoryEntry["sensitivity"];
  occurredAtMs: number;
  updatedAtMs: number;
};

export type MemoryVectorHit = {
  id: string;
  score: number;
  distance: number;
};

const TABLE_PREFIX = "memory_vectors";

@Injectable()
export class MemoryVectorService {
  private readonly logger = new Logger(MemoryVectorService.name);
  private readonly tablePromises = new Map<string, Promise<LanceTable | undefined>>();

  constructor(@Inject(MemoryEmbeddingService) private readonly embeddingService: MemoryEmbeddingService) {}

  isEnabled() {
    return process.env.MEMORY_VECTOR_PROVIDER === "lancedb";
  }

  getStatus() {
    return {
      vectorProvider: process.env.MEMORY_VECTOR_PROVIDER || "disabled",
      enabled: this.isEnabled(),
      embedding: this.embeddingService.getStatus()
    };
  }

  async upsert(entry: MemoryEntry) {
    if (!this.isEnabled()) return;
    try {
      const embedding = await this.embeddingService.embed(memoryEmbeddingText(entry));
      const table = await this.getTable(embedding);
      if (!table) return;
      await table.delete(`id = '${escapeSqlString(entry.id)}'`);
      if (entry.status === "tombstoned") return;
      await table.add([toVectorRow(entry, embedding)]);
      if (embedding.degradedReason) this.logger.warn(embedding.degradedReason);
    } catch (error) {
      this.logger.warn(error instanceof Error ? error.message : "Memory vector upsert failed.");
    }
  }

  async remove(id: string) {
    if (!this.isEnabled()) return;
    try {
      const tables = await this.openExistingVectorTables();
      await Promise.all(tables.map((table) => table.delete(`id = '${escapeSqlString(id)}'`)));
    } catch (error) {
      this.logger.warn(error instanceof Error ? error.message : "Memory vector remove failed.");
    }
  }

  async search(input: SearchMemoryInput & { kinds?: MemoryEntry["kind"][]; fromMs?: number; toMs?: number; limit?: number }) {
    try {
      if (!this.isEnabled()) return [];
      const embedding = await this.embeddingService.embed(input.query);
      const table = await this.getTable(embedding);
      if (!table) return [];
      const where = buildWhere(input);
      const query = table.search(embedding.vector);
      const rows = await (where ? query.where(where) : query).limit(input.limit ?? 20).toArray() as Array<MemoryVectorRow & { _distance?: number }>;
      if (embedding.degradedReason) this.logger.warn(embedding.degradedReason);
      return rows.map((row) => {
        const distance = Number(row._distance ?? 0);
        return {
          id: row.id,
          distance,
          score: 1 / (1 + Math.max(0, distance))
        };
      });
    } catch (error) {
      this.logger.warn(error instanceof Error ? error.message : "Memory vector search failed.");
      return [];
    }
  }

  private async getTable(embedding: MemoryEmbeddingResult) {
    if (!this.isEnabled()) return undefined;
    const tableName = tableNameForEmbedding(embedding);
    if (!this.tablePromises.has(tableName)) this.tablePromises.set(tableName, this.openTable(tableName, embedding));
    return this.tablePromises.get(tableName);
  }

  private async openTable(tableName: string, embedding: MemoryEmbeddingResult) {
    const lancedb = await import("@lancedb/lancedb");
    const db = await lancedb.connect(lanceDbUri());
    const tableNames = await db.tableNames();
    if (tableNames.includes(tableName)) return db.openTable(tableName);
    return db.createTable(tableName, [emptySeedRow(embedding)]);
  }

  private async openExistingVectorTables() {
    const lancedb = await import("@lancedb/lancedb");
    const db = await lancedb.connect(lanceDbUri());
    const tableNames = (await db.tableNames()).filter((name) => name === TABLE_PREFIX || name.startsWith(`${TABLE_PREFIX}_`));
    return Promise.all(tableNames.map((name) => db.openTable(name)));
  }
}

function lanceDbUri() {
  return resolve(process.env.MEMORY_LANCEDB_URI ?? `${process.env.SP_AGENT_DATA_DIR ?? ".sp-agent-data"}/lancedb`);
}

function toVectorRow(entry: MemoryEntry, embedding: MemoryEmbeddingResult): MemoryVectorRow {
  return {
    id: entry.id,
    vector: embedding.vector,
    content: entry.content,
    embeddingProvider: embedding.provider,
    embeddingModel: embedding.model,
    kind: entry.kind,
    scope: entry.scope,
    sessionId: entry.sessionId ?? "",
    status: entry.status,
    sensitivity: entry.sensitivity,
    occurredAtMs: toTimeMs(entry.occurredAt ?? entry.createdAt),
    updatedAtMs: toTimeMs(entry.updatedAt)
  };
}

function emptySeedRow(embedding: MemoryEmbeddingResult): MemoryVectorRow {
  return {
    id: "__seed__",
    vector: Array.from({ length: embedding.vector.length }, () => 0),
    content: "",
    embeddingProvider: embedding.provider,
    embeddingModel: embedding.model,
    kind: "core",
    scope: "global",
    sessionId: "",
    status: "tombstoned",
    sensitivity: "normal",
    occurredAtMs: 0,
    updatedAtMs: 0
  };
}

function memoryEmbeddingText(entry: MemoryEntry) {
  return [entry.kind, entry.content, entry.tags.join(" "), entry.source.label ?? ""].filter(Boolean).join("\n");
}

function buildWhere(input: SearchMemoryInput & { kinds?: MemoryEntry["kind"][]; fromMs?: number; toMs?: number }) {
  const clauses = [`id != '__seed__'`];
  const statuses = input.statuses ?? ["candidate", "active"];
  clauses.push(`status IN (${statuses.map((status) => `'${escapeSqlString(status)}'`).join(", ")})`);
  if (!input.includeSensitive) clauses.push(`sensitivity != 'sensitive'`);
  if (input.kinds?.length) clauses.push(`kind IN (${input.kinds.map((kind) => `'${escapeSqlString(kind)}'`).join(", ")})`);
  if (input.kind) clauses.push(`kind = '${escapeSqlString(input.kind)}'`);
  if (input.scope) clauses.push(`scope = '${escapeSqlString(input.scope)}'`);
  if (input.sessionId) clauses.push(`(scope = 'global' OR sessionId = '${escapeSqlString(input.sessionId)}')`);
  if (input.fromMs !== undefined) clauses.push(`occurredAtMs >= ${input.fromMs}`);
  if (input.toMs !== undefined) clauses.push(`occurredAtMs <= ${input.toMs}`);
  return clauses.join(" AND ");
}

function escapeSqlString(value: string) {
  return value.replace(/'/g, "''");
}

function toTimeMs(value: string | undefined) {
  const ms = value ? Date.parse(value) : undefined;
  return Number.isFinite(ms) ? ms as number : 0;
}

function tableNameForEmbedding(embedding: MemoryEmbeddingResult) {
  const signature = `${embedding.provider}_${embedding.model}_${embedding.vector.length}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
  return `${TABLE_PREFIX}_${signature}`;
}
