import { spawn } from "node:child_process";
import { createResearchTask, getResearchReport, getResearchTask } from "./smoke-extension-client.mjs";

const port1 = Number(process.env.SMOKE_REQUEUE_PORT_1 ?? 4362);
const port2 = Number(process.env.SMOKE_REQUEUE_PORT_2 ?? 4363);
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 180000);
const pollIntervalMs = Number(process.env.SMOKE_POLL_INTERVAL_MS ?? 500);
const apiEntry = "apps/api/dist/apps/api/src/main.js";

let activeProcess;

async function main() {
  const first = await startApi(port1);
  activeProcess = first;
  const firstBase = apiBase(port1);

  const created = [];
  for (let index = 1; index <= 4; index += 1) {
    created.push(await createTask(firstBase, `PENDING_REQUEUE_SCRIPT_${Date.now()}_${index}`));
  }

  const queueBeforeStop = await waitForPending(firstBase);
  const pendingTaskId = queueBeforeStop.pendingTaskIds[0];
  assert(pendingTaskId, `expected a pending task before restart: ${JSON.stringify(queueBeforeStop)}`);

  await stopApi(first);
  activeProcess = undefined;

  const second = await startApi(port2);
  activeProcess = second;
  const secondBase = apiBase(port2);
  const task = await waitForTask(secondBase, pendingTaskId);
  const eventTypes = (task.events ?? []).map((event) => event.eventType);
  const report = await getResearchReport(secondBase, pendingTaskId);

  assert(task.status === "completed", `expected requeued task completed, got ${task.status}`);
  assert(count(eventTypes, "task_requeued_after_restart") === 1, "expected exactly one task_requeued_after_restart event");
  assert(count(eventTypes, "task_started") === 1, "expected exactly one task_started event");
  assert(report.id, "expected requeued report id");

  await waitForQueueIdle(secondBase);
  await stopApi(second);
  activeProcess = undefined;

  console.log(
    JSON.stringify(
      {
        ok: true,
        firstBase,
        secondBase,
        pendingTaskId,
        createdTaskIds: created.map((item) => item.task.id)
      },
      null,
      2
    )
  );
}

async function startApi(port) {
  const child = spawn(process.execPath, [apiEntry], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      RESEARCH_TASK_QUEUE_CONCURRENCY: "1",
      DATA_CONNECTOR_TIMEOUT_MS: "3000",
      SILICONFLOW_API_KEY: ""
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.on("data", (chunk) => process.stdout.write(`[api:${port}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[api:${port}] ${chunk}`));
  await waitForHealth(apiBase(port));
  return child;
}

async function stopApi(child) {
  if (child.exitCode !== null || child.signalCode) return;
  child.kill("SIGINT");
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Timed out stopping API process"));
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

async function createTask(base, input) {
  return createResearchTask(base, {
    input,
    inputType: "symbol",
    question: "pending requeue smoke",
    options: {
      includeOnchain: false,
      includeSocial: false,
      includeSimilarCases: false
    }
  });
}

async function waitForPending(base) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const queue = await readJson(`${base}/research/queue`);
    if (queue.pending > 0 && queue.pendingTaskIds.length > 0) return queue;
    await sleep(pollIntervalMs);
  }
  throw new Error("Timed out waiting for a pending task");
}

async function waitForTask(base, taskId) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const task = await getResearchTask(base, taskId);
    if (["completed", "failed", "cancelled"].includes(task.status)) return task;
    await sleep(pollIntervalMs);
  }
  throw new Error(`Timed out waiting for task ${taskId}`);
}

async function waitForQueueIdle(base) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const queue = await readJson(`${base}/research/queue`);
    if (queue.pending === 0 && queue.running === 0) return;
    await sleep(pollIntervalMs);
  }
  throw new Error("Timed out waiting for queue idle");
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

function apiBase(port) {
  return `http://localhost:${port}/api`;
}

function count(values, value) {
  return values.filter((item) => item === value).length;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

process.on("exit", () => {
  if (activeProcess && activeProcess.exitCode === null && !activeProcess.signalCode) {
    activeProcess.kill("SIGKILL");
  }
});

main().catch(async (error) => {
  if (activeProcess) await stopApi(activeProcess).catch(() => undefined);
  console.error(error);
  process.exit(1);
});
