import { spawn } from "node:child_process";
import { getResearchReport, getResearchTask } from "./smoke-extension-client.mjs";

const apiPort = Number(process.env.SMOKE_CHAT_API_PORT ?? 4368);
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 120000);
const pollIntervalMs = Number(process.env.SMOKE_POLL_INTERVAL_MS ?? 500);
const apiEntry = "apps/api/dist/apps/api/src/main.js";

const children = new Set();

async function main() {
  const api = await startProcess("api", [apiEntry], {
    PORT: String(apiPort),
    SILICONFLOW_API_KEY: ""
  });
  await waitForHealth(apiBase());
  await waitForQueueIdle();

  const session = await postJson(`${apiBase()}/chat/sessions`, {
    title: "Chat smoke"
  });
  assert(session.id, "expected created chat session id");

  const created = await postJson(`${apiBase()}/chat/sessions/${session.id}/messages`, {
    content: "UNI",
    triggerResearch: true
  });

  assert(created.message?.role === "user", "expected user message in chat create response");
  assert(created.assistantMessage?.role === "assistant", "expected assistant placeholder in chat create response");
  assert(created.task?.id, "expected chat-triggered research task id");
  assert(created.assistantMessage?.metadata?.taskId === created.task.id, "expected assistant placeholder metadata taskId");

  const finalTask = await waitForTask(created.task.id);
  assert(finalTask.status === "completed", `expected chat task completed, got ${finalTask.status}`);

  const report = await getResearchReport(apiBase(), created.task.id);
  assert(report.id, "expected completed report id");
  assert(report.taskId === created.task.id, "expected report task id to match chat task");

  const marker = `Report: ${report.id}`;
  const finalMessage = await postJson(`${apiBase()}/chat/sessions/${session.id}/messages`, {
    role: "assistant",
    triggerResearch: false,
    content: [
      "Research report completed.",
      "",
      `Task: ${created.task.id}`,
      marker,
      `Recommendation: ${report.recommendation}`,
      `Confidence: ${report.confidence}`,
      "",
      report.summary
    ].join("\n")
  });
  assert(finalMessage.message?.role === "assistant", "expected final assistant message to be persisted");
  assert(finalMessage.message?.content?.includes(marker), "expected final assistant message to include report marker");

  const hydratedSession = await readJson(`${apiBase()}/chat/sessions/${session.id}`);
  const finalSummary = hydratedSession.messages?.find(
    (message) => message.role === "assistant" && typeof message.content === "string" && message.content.includes(marker)
  );
  assert(finalSummary, "expected hydrated chat session to include final report summary");

  await waitForQueueIdle();
  await stopProcess(api);

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBase: apiBase(),
        sessionId: session.id,
        taskId: created.task.id,
        reportId: report.id,
        messageCount: hydratedSession.messages?.length ?? 0
      },
      null,
      2
    )
  );
}

async function startProcess(label, args, env) {
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  children.add(child);
  child.stdout.on("data", (chunk) => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[${label}] ${chunk}`));
  return child;
}

async function stopProcess(child) {
  if (!children.has(child)) return;
  children.delete(child);
  if (child.exitCode !== null || child.signalCode) return;
  child.kill("SIGINT");
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Timed out stopping child process"));
    }, 5000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function waitForHealth(base) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) return;
    } catch {
      // keep polling until the API has bound its port
    }
    await sleep(pollIntervalMs);
  }
  throw new Error(`Timed out waiting for API health at ${base}`);
}

async function waitForTask(taskId) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const task = await getResearchTask(apiBase(), taskId);
    if (["completed", "failed", "cancelled"].includes(task.status)) return task;
    await sleep(pollIntervalMs);
  }
  throw new Error(`Timed out waiting for task ${taskId}`);
}

async function waitForQueueIdle() {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const queue = await readJson(`${apiBase()}/research/queue`);
    if (queue.pending === 0 && queue.running === 0) return;
    await sleep(pollIntervalMs);
  }
  throw new Error("Timed out waiting for research queue to become idle");
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
  assert(response.ok, `${url} returned HTTP ${response.status}`);
  return response.json();
}

function apiBase() {
  return `http://localhost:${apiPort}/api`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

process.on("exit", () => {
  for (const child of children) {
    if (child.exitCode === null && !child.signalCode) child.kill("SIGKILL");
  }
});

main().catch(async (error) => {
  for (const child of [...children].reverse()) {
    await stopProcess(child).catch(() => undefined);
  }
  console.error(error);
  process.exit(1);
});
