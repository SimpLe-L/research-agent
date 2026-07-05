import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CreateMemoryCandidateInput,
  MemoryAuditEvent,
  MemoryEntry,
  MergeMemoryInput,
  PromoteMemoryInput,
  SearchMemoryInput,
  UpdateMemoryInput
} from "@sp-agent/shared";
import { LocalJsonStore } from "./local-json-store.service.js";

type MemoryFile = {
  memories: MemoryEntry[];
  auditEvents: MemoryAuditEvent[];
};

type ScoredMemory = {
  entry: MemoryEntry;
  score: number;
  matchedTerms: string[];
  rankingSignals: string[];
};

@Injectable()
export class MemoryService {
  constructor(@Inject(LocalJsonStore) private readonly store: LocalJsonStore) {}

  async list() {
    return (await this.readFile()).memories.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async audit(memoryId?: string) {
    const events = (await this.readFile()).auditEvents;
    return (memoryId ? events.filter((event) => event.memoryId === memoryId) : events).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
      status: "candidate",
      supersedes: [],
      conflictsWith: [],
      createdAt: now,
      updatedAt: now
    };
    const file = await this.readFile();
    const conflicts = detectConflicts(entry, file.memories);
    if (conflicts.length > 0) {
      entry.conflictsWith = conflicts.map((conflict) => conflict.id);
      entry.conflictGroupId = `mem_conflict_${crypto.randomUUID()}`;
      entry.conflictReason = "Potential duplicate or source-conflicting memory candidate.";
    }
    file.memories.push(entry);
    file.auditEvents.push(makeAuditEvent(entry.id, "candidate_created", "Created as a memory write candidate."));
    if (conflicts.length > 0) {
      file.auditEvents.push(makeAuditEvent(entry.id, "conflict_detected", entry.conflictReason, entry.conflictsWith));
    }
    await this.writeFile(file);
    return {
      accepted: true,
      memoryId: entry.id,
      memory: entry,
      conflicts
    };
  }

  async promote(id: string, input: PromoteMemoryInput) {
    const file = await this.readFile();
    const entry = findMemory(file, id);
    const now = new Date().toISOString();
    entry.status = "active";
    entry.updatedAt = now;
    entry.promotedAt = now;
    file.auditEvents.push(makeAuditEvent(entry.id, "promoted", input.reason));
    await this.writeFile(file);
    return { memory: entry, auditEvents: file.auditEvents.filter((event) => event.memoryId === entry.id) };
  }

  async update(id: string, input: UpdateMemoryInput) {
    const file = await this.readFile();
    const entry = findMemory(file, id);
    if (input.content !== undefined) entry.content = input.content.trim();
    if (input.confidence !== undefined) entry.confidence = input.confidence;
    if (input.tags !== undefined) entry.tags = input.tags;
    if (input.provenance !== undefined) entry.provenance = { ...entry.provenance, ...input.provenance };
    entry.updatedAt = new Date().toISOString();
    file.auditEvents.push(makeAuditEvent(entry.id, "updated", "Updated memory fields."));
    await this.writeFile(file);
    return { memory: entry, auditEvents: file.auditEvents.filter((event) => event.memoryId === entry.id) };
  }

  async merge(input: MergeMemoryInput) {
    const file = await this.readFile();
    const sourceMemories = input.sourceIds.map((id) => findMemory(file, id));
    const now = new Date().toISOString();
    const entry: MemoryEntry = {
      id: `mem_${crypto.randomUUID()}`,
      scope: sourceMemories.find((memory) => memory.scope === "session")?.scope ?? "global",
      sessionId: sourceMemories.find((memory) => memory.sessionId)?.sessionId,
      content: input.content.trim(),
      source: { type: "system", label: "memory merge" },
      provenance: { reason: input.reason, mergedFrom: input.sourceIds },
      confidence: input.confidence,
      tags: input.tags,
      status: "active",
      supersedes: input.sourceIds,
      conflictsWith: [],
      createdAt: now,
      updatedAt: now,
      promotedAt: now
    };
    for (const source of sourceMemories) {
      source.status = "tombstoned";
      source.updatedAt = now;
      source.tombstonedAt = now;
    }
    file.memories.push(entry);
    file.auditEvents.push(makeAuditEvent(entry.id, "merged", input.reason, input.sourceIds));
    if (sourceMemories.some((memory) => (memory.conflictsWith ?? []).length > 0 || memory.conflictGroupId)) {
      file.auditEvents.push(makeAuditEvent(entry.id, "conflict_resolved", "Merged memory resolves source conflict set.", input.sourceIds));
    }
    for (const sourceId of input.sourceIds) {
      file.auditEvents.push(makeAuditEvent(sourceId, "forgotten", `Superseded by merged memory ${entry.id}.`, [entry.id]));
    }
    await this.writeFile(file);
    return { memory: entry, mergedFrom: input.sourceIds, auditEvents: file.auditEvents.filter((event) => event.memoryId === entry.id) };
  }

