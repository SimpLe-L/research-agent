await import("../apps/api/dist/apps/api/src/env.js").catch(() => undefined);
const { draftResearchReportWithAgent, getAgentRuntimeStatus } = await import("../packages/agent-runtime/dist/index.js");

const baseInput = {
  baseReportMarkdown: [
    "# UNI Research",
    "",
    "- Source: https://example.com",
    "- Degraded reason: SILICONFLOW_API_KEY is not configured.",
    "",
    "## Recommendation",
    "Watch"
  ].join("\n"),
  baseSummary: "UNI deterministic report smoke.",
  recommendation: "Watch",
  confidence: 50
};

async function main() {
  const siliconflowStatus = await getAgentRuntimeStatus({
    AGENT_RUNTIME_PROVIDER: "siliconflow",
    SILICONFLOW_API_KEY: ""
  });
  assert(siliconflowStatus.provider === "siliconflow", `expected siliconflow status provider, got ${siliconflowStatus.provider}`);
  assert(siliconflowStatus.configured === false, "expected missing SiliconFlow key to be unconfigured");

  const siliconflowDraft = await draftResearchReportWithAgent(baseInput, {
    AGENT_RUNTIME_PROVIDER: "siliconflow",
    SILICONFLOW_API_KEY: ""
  });
  assert(siliconflowDraft.provider === "siliconflow", `expected siliconflow draft provider, got ${siliconflowDraft.provider}`);
  assert(Boolean(siliconflowDraft.degradedReason), "expected SiliconFlow missing-key degraded reason");

  const piStatus = await getAgentRuntimeStatus({
    AGENT_RUNTIME_PROVIDER: "pi"
  });
  assert(piStatus.provider === "pi", `expected pi status provider, got ${piStatus.provider}`);
  assert(piStatus.configured === false, "expected missing Pi config to be unconfigured");
  assert(piStatus.sdkLoaded === true, "expected Pi SDK package to be loadable");

  const piDraft = await draftResearchReportWithAgent(baseInput, {
    AGENT_RUNTIME_PROVIDER: "pi",
    AGENT_RUNTIME_TIMEOUT_MS: "1000"
  });
  assert(piDraft.provider === "pi", `expected pi draft provider, got ${piDraft.provider}`);
  assert(Boolean(piDraft.degradedReason), "expected Pi missing-config degraded reason");

  console.log(
    JSON.stringify(
      {
        ok: true,
        siliconflowStatus,
        siliconflowDegradedReason: siliconflowDraft.degradedReason,
        piStatus,
        piDegradedReason: piDraft.degradedReason
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
