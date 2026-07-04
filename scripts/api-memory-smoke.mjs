import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const port = Number(process.env.SMOKE_API_PORT ?? 4400 + Math.floor(Math.random() * 1000));
const baseUrl = process.env.SMOKE_API_BASE ?? `http://127.0.0.1:${port}/api`;
const dataDir = await mkdtemp(join(tmpdir(), "sp-agent-memory-smoke-"));
let apiProcess;

try {
  if (!process.env.SMOKE_API_BASE) {
    apiProcess = spawn(process.execPath, ["apps/api/dist/apps/api/src/main.js"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        SP_AGENT_DATA_DIR: dataDir,
        SILICONFLOW_API_KEY: "",
        PI_API_KEY: ""
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    await waitForApi(baseUrl);
  }

  const session = await post(`${baseUrl}/chat/sessions`, { title: "Memory smoke" });
  await post(`${baseUrl}/chat/sessions/${session.id}/messages`, {
    role: "user",
    content: "我喜欢用本地优先的个人助手。"
  });

  const created = await post(`${baseUrl}/memory/candidates`, {
    content: "用户偏好本地优先的个人助手架构。",
    scope: "session",
    sessionId: session.id,
    source: { type: "user", id: session.id, label: "memory smoke" },
    provenance: { smoke: true },
    confidence: 0.9,
    tags: ["preference", "architecture"]
  });
  assert(created.accepted === true, "memory candidate should be accepted");

  const search = await get(`${baseUrl}/memory/search?query=${encodeURIComponent("本地优先 助手")}&sessionId=${session.id}`);
  assert(search.memories.length === 1, "memory search should find the created entry");

  const extensionSearch = await post(`${baseUrl}/extensions/local.memory/invoke`, {
    capabilityId: "memory.search",
    input: { query: "个人助手", sessionId: session.id }
  });
  assert(extensionSearch.status === "completed", "memory extension search should complete");
  assert(extensionSearch.permissionAudit.mode === "read_only", "memory search should be read-only");

  const agentTurn = await post(`${baseUrl}/agent/messages`, {
    content: "我偏好的助手架构是什么？",
    sessionId: session.id
  });
  assert(Array.isArray(agentTurn.memoryContext), "agent turn should expose memory context");
  assert(agentTurn.memoryContext.length >= 1, "agent turn should retrieve relevant memory context");

  const writeAudit = await post(`${baseUrl}/extensions/local.memory/invoke`, {
    capabilityId: "memory.write_candidate",
    input: { content: "通过扩展写入的记忆。", source: { type: "system" } }
  });
  assert(writeAudit.permissionAudit.mode === "write_or_provider", "memory write should not be read-only");

  await del(`${baseUrl}/memory/${created.memoryId}`);
  const afterDelete = await get(`${baseUrl}/memory/search?query=${encodeURIComponent("本地优先")}&sessionId=${session.id}`);
  assert(afterDelete.memories.length === 0, "tombstoned memory should not appear in search");

  console.log("api memory smoke passed", {
    sessionId: session.id,
    memoryId: created.memoryId,
    dataDir
  });
} finally {
  if (apiProcess) apiProcess.kill("SIGTERM");
  await rm(dataDir, { recursive: true, force: true });
}

async function waitForApi(url) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`API did not start at ${url}`);
}

async function get(url) {
  const response = await fetch(url);
  return readJson(response, url);
}

async function post(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return readJson(response, url);
}

async function del(url) {
  const response = await fetch(url, { method: "DELETE" });
  return readJson(response, url);
}

async function readJson(response, url) {
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  assert(response.ok, `${url} failed with ${response.status}: ${text}`);
  return json;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
