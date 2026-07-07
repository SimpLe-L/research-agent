import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = Number(process.env.SMOKE_API_PORT ?? 4700 + Math.floor(Math.random() * 1000));
const base = process.env.SMOKE_API_BASE ?? `http://127.0.0.1:${port}/api`;
const dataDir = await mkdtemp(join(tmpdir(), "sp-agent-extension-smoke-"));
let apiProcess;

try {
  await mkdir(join(dataDir, "connectors"), { recursive: true });
  await writeFile(
    join(dataDir, "connectors", "bookmarks.json"),
    JSON.stringify(
      {
        bookmarks: [
          {
            id: "bookmark_smoke_agent_docs",
            title: "Agent workflow docs",
            url: "https://example.test/agent-workflow",
            description: "Local bookmark connector smoke fixture for workflow and extension boundaries.",
            tags: ["agent", "workflow", "extension"],
            source: "smoke",
            createdAt: new Date().toISOString()
          }
        ]
      },
      null,
      2
    )
  );

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

  const registry = await getJson(`${base}/extensions`);
  const context = registry.extensions.find((extension) => extension.id === "local.context");
  assert(context?.status === "active", "expected active local.context extension");
  assert(context.capabilities.some((capability) => capability.id === "context.snapshot"), "expected context.snapshot capability");
  assert(context.capabilities.some((capability) => capability.id === "context.briefing"), "expected context.briefing capability");
  const memory = registry.extensions.find((extension) => extension.id === "local.memory");
  assert(memory?.capabilities.some((capability) => capability.id === "memory.merge"), "expected memory.merge capability");
  const project = registry.extensions.find((extension) => extension.id === "local.project");
  assert(project?.status === "active", "expected active local.project extension");
  assert(project.capabilities.some((capability) => capability.id === "project.search_docs"), "expected project.search_docs capability");
  assert(project.capabilities.some((capability) => capability.id === "project.plan"), "expected project.plan capability");
  const bookmarks = registry.extensions.find((extension) => extension.id === "local.bookmarks");
  assert(bookmarks?.status === "active", "expected active local.bookmarks connector");
  assert(bookmarks.kind === "connector", "expected local.bookmarks to be registered as a connector");
  assert(bookmarks.capabilities.some((capability) => capability.id === "bookmarks.search"), "expected bookmarks.search capability");
  assert(bookmarks.capabilities.some((capability) => capability.id === "bookmarks.digest"), "expected bookmarks.digest capability");

  const invoked = await postJson(`${base}/extensions/local.context/invoke`, {
    capabilityId: "context.snapshot",
    input: {}
  });
  assert(invoked.status === "completed", "expected context.snapshot invocation to complete");
  assert(invoked.permissionAudit?.mode === "read_only", "expected context.snapshot to be read-only");
  assert(invoked.result?.extensionIds?.includes("local.context"), "expected context snapshot to include local.context");
  assert(typeof invoked.result?.now === "string", "expected context snapshot timestamp");

  const briefing = await postJson(`${base}/extensions/local.context/invoke`, {
    capabilityId: "context.briefing",
    input: { includeWorkflows: true, workflowLimit: 3 }
  });
  assert(briefing.status === "completed", "expected context.briefing invocation to complete");
  assert(briefing.permissionAudit?.mode === "read_only", "expected context.briefing to be read-only");
  assert(briefing.result?.extensionSummary?.active >= 1, "context briefing should include active extension count");
  assert(Array.isArray(briefing.result?.extensionSummary?.extensions), "context briefing should include extension details");
  assert(typeof briefing.result?.workflowSummary?.total === "number", "context briefing should include workflow summary");

  const pending = await postJson(`${base}/extensions/local.memory/invoke`, {
    capabilityId: "memory.write_candidate",
    input: { content: "extension approval smoke", source: { type: "system" } }
  });
  assert(pending.status === "pending_approval", "write extension should request approval");
  assert(pending.approval?.status === "pending", "write extension should return pending approval");

  const approved = await patchJson(`${base}/approvals/${pending.approval.id}`, {
    decision: "approved",
    reason: "Extension smoke approval."
  });
  assert(approved.approval?.status === "approved", "approval request should be approved");
  await expectPostFailure(
    `${base}/extensions/local.memory/invoke`,
    {
      capabilityId: "memory.write_candidate",
      input: { ...pending.approval.input, content: "tampered approval input" },
      approvalId: pending.approval.id
    },
    400
  );
  const completedWrite = await postJson(`${base}/extensions/local.memory/invoke`, {
    capabilityId: "memory.write_candidate",
    input: pending.approval.input,
    approvalId: pending.approval.id
  });
  assert(completedWrite.status === "completed", "approved write extension should execute");
  assert(completedWrite.result?.memory?.content === "extension approval smoke", "approved write should create the memory candidate");

  const projectSearch = await postJson(`${base}/extensions/local.project/invoke`, {
    capabilityId: "project.search_docs",
    input: { query: "workflow approval memory", limit: 3 }
  });
  assert(projectSearch.status === "completed", "project.search_docs should complete");
  assert(projectSearch.permissionAudit?.mode === "read_only", "project.search_docs should be read-only");
  assert(projectSearch.result?.workflow?.status === "completed", "project search should return completed workflow");
  assert(projectSearch.result.workflow.nodeEvents?.length >= 2, "project search workflow should expose node events");

  const projectPlan = await postJson(`${base}/extensions/local.project/invoke`, {
    capabilityId: "project.plan",
    input: { goal: "Plan workflow and extension next steps", limit: 4 }
  });
  assert(projectPlan.status === "completed", "project.plan should complete");
  assert(projectPlan.permissionAudit?.mode === "read_only", "project.plan should be read-only");
  assert(projectPlan.result?.plan?.nextSteps?.length >= 2, "project.plan should return next steps");
  assert(projectPlan.result?.workflow?.status === "completed", "project.plan should include supporting workflow");

  const bookmarkSearch = await postJson(`${base}/extensions/local.bookmarks/invoke`, {
    capabilityId: "bookmarks.search",
    input: { query: "workflow", limit: 5 }
  });
  assert(bookmarkSearch.status === "completed", "bookmarks.search should complete");
  assert(bookmarkSearch.permissionAudit?.mode === "read_only", "bookmarks.search should be read-only");
  assert(bookmarkSearch.result?.bookmarks?.[0]?.id === "bookmark_smoke_agent_docs", "bookmarks.search should return connector fixture");

  const bookmarkDigest = await postJson(`${base}/extensions/local.bookmarks/invoke`, {
    capabilityId: "bookmarks.digest",
    input: { query: "workflow", limit: 5 }
  });
  assert(bookmarkDigest.status === "completed", "bookmarks.digest should complete");
  assert(bookmarkDigest.permissionAudit?.mode === "read_only", "bookmarks.digest should be read-only");
  assert(bookmarkDigest.result?.digest?.matched >= 1, "bookmarks.digest should include matched count");
  assert(bookmarkDigest.result?.digest?.topTags?.some((tag) => tag.name === "workflow"), "bookmarks.digest should include tag summary");

  console.log(
    JSON.stringify(
      {
        ok: true,
        extensionIds: registry.extensions.map((extension) => extension.id),
        contextSnapshot: invoked.result
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

async function patchJson(url, body) {
  const response = await fetch(url, {
    method: "PATCH",
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

async function readJson(response, url) {
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  assert(response.ok, `${url} failed with ${response.status}: ${text}`);
  return json;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
