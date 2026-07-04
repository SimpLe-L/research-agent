import { spawn } from "node:child_process";
import { getResearchReport, getResearchTask, getResearchTaskEvents } from "./smoke-extension-client.mjs";

const apiPort = Number(process.env.SMOKE_AGENT_WORKER_API_PORT ?? 4365);
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 120000);
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

  const created = await createAgentResearchSession(`AGENT_WORKER_SMOKE_${Date.now()}`);
  assert(created.queued === false, `expected api_only agent session queued=false, got ${created.queued}`);
  assert(created.mode === "pi_research_session", `expected pi_research_session mode, got ${created.mode ?? "missing"}`);
  assert(created.task.status === "pending", `expected new task status pending, got ${created.task.status}`);

  const queueBeforeWorker = await readJson(`${apiBase()}/research/queue`);
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
  assert(finalTask.status === "completed", `expected worker agent task completed, got ${finalTask.status}`);

  const events = await getResearchTaskEvents(apiBase(), created.task.id);
  assert(events.events?.some((event) => event.eventType === "agent_research_session_started"), "expected agent session start event");
  assertNodeTool(events.events, "resolve_asset", "node_completed", "resolve_research_asset");
  assertNodeTool(events.events, "collect_sources", "node_completed", "collect_research_sources");
  assertNodeTool(events.events, "fetch_market_data", "node_completed", "fetch_research_market_data");
  assertNodeTool(events.events, "fetch_onchain_data", "node_completed", "fetch_research_onchain_data");
  assertNodeTool(events.events, "analyze_risk", "node_completed", "analyze_research_risk");
  assertNodeTool(events.events, "match_cases", "node_completed", "search_research_knowledge");

  const agentReportEvent = events.events?.find((event) => event.node === "write_report" && event.eventType === "agent_report_degraded");
  assert(agentReportEvent, "expected degraded agent report event without live Pi key");
  assert(
    agentReportEvent.payload?.agentTool?.activeTools?.includes("write_research_report"),
    "expected worker write_report to expose write_research_report app tool audit"
  );

  const indexedEvent = events.events?.find((event) => event.node === "index_knowledge" && event.eventType === "knowledge_indexed");
  assert(indexedEvent, "expected worker knowledge_indexed event");
  assert(
    indexedEvent.payload?.agentTool?.activeTools?.includes("index_research_knowledge"),
    "expected worker index_knowledge to expose index_research_knowledge app tool audit"
  );

  const report = await getResearchReport(apiBase(), created.task.id);
  assert(report.id, "expected worker agent report id");

  await stopProcess(worker);
  await stopProcess(api);

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBase: apiBase(),
        taskId: created.task.id,
        queueBeforeWorker,
        agentToolNodes: [
          "resolve_research_asset",
          "collect_research_sources",
          "fetch_research_market_data",
          "fetch_research_onchain_data",
          "analyze_research_risk",
          "search_research_knowledge",
          "write_research_report",
          "index_research_knowledge"
        ]
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

async function createAgentResearchSession(input) {
  return postJson(`${apiBase()}/agent/research-sessions`, {
    input,
    inputType: "symbol",
    question: "API-only agent worker smoke",
    userMessage: "Start a Pi-coordinated worker research session smoke.",
    options: {
      includeOnchain: true,
      includeSocial: false,
      includeSimilarCases: true
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

function assertNodeTool(events, node, eventType, toolName) {
  const event = events?.find((item) => item.node === node && item.eventType === eventType);
  assert(event, `expected ${node} ${eventType} event`);
  assert(
    event.payload?.agentTool?.activeTools?.includes(toolName),
    `expected ${node} to expose ${toolName} app tool audit`
  );
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
