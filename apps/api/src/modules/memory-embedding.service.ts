import { Injectable } from "@nestjs/common";
import type { ProviderStatus } from "@sp-agent/shared";

export type MemoryEmbeddingResult = {
  provider: "deterministic" | "siliconflow";
  model: string;
  vector: number[];
  degradedReason?: string;
};

const DETERMINISTIC_MODEL = "local-hash-v1";
const DETERMINISTIC_VECTOR_DIMENSIONS = 64;
const SILICONFLOW_DEFAULT_BASE_URL = "https://api.siliconflow.cn/v1";
const SILICONFLOW_DEFAULT_EMBEDDING_MODEL = "BAAI/bge-m3";

@Injectable()
export class MemoryEmbeddingService {
  async embed(text: string, env: NodeJS.ProcessEnv = process.env): Promise<MemoryEmbeddingResult> {
    const provider = selectedEmbeddingProvider(env);
    if (provider === "siliconflow") {
      const apiKey = env.SILICONFLOW_API_KEY;
      if (!apiKey) {
        return {
          ...deterministicEmbedding(text),
          degradedReason: "MEMORY_EMBEDDING_PROVIDER=siliconflow requires SILICONFLOW_API_KEY; using deterministic fallback."
        };
      }

      try {
        return await siliconFlowEmbedding(text, env);
      } catch (error) {
        return {
          ...deterministicEmbedding(text),
          degradedReason: error instanceof Error ? error.message : "SiliconFlow embedding request failed; using deterministic fallback."
        };
      }
    }

    return deterministicEmbedding(text);
  }

  getStatus(env: NodeJS.ProcessEnv = process.env): ProviderStatus {
    const provider = selectedEmbeddingProvider(env);
    if (provider === "deterministic") {
      return {
        name: "deterministic",
        configured: true,
        reachable: true
      };
    }

    const configured = Boolean(env.SILICONFLOW_API_KEY);
    const model = siliconFlowEmbeddingModel(env);
    return {
      name: `siliconflow:${model}`,
      configured,
      reachable: configured,
      degradedReason: configured ? undefined : "SiliconFlow memory embeddings require SILICONFLOW_API_KEY."
    };
  }
}

function selectedEmbeddingProvider(env: NodeJS.ProcessEnv): "deterministic" | "siliconflow" {
  const selected = env.MEMORY_EMBEDDING_PROVIDER?.trim().toLowerCase();
  if (selected === "deterministic" || selected === "siliconflow") return selected;
  return env.SILICONFLOW_API_KEY ? "siliconflow" : "deterministic";
}

function siliconFlowEmbeddingModel(env: NodeJS.ProcessEnv) {
  return env.SILICONFLOW_EMBEDDING_MODEL || "BAAI/bge-m3";
}

async function siliconFlowEmbedding(text: string, env: NodeJS.ProcessEnv): Promise<MemoryEmbeddingResult> {
  const model = siliconFlowEmbeddingModel(env);
  const baseUrl = (env.SILICONFLOW_BASE_URL || SILICONFLOW_DEFAULT_BASE_URL).replace(/\/+$/u, "");
  const timeoutMs = Number(env.MEMORY_EMBEDDING_TIMEOUT_MS ?? 30_000);
  const response = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.SILICONFLOW_API_KEY ?? ""}`
    },
    body: JSON.stringify({
      model,
      input: text
    }),
    signal: AbortSignal.timeout(Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30_000)
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`SiliconFlow embedding returned HTTP ${response.status}: ${message}`);
  }

  const json = await response.json() as Record<string, unknown>;
  const vector = extractEmbeddingVector(json);
  if (!vector) throw new Error("SiliconFlow embedding response did not include a numeric embedding vector.");
  return {
    provider: "siliconflow",
    model,
    vector
  };
}

function extractEmbeddingVector(json: Record<string, unknown>) {
  const data = json.data;
  if (!Array.isArray(data)) return undefined;
  const first = data[0] as Record<string, unknown> | undefined;
  const embedding = first?.embedding;
  if (!Array.isArray(embedding)) return undefined;
  const vector = embedding.map((value) => Number(value));
  return vector.length > 0 && vector.every((value) => Number.isFinite(value)) ? vector : undefined;
}

function deterministicEmbedding(text: string): MemoryEmbeddingResult {
  const vector = Array.from({ length: DETERMINISTIC_VECTOR_DIMENSIONS }, () => 0);
  const terms = tokenizeForEmbedding(text);
  for (const term of terms) {
    const index = hashTerm(term) % DETERMINISTIC_VECTOR_DIMENSIONS;
    vector[index] += 1;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return {
    provider: "deterministic",
    model: DETERMINISTIC_MODEL,
    vector: vector.map((value) => Number((value / magnitude).toFixed(6)))
  };
}

function tokenizeForEmbedding(value: string) {
  const normalized = value.toLowerCase();
  const terms = normalized.split(/[^a-z0-9\u4e00-\u9fa5._-]+/u).map((term) => term.trim()).filter(Boolean);
  const expanded = new Set<string>();
  for (const term of terms) {
    expanded.add(term);
    if (/[\u4e00-\u9fa5]/u.test(term)) {
      for (let index = 0; index < term.length - 1; index += 1) expanded.add(term.slice(index, index + 2));
    }
  }
  return [...expanded];
}

function hashTerm(term: string) {
  let hash = 2166136261;
  for (const char of term) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
