import type { MarketData, MarketSnapshot } from "@sp-agent/shared";

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function analyzeMarketSnapshot(assets: MarketData[], degradedReasons: string[] = []): MarketSnapshot {
  const btc = assets.find((asset) => asset.coingeckoId === "bitcoin");
  const eth = assets.find((asset) => asset.coingeckoId === "ethereum");
  const usableChanges = [btc?.change24hPct, eth?.change24hPct].filter((value): value is number => typeof value === "number");
  const averageChange = usableChanges.length ? usableChanges.reduce((sum, value) => sum + value, 0) / usableChanges.length : undefined;

  let regime: MarketSnapshot["regime"] = "Neutral";
  let recommendation: MarketSnapshot["recommendation"] = "Watch";
  let confidence = 35;

  if (averageChange !== undefined) {
    confidence = 55;
    if (averageChange >= 5) {
      regime = "Risk-On";
      recommendation = "Watch";
    } else if (averageChange >= 1.5) {
      regime = "Risk-On Early";
      recommendation = "Watch";
    } else if (averageChange <= -8) {
      regime = "Capitulation";
      recommendation = "Avoid";
    } else if (averageChange <= -3) {
      regime = "Risk-Off";
      recommendation = "Reduce";
    }
  }

  if (degradedReasons.length) {
    confidence = Math.min(confidence, 30);
  }

  return {
    id: createId("market"),
    scope: "BTC_ETH",
    metrics: {
      assets,
      averageChange24hPct: averageChange
    },
    regime,
    recommendation,
    confidence,
    summary:
      averageChange === undefined
        ? "主流币行情数据未获取到，当前只能给出观察建议。"
        : `BTC/ETH 24h 平均涨跌幅为 ${averageChange.toFixed(2)}%，市场状态判断为 ${regime}。`,
    degradedReasons,
    createdAt: new Date().toISOString()
  };
}
