import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const corpus = JSON.parse(await readFile("fixtures/research-eval.v1.json", "utf8"));
const port = Number(process.env.SMOKE_API_PORT ?? 5900 + Math.floor(Math.random() * 600));
const base = process.env.SMOKE_API_BASE ?? `http://127.0.0.1:${port}/api`;
const dataDir = await mkdtemp(join(tmpdir(), "sp-agent-research-eval-data-"));
const projectRoot = await mkdtemp(join(tmpdir(), "sp-agent-research-eval-project-"));
let apiProcess;

try {
  await seedFixtures();
  if (!process.env.SMOKE_API_BASE) {
    apiProcess = spawn(process.execPath, ["apps/api/dist/apps/api/src/main.js"], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(port), SP_AGENT_DATA_DIR: dataDir, SP_AGENT_PROJECT_ROOT: projectRoot, SILICONFLOW_API_KEY: "" },
      stdio: ["ignore", "pipe", "pipe"]
    });
    await waitForApi();
  }

  await seedMemory();
  const results = [];
  for (const testCase of corpus.cases) {
    const response = await postJson(`${base}/extensions/personal.research/invoke`, {
      capabilityId: "research.run",
      input: { question: testCase.question, sourceScopes: testCase.scopes, strategy: testCase.strategy ?? "deterministic" }
    });
    assert(response.status === "completed", `${testCase.id}: research invocation did not complete`);
    const report = response.result.workflow.result;
    assertExpected(testCase, report);
    results.push({ id: testCase.id, metrics: report.metrics, status: testCase.expect });

    if (testCase.checkApproval) await verifyApproval(report);
  }

  const summary = summarize(results);
  console.log(JSON.stringify({ ok: true, corpus: corpus.version, cases: results.length, summary, results }, null, 2));
} finally {
  if (apiProcess) apiProcess.kill("SIGTERM");
  await Promise.all([rm(dataDir, { recursive: true, force: true }), rm(projectRoot, { recursive: true, force: true })]);
}

async function seedFixtures() {
  await mkdir(join(dataDir, "connectors"), { recursive: true });
  await mkdir(projectRoot, { recursive: true });
  await Promise.all([
    writeFile(join(projectRoot, "README.md"), "Research reports are stored locally. Research preserves cited source evidence. Citations preserve source locators.\n", "utf8"),
    writeFile(join(projectRoot, "AGENTS.md"), "Evidence is inspectable. Unsupported answers must not be invented. Memory promotion requires approval.\n", "utf8"),
    writeFile(join(projectRoot, "ARCHITECTURE.md"), "The selected option does not send data remotely in local mode. The selected option sends data remotely when cloud mode is enabled. Cloud mode sends data remotely.\n", "utf8"),
    writeFile(join(projectRoot, "PROCESS.md"), "Local documents are read only.\n", "utf8"),
    writeFile(join(projectRoot, "DEVELOPMENT_PLAN.md"), "Research reports uncertainty when evidence conflicts.\n", "utf8"),
    writeFile(join(projectRoot, "package.json"), JSON.stringify({ name: "research-eval-fixture" }), "utf8"),
    writeFile(join(dataDir, "connectors", "bookmarks.json"), JSON.stringify({
      bookmarks: [
        { id: "bookmark_metadata", title: "Research source metadata", url: "https://example.test/metadata", description: "Bookmark sources preserve retrieval time, citations, and source provenance.", tags: ["research", "evidence"], source: "evaluation", createdAt: new Date().toISOString() },
        { id: "bookmark_remote", title: "Remote connector policy", url: "https://example.test/remote", description: "Remote connectors require explicit approval before they access external data.", tags: ["remote", "approval"], source: "evaluation", createdAt: new Date().toISOString() }
      ]
    }, null, 2), "utf8")
  ]);
}

async function seedMemory() {
  const session = await postJson(`${base}/chat/sessions`, { title: "Research evaluation" });
  const normal = await postJson(`${base}/memory/candidates`, {
    content: "The user's research preference is local citations.", kind: "core", scope: "session", sessionId: session.id,
    source: { type: "user", id: "eval", label: "evaluation fixture" }, confidence: 0.9, tags: ["research", "preference"]
  });
  await postJson(`${base}/memory/${normal.memoryId}/promote`, { reason: "Evaluation fixture" });
  const sensitive = await postJson(`${base}/memory/candidates`, {
    content: "The secret passport code is violet-77.", kind: "core", scope: "session", sessionId: session.id,
    source: { type: "user", id: "eval", label: "evaluation fixture" }, confidence: 0.9, sensitivity: "sensitive", tags: ["secret"]
  });
  await postJson(`${base}/memory/${sensitive.memoryId}/promote`, { reason: "Evaluation fixture" });
}

function assertExpected(testCase, report) {
  const diagnostics = JSON.stringify({ claims: report.claims, sources: report.sources.map((source) => source.title), evidence: report.evidence.map((item) => item.excerpt) });
  if (testCase.expect === "supported") assert(report.claims.some((claim) => claim.status === "supported"), `${testCase.id}: expected supported claim; ${diagnostics}`);
  if (testCase.expect === "contested") assert(report.claims.some((claim) => claim.status === "contested"), `${testCase.id}: expected contested claim; ${diagnostics}`);
  if (testCase.expect === "insufficient") assert(report.claims.some((claim) => claim.status === "insufficient"), `${testCase.id}: expected insufficient claim; ${diagnostics}`);
  if (testCase.expect === "degraded") assert(Boolean(report.degradedReason), `${testCase.id}: expected degraded reason`);
  if (testCase.expectMemory === true) assert(report.sources.some((source) => source.type === "memory"), `${testCase.id}: expected relevant memory source`);
  if (testCase.expectMemory === false) assert(!report.sources.some((source) => source.type === "memory"), `${testCase.id}: sensitive memory must be excluded`);
  assert(report.claims.every((claim) => claim.status === "insufficient" || claim.supportingEvidenceIds.length > 0 || claim.conflictingEvidenceIds.length > 0), `${testCase.id}: claims must have citations or be insufficient`);
}

async function verifyApproval(report) {
  const claim = report.claims.find((item) => item.status === "supported");
  assert(claim, "approval fixture requires a supported claim");
  const pending = await postJson(`${base}/extensions/local.memory/invoke`, {
    capabilityId: "memory.write_candidate",
    input: { content: claim.statement, kind: "project", source: { type: "system", id: report.id, label: "research evaluation" }, provenance: { reportId: report.id }, confidence: claim.confidence, tags: ["research", "evaluation"] }
  });
  assert(pending.status === "pending_approval", "research memory promotion must require approval");
}

function summarize(results) {
  const total = results.length || 1;
  const totals = results.reduce((summary, item) => ({
    sourceCount: summary.sourceCount + item.metrics.sourceCount,
    evidenceCount: summary.evidenceCount + item.metrics.evidenceCount,
    citedClaimCount: summary.citedClaimCount + item.metrics.citedClaimCount,
    totalMs: summary.totalMs + item.metrics.totalMs
  }), { sourceCount: 0, evidenceCount: 0, citedClaimCount: 0, totalMs: 0 });
  return {
    averageSources: Number((totals.sourceCount / total).toFixed(2)),
    averageEvidence: Number((totals.evidenceCount / total).toFixed(2)),
    averageCitedClaims: Number((totals.citedClaimCount / total).toFixed(2)),
    averageLatencyMs: Number((totals.totalMs / total).toFixed(2))
  };
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
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
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
