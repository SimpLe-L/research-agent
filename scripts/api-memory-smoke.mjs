import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const port = Number(process.env.SMOKE_API_PORT ?? 4400 + Math.floor(Math.random() * 1000));
const baseUrl = process.env.SMOKE_API_BASE ?? `http://127.0.0.1:${port}/api`;
const dataDir = await mkdtemp(join(tmpdir(), "sp-agent-memory-smoke-"));
const yesterday = startOfDay(addDays(new Date(), -1));
const yesterdayStart = yesterday.toISOString();
const yesterdayEnd = new Date(addDays(yesterday, 1).getTime() - 1).toISOString();
const yesterdayJournalAt = new Date(yesterday.getTime() + 8 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString();
let apiProcess;

try {
  if (!process.env.SMOKE_API_BASE) {
    apiProcess = spawn(process.execPath, ["apps/api/dist/apps/api/src/main.js"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        SP_AGENT_DATA_DIR: dataDir,
        MEMORY_VECTOR_PROVIDER: "lancedb",
        MEMORY_LANCEDB_URI: join(dataDir, "lancedb"),
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
  await post(`${baseUrl}/chat/sessions/${session.id}/messages`, {
    role: "user",
    content: "请记住我喜欢极简语音界面。"
  });
  await post(`${baseUrl}/chat/sessions/${session.id}/messages`, {
    role: "user",
    content: "昨天我们用语音讨论了 Memory v2 的 journal 时间检索。",
    metadata: { source: "voice", sttProvider: "deterministic", audioPersisted: false }
  });

  const created = await post(`${baseUrl}/memory/candidates`, {
    content: "用户偏好本地优先的个人助手架构。",
    kind: "core",
    scope: "session",
    sessionId: session.id,
    source: { type: "user", id: session.id, label: "memory smoke" },
    provenance: { smoke: true },
    confidence: 0.9,
    tags: ["preference", "architecture"]
  });
  assert(created.accepted === true, "memory candidate should be accepted");
  assert(created.memory.kind === "core", "memory candidate should preserve kind");
  assert(created.memory.sensitivity === "normal", "memory candidate should default to normal sensitivity");
  assert(created.memory.status === "candidate", "memory candidate should start as candidate");

  const search = await get(`${baseUrl}/memory/search?query=${encodeURIComponent("本地优先 助手")}&sessionId=${session.id}`);
  assert(search.memories.length === 1, "memory search should find the created entry");
  assert(search.memories[0].matchedTerms?.length >= 1, "memory search should expose matched terms");
  assert(search.memories[0].rankingSignals?.includes("content_match"), "memory search should expose ranking signals");
  assert(search.memories[0].sourceSnippet?.includes("本地优先"), "memory search should expose a source snippet");
  assert(search.memories[0].citation?.memoryId === created.memoryId, "memory search should expose memory citation");
  assert(search.memories[0].debug?.strategy === "hybrid", "memory search should expose retrieval debug metadata");

  const promoted = await post(`${baseUrl}/memory/${created.memoryId}/promote`, {
    reason: "smoke accepted durable fact"
  });
  assert(promoted.memory.status === "active", "promoted memory should become active");

  const journal = await post(`${baseUrl}/memory/candidates`, {
    content: "昨天下午我们用语音讨论了 Memory v2 的 journal 时间检索。",
    kind: "journal",
    scope: "session",
    sessionId: session.id,
    source: { type: "voice", id: session.id, label: "voice transcript" },
    provenance: { source: "voice", sttProvider: "deterministic", audioPersisted: false },
    confidence: 0.75,
    occurredAt: yesterdayJournalAt,
    tags: ["voice", "journal", "memory"]
  });
  await post(`${baseUrl}/memory/${journal.memoryId}/promote`, {
    reason: "smoke accepted voice journal event"
  });
  const temporalSearch = await get(
    `${baseUrl}/memory/search?query=${encodeURIComponent("昨天")}&kind=journal&from=${encodeURIComponent(yesterdayStart)}&to=${encodeURIComponent(yesterdayEnd)}&sessionId=${encodeURIComponent(session.id)}`
  );
  assert(temporalSearch.memories.length === 1, "temporal journal search should find the journal entry");
  assert(temporalSearch.memories[0].rankingSignals.includes("temporal_window"), "temporal journal search should expose temporal window signal");
  assert(temporalSearch.memories[0].rankingSignals.includes("journal_temporal"), "temporal journal search should use journal temporal ranking");
  const relativeTemporalSearch = await get(`${baseUrl}/memory/search?query=${encodeURIComponent("昨天讨论了什么")}&kind=journal&sessionId=${encodeURIComponent(session.id)}`);
  assert(relativeTemporalSearch.memories.length >= 1, "relative temporal query should infer yesterday window");
  assert(relativeTemporalSearch.memories[0].rankingSignals.includes("temporal_window"), "relative temporal query should expose temporal window signal");

  const extracted = await post(`${baseUrl}/memory/extract/session`, {
    sessionId: session.id,
    maxCandidates: 6
  });
  assert(extracted.accepted >= 2, "session extraction should create memory candidates");
  assert(extracted.memories.some((memory) => memory.kind === "core"), "session extraction should create core memory for explicit preference");
  const extractedVoice = extracted.memories.find((memory) => memory.source.type === "voice");
  assert(extractedVoice, "session extraction should preserve voice source");
  assert(extractedVoice.provenance.sttProvider === "deterministic", "voice extraction should preserve stt provider provenance");
  assert(extractedVoice.provenance.audioPersisted === false, "voice extraction should preserve audio non-persistence provenance");

  const sessionSummary = await post(`${baseUrl}/memory/summaries/session`, {
    sessionId: session.id,
    maxMessages: 10
  });
  assert(sessionSummary.accepted === true, "session summary should create a memory candidate");
  assert(sessionSummary.memory.kind === "summary", "session summary should use summary memory kind");
  assert(sessionSummary.memory.provenance.sourceMessageIds.length >= 1, "session summary should preserve source message ids");
  assert(sessionSummary.provider === "deterministic", "session summary should expose the memory intelligence provider");

  await post(`${baseUrl}/memory/candidates`, {
    content: "用户喜欢本地优先的个人助手架构和可审计记忆。",
    kind: "core",
    scope: "session",
    sessionId: session.id,
    source: { type: "user", id: session.id, label: "memory smoke duplicate" },
    provenance: { smoke: true, duplicate: true },
    confidence: 0.82,
    tags: ["preference", "architecture"]
  });
  const consolidation = await post(`${baseUrl}/memory/consolidate`, {
    statuses: ["candidate", "active"],
    maxSuggestions: 5
  });
  assert(consolidation.provider === "deterministic", "memory consolidation should expose provider");
  assert(consolidation.suggestions.length >= 1, "memory consolidation should suggest related memories");
  assert(consolidation.suggestions[0].sourceIds.length >= 2, "memory consolidation suggestion should include source ids");

  const coreOnlySearch = await get(`${baseUrl}/memory/search?query=${encodeURIComponent("本地优先")}&strategy=core_semantic&sessionId=${encodeURIComponent(session.id)}`);
  assert(coreOnlySearch.memories.length >= 1, "core semantic search should find core memories");
  assert(coreOnlySearch.memories.every((item) => item.entry.kind !== "journal"), "core semantic search should exclude journal memories");
  assert(coreOnlySearch.memories.some((item) => item.rankingSignals.includes("vector_match")), "core semantic search should use vector ranking when LanceDB is enabled");

  const hybridSearch = await get(`${baseUrl}/memory/search?query=${encodeURIComponent("Memory v2 本地优先")}&strategy=hybrid&sessionId=${encodeURIComponent(session.id)}&limit=5`);
  assert(hybridSearch.memories.some((item) => item.entry.kind === "core"), "hybrid search should include core memories");
  assert(hybridSearch.memories.some((item) => item.entry.kind === "journal"), "hybrid search should include journal memories");
  assert(hybridSearch.memories.some((item) => item.rankingSignals.includes("vector_match")), "hybrid search should use vector ranking when LanceDB is enabled");

  const sensitive = await post(`${baseUrl}/memory/candidates`, {
    content: "用户的敏感测试代号是 SECRETUNIQUEV2。",
    kind: "core",
    source: { type: "user", id: session.id, label: "sensitivity smoke" },
    sensitivity: "sensitive",
    confidence: 0.95,
    tags: ["sensitive"]
  });
  await post(`${baseUrl}/memory/${sensitive.memoryId}/promote`, {
    reason: "smoke accepted sensitive fact for retrieval gate test"
  });
  const hiddenSensitive = await get(`${baseUrl}/memory/search?query=${encodeURIComponent("SECRETUNIQUEV2")}`);
  assert(hiddenSensitive.memories.length === 0, "sensitive memory should be excluded by default");
  const visibleSensitive = await get(`${baseUrl}/memory/search?query=${encodeURIComponent("SECRETUNIQUEV2")}&includeSensitive=true`);
  assert(visibleSensitive.memories.length === 1, "explicit includeSensitive should allow sensitive memory search");

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
  assert(agentTurn.memoryContext.every((item) => item.entry.status === "active"), "agent retrieval gate should only expose active memories");
  assert(agentTurn.memoryContext.every((item) => item.entry.sensitivity !== "sensitive"), "agent retrieval gate should exclude sensitive memories");
  assert(agentTurn.memoryContext.every((item) => item.citation?.memoryId), "agent memory context should expose citations");
  assert(agentTurn.memoryContext.every((item) => item.debug?.strategy), "agent memory context should expose debug strategy");

  const writeAudit = await post(`${baseUrl}/extensions/local.memory/invoke`, {
    capabilityId: "memory.write_candidate",
    input: { content: "通过扩展写入的记忆。", source: { type: "system" } },
    idempotencyKey: "memory-smoke-approved-write"
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
    input: writeAudit.approval.input,
    idempotencyKey: writeAudit.approval.idempotencyKey
  });
  assert(approvedWrite.status === "completed", "approved memory write should complete");
  await expectPostFailure(`${baseUrl}/extensions/local.memory/invoke`, {
    capabilityId: "memory.write_candidate",
    approvalId: writeAudit.approval.id,
    input: writeAudit.approval.input,
    idempotencyKey: writeAudit.approval.idempotencyKey
  }, 400);
  await expectPostFailure(`${baseUrl}/extensions/local.memory/invoke`, {
    capabilityId: "memory.write_candidate",
    approvalId: writeAudit.approval.id,
    input: { ...writeAudit.approval.input, content: "被篡改的审批输入。" },
    idempotencyKey: writeAudit.approval.idempotencyKey
  }, 400);

  await del(`${baseUrl}/memory/${merged.memory.id}`);
  const afterDelete = await get(`${baseUrl}/memory/search?query=${encodeURIComponent("本地优先")}&sessionId=${session.id}&statuses=active`);
  assert(afterDelete.memories.every((item) => item.entry.id !== merged.memory.id), "tombstoned memory should not appear in active search");

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

async function expectPostFailure(url, body, status) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  assert(response.status === status, `${url} expected ${status} but received ${response.status}: ${text}`);
}

async function patch(url, body) {
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return readJson(response, url);
}

function startOfDay(value) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value, days) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
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