  async search(input: SearchMemoryInput) {
    const terms = tokenize(input.query);
    const memories = (await this.readFile()).memories
      .filter((entry) => entry.status !== "tombstoned")
      .filter((entry) => !input.scope || entry.scope === input.scope)
      .filter((entry) => !input.sessionId || entry.scope === "global" || entry.sessionId === input.sessionId)
      .map((entry) => scoreMemory(entry, terms, input.query))
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
    file.auditEvents.push(makeAuditEvent(entry.id, "forgotten", "Tombstoned by forget request."));
    await this.writeFile(file);
    return { memory: entry, auditEvents: file.auditEvents.filter((event) => event.memoryId === entry.id) };
  }

  private async readFile(): Promise<MemoryFile> {
    const file = await this.store.read<MemoryFile>("memory.json", { memories: [], auditEvents: [] });
    return { memories: (file.memories ?? []).map(normalizeMemoryEntry), auditEvents: file.auditEvents ?? [] };
  }

  private async writeFile(file: MemoryFile) {
    await this.store.write("memory.json", file);
  }
}

function normalizeMemoryEntry(entry: MemoryEntry): MemoryEntry {
  return {
    ...entry,
    supersedes: entry.supersedes ?? [],
    conflictsWith: entry.conflictsWith ?? []
  };
}

function findMemory(file: MemoryFile, id: string) {
  const entry = file.memories.find((memory) => memory.id === id);
  if (!entry) throw new NotFoundException(`Memory ${id} not found`);
  return entry;
}

function makeAuditEvent(memoryId: string, action: MemoryAuditEvent["action"], reason?: string, sourceMemoryIds: string[] = []): MemoryAuditEvent {
  return {
    id: `mem_audit_${crypto.randomUUID()}`,
    memoryId,
    action,
    reason,
    sourceMemoryIds,
    createdAt: new Date().toISOString()
  };
}

function scoreMemory(entry: MemoryEntry, terms: string[], query: string): ScoredMemory {
  const haystack = `${entry.content} ${entry.tags.join(" ")} ${entry.source.label ?? ""}`.toLowerCase();
  const content = entry.content.toLowerCase();
  const tags = entry.tags.map((tag) => tag.toLowerCase());
  const sourceLabel = entry.source.label?.toLowerCase() ?? "";
  const normalizedQuery = query.toLowerCase().trim();
  const matchedTerms = terms.filter((term) => haystack.includes(term));
  if (matchedTerms.length === 0) return { entry, score: 0, matchedTerms: [], rankingSignals: [] };

  const rankingSignals: string[] = [];
  let score = 0;

  if (normalizedQuery && content.includes(normalizedQuery)) {
    score += 8;
    rankingSignals.push("exact_phrase");
  }

  for (const term of matchedTerms) {
    const contentHits = countOccurrences(content, term);
    const tagHits = tags.filter((tag) => tag.includes(term)).length;
    const sourceHits = sourceLabel.includes(term) ? 1 : 0;
    if (contentHits > 0) {
      score += Math.min(contentHits, 6) * 2;
      rankingSignals.push("content_match");
    }
    if (tagHits > 0) {
      score += tagHits * 3;
      rankingSignals.push("tag_match");
    }
    if (sourceHits > 0) {
      score += sourceHits;
      rankingSignals.push("source_match");
    }
  }

  if (entry.status === "active") {
    score += 3;
    rankingSignals.push("accepted_fact");
  } else if (entry.status === "candidate") {
    score += 0.5;
    rankingSignals.push("candidate");
  }

  score += entry.confidence * 2;
  const ageMs = Date.now() - Date.parse(entry.updatedAt);
  if (Number.isFinite(ageMs) && ageMs >= 0) {
    score += Math.max(0, 1 - ageMs / (1000 * 60 * 60 * 24 * 30));
    rankingSignals.push("recency");
  }

  return { entry, score: Number(score.toFixed(4)), matchedTerms: Array.from(new Set(matchedTerms)), rankingSignals: Array.from(new Set(rankingSignals)) };
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

function detectConflicts(candidate: MemoryEntry, memories: MemoryEntry[]) {
  const candidateTerms = new Set(tokenize(candidate.content));
  return memories
    .filter((entry) => entry.status !== "tombstoned")
    .filter((entry) => entry.id !== candidate.id)
    .filter((entry) => entry.scope === "global" || candidate.scope === "global" || entry.sessionId === candidate.sessionId)
    .filter((entry) => {
      const contentSimilarity = jaccard(candidateTerms, new Set(tokenize(entry.content)));
      const tagOverlap = candidate.tags.some((tag) => entry.tags.includes(tag));
      const sourceConflict = candidate.source.type !== entry.source.type || (candidate.source.id && entry.source.id && candidate.source.id !== entry.source.id);
      return contentSimilarity >= 0.45 || (tagOverlap && contentSimilarity >= 0.25) || (sourceConflict && contentSimilarity >= 0.3);
    })
    .map((entry) => ({
      id: entry.id,
      status: entry.status,
      content: entry.content,
      source: entry.source,
      confidence: entry.confidence,
      tags: entry.tags
    }));
}

function jaccard(left: Set<string>, right: Set<string>) {
  if (left.size === 0 && right.size === 0) return 0;
  const intersection = [...left].filter((term) => right.has(term)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

function countOccurrences(value: string, term: string) {
  if (!term) return 0;
  let count = 0;
  let index = value.indexOf(term);
  while (index >= 0) {
    count += 1;
    index = value.indexOf(term, index + term.length);
  }
  return count;
}
