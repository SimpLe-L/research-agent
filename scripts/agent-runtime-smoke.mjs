await import("../apps/api/dist/apps/api/src/env.js").catch(() => undefined);
const { getAgentRuntimeStatus, listRuntimeAdapters, runPersonalAgentTurnWithAgent } = await import("../packages/agent-runtime/dist/index.js");

async function main() {
  const status = await getAgentRuntimeStatus({
    AGENT_RUNTIME_PROVIDER: "pi",
    SILICONFLOW_API_KEY: ""
  });
  assert(status.provider === "pi", `expected pi provider, got ${status.provider}`);
  assert(status.configured === false, "expected missing Pi config to be unconfigured");
  assert(status.sdkLoaded === true, "expected Pi SDK package to be loadable");

  const turn = await runPersonalAgentTurnWithAgent(
    {
      message: "现在项目是什么状态？",
      extensionManifests: [{ id: "core.agent-shell", status: "active", capabilities: [{ id: "extensions.inspect", label: "Inspect extensions", description: "Inspect the local registry" }] }],
      safetyModel: { defaultToolPolicy: "read_only" }
    },
    {
      AGENT_RUNTIME_PROVIDER: "pi",
      SILICONFLOW_API_KEY: ""
    }
  );
  assert(turn.provider === "pi", `expected pi turn provider, got ${turn.provider}`);
  assert(Boolean(turn.degradedReason), "expected missing config turn to degrade");
  assert(turn.activeTools?.includes("inspect_extension_registry"), "expected registry inspection tool to be exposed");
  assert(turn.activeTools?.includes("core_agent_shell_extensions_inspect"), "expected manifest capability to receive a dedicated runtime tool");
  assert(!turn.activeTools?.includes("invoke_extension_capability"), "generic capability invocation should not be exposed to the runtime");

  const adapters = listRuntimeAdapters();
  assert(adapters.some((adapter) => adapter.id === "pi" && adapter.default), "expected default Pi runtime adapter");
  assert(adapters.some((adapter) => adapter.id === "local-deterministic" && !adapter.default), "expected local deterministic runtime adapter");

  const localStatus = await getAgentRuntimeStatus({
    AGENT_RUNTIME_PROVIDER: "local-deterministic"
  });
  assert(localStatus.provider === "local-deterministic", `expected local deterministic provider, got ${localStatus.provider}`);
  assert(localStatus.configured === true && localStatus.reachable === true, "expected local deterministic runtime to be ready");

  const localTurn = await runPersonalAgentTurnWithAgent(
    {
      message: "离线模式可用吗？",
      memoryContext: [{ entry: { id: "memory_smoke" } }],
      extensionManifests: [{ id: "local.context" }, { id: "local.bookmarks" }],
      safetyModel: { defaultToolPolicy: "read_only" }
    },
    {
      AGENT_RUNTIME_PROVIDER: "local-deterministic"
    }
  );
  assert(localTurn.provider === "local-deterministic", `expected local deterministic turn, got ${localTurn.provider}`);
  assert(!localTurn.content.includes("可见扩展"), "local deterministic turn should not expose extension counts");
  assert(!localTurn.content.includes("检索到相关记忆"), "local deterministic turn should not expose memory retrieval counts");

  console.log(
    JSON.stringify(
      {
        ok: true,
        status,
        adapters: adapters.map((adapter) => adapter.id),
        degradedReason: turn.degradedReason,
        activeTools: turn.activeTools,
        localDeterministic: localTurn.content
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
