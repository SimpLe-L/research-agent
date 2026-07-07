import { Injectable } from "@nestjs/common";
import type {
  ChatMessage,
  CreateMemoryCandidateInput,
  MemoryConsolidationSuggestion,
  MemoryEntry
} from "@sp-agent/shared";

type IntelligenceResult<T> = {
  value: T;
  provider: "deterministic" | "siliconflow";
  degradedReason?: string;
};

type LlmMemoryCandidate = {
  content?: unknown;
  kind?: unknown;
  scope?: unknown;
  confidence?: unknown;
  sensitivity?: unknown;
  tags?: unknown;
  occurredAt?: unknown;
  sourceMessageId?: unknown;
};

const SILICONFLOW_DEFAULT_BASE_URL = "https://api.siliconflow.cn/v1";
const DEFAULT_MEMORY_INTELLIGENCE_MODEL = "deepseek-ai/DeepSeek-V4-Flash";

@Injectable()
export class MemoryIntelligenceService {
  async extractCandidates(messages: ChatMessage[], maxCandidates: number, env: NodeJS.ProcessEnv = process.env): Promise<IntelligenceResult<CreateMemoryCandidateInput[]>> {
    if (selectedProvider(env) === "siliconflow") {
      try {
        return {
          value: await this.extractCandidatesWithSiliconFlow(messages, maxCandidates, env),
          provider: "siliconflow"
        };
      } catch (error) {
        return {
          value: deterministicExtractMemoryCandidates(messages, maxCandidates),
          provider: "deterministic",
          degradedReason: error instanceof Error ? error.message : "SiliconFlow memory extraction failed; using deterministic fallback."
        };
      }
    }

    return {
      value: deterministicExtractMemoryCandidates(messages, maxCandidates),
      provider: "deterministic"
    };
  }

  async summarizeSession(sessionId: string, messages: ChatMessage[], env: NodeJS.ProcessEnv = process.env): Promise<IntelligenceResult<CreateMemoryCandidateInput>> {
    if (selectedProvider(env) === "siliconflow") {
      try {
        return {
          value: await this.summarizeSessionWithSiliconFlow(sessionId, messages, env),
          provider: "siliconflow"
        };
      } catch (error) {
        return {
          value: deterministicSessionSummaryCandidate(sessionId, messages),
          provider: "deterministic",
          degradedReason: error instanceof Error ? error.message : "SiliconFlow memory summarization failed; using deterministic fallback."
        };
      }
    }

    return {
      value: deterministicSessionSummaryCandidate(sessionId, messages),
      provider: "deterministic"
    };
  }

  suggestConsolidations(memories: MemoryEntry[], maxSuggestions: number): IntelligenceResult<MemoryConsolidationSuggestion[]> {
    return {
      value: deterministicConsolidationSuggestions(memories, maxSuggestions),
      provider: "deterministic"
    };
  }

  getStatus(env: NodeJS.ProcessEnv = process.env) {
    const provider = selectedProvider(env);
    if (provider === "deterministic") {
      return { name: "deterministic", configured: true, reachable: true };
    }
    const configured = Boolean(env.SILICONFLOW_API_KEY);
    return {
      name: `siliconflow:${memoryIntelligenceModel(env)}`,
      configured,
      reachable: configured,
      degradedReason: configured ? undefined : "MEMORY_INTELLIGENCE_PROVIDER=siliconflow requires SILICONFLOW_API_KEY."
    };
  }

