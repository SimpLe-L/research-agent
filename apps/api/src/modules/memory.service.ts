import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateMemoryCandidateInput, MemoryEntry, SearchMemoryInput } from "@sp-agent/shared";
import { LocalJsonStore } from "./local-json-store.service.js";

type MemoryFile = {
  memories: MemoryEntry[];
};

@Injectable()
export class MemoryService {
  constructor(@Inject(LocalJsonStore) private readonly store: LocalJsonStore) {}

  async list() {
    return (await this.readFile()).memories.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createCandidate(input: CreateMemoryCandidateInput) {
    const now = new Date().toISOString();
    const entry: MemoryEntry = {
      id: `mem_${crypto.randomUUID()}`,
      scope: input.scope,
      sessionId: input.sessionId,
      content: input.content.trim(),
      source: input.source,
      provenance: input.provenance,
      confidence: input.confidence,
      tags: input.tags,
      status: "active",
      createdAt: now,
      updatedAt: now
    };
    const file = await this.readFile();
    file.memories.push(entry);
    await this.writeFile(file);
    return {
      accepted: true,
      memoryId: entry.id,
      memory: entry
    };
  }

  async search(input: SearchMemoryInput) {
    const terms = tokenize(input.query);
    const memories = (await this.readFile()).memories
      .filter((entry) => entry.status === "active")
      .filter((entry) => !input.scope || entry.scope === input.scope)
      .filter((entry) => !input.sessionId || entry.scope === "global" || entry.sessionId === input.sessionId)
      .map((entry) => ({ entry, score: scoreMemory(entry, terms) }))
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score || b.entry.updatedAt.localeCompare(a.entry.updatedAt))
      .slice(0, input.limit);
    return { memories };
  }

  async tombstone(id: string) {
    const file = await this.readFile();
    const entry = file.memories.find((memory) => memory.id === id);
    if (!entry) throw new NotFoundException(`Memory ${id} not found`);
    const now = new Date().toISOString();
    entry.status = "tombstoned";
    entry.updatedAt = now;
    entry.tombstonedAt = now;
    await this.writeFile(file);
    return { memory: entry };
  }

  private async readFile(): Promise<MemoryFile> {
    return this.store.read<MemoryFile>("memory.json", { memories: [] });
  }

  private async writeFile(file: MemoryFile) {
    await this.store.write("memory.json", file);
  }
}

function scoreMemory(entry: MemoryEntry, terms: string[]) {
  const haystack = `${entry.content} ${entry.tags.join(" ")} ${entry.source.label ?? ""}`.toLowerCase();
  const matches = terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
  return matches > 0 ? matches + entry.confidence * 0.1 : 0;
}

function tokenize(value: string) {
  const terms = value
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5]+/u)
    .map((term) => term.trim())
    .filter(Boolean);
  const expanded = new Set<string>();
  for (const term of terms.length > 0 ? terms : [value.toLowerCase()]) {
    expanded.add(term);
    if (/[\u4e00-\u9fa5]/u.test(term)) {
      for (let index = 0; index < term.length - 1; index += 1) {
        expanded.add(term.slice(index, index + 2));
      }
    }
  }
  return Array.from(expanded);
}
