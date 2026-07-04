await import("../apps/api/dist/apps/api/src/env.js").catch(() => undefined);
const { getAgentRuntimeStatus, runPersonalAgentTurnWithAgent } = await import("../packages/agent-runtime/dist/index.js");

async function main() {
  const missingConfig = await getAgentRuntimeStatus({
    AGENT_RUNTIME_PROVIDER: "pi",
    SILICONFLOW_API_KEY: "",
    PI_API_KEY: ""
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
    PI_AGENT_RUNTIME_TIMEOUT_MS: "1000"
  };
  const missingModel = await getAgentRuntimeStatus(missingModelEnv);
  assert(missingModel.configured === true, "expected placeholder Pi config to be configured");
  assert(missingModel.sdkLoaded === true, "expected Pi SDK package to remain loadable");
  assert(missingModel.selectedModelAvailable === false, "expected missing model to be unavailable");
  assert(missingModel.reachable === false, "expected missing model to be unreachable");

  const missingModelTurn = await runPersonalAgentTurnWithAgent(
    {
      message: "List local extensions",
      extensionManifests: [{ id: "core.agent-shell", capabilities: [{ id: "extensions.inspect" }] }],
      safetyModel: { defaultToolPolicy: "read_only" }
    },
    missingModelEnv
  );
  assert(missingModelTurn.provider === "pi", `expected pi turn provider, got ${missingModelTurn.provider}`);
  assert(Boolean(missingModelTurn.degradedReason), "expected missing model turn to degrade");

  let liveTurn;
  if (process.env.PI_LIVE_SMOKE === "1") {
    const liveEnv = {
      ...process.env,
      AGENT_RUNTIME_PROVIDER: "pi",
      PI_AGENT_RUNTIME_TIMEOUT_MS: process.env.PI_LIVE_SMOKE_TIMEOUT_MS ?? "120000"
    };
    const liveStatus = await getAgentRuntimeStatus(liveEnv);
    assert(liveStatus.configured === true, "PI_LIVE_SMOKE=1 requires SILICONFLOW_API_KEY, PI_API_KEY, or another valid provider key source");
    assert(liveStatus.reachable === true, `expected live Pi runtime locally ready, got ${liveStatus.degradedReason ?? "unknown"}`);
    liveTurn = await runPersonalAgentTurnWithAgent(
      {
        message: "用一句话说明当前本地个人 agent 基座是什么。",
        extensionManifests: [{ id: "core.agent-shell", capabilities: [{ id: "extensions.inspect" }] }],
        safetyModel: { defaultToolPolicy: "read_only" }
      },
      liveEnv
    );
    assert(!liveTurn.degradedReason, `expected live Pi turn to succeed, got ${liveTurn.degradedReason}`);
    assert(typeof liveTurn.content === "string" && liveTurn.content.length > 0, "expected live Pi turn content");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        missingConfig,
        missingModel,
        missingModelDegradedReason: missingModelTurn.degradedReason,
        liveSmoke: process.env.PI_LIVE_SMOKE === "1",
        liveModel: liveTurn?.model,
        liveActiveTools: liveTurn?.activeTools
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
