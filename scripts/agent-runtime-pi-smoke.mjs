await import("../apps/api/dist/apps/api/src/env.js").catch(() => undefined);
const { draftResearchReportWithAgent, getAgentRuntimeStatus, runPersonalAgentTurnWithAgent } = await import("../packages/agent-runtime/dist/index.js");

const baseInput = {
  baseReportMarkdown: [
    "# Pi Runtime Smoke Report",
    "",
    "- Source: https://example.com/pi-runtime-smoke",
    "- Degraded reason: This is a local smoke fixture.",
    "",
    "## Recommendation",
    "Watch"
  ].join("\n"),
  baseSummary: "Pi runtime local readiness smoke.",
  recommendation: "Watch",
  confidence: 55,
  researchContext: {
    taskId: "task_pi_runtime_smoke",
    asset: { symbol: "PI-SMOKE", chain: "ethereum" },
    sources: [{ title: "Pi Runtime Smoke", url: "https://example.com/pi-runtime-smoke" }],
    marketData: [],
    degradedReasons: ["This is a local smoke fixture."]
  }
};

async function main() {
  const missingConfig = await getAgentRuntimeStatus({
    AGENT_RUNTIME_PROVIDER: "pi"
  });
  assert(missingConfig.provider === "pi", `expected pi provider, got ${missingConfig.provider}`);
  assert(missingConfig.sdkLoaded === true, "expected Pi SDK package to be loadable");
  assert(missingConfig.configured === false, "expected missing Pi config to be unconfigured");
  assert(missingConfig.reachable === false, "expected missing Pi config to be unreachable");

  const missingModelEnv = {
    AGENT_RUNTIME_PROVIDER: "pi",
    PI_MODEL_PROVIDER: "openai",
    PI_MODEL_ID: "sp-agent-missing-model",
    PI_API_KEY: "sp-agent-local-smoke-placeholder",
    AGENT_RUNTIME_TIMEOUT_MS: "1000"
  };
  const missingModel = await getAgentRuntimeStatus(missingModelEnv);
  assert(missingModel.configured === true, "expected placeholder Pi config to be configured");
  assert(missingModel.sdkLoaded === true, "expected Pi SDK package to remain loadable");
  assert(missingModel.selectedModelAvailable === false, "expected missing model to be unavailable");
  assert(missingModel.reachable === false, "expected missing model to be unreachable");

  const missingModelDraft = await draftResearchReportWithAgent(baseInput, missingModelEnv);
  assert(missingModelDraft.provider === "pi", `expected pi draft provider, got ${missingModelDraft.provider}`);
  assert(Boolean(missingModelDraft.degradedReason), "expected missing model draft to degrade");

  const missingConfigTurn = await runPersonalAgentTurnWithAgent(
    {
      message: "List local extensions",
      extensionManifests: [{ id: "local.knowledge", capabilities: [{ id: "knowledge.search" }] }],
      safetyModel: { defaultToolPolicy: "read_only" }
    },
    { AGENT_RUNTIME_PROVIDER: "pi" }
  );
  assert(missingConfigTurn.provider === "pi", `expected pi turn provider, got ${missingConfigTurn.provider}`);
  assert(Boolean(missingConfigTurn.degradedReason), "expected missing config turn to degrade");
  assert(
    missingConfigTurn.activeTools?.includes("inspect_extension_registry") &&
      missingConfigTurn.activeTools?.includes("invoke_extension_capability"),
    `expected personal agent turn to expose registry and extension tools, got ${JSON.stringify(missingConfigTurn.activeTools)}`
  );

  let liveDraft;
  if (process.env.PI_LIVE_SMOKE === "1") {
    const liveEnv = {
      ...process.env,
      AGENT_RUNTIME_PROVIDER: "pi",
      AGENT_RUNTIME_TIMEOUT_MS: process.env.PI_LIVE_SMOKE_TIMEOUT_MS ?? "60000"
    };
    const liveStatus = await getAgentRuntimeStatus(liveEnv);
    assert(liveStatus.provider === "pi", `expected live Pi provider, got ${liveStatus.provider}`);
    assert(liveStatus.configured === true, "PI_LIVE_SMOKE=1 requires SILICONFLOW_API_KEY, PI_API_KEY, or another valid provider key source");
    assert(liveStatus.reachable === true, `expected live Pi runtime locally ready, got ${liveStatus.degradedReason ?? "unknown"}`);

    liveDraft = await draftResearchReportWithAgent(baseInput, liveEnv);
    assert(liveDraft.provider === "pi", `expected live pi draft provider, got ${liveDraft.provider}`);
    assert(!liveDraft.degradedReason, `expected live Pi draft to succeed, got ${liveDraft.degradedReason}`);
    assert(
      liveDraft.activeTools?.includes("inspect_research_context") && liveDraft.activeTools?.includes("inspect_deterministic_report"),
      `expected live Pi draft to expose app research tools, got ${JSON.stringify(liveDraft.activeTools)}`
    );
    assert(
      typeof liveDraft.markdown === "string" && liveDraft.markdown.includes("https://example.com/pi-runtime-smoke"),
      "expected live Pi draft markdown to preserve the source URL"
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        missingConfig,
        missingModel,
        missingModelDegradedReason: missingModelDraft.degradedReason,
        liveSmoke: process.env.PI_LIVE_SMOKE === "1",
        liveModel: liveDraft?.model,
        liveActiveTools: liveDraft?.activeTools,
        liveToolCalls: liveDraft?.toolCalls?.map((call) => ({
          toolName: call.toolName,
          isError: call.isError
        }))
      },
      null,
      2
    )
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
