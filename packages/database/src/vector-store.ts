import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import * as lancedb from "@lancedb/lancedb";
import type { ResearchReport } from "@sp-agent/shared";

export type VectorHit = {
  reportId: string;
  taskId: string;
  title: string;
  section: string;
  text: string;
  score?: number;
};

type ReportVectorRow = {
  id: string;
  reportId: string;
  taskId: string;
  title: string;
  section: string;
  text: string;
  vector: number[];
  createdAt: string;
};

const tableName = "reports";

export class LanceDbVectorStore {
  constructor(private readonly uri = process.env.LANCEDB_URI ?? ".data/lancedb") {}

  async indexReport(report: ResearchReport, embedding: number[]): Promise<void> {
    const table = await this.getOrCreateReportsTable(embedding.length);
    const id = `report_vec_${report.id}`;
    const row: ReportVectorRow = {
      id,
      reportId: report.id,
      taskId: report.taskId,
      title: report.title,
      section: "full_report",
      text: `${report.title}\n\n${report.summary}\n\n${report.markdown}`.slice(0, 20000),
      vector: embedding,
      createdAt: new Date().toISOString()
    };
    await table.delete(`id = '${escapePredicateValue(id)}'`);
    await table.add([row]);
  }

  async searchReports(embedding: number[], limit = 5): Promise<VectorHit[]> {
    const db = await this.connect();
    const names = await db.tableNames();
    if (!names.includes(tableName)) return [];
    const table = await db.openTable(tableName);
    const rows = (await table.search(embedding).limit(limit).toArray()) as Array<ReportVectorRow & { _distance?: number }>;
    return rows
      .filter((row) => row.id !== "seed" && row.reportId !== "seed")
      .map((row) => ({
        reportId: row.reportId,
        taskId: row.taskId,
        title: row.title,
        section: row.section,
        text: row.text,
        score: typeof row._distance === "number" ? row._distance : undefined
      }));
  }

  async deleteReport(reportId: string): Promise<{ deleted: boolean }> {
    const db = await this.connect();
    const names = await db.tableNames();
    if (!names.includes(tableName)) return { deleted: false };
    const table = await db.openTable(tableName);
    await table.delete(`reportId = '${escapePredicateValue(reportId)}'`);
    return { deleted: true };
  }

  async status(): Promise<{ configured: boolean; reachable: boolean; degradedReason?: string }> {
    try {
      const db = await this.connect();
      await db.tableNames();
      return { configured: true, reachable: true };
    } catch (error) {
      return {
        configured: true,
        reachable: false,
        degradedReason: error instanceof Error ? error.message : "LanceDB status check failed."
      };
    }
  }

  private async connect() {
    const absolute = this.uri.startsWith(".") ? resolve(process.cwd(), this.uri) : this.uri;
    await mkdir(dirname(resolve(absolute, "placeholder")), { recursive: true });
    return lancedb.connect(absolute);
  }

  private async getOrCreateReportsTable(dimensions: number) {
    const db = await this.connect();
    const names = await db.tableNames();
    if (names.includes(tableName)) return db.openTable(tableName);

    return db.createTable(tableName, [
      {
        id: "seed",
        reportId: "seed",
        taskId: "seed",
        title: "seed",
        section: "seed",
        text: "seed",
        vector: Array.from({ length: dimensions }, () => 0),
        createdAt: new Date().toISOString()
      }
    ]);
  }
}

function escapePredicateValue(value: string): string {
  return value.replace(/'/g, "''");
}
