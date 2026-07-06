import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

loadDotEnv(resolve(process.cwd(), ".env"));

if (process.env.MEMORY_EMBEDDING_LIVE_SMOKE !== "1") {
  console.log("memory embedding live smoke skipped; set MEMORY_EMBEDDING_LIVE_SMOKE=1 to call SiliconFlow.");
  process.exit(0);
}

const apiKey = process.env.SILICONFLOW_API_KEY;
assert(Boolean(apiKey), "MEMORY_EMBEDDING_LIVE_SMOKE=1 requires SILICONFLOW_API_KEY in .env.");

const baseUrl = (process.env.SILICONFLOW_BASE_URL || "https://api.siliconflow.cn/v1").replace(/\/+$/u, "");
const model = process.env.SILICONFLOW_EMBEDDING_MODEL || "BAAI/bge-m3";
const response = await fetch(`${baseUrl}/embeddings`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`
  },
  body: JSON.stringify({
    model,
    input: "memory embedding live smoke"
  }),
  signal: AbortSignal.timeout(30_000)
});

const text = await response.text();
assert(response.ok, `SiliconFlow embedding request failed with HTTP ${response.status}: ${text}`);
const json = text ? JSON.parse(text) : {};
const embedding = json?.data?.[0]?.embedding;
assert(Array.isArray(embedding), "SiliconFlow embedding response should include data[0].embedding.");
assert(embedding.length > 64, "SiliconFlow BGE-M3 embedding should be higher dimensional than deterministic fallback.");
assert(embedding.every((value) => Number.isFinite(Number(value))), "SiliconFlow embedding values should be numeric.");

console.log("memory embedding live smoke passed", {
  provider: "siliconflow",
  model,
  dimensions: embedding.length
});

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  const contents = readFileSync(path, "utf8");
  for (const line of contents.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/gu, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
