import { spawn } from "node:child_process";
import { createResearchTask, getResearchReport, getResearchTask } from "./smoke-extension-client.mjs";

const apiPort = Number(process.env.SMOKE_WORKER_API_PORT ?? 4364);
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 60000);
const pollIntervalMs = Number(process.env.SMOKE_POLL_INTERVAL_MS ?? 500);
const apiEntry = "apps/api/dist/apps/api/src/main.js";
const workerEntry = "apps/api/dist/apps/api/src/worker.js";

const children = new Set();

async function main() {
  const api = await startProcess("api", [apiEntry], {
    PORT: String(apiPort),
    RESEARCH_TASK_EXECUTOR_MODE: "api_only",
    SILICONFLOW_API_KEY: ""
  });
  await waitForHealth(apiBase());

  const created = await createTask(`WORKER_SMOKE_${Date.now()}`);
  assert(created.queued === false, `expected api_only create response queued=false, got ${created.queued}`);
  assert(created.task.status === "pending", `expected new task status pending, got ${created.task.status}`);

  const queueBeforeWorker = await readJson(`${apiBase()}/research/queue`);
  assert(queueBeforeWorker.mode === "external_worker", `expected external_worker queue mode, got ${queueBeforeWorker.mode}`);
  assert(queueBeforeWorker.executorMode === "api_only", `expected api_only executor mode, got ${queueBeforeWorker.executorMode}`);
  assert(queueBeforeWorker.databaseReachable === true, "expected API-only queue status to include reachable PostgreSQL state");
  assert(
    queueBeforeWorker.persistedPendingTaskIds?.includes(created.task.id),
    `expected persisted pending queue to include ${created.task.id}: ${JSON.stringify(queueBeforeWorker)}`
  );

  const worker = await startProcess("worker", [workerEntry], {
    RESEARCH_TASK_EXECUTOR_MODE: "worker",
    RESEARCH_TASK_QUEUE_CONCURRENCY: "1",
    RESEARCH_WORKER_POLL_INTERVAL_MS: "500",
    SILICONFLOW_API_KEY: ""
  });

  const finalTask = await waitForTask(created.task.id);
  const eventTypes = (finalTask.events ?? []).map((event) => event.eventType);
  const report = await getResearchReport(apiBase(), created.task.id);

  assert(finalTask.status === "completed", `expected worker task completed, got ${finalTask.status}`);
  assert(eventTypes.includes("task_waiting_for_worker"), "expected task_waiting_for_worker event");
  assert(
    eventTypes.includes("task_worker_queued") || eventTypes.includes("task_requeued_after_restart"),
    "expected a worker queue event"
  );
  assert(report.id, "expected worker report id");

  await stopProcess(worker);
  await stopProcess(api);

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBase: apiBase(),
        taskId: created.task.id,
        queueBeforeWorker,
        eventTypes
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

async function createTask(input) {
  return createResearchTask(apiBase(), {
    input,
    inputType: "symbol",
    question: "API-only worker smoke",
    options: {
      includeOnchain: false,
      includeSocial: false,
      includeSimilarCases: false
    }
  });
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
