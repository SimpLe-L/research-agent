await import("../apps/api/dist/apps/api/src/env.js").catch(() => undefined);
const { getAgentRuntimeStatus, runPersonalAgentTurnWithAgent } = await import("../packages/agent-runtime/dist/index.js");

async function main() {
  const status = await getAgentRuntimeStatus({
    AGENT_RUNTIME_PROVIDER: "pi",
    SILICONFLOW_API_KEY: "",
    PI_API_KEY: ""
  });
  assert(status.provider === "pi", `expected pi provider, got ${status.provider}`);
  assert(status.configured === false, "expected missing Pi config to be unconfigured");
  assert(status.sdkLoaded === true, "expected Pi SDK package to be loadable");

  const turn = await runPersonalAgentTurnWithAgent(
    {
      message: "现在项目是什么状态？",
      extensionManifests: [{ id: "core.agent-shell", capabilities: [{ id: "extensions.inspect" }] }],
      safetyModel: { defaultToolPolicy: "read_only" }
    },
    {
      AGENT_RUNTIME_PROVIDER: "pi",
      SILICONFLOW_API_KEY: "",
      PI_API_KEY: ""
    }
  );
  assert(turn.provider === "pi", `expected pi turn provider, got ${turn.provider}`);
  assert(Boolean(turn.degradedReason), "expected missing config turn to degrade");
  assert(turn.activeTools?.includes("inspect_extension_registry"), "expected registry inspection tool to be exposed");

  console.log(
    JSON.stringify(
      {
        ok: true,
        status,
        degradedReason: turn.degradedReason,
        activeTools: turn.activeTools
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
