import { analyzeMarketSnapshot } from "./smoke-extension-client.mjs";

const apiBase = process.env.SMOKE_API_BASE ?? "http://localhost:4317/api";

async function main() {
  await assertOk(`${apiBase}/health`, "health");

  const providers = await readJson(`${apiBase}/providers/status`);
  const coingecko = (providers.providers ?? []).find((provider) => provider.name === "coingecko");
  assert(coingecko?.configured === true, "expected CoinGecko public API to be configured by default");
  assert(coingecko?.reachable === true, `expected CoinGecko public API reachable, got ${coingecko?.degradedReason ?? "unknown"}`);

  const snapshot = await analyzeMarketSnapshot(apiBase);
  const assets = snapshot.metrics?.assets ?? [];
  const btc = assets.find((asset) => asset.coingeckoId === "bitcoin");
  const eth = assets.find((asset) => asset.coingeckoId === "ethereum");
  assert(btc?.priceUsd > 0, `expected Bitcoin public price, got ${btc?.priceUsd ?? "missing"}`);
  assert(eth?.priceUsd > 0, `expected Ethereum public price, got ${eth?.priceUsd ?? "missing"}`);
  assert(!snapshot.degradedReasons?.some((reason) => reason.includes("COINGECKO_API_KEY")), "expected no CoinGecko key degraded reason");

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBase,
        coingecko: "public-api-reachable",
        bitcoinUsd: btc.priceUsd,
        ethereumUsd: eth.priceUsd
      },
      null,
      2
    )
  );
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
