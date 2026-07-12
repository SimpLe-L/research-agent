import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = Number(process.env.SMOKE_API_PORT ?? 4391);
const base = process.env.SMOKE_API_BASE ?? `http://127.0.0.1:${port}/api`;
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 30000);
let apiProcess;
const dataDir = await mkdtemp(join(tmpdir(), "sp-agent-api-smoke-"));

async function main() {
  if (!process.env.SMOKE_API_BASE) {
    apiProcess = spawn("node", ["apps/api/dist/apps/api/src/main.js"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        SP_AGENT_DATA_DIR: dataDir,
        SILICONFLOW_API_KEY: ""
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    apiProcess.stdout.on("data", (chunk) => process.stdout.write(`[api] ${chunk}`));
    apiProcess.stderr.on("data", (chunk) => process.stderr.write(`[api] ${chunk}`));
  }

  await waitForHealth();
  const health = await readJson(`${base}/health`);
  assert(health.ok === true, "expected health ok");

  const providers = await readJson(`${base}/providers/status`);
  assert(Array.isArray(providers.providers), "expected providers array");
  assert(providers.providers.some((provider) => provider.name === "agent-runtime"), "expected agent-runtime provider");

  const readiness = await readJson(`${base}/settings/readiness`);
  assert(Array.isArray(readiness.items), "expected readiness items");
  assert(readiness.items.some((item) => item.id === "pi-runtime"), "expected pi-runtime readiness item");
  assert(readiness.items.some((item) => item.id === "memory-layer" && item.status === "ready"), "expected ready memory layer");
  assert(readiness.items.some((item) => item.id === "speech-stt"), "expected speech-stt readiness item");
  assert(readiness.items.some((item) => item.id === "speech-tts"), "expected speech-tts readiness item");

  const extensions = await readJson(`${base}/extensions`);
  assert(Array.isArray(extensions.extensions), "expected extension registry");
  assert(extensions.extensions.some((extension) => extension.id === "core.agent-shell"), "expected core.agent-shell extension");
  assert(extensions.extensions.some((extension) => extension.id === "local.memory" && extension.status === "active"), "expected active local.memory extension");
  assert(extensions.extensions.some((extension) => extension.id === "local.project" && extension.status === "active"), "expected active local.project extension");
  assert(!extensions.extensions.some((extension) => extension.id === "web3.research"), "web3.research should not be active");

  const agentStatus = await readJson(`${base}/agent/status`);
  assert(agentStatus.mode === "local_personal_agent", "expected local personal agent mode");

  const skillSource = join(dataDir, "skill-fixture");
  await mkdir(skillSource, { recursive: true });
  await writeFile(join(skillSource, "SKILL.md"), "---\nname: smoke.local-summary\ndescription: Summarize explicitly supplied text.\nversion: 1.0.0\n---\n\nSummarize only the material supplied by the user. State uncertainty.");
  const importedSkill = await postJson(`${base}/skills/import`, { sourcePath: skillSource });
  assert(importedSkill.status === "disabled", "imported local Skill should start disabled");
  const enabledSkill = await patchJson(`${base}/skills/${encodeURIComponent(importedSkill.id)}/enable`, {});
  assert(enabledSkill.status === "active", "local Skill should enable");
  const statusWithSkill = await readJson(`${base}/agent/status`);
  assert(statusWithSkill.extensions.some((extension) => extension.id === `local.skill.${importedSkill.id}`), "enabled local Skill should appear in runtime catalog");
  const disabledSkill = await patchJson(`${base}/skills/${encodeURIComponent(importedSkill.id)}/disable`, {});
  assert(disabledSkill.status === "disabled", "local Skill should disable");
  const removedSkill = await deleteJson(`${base}/skills/${encodeURIComponent(importedSkill.id)}`);
  assert(removedSkill.removed === true, "local Skill should remove");

  const upload = new FormData();
  upload.append("files", new Blob(["---\nname: smoke.uploaded-skill\ndescription: Imported through multipart upload.\n---\n\nUse supplied text only."], { type: "text/markdown" }), "SKILL.md");
  const uploadedSkill = await postForm(`${base}/skills/import-upload`, upload);
  assert(uploadedSkill.id === "smoke.uploaded-skill" && uploadedSkill.status === "disabled", "multipart upload should import a SKILL.md-only package");
  await deleteJson(`${base}/skills/${encodeURIComponent(uploadedSkill.id)}`);

  const session = await postJson(`${base}/chat/sessions`, { title: "API smoke" });
  assert(session.id, "expected created chat session id");

  const turn = await postJson(`${base}/agent/messages`, {
    content: "当前项目状态是什么？",
    sessionId: session.id
  });
  assert(turn.role === "assistant", "expected assistant response");
  assert(turn.sessionId === session.id, "expected agent turn to use requested chat session");
  assert(typeof turn.content === "string" && turn.content.length > 0, "expected assistant content");
  assert(turn.degradedReason, "expected missing-key degraded reason in smoke env");
  assert(Array.isArray(turn.artifacts) && turn.artifacts.length === 0, "ordinary chat should not create a skill artifact");

  const savedSession = await readJson(`${base}/chat/sessions/${session.id}`);
  assert(savedSession.messages?.length === 2, "expected user and assistant messages to persist");
  assert(savedSession.messages[0].role === "user", "expected persisted user message");
  assert(savedSession.messages[1].role === "assistant", "expected persisted assistant message");

  const deleted = await deleteJson(`${base}/chat/sessions/${session.id}`);
  assert(deleted.deleted === true && deleted.sessionId === session.id, "expected chat session delete response");
  const sessionsAfterDelete = await readJson(`${base}/chat/sessions`);
  assert(!sessionsAfterDelete.sessions.some((item) => item.id === session.id), "deleted chat session should be absent from list");

  const streamSession = await postJson(`${base}/chat/sessions`, { title: "API stream smoke" });
  const streamEvents = await postSse(`${base}/agent/messages/stream`, {
    content: "用流式接口回答当前项目状态。",
    sessionId: streamSession.id
  });
  assert(streamEvents.some((event) => event.type === "metadata" && event.sessionId === streamSession.id), "expected stream metadata event");
  assert(streamEvents.some((event) => event.type === "text_delta" && event.text), "expected stream text_delta events");
  const doneEvent = streamEvents.find((event) => event.type === "done");
  assert(doneEvent?.result?.sessionId === streamSession.id, "expected stream done event with session id");
  const savedStreamSession = await readJson(`${base}/chat/sessions/${streamSession.id}`);
  assert(savedStreamSession.messages?.length === 2, "expected streamed user and assistant messages to persist");
  await deleteJson(`${base}/chat/sessions/${streamSession.id}`);

  await stopApi();
  console.log(
    JSON.stringify(
      {
        ok: true,
        base,
        extensionIds: extensions.extensions.map((extension) => extension.id),
        providerCount: providers.providers.length,
        degradedReason: turn.degradedReason
      },
      null,
      2
    )
  );
}

async function waitForHealth() {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const health = await readJson(`${base}/health`);
      if (health.ok) return;
    } catch {
      // keep polling while API starts
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${base}/health`);
}

async function readJson(url) {
  const response = await fetch(url);
  assert(response.ok, `${url} returned HTTP ${response.status}`);
  return response.json();
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  assert(response.ok, `${url} returned HTTP ${response.status}: ${data.message ?? "unknown error"}`);
  return data;
}

async function patchJson(url, body) {
  const response = await fetch(url, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  assert(response.ok, `${url} returned HTTP ${response.status}: ${data.message ?? "unknown error"}`);
  return data;
}

async function postForm(url, body) {
  const response = await fetch(url, { method: "POST", body });
  const data = await response.json();
  assert(response.ok, `${url} returned HTTP ${response.status}: ${data.message ?? "unknown error"}`);
  return data;
}

async function deleteJson(url) {
  const response = await fetch(url, { method: "DELETE" });
  const data = await response.json();
  assert(response.ok, `${url} returned HTTP ${response.status}: ${data.message ?? "unknown error"}`);
  return data;
}

async function postSse(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  assert(response.ok, `${url} returned HTTP ${response.status}: ${text}`);
  return text
    .split(/\n\n+/)
    .map((raw) =>
      raw
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n")
    )
    .filter(Boolean)
    .map((data) => JSON.parse(data));
}

async function stopApi() {
  if (!apiProcess || apiProcess.exitCode !== null || apiProcess.signalCode) return;
  apiProcess.kill("SIGINT");
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      apiProcess.kill("SIGKILL");
      reject(new Error("Timed out stopping API process"));
    }, 5000);
    apiProcess.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function cleanupDataDir() {
  await rm(dataDir, { recursive: true, force: true });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

process.on("exit", () => {
  if (apiProcess && apiProcess.exitCode === null && !apiProcess.signalCode) {
    apiProcess.kill("SIGKILL");
  }
});

main().catch(async (error) => {
  await stopApi().catch(() => undefined);
  await cleanupDataDir().catch(() => undefined);
  console.error(error);
  process.exit(1);
}).finally(async () => {
  await cleanupDataDir().catch(() => undefined);
});
