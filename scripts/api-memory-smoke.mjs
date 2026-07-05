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
        SILICONFLOW_API_KEY: ""
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
  assert(created.memory.status === "candidate", "memory candidate should start as candidate");

  const search = await get(`${baseUrl}/memory/search?query=${encodeURIComponent("本地优先 助手")}&sessionId=${session.id}`);
  assert(search.memories.length === 1, "memory search should find the created entry");
  assert(search.memories[0].matchedTerms?.length >= 1, "memory search should expose matched terms");
  assert(search.memories[0].rankingSignals?.includes("content_match"), "memory search should expose ranking signals");

  const promoted = await post(`${baseUrl}/memory/${created.memoryId}/promote`, {
    reason: "smoke accepted durable fact"
  });
  assert(promoted.memory.status === "active", "promoted memory should become active");

  const conflicting = await post(`${baseUrl}/memory/candidates`, {
    content: "用户偏好本地优先的个人助手架构。",
    scope: "session",
    sessionId: session.id,
    source: { type: "assistant", id: "assistant-conflict", label: "conflict smoke" },
    confidence: 0.4,
    tags: ["preference", "architecture"]
  });
  assert(conflicting.memory.conflictsWith.includes(created.memoryId), "similar memory candidate should record conflict ids");
  assert(conflicting.conflicts?.length >= 1, "conflict response should include conflicting memories");
  const conflictAudit = await get(`${baseUrl}/memory/audit?memoryId=${encodeURIComponent(conflicting.memoryId)}`);
  assert(conflictAudit.auditEvents.some((event) => event.action === "conflict_detected"), "memory audit should record conflict detection");

  const updated = await patch(`${baseUrl}/memory/${created.memoryId}`, {
    tags: ["preference", "architecture", "local-first"],
    provenance: { updatedBySmoke: true }
  });
  assert(updated.memory.tags.includes("local-first"), "memory update should persist tags");

  const second = await post(`${baseUrl}/memory/candidates`, {
    content: "用户希望 memory 能够审计和回滚。",
    source: { type: "user", id: session.id, label: "memory smoke" },
    confidence: 0.8,
    tags: ["memory"]
  });
  const merged = await post(`${baseUrl}/memory/merge`, {
    sourceIds: [created.memoryId, conflicting.memoryId, second.memoryId],
    content: "用户偏好本地优先的个人助手，并希望 memory 可审计、可回滚。",
    reason: "smoke merge related memory preferences",
    tags: ["preference", "memory"]
  });
  assert(merged.memory.status === "active", "merged memory should be active");
  assert(merged.mergedFrom.length === 3, "merge should report source ids");

  const audit = await get(`${baseUrl}/memory/audit?memoryId=${encodeURIComponent(merged.memory.id)}`);
  assert(audit.auditEvents.some((event) => event.action === "merged"), "memory audit should record merge");
  assert(audit.auditEvents.some((event) => event.action === "conflict_resolved"), "memory audit should record conflict resolution");

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
  assert(writeAudit.status === "pending_approval", "memory write through extension should require approval");
  assert(writeAudit.approval?.status === "pending", "pending approval should be returned");

  const approvalDecision = await patch(`${baseUrl}/approvals/${writeAudit.approval.id}`, {
    decision: "approved",
    reason: "smoke approval"
  });
  assert(approvalDecision.approval.status === "approved", "approval should be approved");

  const approvedWrite = await post(`${baseUrl}/extensions/local.memory/invoke`, {
    capabilityId: "memory.write_candidate",
    approvalId: writeAudit.approval.id,
    input: { content: "通过审批后扩展写入的记忆。", source: { type: "system" } }
  });
  assert(approvedWrite.status === "completed", "approved memory write should complete");

  await del(`${baseUrl}/memory/${merged.memory.id}`);
  const afterDelete = await get(`${baseUrl}/memory/search?query=${encodeURIComponent("本地优先")}&sessionId=${session.id}`);
  assert(afterDelete.memories.length === 0, "tombstoned memory should not appear in search");

  console.log("api memory smoke passed", {
    sessionId: session.id,
    memoryId: merged.memory.id,
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

async function patch(url, body) {
  const response = await fetch(url, {
    method: "PATCH",
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
