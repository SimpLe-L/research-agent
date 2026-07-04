import type { ResearchInputType, ResolvedAsset } from "@sp-agent/shared";

const evmAddressPattern = /^0x[a-fA-F0-9]{40}$/;
const urlPattern = /^https?:\/\//i;

export function inferInputType(input: string): ResearchInputType {
  const trimmed = input.trim();
  if (evmAddressPattern.test(trimmed)) return "evm_address";
  if (urlPattern.test(trimmed)) return "url";
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) return "solana_mint";
  if (/^[A-Z0-9]{2,12}$/.test(trimmed)) return "symbol";
  return "project_name";
}

export function resolveAsset(input: string, inputType: ResearchInputType = "auto"): ResolvedAsset {
  const normalizedInput = input.trim();
  const resolvedInputType = inputType === "auto" ? inferInputType(normalizedInput) : inputType;

  if (resolvedInputType === "evm_address") {
    return {
      input: normalizedInput,
      inputType: resolvedInputType,
      chain: "ethereum",
      address: normalizedInput,
      confidence: 65,
      degradedReason: "EVM 地址格式已识别，但尚未接入 Viem/RPC 做真实链归属和 metadata 校验。"
    };
  }

  if (resolvedInputType === "symbol") {
    return {
      input: normalizedInput,
      inputType: resolvedInputType,
      symbol: normalizedInput.toUpperCase(),
      confidence: 35,
      degradedReason: "Symbol 可能对应多个资产，尚未接入 CoinGecko/DEX 数据源消歧。"
    };
  }

  if (resolvedInputType === "url") {
    return {
      input: normalizedInput,
      inputType: resolvedInputType,
      confidence: 30,
      degradedReason: "URL 已识别，网页采集和项目归因将在 Playwright/Readability 接入后完成。"
    };
  }

  return {
    input: normalizedInput,
    inputType: resolvedInputType,
    name: normalizedInput,
    confidence: 30,
    degradedReason: "项目名已记录，但尚未接入外部检索做资产解析。"
  };
}