  private async extractCandidatesWithSiliconFlow(messages: ChatMessage[], maxCandidates: number, env: NodeJS.ProcessEnv) {
    if (!env.SILICONFLOW_API_KEY) throw new Error("MEMORY_INTELLIGENCE_PROVIDER=siliconflow requires SILICONFLOW_API_KEY.");
    const json = await callSiliconFlowJson(env, [
      {
        role: "system",
        content: [
          "Extract durable memory candidates for a local-first personal agent.",
          "Return strict JSON: {\"memories\":[{\"content\":string,\"kind\":\"core|journal|summary|procedural|project\",\"scope\":\"global|session\",\"confidence\":0..1,\"sensitivity\":\"normal|sensitive\",\"tags\":string[],\"occurredAt\"?:string,\"sourceMessageId\"?:string}]}",
          "Prefer stable user preferences/facts as core, project facts as project, events as journal, habits as procedural.",
          "Do not include passwords, secrets, private keys, or raw credentials as content; mark sensitive if the user discussed sensitive material."
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify({
          maxCandidates,
          messages: messages.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            createdAt: message.createdAt,
            metadata: message.metadata
          }))
        })
      }
    ]);
    const parsed = asRecord(json);
    const memories = Array.isArray(parsed.memories) ? parsed.memories : [];
    return memories
      .map((item) => normalizeLlmCandidate(item, messages))
      .filter((item): item is CreateMemoryCandidateInput => Boolean(item))
      .slice(0, maxCandidates);
  }

  private async summarizeSessionWithSiliconFlow(sessionId: string, messages: ChatMessage[], env: NodeJS.ProcessEnv) {
    if (!env.SILICONFLOW_API_KEY) throw new Error("MEMORY_INTELLIGENCE_PROVIDER=siliconflow requires SILICONFLOW_API_KEY.");
    const json = await callSiliconFlowJson(env, [
      {
        role: "system",
        content: "Summarize this chat session into one inspectable memory summary candidate. Return strict JSON: {\"content\":string,\"tags\":string[],\"confidence\":0..1,\"occurredAt\"?:string}. Keep it concise, factual, and auditable."
      },
      {
        role: "user",
        content: JSON.stringify({
          sessionId,
          messages: messages.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            createdAt: message.createdAt,
            metadata: message.metadata
          }))
        })
      }
    ]);
    const parsed = asRecord(json);
    const content = typeof parsed.content === "string" ? parsed.content.trim() : "";
    if (!content) throw new Error("SiliconFlow memory summarizer returned an empty summary.");
    return {
      content,
      kind: "summary",
      scope: "session",
      sessionId,
      source: { type: "system", id: sessionId, label: "session summary" },
      provenance: {
        sessionId,
        messageCount: messages.length,
        summarizedBy: "siliconflow_memory_summarizer",
        sourceMessageIds: messages.map((message) => message.id)
      },
      confidence: clampConfidence(parsed.confidence, 0.72),
      sensitivity: "normal",
      occurredAt: typeof parsed.occurredAt === "string" ? parsed.occurredAt : messages.at(-1)?.createdAt,
      tags: normalizeTags(parsed.tags, ["summary", "session", "llm"])
    } satisfies CreateMemoryCandidateInput;
  }
}

function selectedProvider(env: NodeJS.ProcessEnv): "deterministic" | "siliconflow" {
  const selected = env.MEMORY_INTELLIGENCE_PROVIDER?.trim().toLowerCase();
  return selected === "siliconflow" ? "siliconflow" : "deterministic";
}

function memoryIntelligenceModel(env: NodeJS.ProcessEnv) {
  return env.MEMORY_INTELLIGENCE_MODEL || env.PI_MODEL_ID || env.PI_SILICONFLOW_MODEL || DEFAULT_MEMORY_INTELLIGENCE_MODEL;
}

