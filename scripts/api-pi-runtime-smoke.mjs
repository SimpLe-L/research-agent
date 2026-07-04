import { getResearchReport, getResearchTask, getResearchTaskEvents } from "./smoke-extension-client.mjs";

const apiBase = process.env.SMOKE_API_BASE ?? "http://localhost:4317/api";
const timeoutMs = Number(process.env.SMOKE_PI_API_TIMEOUT_MS ?? 240000);
const pollIntervalMs = Number(process.env.SMOKE_POLL_INTERVAL_MS ?? 1000);

async function main() {
  await assertOk(`${apiBase}/health`, "health");

  const providers = await readJson(`${apiBase}/providers/status`);
  const agentRuntime = providers.providers?.find((provider) => provider.name === "agent-runtime");
  assert(agentRuntime?.provider === "pi", `expected agent-runtime provider=pi, got ${agentRuntime?.provider ?? "missing"}`);
  assert(agentRuntime?.reachable === true, `expected Pi runtime reachable, got ${agentRuntime?.degradedReason ?? "unknown"}`);

  const created = await postJson(`${apiBase}/agent/research-sessions`, {
    input: "PI_RUNTIME_SMOKE_UNI",
    inputType: "symbol",
    question: "Pi runtime API smoke",
    userMessage: "Start a Pi-coordinated research session for smoke verification.",
    options: {
      includeOnchain: true,
      includeSocial: false,
      includeSimilarCases: true
    }
  });
  assert(["pending", "running"].includes(created.task?.status), `expected new task status pending/running, got ${created.task?.status}`);
  assert(created.mode === "pi_research_session", `expected pi_research_session mode, got ${created.mode ?? "missing"}`);
  assert(created.coordinator === "pi", `expected coordinator=pi, got ${created.coordinator ?? "missing"}`);
  assert(created.permissionAudit?.mode === "write_or_provider", "expected research session create_task permission audit");
  assert(created.plannedTools?.includes("resolve_asset"), "expected research session planned tool resolve_asset");

  const task = await waitForTask(created.task.id);
  assert(task.status === "completed", `expected Pi API smoke task completed, got ${task.status}`);

  const events = await getResearchTaskEvents(apiBase, created.task.id);
  const sessionStartEvent = events.events?.find((event) => event.eventType === "agent_research_session_started");
  assert(sessionStartEvent, "expected agent_research_session_started event");
  assert(sessionStartEvent.payload?.coordinator === "pi", "expected session start coordinator=pi");
  assert(
    sessionStartEvent.payload?.plannedTools?.includes("resolve_asset"),
    "expected session start event to include research tool plan"
  );
  const resolveAssetEvent = events.events?.find((event) => event.node === "resolve_asset" && event.eventType === "node_completed");
  assert(resolveAssetEvent?.payload?.asset, "expected resolve_asset node payload");
  assert(
    resolveAssetEvent.payload?.agentTool?.activeTools?.includes("resolve_research_asset"),
    "expected resolve_asset node to expose Pi-callable resolve_research_asset app tool"
  );
  const collectSourcesEvent = events.events?.find((event) => event.node === "collect_sources" && event.eventType === "node_completed");
  assert(collectSourcesEvent?.payload?.sources, "expected collect_sources node payload");
  assert(
    collectSourcesEvent.payload?.agentTool?.activeTools?.includes("collect_research_sources"),
    "expected collect_sources node to expose Pi-callable collect_research_sources app tool"
  );
  const marketDataEvent = events.events?.find((event) => event.node === "fetch_market_data" && event.eventType === "node_completed");
  assert(marketDataEvent?.payload?.marketData, "expected fetch_market_data node payload");
  assert(
    marketDataEvent.payload?.agentTool?.activeTools?.includes("fetch_research_market_data"),
    "expected fetch_market_data node to expose Pi-callable fetch_research_market_data app tool"
  );
  const onchainDataEvent = events.events?.find((event) => event.node === "fetch_onchain_data" && event.eventType === "node_completed");
  assert(onchainDataEvent, "expected fetch_onchain_data node payload");
  assert(
    onchainDataEvent.payload?.agentTool?.activeTools?.includes("fetch_research_onchain_data"),
    "expected fetch_onchain_data node to expose Pi-callable fetch_research_onchain_data app tool"
  );
  const matchCasesEvent = events.events?.find((event) => event.node === "match_cases" && event.eventType === "node_completed");
  assert(matchCasesEvent, "expected match_cases node payload");
  assert(
    matchCasesEvent.payload?.agentTool?.activeTools?.includes("search_research_knowledge"),
    "expected match_cases node to expose Pi-callable search_research_knowledge app tool"
  );
  const analyzeRiskEvent = events.events?.find((event) => event.node === "analyze_risk" && event.eventType === "node_completed");
  assert(analyzeRiskEvent?.payload?.risk, "expected analyze_risk node risk payload");
  assert(
    analyzeRiskEvent.payload?.agentTool?.activeTools?.includes("analyze_research_risk"),
    "expected analyze_risk node to expose Pi-callable analyze_research_risk app tool"
  );
  const agentEvent = events.events?.find((event) => event.eventType === "agent_report_completed" || event.eventType === "agent_report_degraded");
  assert(agentEvent, "expected an agent report completion or degraded event");
  assert(
    agentEvent.eventType === "agent_report_completed",
    `expected Pi agent report completion, got degraded: ${agentEvent.payload?.reason ?? "unknown"}`
  );
  assert(
    agentEvent.payload?.model === "siliconflow/deepseek-ai/DeepSeek-V4-Flash",
    `expected SiliconFlow DeepSeek V4 Flash model, got ${agentEvent.payload?.model ?? "missing"}`
  );
  assert(
    agentEvent.payload?.agentTool?.activeTools?.includes("write_research_report"),
    "expected write_report node to expose Pi-callable write_research_report app tool"
  );
  const indexedEvent = await waitForEvent(created.task.id, "knowledge_indexed");
  assert(indexedEvent, "expected index_knowledge node payload");
  assert(
    indexedEvent.payload?.agentTool?.activeTools?.includes("index_research_knowledge"),
    "expected index_knowledge node to expose Pi-callable index_research_knowledge app tool"
  );

  const report = await getResearchReport(apiBase, created.task.id);
  assert(typeof report.markdown === "string" && report.markdown.length > 100, "expected non-empty Pi drafted report markdown");

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBase,
        taskId: created.task.id,
        reportId: report.id,
        model: agentEvent.payload.model,
        recommendation: report.recommendation,
        confidence: report.confidence
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
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const events = await getResearchTaskEvents(apiBase, taskId);
    const event = events.events?.find((item) => item.eventType === eventType);
    if (event) return event;
    await sleep(pollIntervalMs);
  }
  throw new Error(`Timed out waiting for event ${eventType} on task ${taskId}`);
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
