import { createResearchTask, getResearchTask, reindexKnowledgeReport, searchKnowledge } from "./smoke-extension-client.mjs";

const apiBase = process.env.SMOKE_API_BASE ?? "http://localhost:4317/api";
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 180000);
const pollIntervalMs = Number(process.env.SMOKE_POLL_INTERVAL_MS ?? 1000);
const evmSmokeAddress = process.env.SMOKE_EVM_ADDRESS ?? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const evmSmokeSymbol = process.env.SMOKE_EVM_SYMBOL ?? "USDC";

async function main() {
  await assertOk(`${apiBase}/health`, "health");

  const providers = await readJson(`${apiBase}/providers/status`);
  const providerByName = new Map((providers.providers ?? []).map((provider) => [provider.name, provider]));
  const siliconflow = providerByName.get("siliconflow");
  assert(siliconflow?.configured === true, "expected SiliconFlow to be configured");
  assert(siliconflow?.reachable === true, `expected SiliconFlow reachable, got ${siliconflow?.degradedReason ?? "unknown"}`);

  const evmRpc = providerByName.get("evm-rpc");
  assert(evmRpc?.configured === true, "expected at least one EVM RPC URL to be configured");
  assert(evmRpc?.reachable === true, `expected EVM RPC reachable, got ${evmRpc?.degradedReason ?? "unknown"}`);

  const reindex = await reindexKnowledgeReport(apiBase);
  assert(reindex.total > 0, "expected at least one report to reindex");
  assert(reindex.indexed === reindex.total, `expected all reports indexed, got ${reindex.indexed}/${reindex.total}`);
  assert(reindex.failed === 0, `expected no reindex failures, got ${reindex.failed}`);

  const search = await searchKnowledge(apiBase, "UNI");
  assert(Array.isArray(search.vectorHits), "expected vectorHits array");
  assert(search.vectorHits.length > 0, "expected live vector search hits");
  assert(!search.vectorHits.some((hit) => hit.reportId === "seed"), "expected seed vector row to be hidden from search hits");

  const evmTask = await runEvmSmokeTask();

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBase,
        siliconflow: "reachable",
        evmRpc: "reachable",
        reindexed: `${reindex.indexed}/${reindex.total}`,
        vectorHits: search.vectorHits.length,
        evmTask
      },
      null,
      2
    )
  );
}

async function runEvmSmokeTask() {
  const created = await createResearchTask(apiBase, {
    input: evmSmokeAddress,
    inputType: "evm_address",
    question: "RPC live smoke",
    options: {
      includeOnchain: true,
      includeSocial: false,
      includeSimilarCases: false
    }
  });
  const task = await waitForTask(created.task.id);
  assert(task.status === "completed", `expected EVM smoke task completed, got ${task.status}`);
  const onchain = task.events.find((event) => event.node === "fetch_onchain_data" && event.eventType === "node_completed");
  assert(onchain, "missing fetch_onchain_data completion event");
  const onchainData = onchain.payload?.onchainData;
  const contractRiskData = onchain.payload?.contractRiskData;
  assert(onchainData?.symbol === evmSmokeSymbol, `expected ${evmSmokeSymbol} symbol, got ${onchainData?.symbol ?? "unknown"}`);
  assert(!onchainData?.degradedReason, `onchain metadata degraded: ${onchainData?.degradedReason}`);
  assert(contractRiskData?.hasBytecode === true, "expected contract bytecode in contract risk result");
  return {
    taskId: task.id,
    symbol: onchainData.symbol,
    chain: onchainData.chain,
    hasBytecode: contractRiskData.hasBytecode
  };
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

async function assertOk(url, label) {
  const response = await fetch(url);
  assert(response.ok, `${label} returned HTTP ${response.status}`);
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