async function callSiliconFlowJson(env: NodeJS.ProcessEnv, messages: Array<{ role: "system" | "user"; content: string }>) {
  const baseUrl = (env.SILICONFLOW_BASE_URL || SILICONFLOW_DEFAULT_BASE_URL).replace(/\/+$/u, "");
  const timeoutMs = Number(env.MEMORY_INTELLIGENCE_TIMEOUT_MS ?? 45_000);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.SILICONFLOW_API_KEY ?? ""}`
    },
    body: JSON.stringify({
      model: memoryIntelligenceModel(env),
      messages,
      temperature: 0.1,
      response_format: { type: "json_object" }
    }),
    signal: AbortSignal.timeout(Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 45_000)
  });
  if (!response.ok) throw new Error(`SiliconFlow memory intelligence returned HTTP ${response.status}: ${await response.text()}`);
  const json = await response.json() as Record<string, unknown>;
  const content = (((json.choices as unknown[])?.[0] as Record<string, unknown> | undefined)?.message as Record<string, unknown> | undefined)?.content;
  if (typeof content !== "string") throw new Error("SiliconFlow memory intelligence response did not include message content.");
  return JSON.parse(content) as unknown;
}

function normalizeLlmCandidate(item: unknown, messages: ChatMessage[]): CreateMemoryCandidateInput | undefined {
  const raw = item as LlmMemoryCandidate;
  if (typeof raw.content !== "string" || raw.content.trim().length < 8) return undefined;
  const sourceMessage = typeof raw.sourceMessageId === "string"
    ? messages.find((message) => message.id === raw.sourceMessageId)
    : messages.find((message) => raw.content && typeof raw.content === "string" && message.content.includes(raw.content.slice(0, 24)));
  return {
    content: normalizeMemoryCandidateContent(raw.content) ?? raw.content.trim(),
    kind: normalizeKind(raw.kind),
    scope: raw.scope === "global" ? "global" : "session",
    sessionId: sourceMessage?.sessionId ?? messages[0]?.sessionId,
    source: {
      type: sourceMessage?.metadata?.source === "voice" ? "voice" : sourceMessage?.role === "assistant" ? "assistant" : "user",
      id: sourceMessage?.id,
      label: sourceMessage?.metadata?.source === "voice" ? "voice transcript" : sourceMessage ? `chat ${sourceMessage.role}` : "chat session"
    },
    provenance: {
      sessionId: sourceMessage?.sessionId ?? messages[0]?.sessionId,
      messageId: sourceMessage?.id,
      role: sourceMessage?.role,
      extractedBy: "siliconflow_memory_extractor",
      sttProvider: typeof sourceMessage?.metadata?.sttProvider === "string" ? sourceMessage.metadata.sttProvider : undefined,
      audioPersisted: sourceMessage?.metadata?.source === "voice" ? false : undefined
    },
    confidence: clampConfidence(raw.confidence, 0.72),
    sensitivity: raw.sensitivity === "sensitive" ? "sensitive" : "normal",
    occurredAt: typeof raw.occurredAt === "string" ? raw.occurredAt : sourceMessage?.createdAt,
    tags: normalizeTags(raw.tags, ["extracted", "llm"])
  };
}

function deterministicExtractMemoryCandidates(messages: ChatMessage[], maxCandidates: number): CreateMemoryCandidateInput[] {
  const candidates: CreateMemoryCandidateInput[] = [];
  const seen = new Set<string>();
  for (const message of messages) {
    if (candidates.length >= maxCandidates) break;
    const content = normalizeMemoryCandidateContent(message.content);
    if (!content || seen.has(content)) continue;
    seen.add(content);
    candidates.push({
      content,
      ...classifyMemoryCandidate(message),
      sessionId: message.sessionId,
      source: {
        type: message.metadata?.source === "voice" ? "voice" : message.role === "assistant" ? "assistant" : "user",
        id: message.id,
        label: message.metadata?.source === "voice" ? "voice transcript" : `chat ${message.role}`
      },
      provenance: {
        sessionId: message.sessionId,
        messageId: message.id,
        role: message.role,
        extractedBy: "rule_based_session_memory_extractor",
        sttProvider: typeof message.metadata?.sttProvider === "string" ? message.metadata.sttProvider : undefined,
        audioPersisted: message.metadata?.source === "voice" ? false : undefined
      },
      occurredAt: message.createdAt
    });
  }
  return candidates;
}

function classifyMemoryCandidate(message: ChatMessage): Pick<CreateMemoryCandidateInput, "kind" | "scope" | "confidence" | "sensitivity" | "tags"> {
  const content = message.content.toLowerCase();
  const tags = new Set<string>(["extracted"]);
  if (message.metadata?.source === "voice") tags.add("voice");
  if (/\b(password|token|secret|api[_-]?key|private key)\b/i.test(message.content) || /密码|密钥|私钥|token/i.test(message.content)) {
    tags.add("sensitive");
    return { kind: "journal", scope: "session", confidence: 0.45, sensitivity: "sensitive", tags: [...tags] };
  }
  if (/请记住|记住|我喜欢|我偏好|我的名字|我是|以后.*(都|请|不要)|不要.*回答|prefer|my name is|remember that/i.test(message.content)) {
    tags.add("core");
    return { kind: "core", scope: "global", confidence: 0.78, sensitivity: "normal", tags: [...tags] };
  }
  if (/项目|代码|仓库|repo|repository|agent|memory|workflow|electron|nestjs|react/i.test(content)) {
    tags.add("project");
    return { kind: "project", scope: "session", confidence: 0.68, sensitivity: "normal", tags: [...tags] };
  }
  if (/习惯|流程|每次|总是|通常|workflow|routine|process/i.test(content)) {
    tags.add("procedural");
    return { kind: "procedural", scope: "global", confidence: 0.65, sensitivity: "normal", tags: [...tags] };
  }
  tags.add("journal");
  return { kind: "journal", scope: "session", confidence: 0.58, sensitivity: "normal", tags: [...tags] };
}

function deterministicSessionSummaryCandidate(sessionId: string, messages: ChatMessage[]): CreateMemoryCandidateInput {
  const occurredAt = messages.at(-1)?.createdAt ?? new Date().toISOString();
  const userMessages = messages.filter((message) => message.role === "user").slice(-8);
  const assistantMessages = messages.filter((message) => message.role === "assistant").slice(-4);
  const userSummary = userMessages.map((message) => `用户：${truncateForSummary(message.content)}`).join("\n");
  const assistantSummary = assistantMessages.map((message) => `助手：${truncateForSummary(message.content)}`).join("\n");
  return {
    content: ["会话摘要：", userSummary, assistantSummary].filter(Boolean).join("\n"),
    kind: "summary",
    scope: "session",
    sessionId,
    source: { type: "system", id: sessionId, label: "session summary" },
    provenance: {
      sessionId,
      messageCount: messages.length,
      summarizedBy: "rule_based_session_summarizer",
      sourceMessageIds: messages.map((message) => message.id)
    },
    confidence: 0.62,
    sensitivity: "normal",
    occurredAt,
    tags: ["summary", "session"]
  };
}

function deterministicConsolidationSuggestions(memories: MemoryEntry[], maxSuggestions: number): MemoryConsolidationSuggestion[] {
  const active = memories.filter((memory) => memory.status !== "tombstoned");
  const groups = new Map<string, MemoryEntry[]>();
  for (const memory of active) {
    const key = memory.conflictGroupId || `${memory.kind}:${memory.tags.slice(0, 2).sort().join(",") || firstContentKey(memory.content)}`;
    const current = groups.get(key) ?? [];
    current.push(memory);
    groups.set(key, current);
  }
  const suggestions: MemoryConsolidationSuggestion[] = [];
  for (const group of groups.values()) {
    const related = group.length >= 2 ? group : findSimilarMemories(group[0], active);
    const unique = uniqueById(related).filter((memory) => memory.status !== "tombstoned");
    if (unique.length < 2) continue;
    suggestions.push(buildConsolidationSuggestion(unique));
    if (suggestions.length >= maxSuggestions) break;
  }
  return dedupeSuggestions(suggestions).slice(0, maxSuggestions);
}

function findSimilarMemories(seed: MemoryEntry | undefined, memories: MemoryEntry[]) {
  if (!seed) return [];
  const seedTerms = new Set(tokenize(seed.content));
  return memories.filter((memory) => {
    if (memory.id === seed.id) return true;
    if (memory.kind !== seed.kind && !memory.tags.some((tag) => seed.tags.includes(tag))) return false;
    return jaccard(seedTerms, new Set(tokenize(memory.content))) >= 0.38;
  });
}

function buildConsolidationSuggestion(memories: MemoryEntry[]): MemoryConsolidationSuggestion {
  const primary = [...memories].sort((a, b) => b.confidence - a.confidence || b.updatedAt.localeCompare(a.updatedAt))[0];
  const tags = [...new Set(memories.flatMap((memory) => memory.tags))].slice(0, 8);
  return {
    sourceIds: memories.map((memory) => memory.id),
    content: primary.content,
    kind: primary.kind,
    reason: "Related memories appear to describe the same fact, preference, event, or project context.",
    confidence: Math.max(0.65, Math.min(0.95, memories.reduce((sum, memory) => sum + memory.confidence, 0) / memories.length)),
    sensitivity: memories.some((memory) => memory.sensitivity === "sensitive") ? "sensitive" : "normal",
    occurredAt: memories.map((memory) => memory.occurredAt ?? memory.createdAt).sort().at(-1),
    tags,
    conflictReason: memories.some((memory) => (memory.conflictsWith ?? []).length > 0 || memory.conflictGroupId)
      ? "Suggestion includes memories with existing conflict metadata."
      : undefined
  };
}

function dedupeSuggestions(suggestions: MemoryConsolidationSuggestion[]) {
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const key = [...suggestion.sourceIds].sort().join(",");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueById(memories: MemoryEntry[]) {
  return [...new Map(memories.map((memory) => [memory.id, memory])).values()];
}

function firstContentKey(content: string) {
  return tokenize(content).slice(0, 3).join("-");
}

function normalizeMemoryCandidateContent(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length < 8) return undefined;
  return normalized.length > 360 ? `${normalized.slice(0, 357)}...` : normalized;
}

function truncateForSummary(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}

function normalizeKind(value: unknown): CreateMemoryCandidateInput["kind"] {
  return value === "journal" || value === "summary" || value === "procedural" || value === "project" ? value : "core";
}

function clampConfidence(value: unknown, fallback: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.max(0, Math.min(1, numberValue));
}

function normalizeTags(value: unknown, fallback: string[]) {
  const tags = Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean) : fallback;
  return [...new Set(tags.length > 0 ? tags : fallback)].slice(0, 12);
}

function asRecord(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  throw new Error("Memory intelligence response was not a JSON object.");
}

function tokenize(value: string) {
  return Array.from(new Set(value.toLowerCase().split(/[^a-z0-9\u4e00-\u9fa5]+/u).map((term) => term.trim()).filter(Boolean)));
}

function jaccard(left: Set<string>, right: Set<string>) {
  if (left.size === 0 && right.size === 0) return 0;
  const intersection = [...left].filter((term) => right.has(term)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}
