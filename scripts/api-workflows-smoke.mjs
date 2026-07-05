import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = Number(process.env.SMOKE_API_PORT ?? 4800 + Math.floor(Math.random() * 1000));
const base = process.env.SMOKE_API_BASE ?? `http://127.0.0.1:${port}/api`;
const dataDir = await mkdtemp(join(tmpdir(), "sp-agent-workflows-smoke-"));
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
    await waitForApi();
  }

  const started = await postJson(`${base}/workflows/local-project/search-docs`, {
    query: "workflow runner extension registry",
    limit: 3
  });
  assert(started.workflow?.id, "workflow should have id");
  assert(started.workflow.status === "completed", "project doc search workflow should complete");
  assert(started.workflow.kind === "local.project.search_docs", "workflow kind should match project doc search");
  assert(started.workflow.nodeEvents?.some((event) => event.nodeId === "read_docs"), "workflow should expose read_docs node event");

  const fetched = await getJson(`${base}/workflows/${started.workflow.id}`);
  assert(fetched.workflow.id === started.workflow.id, "workflow get should return persisted workflow");

  const retried = await postJson(`${base}/workflows/${started.workflow.id}/retry`, {});
  assert(retried.workflow.id !== started.workflow.id, "retry should create a new workflow");
  assert(retried.workflow.status === "completed", "retried workflow should complete");

  const asyncStarted = await postJson(`${base}/workflows/local-project/search-docs/async`, {
    query: "extension registry async workflow",
    limit: 2
  });
  assert(asyncStarted.workflow?.id, "async workflow should have id");
  assert(asyncStarted.workflow.status === "pending", "async workflow should start pending");
  const asyncCompleted = await waitForWorkflow(asyncStarted.workflow.id, "completed");
  assert(asyncCompleted.workflow.nodeEvents?.some((event) => event.nodeId === "run"), "async workflow should expose queued run node event");

  const cancelled = await postJson(`${base}/workflows/${retried.workflow.id}/cancel`, {});
  assert(cancelled.workflow.degradedReason?.includes("already completed"), "cancelling completed workflow should be a truthful no-op");

  const list = await getJson(`${base}/workflows`);
  assert(list.workflows.length >= 3, "workflow list should include started, retried, and async workflows");

  const extensionSearch = await postJson(`${base}/extensions/local.project/invoke`, {
    capabilityId: "project.search_docs",
    input: { query: "memory approval", limit: 2 }
  });
  assert(extensionSearch.status === "completed", "extension-backed project workflow should complete");
  assert(extensionSearch.permissionAudit.mode === "read_only", "project workflow extension should be read-only");
  assert(extensionSearch.result.workflow.status === "completed", "extension result should include completed workflow");

  console.log(
    JSON.stringify(
      {
        ok: true,
        workflowId: started.workflow.id,
        retriedWorkflowId: retried.workflow.id,
        asyncWorkflowId: asyncCompleted.workflow.id,
        nodeEventCount: started.workflow.nodeEvents.length,
        dataDir
      },
      null,
      2
    )
  );
} finally {
  if (apiProcess) apiProcess.kill("SIGTERM");
  await rm(dataDir, { recursive: true, force: true });
}

async function waitForApi() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const health = await getJson(`${base}/health`);
      if (health.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`API did not start at ${base}`);
}

async function getJson(url) {
  const response = await fetch(url);
  return readJson(response, url);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return readJson(response, url);
}

async function waitForWorkflow(id, status) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const workflow = await getJson(`${base}/workflows/${id}`);
    if (workflow.workflow?.status === status) return workflow;
    if (workflow.workflow?.status === "failed") throw new Error(`workflow ${id} failed: ${workflow.workflow.error}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`workflow ${id} did not reach ${status}`);
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
