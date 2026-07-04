import type {
  ArkhamIntel,
  ContractRiskData,
  DexLiquidityData,
  HolderConcentrationData,
  MarketData,
  OnchainData,
  ResearchReport,
  ResolvedAsset,
  RiskAssessment,
  SimilarCase,
  SourceCandidate
} from "@sp-agent/shared";

type ReportInput = {
  id: string;
  taskId: string;
  asset: ResolvedAsset;
  risk: RiskAssessment;
  question: string;
  sources: SourceCandidate[];
  marketData: MarketData[];
  onchainData?: OnchainData;
  contractRiskData?: ContractRiskData;
  dexLiquidityData?: DexLiquidityData;
  holderConcentrationData?: HolderConcentrationData;
  arkhamIntel?: ArkhamIntel;
  similarCases?: SimilarCase[];
  degradedReasons: string[];
};

function formatUsd(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return "未获取到";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1 ? 2 : 8
  }).format(value);
}

function metricLine(label: string, value: string): string {
  return `- ${label}：${value}`;
}

export function writeResearchReport(input: ReportInput): ResearchReport {
  const projectName = input.asset.name ?? input.asset.symbol ?? input.asset.address ?? input.asset.input;
  const recommendation = input.risk.totalScore >= 71 ? "Avoid" : input.risk.totalScore >= 46 ? "Watch" : "Watch";
  const confidence = Math.max(15, 100 - input.risk.missingDataScore);
  const createdAt = new Date().toISOString();
  const degradedList = input.degradedReasons.length
    ? input.degradedReasons.map((reason) => `- ${reason}`).join("\n")
    : "- 暂无降级项。";
  const coingecko = input.marketData.find((item) => item.provider === "coingecko");
  const defillama = input.marketData.find((item) => item.provider === "defillama");
  const marketLines = [
    metricLine("价格", formatUsd(coingecko?.priceUsd)),
    metricLine("流通市值", formatUsd(coingecko?.marketCapUsd)),
    metricLine("FDV", formatUsd(coingecko?.fdvUsd)),
    metricLine("24h 成交量", formatUsd(coingecko?.volume24hUsd)),
    metricLine("TVL", formatUsd(defillama?.tvlUsd))
  ].join("\n");
  const sourceLines = input.sources.length
    ? input.sources
        .map((source) => {
          const metadata = [
            `${source.provider}/${source.sourceType}`,
            source.statusCode === undefined ? undefined : `status=${source.statusCode}`,
            source.fetchedAt ? `fetchedAt=${source.fetchedAt}` : undefined
          ]
            .filter(Boolean)
            .join("，");
          const snippet = source.snippet ? `\n  - 摘要：${source.snippet}` : "";
          const degraded = source.degradedReason ? `\n  - 降级：${source.degradedReason}` : "";
          return `- [${source.title}](${source.url}) - ${metadata}${snippet}${degraded}`;
        })
        .join("\n")
    : "- 未生成可用来源候选。";
  const dataSourceLines = input.marketData
    .filter((item) => item.sourceUrl)
    .map((item) => `- [${item.provider}](${item.sourceUrl}) fetchedAt=${item.fetchedAt}`)
    .join("\n");
  const onchain = input.onchainData;
  const contractRisk = input.contractRiskData;
  const contractRiskReadable = contractRisk?.degradedReason
    ? {
        hasBytecode: "未获取到",
        isProxyLike: "未获取到",
        owner: "未获取到",
        paused: "未获取到"
      }
    : {
        hasBytecode: contractRisk?.hasBytecode === true ? "是" : contractRisk?.hasBytecode === false ? "否" : "未获取到",
        isProxyLike: contractRisk?.isProxyLike === true ? "可能存在" : contractRisk?.isProxyLike === false ? "未检测到" : "未获取到",
        owner: contractRisk?.owner ?? "未获取到",
        paused: contractRisk?.paused === undefined ? "未获取到" : contractRisk.paused ? "true" : "false"
      };
  const arkham = input.arkhamIntel;
  const arkhamLabels = arkham?.labels.length ? arkham.labels.join(", ") : "未获取到";
  const arkhamSourceLines = arkham?.sourceUrls.length ? arkham.sourceUrls.map((url) => `- [arkham](${url}) fetchedAt=${arkham.fetchedAt}`).join("\n") : "";
  const capabilities = contractRisk?.detectedCapabilities;
  const capabilityLines = [
    metricLine("Mint/增发能力", capabilities?.mint ? "检测到相关 selector" : "未检测到"),
    metricLine("Pause/暂停能力", capabilities?.pause ? "检测到相关 selector" : "未检测到"),
    metricLine("Upgrade/代理升级能力", capabilities?.upgrade ? "检测到相关 selector 或 proxy pattern" : "未检测到"),
    metricLine("Owner/Admin 控制", capabilities?.ownerControl ? "检测到相关 selector 或 owner()" : "未检测到"),
    metricLine("Blacklist/冻结能力", capabilities?.blacklist ? "检测到相关 selector" : "未检测到"),
    metricLine("Tax/Fee 调整能力", capabilities?.taxOrFeeControl ? "检测到相关 selector" : "未检测到"),
    metricLine("交易开关能力", capabilities?.tradingControl ? "检测到相关 selector" : "未检测到"),
    metricLine("DEX Pair/LP 路由控制", capabilities?.dexPairControl ? "检测到相关 selector" : "未检测到"),
    metricLine("MaxTx/MaxWallet 限制", capabilities?.maxTxOrWalletControl ? "检测到相关 selector" : "未检测到")
  ].join("\n");
  const dexLiquidity = input.dexLiquidityData;
  const dexPairLines = dexLiquidity?.pairs.length
    ? dexLiquidity.pairs
        .slice(0, 5)
        .map(
          (pair) =>
            `- ${pair.dexId ?? "unknown dex"} ${pair.baseTokenSymbol ?? "?"}/${pair.quoteTokenSymbol ?? "?"}：liquidity=${formatUsd(pair.liquidityUsd)}，24h volume=${formatUsd(pair.volume24hUsd)}，txns24h=${pair.txns24h ?? "未获取到"}${pair.url ? `，source=${pair.url}` : ""}`
        )
        .join("\n")
    : "- 未获取到可用 DEX 池子。";
  const dexSourceLines = dexLiquidity?.sourceUrls.length
    ? dexLiquidity.sourceUrls.map((url) => `- [dexscreener](${url}) fetchedAt=${dexLiquidity.fetchedAt}`).join("\n")
    : "";
  const holderConcentration = input.holderConcentrationData;
  const holderLines = holderConcentration?.topHolders.length
    ? holderConcentration.topHolders
        .slice(0, 10)
        .map(
          (holder, index) =>
            `- #${index + 1} ${holder.address ?? "unknown"}：pct=${holder.pct === undefined ? "未获取到" : `${holder.pct.toFixed(2)}%`}，balance=${holder.balance ?? "未获取到"}`
        )
        .join("\n")
    : "- 未获取到可解析 holder 列表。";
  const holderSourceLine = holderConcentration?.sourceUrl
    ? `- [${holderConcentration.provider}](${holderConcentration.sourceUrl}) fetchedAt=${holderConcentration.fetchedAt}`
    : "";
  const similarCaseLines = input.similarCases?.length
    ? input.similarCases
        .slice(0, 5)
        .map(
          (item) =>
            `- ${item.title}：similarity=${item.similarityScore}/100，recommendation=${item.recommendation}，confidence=${item.confidence}，reasons=${item.matchedReasons.join("；") || "本地文本匹配"}，reportId=${item.reportId}`
        )
        .join("\n")
    : "- 暂无可匹配历史案例。";

  const markdown = `# 项目投研报告：${projectName}

## 1. 一句话结论

当前数据更支持观察，而不是立即买入。该结论置信度为 ${confidence}/100，主要原因是外部数据源和链上校验仍处于降级模式。

## 2. 基础信息

- 输入：${input.asset.input}
- 输入类型：${input.asset.inputType}
- 链：${input.asset.chain ?? "未确认"}
- 合约地址：${input.asset.address ?? "未获取到"}
- Symbol：${input.asset.symbol ?? "未获取到"}
- 项目名：${input.asset.name ?? "未获取到"}
- ERC20 name：${onchain?.name ?? "未获取到"}
- ERC20 symbol：${onchain?.symbol ?? "未获取到"}
- ERC20 decimals：${onchain?.decimals ?? "未获取到"}
- ERC20 totalSupply(raw)：${onchain?.totalSupply ?? "未获取到"}
- 资产解析置信度：${input.asset.confidence}/100

## 3. 项目机制

未获取到。需要接入官网、文档、白皮书或项目资料采集后补全。

## 4. 团队与融资

未获取到。需要接入网页资料、融资数据库或可信来源后补全。

## 5. 代币经济

未获取到。需要接入 CoinGecko、项目文档、解锁数据或链上数据后补全。

## 6. 市场与流动性

${marketLines}

${coingecko?.degradedReason ? `CoinGecko 降级：${coingecko.degradedReason}` : "CoinGecko 市场数据已写入报告。"}

## 7. TVL / 收入 / 链上活跃度

${defillama?.tvlUsd !== undefined ? `DefiLlama 当前 TVL：${formatUsd(defillama.tvlUsd)}` : "未获取到 TVL / 收入 / 链上活跃度。"}

${defillama?.degradedReason ? `DefiLlama 降级：${defillama.degradedReason}` : "DefiLlama 协议指标已写入报告。"}

DEX 流动性：
- DEX 池子数量：${dexLiquidity?.pairCount ?? 0}
- 总流动性：${formatUsd(dexLiquidity?.totalLiquidityUsd)}
- 最大池流动性：${formatUsd(dexLiquidity?.topPairLiquidityUsd)}
- 24h 总交易量：${formatUsd(dexLiquidity?.totalVolume24hUsd)}

Top DEX pools:
${dexPairLines}

${dexLiquidity && !dexLiquidity.degradedReason ? `已通过 DEX Screener 获取池子数据，读取时间：${dexLiquidity.fetchedAt}。` : `DEX 流动性降级：${dexLiquidity?.degradedReason ?? "未执行 DEX 流动性查询。"}`}

## 8. 合约与链上风险

- 合约风险分：${input.risk.contractScore}/100
- 持仓集中风险分：${input.risk.concentrationScore}/100
- 数据缺失风险分：${input.risk.missingDataScore}/100

当前已完成 owner/admin、mint、pause、blacklist、tax/fee、upgradeability、交易开关、DEX pair/LP 路由相关 selector 静态检查。该检查只能证明合约字节码中存在相关函数入口或 proxy pattern，不能替代源码审计、参数读取、LP 锁仓和 top holders 集中度分析。

${onchain && !onchain.degradedReason ? `已通过 ${onchain.provider} 在 ${onchain.chain} 读取 ERC20 metadata，读取时间：${onchain.fetchedAt}。` : `链上读取降级：${onchain?.degradedReason ?? "未执行链上读取。"}`}

基础合约风险检查：
- 合约 bytecode 存在：${contractRiskReadable.hasBytecode}
- Proxy/upgrade pattern：${contractRiskReadable.isProxyLike}
- owner：${contractRiskReadable.owner}
- paused：${contractRiskReadable.paused}
- 检测到的函数：${contractRisk?.detectedSelectors.length ? contractRisk.detectedSelectors.join(", ") : "未获取到"}
- 风险标记：${contractRisk?.riskFlags.length ? contractRisk.riskFlags.join(", ") : "未获取到"}

合约能力静态扫描：
${capabilityLines}

${contractRisk && !contractRisk.degradedReason ? `已通过 ${contractRisk.provider} 在 ${contractRisk.chain} 完成基础合约风险读取，读取时间：${contractRisk.fetchedAt}。` : `基础合约风险读取降级：${contractRisk?.degradedReason ?? "未执行合约风险读取。"}`}

Holder 集中度：
- Holder provider：${holderConcentration?.provider ?? "未配置"}
- Holder 行数：${holderConcentration?.holderCount ?? 0}
- Top10 占比：${holderConcentration?.top10Pct === undefined ? "未获取到" : `${holderConcentration.top10Pct.toFixed(2)}%`}
- Top20 占比：${holderConcentration?.top20Pct === undefined ? "未获取到" : `${holderConcentration.top20Pct.toFixed(2)}%`}

Top holders:
${holderLines}

${holderConcentration && !holderConcentration.degradedReason ? `已获取 holder 集中度数据，读取时间：${holderConcentration.fetchedAt}。` : `Holder 集中度降级：${holderConcentration?.degradedReason ?? "未执行 holder 集中度查询。"}`}

Arkham 地址画像：
- 实体/标签数量：${arkham?.labelCount ?? 0}
- 标签样本：${arkhamLabels}
- 资金流样本数量：${arkham?.transferCount ?? 0}
- 持仓样本数量：${arkham?.holdingCount ?? 0}

${arkham && !arkham.degradedReason ? `已通过 Arkham-compatible connector 获取地址画像，读取时间：${arkham.fetchedAt}。` : `Arkham 降级：${arkham?.degradedReason ?? "未执行 Arkham 查询。"}`}

## 9. 社媒与叙事热度

未获取到。需要接入公开网页采集或授权后的社媒采集。

## 10. 历史相似案例

${similarCaseLines}

## 11. 买入建议

Recommendation:
- Action: ${recommendation}
- Confidence: ${confidence}
- Suitable position: None
- Time horizon: Medium
- Entry conditions:
  - 完成真实合约权限校验。
  - 获取 DEX 流动性、FDV、市值、成交量和持仓分布。
  - 关键结论具备可追溯来源。
- Invalid conditions:
  - LP 被大幅移除。
  - Top holders 集中卖出。
  - 合约存在可随意增发、冻结或黑名单权限。
  - 合约存在可动态调整 tax/fee、交易开关或 MaxTx/MaxWallet 的权限，且未给出可信治理或放弃权限证据。
- Key risks:
  - 外部数据源未接入。
  - 链上风险未验证。
  - 缺少相似历史案例。

## 12. 关键风险

- 总风险分：${input.risk.totalScore}/100
- 风险等级：${input.risk.level}
- 流动性风险分：${input.risk.liquidityScore}/100
- 估值风险分：${input.risk.valuationScore}/100
- 社媒/叙事风险分：${input.risk.socialScore}/100
- 历史案例风险分：${input.risk.caseScore}/100

## 13. 数据来源

来源候选：

${sourceLines}

数据源快照：

${dataSourceLines || "- 暂无外部数据源快照。"}
${dexSourceLines ? `\nDEX 数据源：\n\n${dexSourceLines}` : ""}
${holderSourceLine ? `\nHolder 数据源：\n\n${holderSourceLine}` : ""}
${arkhamSourceLines ? `\nArkham 数据源：\n\n${arkhamSourceLines}` : ""}

降级原因：

${degradedList}
`;

  return {
    id: input.id,
    taskId: input.taskId,
    title: `项目投研报告：${projectName}`,
    markdown,
    summary: `当前数据更支持观察，风险等级 ${input.risk.level}，置信度 ${confidence}/100。`,
    recommendation,
    confidence,
    createdAt
  };
}
