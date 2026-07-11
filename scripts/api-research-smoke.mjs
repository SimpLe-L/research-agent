import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const port = Number(process.env.SMOKE_API_PORT ?? 5000 + Math.floor(Math.random() * 800));
const base = process.env.SMOKE_API_BASE ?? `http://127.0.0.1:${port}/api`;
const dataDir = await mkdtemp(join(tmpdir(), "sp-agent-research-smoke-data-"));
const projectRoot = await mkdtemp(join(tmpdir(), "sp-agent-research-smoke-project-"));
let apiProcess;

try {
  await seedFixtureProject();
  if (!process.env.SMOKE_API_BASE) {
    apiProcess = spawn(process.execPath, ["apps/api/dist/apps/api/src/main.js"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        SP_AGENT_DATA_DIR: dataDir,
        SP_AGENT_PROJECT_ROOT: projectRoot,
        SILICONFLOW_API_KEY: "",
        TAVILY_API_KEY: ""
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    await waitForApi();
  }

  const registry = await getJson(`${base}/extensions`);
  const research = registry.extensions.find((extension) => extension.id === "personal.research");
  assert(research?.status === "active", "personal.research should be active");
  assert(research.capabilities.some((capability) => capability.id === "research.run"), "research.run should be registered");
  assert(research.capabilities.some((capability) => capability.id === "research.get_report"), "research.get_report should be registered");
  assert(research.capabilities.some((capability) => capability.id === "research.search_web"), "research.search_web should be registered");

  const supported = await runResearch("Where are reports stored?");
  assert(supported.workflow.status === "completed", "supported research run should complete");
  const supportedReport = supported.workflow.result;
  assert(supportedReport.evidence.length >= 1, "supported research should collect evidence");
  assert(supportedReport.claims.some((claim) => claim.status === "supported"), "supported research should expose a supported claim");
  assert(supportedReport.claims.every((claim) => claim.status === "insufficient" || claim.supportingEvidenceIds.length > 0 || claim.conflictingEvidenceIds.length > 0), "claims must be cited or marked insufficient");

  const inspected = await postJson(`${base}/extensions/personal.research/invoke`, {
    capabilityId: "research.get_report",
    input: { workflowId: supported.workflow.id }
  });
  assert(inspected.status === "completed", "research.get_report should complete");
  assert(inspected.result.report.id === supportedReport.id, "research.get_report should return persisted report");
  assert(inspected.result.report.metrics.citedClaimCount >= 1, "research report should expose citation metrics");

  const contested = await runResearch("Does the selected option send data remotely?");
  assert(contested.workflow.result.claims.some((claim) => claim.status === "contested"), "conflicting fixture sources should produce a contested claim");
  assert(contested.workflow.result.uncertainty.some((item) => item.includes("Conflicting evidence")), "contested research should expose uncertainty");

  const insufficient = await runResearch("What is the quartz sentinel identifier?");
  assert(insufficient.workflow.result.claims.some((claim) => claim.status === "insufficient"), "missing evidence should be marked insufficient");
  assert(insufficient.workflow.result.answer.includes("could not reach a supported conclusion"), "insufficient research should not invent an answer");

  const providerRequested = await runResearch("Where are reports stored?", "provider_assisted");
  assert(providerRequested.workflow.result.provider === "deterministic", "offline research should use deterministic synthesis");
  assert(providerRequested.workflow.result.degradedReason?.includes("Provider-assisted"), "provider request should expose degraded reason");

  const expectedNodes = ["validate_source_scope", "collect_sources", "normalize_sources", "retrieve_memory", "extract_evidence", "compare_evidence", "synthesize_report", "validate_citations"];
  assert(expectedNodes.every((nodeId) => supported.workflow.nodeEvents.some((event) => event.nodeId === nodeId)), "research workflow should preserve every required node event");

  const retried = await postJson(`${base}/workflows/${supported.workflow.id}/retry`, {});
  assert(retried.workflow.kind === "personal.research.run" && retried.workflow.status === "completed", "research workflows should be retryable");

  const importInput = { title: "Imported local note", content: "Private notes stay local and preserve provenance.", locator: "user://smoke/imported-note", tags: ["smoke"] };
  const importPending = await postJson(`${base}/extensions/personal.research/invoke`, { capabilityId: "research.import_source", input: importInput });
  assert(importPending.status === "pending_approval", "research import should require approval");
  await patchJson(`${base}/approvals/${importPending.approval.id}`, { decision: "approved", reason: "Research smoke import." });
  const imported = await postJson(`${base}/extensions/personal.research/invoke`, { capabilityId: "research.import_source", input: importInput, approvalId: importPending.approval.id });
  assert(imported.status === "completed" && imported.result.type === "user_import", "approved research import should persist a user source");
  const importedRun = await postJson(`${base}/extensions/personal.research/invoke`, { capabilityId: "research.run", input: { question: "Do private notes stay local?", sourceScopes: ["user_provided"], sourceIds: [imported.result.id] } });
  assert(importedRun.result.workflow.result.claims.some((claim) => claim.status === "supported"), "imported source should be usable in scoped research");

  const webPending = await postJson(`${base}/extensions/personal.research/invoke`, { capabilityId: "research.fetch_web_source", input: { url: "https://example.test/research" } });
  assert(webPending.status === "pending_approval", "remote fetch should require approval before any provider request");
  await patchJson(`${base}/approvals/${webPending.approval.id}`, { decision: "approved", reason: "Research smoke web policy." });
  await expectPostFailure(`${base}/extensions/personal.research/invoke`, { capabilityId: "research.fetch_web_source", input: webPending.approval.input, approvalId: webPending.approval.id }, 500);

  const webSearchInput = { question: "What is the quartz sentinel identifier?", maxResults: 3 };
  const webSearchPending = await postJson(`${base}/extensions/personal.research/invoke`, { capabilityId: "research.search_web", input: webSearchInput });
  assert(webSearchPending.status === "pending_approval", "web search should request approval before sending the query to its provider");
  assert(webSearchPending.permissionAudit.mode === "write_or_provider", "web search should be audited as a provider action");
  await patchJson(`${base}/approvals/${webSearchPending.approval.id}`, { decision: "approved", reason: "Research smoke web search policy." });
  const webSearch = await postJson(`${base}/extensions/personal.research/invoke`, {
    capabilityId: "research.search_web",
    input: webSearchInput,
    approvalId: webSearchPending.approval.id
  });
  assert(webSearch.status === "completed", "approved web search should run a research workflow");
  assert(webSearch.result.workflow.result.request.sourceScopes.includes("web"), "web search workflow should record the remote source scope");
  assert(webSearch.result.workflow.result.degradedReason?.includes("TAVILY_API_KEY"), "missing web search configuration should remain explicit instead of inventing evidence");

  console.log(JSON.stringify({ ok: true, workflowId: supported.workflow.id, reportId: supportedReport.id, dataDir }, null, 2));
} finally {
  if (apiProcess) apiProcess.kill("SIGTERM");
  await Promise.all([rm(dataDir, { recursive: true, force: true }), rm(projectRoot, { recursive: true, force: true })]);
}

async function seedFixtureProject() {
  await mkdir(projectRoot, { recursive: true });
  await Promise.all([
    writeFile(join(projectRoot, "README.md"), "Research reports are stored locally in the application data directory.\n", "utf8"),
    writeFile(join(projectRoot, "AGENTS.md"), "The selected option does not send data remotely in local mode.\n", "utf8"),
    writeFile(join(projectRoot, "ARCHITECTURE.md"), "The selected option sends data remotely when cloud mode is enabled.\n", "utf8"),
    writeFile(join(projectRoot, "PROCESS.md"), "The local-first workflow keeps research evidence inspectable.\n", "utf8"),
    writeFile(join(projectRoot, "DEVELOPMENT_PLAN.md"), "The first release reports uncertainty when evidence conflicts.\n", "utf8"),
    writeFile(join(projectRoot, "package.json"), JSON.stringify({ name: "research-smoke" }), "utf8")
  ]);
}

async function runResearch(question, strategy = "deterministic") {
  const response = await postJson(`${base}/extensions/personal.research/invoke`, {
    capabilityId: "research.run",
    input: { question, sourceScopes: ["local_documents"], strategy }
  });
  assert(response.status === "completed", "research.run should complete");
  assert(response.permissionAudit.mode === "read_only", "research.run should be read-only");
  return response.result;
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
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
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
