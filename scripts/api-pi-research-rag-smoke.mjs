import {
  getReport,
  getReportSources,
  getResearchReport,
  getResearchTask,
  getResearchTaskEvents,
  reindexKnowledgeReport,
  searchKnowledge
} from "./smoke-extension-client.mjs";

const apiBase = process.env.SMOKE_API_BASE ?? "http://localhost:4317/api";
const timeoutMs = Number(process.env.SMOKE_PI_RESEARCH_RAG_TIMEOUT_MS ?? 420000);
const pollIntervalMs = Number(process.env.SMOKE_POLL_INTERVAL_MS ?? 1000);
const expectedModel = process.env.SMOKE_PI_MODEL ?? "siliconflow/deepseek-ai/DeepSeek-V4-Flash";
const expectedTools = ["inspect_research_context", "inspect_deterministic_report"];

async function main() {
  await assertOk(`${apiBase}/health`, "health");
  await waitForQueueIdle();

  const providers = await readJson(`${apiBase}/providers/status`);
  const agentRuntime = providers.providers?.find((provider) => provider.name === "agent-runtime");
  assert(agentRuntime?.provider === "pi", `expected agent-runtime provider=pi, got ${agentRuntime?.provider ?? "missing"}`);
  assert(agentRuntime?.reachable === true, `expected Pi runtime reachable, got ${agentRuntime?.degradedReason ?? "unknown"}`);

  const marker = `PI_RESEARCH_RAG_SMOKE_${Date.now()}`;
  const created = await postJson(`${apiBase}/agent/research-sessions`, {
    input: marker,
    inputType: "symbol",
    question: `Pi research-to-RAG smoke for ${marker}`,
    userMessage: "Start a Pi-coordinated research session and preserve audit events.",
    options: {
      includeOnchain: true,
      includeSocial: false,
      includeSimilarCases: true
    }
  });
  assert(created.task?.id, "expected created research task id");
  assert(created.mode === "pi_research_session", `expected pi_research_session mode, got ${created.mode ?? "missing"}`);
  assert(created.coordinator === "pi", `expected coordinator=pi, got ${created.coordinator ?? "missing"}`);
  assert(created.permissionAudit?.mode === "write_or_provider", "expected create_task permission audit");
  assert(created.plannedTools?.includes("resolve_asset"), "expected research session planned tool resolve_asset");

  const task = await waitForTask(created.task.id);
  assert(task.status === "completed", `expected Pi research-to-RAG task completed, got ${task.status}`);

  const sessionStartEvent = await waitForEvent(created.task.id, "agent_research_session_started");
  assert(sessionStartEvent.payload?.coordinator === "pi", "expected session start coordinator=pi");
  assert(
    sessionStartEvent.payload?.plannedTools?.includes("resolve_asset"),
    "expected session start event to include research tool plan"
  );
  const eventsAfterSessionStart = await getResearchTaskEvents(apiBase, created.task.id);
  const resolveAssetEvent = eventsAfterSessionStart.events?.find((event) => event.node === "resolve_asset" && event.eventType === "node_completed");
  assert(resolveAssetEvent?.payload?.asset, "expected resolve_asset node payload");
  assert(
    resolveAssetEvent.payload?.agentTool?.activeTools?.includes("resolve_research_asset"),
    "expected resolve_asset node to expose Pi-callable resolve_research_asset app tool"
  );
  const collectSourcesEvent = eventsAfterSessionStart.events?.find((event) => event.node === "collect_sources" && event.eventType === "node_completed");
  assert(collectSourcesEvent?.payload?.sources, "expected collect_sources node payload");
  assert(
    collectSourcesEvent.payload?.agentTool?.activeTools?.includes("collect_research_sources"),
    "expected collect_sources node to expose Pi-callable collect_research_sources app tool"
  );
  const marketDataEvent = eventsAfterSessionStart.events?.find((event) => event.node === "fetch_market_data" && event.eventType === "node_completed");
  assert(marketDataEvent?.payload?.marketData, "expected fetch_market_data node payload");
  assert(
    marketDataEvent.payload?.agentTool?.activeTools?.includes("fetch_research_market_data"),
    "expected fetch_market_data node to expose Pi-callable fetch_research_market_data app tool"
  );
  const onchainDataEvent = eventsAfterSessionStart.events?.find((event) => event.node === "fetch_onchain_data" && event.eventType === "node_completed");
  assert(onchainDataEvent, "expected fetch_onchain_data node payload");
  assert(
    onchainDataEvent.payload?.agentTool?.activeTools?.includes("fetch_research_onchain_data"),
    "expected fetch_onchain_data node to expose Pi-callable fetch_research_onchain_data app tool"
  );
  const matchCasesEvent = eventsAfterSessionStart.events?.find((event) => event.node === "match_cases" && event.eventType === "node_completed");
  assert(matchCasesEvent, "expected match_cases node payload");
  assert(
    matchCasesEvent.payload?.agentTool?.activeTools?.includes("search_research_knowledge"),
    "expected match_cases node to expose Pi-callable search_research_knowledge app tool"
  );
  const analyzeRiskEvent = eventsAfterSessionStart.events?.find((event) => event.node === "analyze_risk" && event.eventType === "node_completed");
  assert(analyzeRiskEvent?.payload?.risk, "expected analyze_risk node risk payload");
  assert(
    analyzeRiskEvent.payload?.agentTool?.activeTools?.includes("analyze_research_risk"),
    "expected analyze_risk node to expose Pi-callable analyze_research_risk app tool"
  );

  const agentEvent = await waitForAnyEvent(created.task.id, ["agent_report_completed", "agent_report_degraded"]);
  assert(
    agentEvent.eventType === "agent_report_completed",
    `expected Pi agent report completion, got degraded: ${agentEvent.payload?.reason ?? "unknown"}`
  );
  assert(agentEvent.payload?.provider === "pi", `expected agent report provider=pi, got ${agentEvent.payload?.provider ?? "missing"}`);
  assert(agentEvent.payload?.model === expectedModel, `expected model ${expectedModel}, got ${agentEvent.payload?.model ?? "missing"}`);
  for (const toolName of expectedTools) {
    assert(agentEvent.payload?.activeTools?.includes(toolName), `expected active Pi app tool ${toolName}`);
  }
  assert(
    agentEvent.payload?.agentTool?.activeTools?.includes("write_research_report"),
    "expected write_report node to expose Pi-callable write_research_report app tool"
  );
  assert(Array.isArray(agentEvent.payload?.toolCalls), "expected Pi toolCalls audit array");

  const report = await getResearchReport(apiBase, created.task.id);
  assert(report.id, "expected generated report id");
  assert(report.taskId === created.task.id, `expected report taskId ${created.task.id}, got ${report.taskId}`);
  assert(typeof report.markdown === "string" && report.markdown.includes(marker), "expected report markdown to preserve input marker");
  assert(typeof report.markdown === "string" && report.markdown.includes("Agent 生成说明"), "expected Pi drafted report to include agent generation appendix");

  const indexedEvent = await waitForEvent(created.task.id, "knowledge_indexed");
  assert(indexedEvent.payload?.indexed === true || typeof indexedEvent.payload?.degradedReason === "string", "expected knowledge indexing to complete or degrade explicitly");
  assert(
    indexedEvent.payload?.agentTool?.activeTools?.includes("index_research_knowledge"),
    "expected index_knowledge node to expose Pi-callable index_research_knowledge app tool"
  );

  const storedReport = await getReport(apiBase, report.id);
  assert(storedReport.id === report.id, "expected Pi report to be retrievable from knowledge reports");
  assert(storedReport.markdown.includes(marker), "expected stored knowledge report to preserve input marker");

  const search = await searchKnowledge(apiBase, marker);
  assert(Array.isArray(search.reports), "expected knowledge search reports array");
  assert(search.reports.some((item) => item.id === report.id), `expected knowledge SQL search to return generated report ${report.id}`);
  assert(Array.isArray(search.vectorHits), "expected knowledge search vectorHits array");
  assert(
    search.vectorHits.some((item) => item.reportId === report.id) || typeof search.degradedReason === "string",
    "expected vector search to return the generated report or degrade explicitly"
  );

  const reportSources = await getReportSources(apiBase, report.id);
  assert(Array.isArray(reportSources.sources), "expected report sources array");

  const reindex = await reindexKnowledgeReport(apiBase, report.id);
  assert(reindex.reportId === report.id, "expected report-specific reindex to target generated Pi report");
  assert(reindex.indexed === true || typeof reindex.degradedReason === "string", "expected report-specific vector indexing or explicit degradation");

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBase,
        taskId: created.task.id,
        reportId: report.id,
        marker,
        model: agentEvent.payload.model,
        activeTools: agentEvent.payload.activeTools,
        toolCallCount: agentEvent.payload.toolCalls.length,
        knowledgeIndexed: indexedEvent.payload,
        sqlHits: search.reports.length,
        vectorHits: search.vectorHits.length,
        vectorDegradedReason: search.degradedReason,
        reportSourceCount: reportSources.sources.length,
        reindex
      },
      null,
      2
    )
  );
}

async function waitForTask(taskId) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const task = await getResearchTask(apiBase, taskId);
    if (["completed", "failed", "cancelled"].includes(task.status)) return task;
    await sleep(pollIntervalMs);
  }
  throw new Error(`Timed out waiting for task ${taskId}`);
}

async function waitForEvent(taskId, eventType) {
  return waitForAnyEvent(taskId, [eventType]);
}

async function waitForAnyEvent(taskId, eventTypes) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const events = await getResearchTaskEvents(apiBase, taskId);
    const event = events.events?.find((item) => eventTypes.includes(item.eventType));
    if (event) return event;
    await sleep(pollIntervalMs);
  }
  throw new Error(`Timed out waiting for ${eventTypes.join(" or ")} on task ${taskId}`);
}

async function waitForQueueIdle() {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const queue = await readJson(`${apiBase}/research/queue`);
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
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  assert(response.ok, `${url} returned HTTP ${response.status}`);
  return response.json();
}

async function assertOk(url, label) {
  const response = await fetch(url);
  assert(response.ok, `${label} returned HTTP ${response.status}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
