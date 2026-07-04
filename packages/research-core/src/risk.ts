import type { ContractRiskData, DexLiquidityData, HolderConcentrationData, RiskAssessment, RiskLevel } from "@sp-agent/shared";

type PartialRiskInputs = {
  hasResolvedAddress: boolean;
  hasMarketData: boolean;
  dexLiquidityData?: DexLiquidityData;
  holderConcentrationData?: HolderConcentrationData;
  hasOnchainData: boolean;
  hasArkhamIntel?: boolean;
  contractRiskData?: ContractRiskData;
  hasSources: boolean;
  hasSimilarCases: boolean;
};

function levelFromScore(score: number): RiskLevel {
  if (score <= 20) return "Low";
  if (score <= 45) return "Medium";
  if (score <= 70) return "High";
  return "Critical";
}

export function calculateInitialRisk(input: PartialRiskInputs): RiskAssessment {
  const severeContractFlags = new Set([
    "proxy_or_upgrade_pattern_present",
    "mint_function_present",
    "supply_can_potentially_expand",
    "transfers_can_potentially_be_paused",
    "contract_currently_paused",
    "owner_not_zero",
    "blacklist_or_freeze_capability_present",
    "tax_or_fee_can_potentially_change",
    "trading_can_potentially_be_gated",
    "dex_pair_or_lp_routing_control_present",
    "max_tx_or_wallet_limit_control_present"
  ]);
  const severeFlagCount = input.contractRiskData?.riskFlags.filter((flag) => severeContractFlags.has(flag)).length ?? 0;
  const contractScore = input.contractRiskData?.degradedReason
    ? 60
    : input.contractRiskData
      ? Math.min(90, 20 + severeFlagCount * 12)
      : input.hasOnchainData
        ? 35
        : 60;
  const liquidityUsd = input.dexLiquidityData && !input.dexLiquidityData.degradedReason ? input.dexLiquidityData.totalLiquidityUsd : undefined;
  const liquidityScore =
    liquidityUsd === undefined
      ? input.hasMarketData
        ? 45
        : 65
      : liquidityUsd < 50_000
        ? 85
        : liquidityUsd < 250_000
          ? 70
          : liquidityUsd < 1_000_000
            ? 50
            : 30;
  const top10Pct = input.holderConcentrationData && !input.holderConcentrationData.degradedReason ? input.holderConcentrationData.top10Pct : undefined;
  const concentrationScore =
    top10Pct === undefined
      ? input.hasOnchainData
        ? 45
        : 70
      : top10Pct >= 80
        ? 90
        : top10Pct >= 60
          ? 75
          : top10Pct >= 40
            ? 55
            : 35;
  const valuationScore = input.hasMarketData ? 35 : 60;
  const socialScore = input.hasSources ? 35 : 55;
  const missingDataScore =
    100 -
    [input.hasResolvedAddress, input.hasMarketData, input.hasOnchainData, input.hasArkhamIntel, input.hasSources, input.hasSimilarCases].filter(Boolean)
      .length *
      14;
  const caseScore = input.hasSimilarCases ? 25 : 50;

  const totalScore = Math.round(
    contractScore * 0.25 +
      liquidityScore * 0.2 +
      concentrationScore * 0.15 +
      valuationScore * 0.15 +
      socialScore * 0.1 +
      missingDataScore * 0.1 +
      caseScore * 0.05
  );

  return {
    totalScore,
    level: levelFromScore(totalScore),
    contractScore,
    liquidityScore,
    concentrationScore,
    valuationScore,
    socialScore,
    missingDataScore,
    caseScore,
    detail: {
      mode: "degraded_bootstrap",
      contractRiskFlags: input.contractRiskData?.riskFlags ?? [],
      dexLiquidityUsd: liquidityUsd,
      holderTop10Pct: top10Pct,
      note: "当前评分已接入基础市场、链上和合约风险输入；更深的持仓/LP/社媒风险仍需继续增强。"
    }
  };
}
