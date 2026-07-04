import type {
  CreateResearchTaskInput,
  ArkhamIntel,
  ContractRiskData,
  DexLiquidityData,
  HolderConcentrationData,
  MarketData,
  OnchainData,
  ResearchReport,
  ResearchTask,
  ResearchTaskEvent,
  ResolvedAsset,
  RiskAssessment,
  SimilarCase,
  SourceCandidate,
  TaskNodeName
} from "@sp-agent/shared";
import { deriveTaskNodeRuns, taskNodeNames } from "@sp-agent/shared";
import { calculateInitialRisk } from "./risk.js";
import { resolveAsset } from "./resolve-asset.js";
import { writeResearchReport } from "./report-writer.js";

export type ResearchTaskRunResult = {
  task: ResearchTask;
  report: ResearchReport;
};

export type ResearchTaskRunHooks = {
  taskId?: string;
  signal?: AbortSignal;
  resumeFromNode?: TaskNodeName;
  resumeState?: ResearchTaskResumeState;
  onTaskUpdated?: (task: ResearchTask) => void | Promise<void>;
  onEvent?: (event: ResearchTaskEvent, task: ResearchTask) => void | Promise<void>;
};

export type ResearchTaskResumeState = {
  asset?: ResolvedAsset;
  sources?: SourceCandidate[];
  marketData?: MarketData[];
  onchainData?: OnchainData;
  contractRiskData?: ContractRiskData;
  dexLiquidityData?: DexLiquidityData;
  holderConcentrationData?: HolderConcentrationData;
  arkhamIntel?: ArkhamIntel;
  similarCases?: SimilarCase[];
  degradedReasons?: string[];
};

export type ResearchRiskInputSnapshot = {
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

export type ResearchTaskAdapters = {
  resolveAsset?: (input: { input: string; inputType: CreateResearchTaskInput["inputType"] }) => Promise<{
    asset?: ResolvedAsset;
    provider: string;
    model?: string;
    degradedReason?: string;
    activeTools?: string[];
    toolCalls?: Array<{
      toolCallId?: string;
      toolName: string;
      input?: unknown;
      isError?: boolean;
      outputPreview?: string;
    }>;
    fallbackUsed?: boolean;
  }>;
  collectSources?: (input: { asset: ReturnType<typeof resolveAsset> }) => Promise<{
    sources: SourceCandidate[];
    provider: string;
    model?: string;
    degradedReason?: string;
    activeTools?: string[];
    toolCalls?: Array<{
      toolCallId?: string;
      toolName: string;
      input?: unknown;
      isError?: boolean;
      outputPreview?: string;
    }>;
    fallbackUsed?: boolean;
  }>;
  fetchMarketData?: (input: { asset: ReturnType<typeof resolveAsset> }) => Promise<{
    marketData: MarketData[];
    provider: string;
    model?: string;
    degradedReason?: string;
    activeTools?: string[];
    toolCalls?: Array<{
      toolCallId?: string;
      toolName: string;
      input?: unknown;
      isError?: boolean;
      outputPreview?: string;
    }>;
    fallbackUsed?: boolean;
  }>;
  fetchOnchainData?: (input: { asset: ReturnType<typeof resolveAsset> }) => Promise<{
    asset?: ResolvedAsset;
    onchainData?: OnchainData;
    contractRiskData?: ContractRiskData;
    dexLiquidityData?: DexLiquidityData;
    holderConcentrationData?: HolderConcentrationData;
    arkhamIntel?: ArkhamIntel;
    provider: string;
    model?: string;
    degradedReason?: string;
    activeTools?: string[];
    toolCalls?: Array<{
      toolCallId?: string;
      toolName: string;
      input?: unknown;
      isError?: boolean;
      outputPreview?: string;
    }>;
    fallbackUsed?: boolean;
  }>;
  searchProjectSources?: (asset: ReturnType<typeof resolveAsset>) => Promise<{ sources: SourceCandidate[]; degradedReason?: string }>;
  getTokenMarketData?: (asset: ReturnType<typeof resolveAsset>) => Promise<MarketData>;
  getDefiProtocolMetrics?: (asset: ReturnType<typeof resolveAsset>) => Promise<MarketData>;
  readErc20Metadata?: (asset: ReturnType<typeof resolveAsset>) => Promise<OnchainData>;
  readContractRisk?: (asset: ReturnType<typeof resolveAsset>) => Promise<ContractRiskData>;
  getDexLiquidityData?: (asset: ReturnType<typeof resolveAsset>) => Promise<DexLiquidityData>;
  getHolderConcentrationData?: (asset: ReturnType<typeof resolveAsset>) => Promise<HolderConcentrationData>;
  getArkhamAddressIntel?: (asset: ReturnType<typeof resolveAsset>) => Promise<ArkhamIntel>;
  matchSimilarCases?: (input: {
    asset: ReturnType<typeof resolveAsset>;
    sources: SourceCandidate[];
    marketData: MarketData[];
    onchainData?: OnchainData;
    contractRiskData?: ContractRiskData;
  }) => Promise<{
    cases: SimilarCase[];
    degradedReason?: string;
    provider?: string;
    model?: string;
    activeTools?: string[];
    toolCalls?: Array<{
      toolCallId?: string;
      toolName: string;
      input?: unknown;
      isError?: boolean;
      outputPreview?: string;
    }>;
    fallbackUsed?: boolean;
  }>;
  analyzeRisk?: (input: {
    riskInput: ResearchRiskInputSnapshot;
  }) => Promise<{
    risk: RiskAssessment;
    provider?: string;
    model?: string;
    degradedReason?: string;
    activeTools?: string[];
    toolCalls?: Array<{
      toolCallId?: string;
      toolName: string;
      input?: unknown;
      isError?: boolean;
      outputPreview?: string;
    }>;
    fallbackUsed?: boolean;
  }>;
  draftResearchReport?: (input: {
    baseReport: ResearchReport;
    researchContext: {
      taskId: string;
      asset: ResolvedAsset;
      sources: SourceCandidate[];
      marketData: MarketData[];
      onchainData?: OnchainData;
      contractRiskData?: ContractRiskData;
      dexLiquidityData?: DexLiquidityData;
      holderConcentrationData?: HolderConcentrationData;
      arkhamIntel?: ArkhamIntel;
      similarCases: SimilarCase[];
      degradedReasons: string[];
    };
  }) => Promise<{
    markdown?: string;
    summary?: string;
    recommendation?: ResearchReport["recommendation"];
    confidence?: number;
    provider: string;
    model?: string;
    degradedReason?: string;
    activeTools?: string[];
    toolCalls?: Array<{
      toolCallId?: string;
      toolName: string;
      input?: unknown;
      isError?: boolean;
      outputPreview?: string;
    }>;
    fallbackUsed?: boolean;
  }>;
};

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export class ResearchTaskCancelledError extends Error {
  constructor() {
    super("Research task was cancelled");
    this.name = "ResearchTaskCancelledError";
  }
}

export async function runBootstrapResearchTask(
  input: CreateResearchTaskInput,
  adapters: ResearchTaskAdapters = {},
  hooks: ResearchTaskRunHooks = {}
): Promise<ResearchTaskRunResult> {
  const now = new Date().toISOString();
  const taskId = hooks.taskId ?? createId("task");
  const events: ResearchTaskEvent[] = [];

  const task: ResearchTask = {
    id: taskId,
    input: input.input,
    inputType: input.inputType,
    question: input.question,
    options: input.options,
    status: "running",
    createdAt: now,
    updatedAt: now,
    events,
    nodeRuns: deriveTaskNodeRuns(events)
  };

  const persistTaskUpdate = async () => {
    await hooks.onTaskUpdated?.(task);
  };

  const emit = async (node: TaskNodeName | undefined, eventType: string, payload: Record<string, unknown> = {}) => {
    const event = {
      id: createId("event"),
      taskId,
      node,
      eventType,
      payload,
      createdAt: new Date().toISOString()
    };
    events.push(event);
    task.nodeRuns = deriveTaskNodeRuns(events);
    await hooks.onEvent?.(event, task);
  };

  const throwIfCancelled = () => {
    if (hooks.signal?.aborted) {
      throw new ResearchTaskCancelledError();
    }
  };

  await persistTaskUpdate();
  throwIfCancelled();
  await emit(undefined, "task_started", { input: input.input });

  let asset = hooks.resumeState?.asset ?? resolveAsset(input.input, input.inputType);
  let sources: SourceCandidate[] = hooks.resumeState?.sources ?? [];
  const marketData: MarketData[] = [...(hooks.resumeState?.marketData ?? [])];
  let onchainData: OnchainData | undefined = hooks.resumeState?.onchainData;
  let contractRiskData: ContractRiskData | undefined = hooks.resumeState?.contractRiskData;
  let dexLiquidityData: DexLiquidityData | undefined = hooks.resumeState?.dexLiquidityData;
  let holderConcentrationData: HolderConcentrationData | undefined = hooks.resumeState?.holderConcentrationData;
  let arkhamIntel: ArkhamIntel | undefined = hooks.resumeState?.arkhamIntel;
  let similarCases: SimilarCase[] = hooks.resumeState?.similarCases ?? [];
  let risk: RiskAssessment | undefined;
  const degradedReasons: string[] = [...(hooks.resumeState?.degradedReasons ?? [])];
  const startIndex = hooks.resumeFromNode ? taskNodeNames.indexOf(hooks.resumeFromNode) : 0;
  const safeStartIndex = startIndex >= 0 ? startIndex : 0;

  if (safeStartIndex > 0) {
    await emit(undefined, "task_resumed_from_checkpoint", {
      resumeFromNode: taskNodeNames[safeStartIndex],
      skippedNodes: taskNodeNames.slice(0, safeStartIndex)
    });
  }

  for (const node of taskNodeNames) {
    if (taskNodeNames.indexOf(node) < safeStartIndex) {
      await emit(node, "node_skipped", { reason: "resume_checkpoint", resumeFromNode: taskNodeNames[safeStartIndex] });
      continue;
    }

    throwIfCancelled();
    task.currentNode = node;
    task.updatedAt = new Date().toISOString();
    await persistTaskUpdate();
    await emit(node, "node_started");
    throwIfCancelled();

    if (node === "resolve_asset") {
      const fallbackAsset = resolveAsset(input.input, input.inputType);
      if (adapters.resolveAsset) {
        const agentResult = await adapters.resolveAsset({ input: input.input, inputType: input.inputType });
        asset = agentResult.asset ?? fallbackAsset;
        if (agentResult.degradedReason) degradedReasons.push(agentResult.degradedReason);
        if (asset.degradedReason) degradedReasons.push(asset.degradedReason);
        throwIfCancelled();
        await emit(node, "node_completed", {
          asset,
          agentTool: {
            provider: agentResult.provider,
            model: agentResult.model,
            degradedReason: agentResult.degradedReason,
            activeTools: agentResult.activeTools ?? [],
            toolCalls: agentResult.toolCalls ?? [],
            fallbackUsed: agentResult.fallbackUsed ?? !agentResult.asset
          }
        });
        continue;
      }
      asset = fallbackAsset;
      if (asset.degradedReason) degradedReasons.push(asset.degradedReason);
      throwIfCancelled();
      await emit(node, "node_completed", { asset });
      continue;
    }

    if (node === "collect_sources") {
      if (adapters.collectSources) {
        const agentResult = await adapters.collectSources({ asset });
        sources = agentResult.sources;
        if (agentResult.degradedReason) degradedReasons.push(agentResult.degradedReason);
        throwIfCancelled();
        await emit(node, "node_completed", {
          degraded: Boolean(agentResult.degradedReason),
          sources,
          agentTool: {
            provider: agentResult.provider,
            model: agentResult.model,
            degradedReason: agentResult.degradedReason,
            activeTools: agentResult.activeTools ?? [],
            toolCalls: agentResult.toolCalls ?? [],
            fallbackUsed: agentResult.fallbackUsed ?? false
          }
        });
        continue;
      }
      if (!adapters.searchProjectSources) {
        const reason = "网页/社媒/文档采集 adapter 尚未接入，报告会标记资料不足。";
        degradedReasons.push(reason);
        throwIfCancelled();
        await emit(node, "node_completed", { degraded: true, reason });
        continue;
      }
      const result = await adapters.searchProjectSources(asset);
      sources = result.sources;
      if (result.degradedReason) degradedReasons.push(result.degradedReason);
      throwIfCancelled();
      await emit(node, "node_completed", { degraded: Boolean(result.degradedReason), sources });
      continue;
    }

    if (node === "fetch_market_data") {
      if (adapters.fetchMarketData) {
        const agentResult = await adapters.fetchMarketData({ asset });
        marketData.push(...agentResult.marketData);
        if (agentResult.degradedReason) degradedReasons.push(agentResult.degradedReason);
        for (const item of agentResult.marketData) {
          if (item.degradedReason) degradedReasons.push(item.degradedReason);
        }
        throwIfCancelled();
        await emit(node, "node_completed", {
          degraded: Boolean(agentResult.degradedReason) || agentResult.marketData.some((item) => Boolean(item.degradedReason)),
          marketData,
          agentTool: {
            provider: agentResult.provider,
            model: agentResult.model,
            degradedReason: agentResult.degradedReason,
            activeTools: agentResult.activeTools ?? [],
            toolCalls: agentResult.toolCalls ?? [],
            fallbackUsed: agentResult.fallbackUsed ?? false
          }
        });
        continue;
      }

      if (adapters.getTokenMarketData) {
        const tokenMarket = await adapters.getTokenMarketData(asset);
        marketData.push(tokenMarket);
        if (tokenMarket.degradedReason) degradedReasons.push(tokenMarket.degradedReason);
      } else {
        const reason = "CoinGecko market adapter 尚未接入，市场价格数据为空。";
        degradedReasons.push(reason);
      }

      if (adapters.getDefiProtocolMetrics) {
        const protocolMetrics = await adapters.getDefiProtocolMetrics(asset);
        marketData.push(protocolMetrics);
        if (protocolMetrics.degradedReason) degradedReasons.push(protocolMetrics.degradedReason);
      } else {
        const reason = "DefiLlama protocol adapter 尚未接入，TVL/协议指标为空。";
        degradedReasons.push(reason);
      }

      throwIfCancelled();
      await emit(node, "node_completed", {
        degraded: marketData.some((item) => Boolean(item.degradedReason)),
        marketData
      });
      continue;
    }

    if (node === "fetch_onchain_data") {
      if (adapters.fetchOnchainData) {
        const agentResult = await adapters.fetchOnchainData({ asset });
        asset = agentResult.asset ?? asset;
        onchainData = agentResult.onchainData;
        contractRiskData = agentResult.contractRiskData;
        dexLiquidityData = agentResult.dexLiquidityData;
        holderConcentrationData = agentResult.holderConcentrationData;
        arkhamIntel = agentResult.arkhamIntel;
        if (agentResult.degradedReason) degradedReasons.push(agentResult.degradedReason);
        for (const item of [onchainData, contractRiskData, dexLiquidityData, holderConcentrationData, arkhamIntel]) {
          if (item?.degradedReason) degradedReasons.push(item.degradedReason);
        }
        throwIfCancelled();
        await emit(node, "node_completed", {
          degraded: Boolean(agentResult.degradedReason || onchainData?.degradedReason || arkhamIntel?.degradedReason),
          onchainData,
          contractRiskData,
          dexLiquidityData,
          holderConcentrationData,
          arkhamIntel,
          agentTool: {
            provider: agentResult.provider,
            model: agentResult.model,
            degradedReason: agentResult.degradedReason,
            activeTools: agentResult.activeTools ?? [],
            toolCalls: agentResult.toolCalls ?? [],
            fallbackUsed: agentResult.fallbackUsed ?? false
          }
        });
        continue;
      }

      if (!adapters.readErc20Metadata) {
        const reason = "Viem/RPC 链上读取 adapter 尚未接入，合约和持仓风险仅按缺失数据处理。";
        degradedReasons.push(reason);
        throwIfCancelled();
        await emit(node, "node_completed", { degraded: true, reason });
        continue;
      }
      onchainData = await adapters.readErc20Metadata(asset);
      if (onchainData.degradedReason) degradedReasons.push(onchainData.degradedReason);
      if (!asset.symbol && onchainData.symbol) asset = { ...asset, symbol: onchainData.symbol };
      if (!asset.name && onchainData.name) asset = { ...asset, name: onchainData.name };
      if (!asset.chain && onchainData.chain) asset = { ...asset, chain: onchainData.chain };
      if (adapters.readContractRisk) {
        contractRiskData = await adapters.readContractRisk(asset);
        if (contractRiskData.degradedReason) degradedReasons.push(contractRiskData.degradedReason);
      } else {
        const reason = "Contract risk adapter 尚未接入，owner/proxy/mint/pause 检查为空。";
        degradedReasons.push(reason);
      }
      if (adapters.getDexLiquidityData) {
        dexLiquidityData = await adapters.getDexLiquidityData(asset);
        if (dexLiquidityData.degradedReason) degradedReasons.push(dexLiquidityData.degradedReason);
      } else {
        const reason = "DEX liquidity adapter 尚未接入，LP/池子深度分析为空。";
        degradedReasons.push(reason);
      }
      if (adapters.getHolderConcentrationData) {
        holderConcentrationData = await adapters.getHolderConcentrationData(asset);
        if (holderConcentrationData.degradedReason) degradedReasons.push(holderConcentrationData.degradedReason);
      } else {
        const reason = "Holder concentration adapter 尚未接入，top holders 集中度分析为空。";
        degradedReasons.push(reason);
      }
      if (adapters.getArkhamAddressIntel) {
        arkhamIntel = await adapters.getArkhamAddressIntel(asset);
        if (arkhamIntel.degradedReason) degradedReasons.push(arkhamIntel.degradedReason);
      } else {
        const reason = "Arkham address intelligence adapter 尚未接入，实体标签和资金流分析为空。";
        degradedReasons.push(reason);
      }
      throwIfCancelled();
      await emit(node, "node_completed", {
        degraded: Boolean(onchainData.degradedReason || arkhamIntel?.degradedReason),
        onchainData,
        contractRiskData,
        dexLiquidityData,
        holderConcentrationData,
        arkhamIntel
      });
      continue;
    }

    if (node === "analyze_risk") {
      const riskInput = buildRiskInput({
        asset,
        sources,
        marketData,
        onchainData,
        contractRiskData,
        dexLiquidityData,
        holderConcentrationData,
        arkhamIntel,
        similarCases
      });

      if (adapters.analyzeRisk) {
        const agentResult = await adapters.analyzeRisk({ riskInput });
        risk = agentResult.risk;
        if (agentResult.degradedReason) degradedReasons.push(agentResult.degradedReason);
        throwIfCancelled();
        await emit(node, "node_completed", {
          risk,
          agentTool: agentResult.provider
            ? {
                provider: agentResult.provider,
                model: agentResult.model,
                degradedReason: agentResult.degradedReason,
                activeTools: agentResult.activeTools ?? [],
                toolCalls: agentResult.toolCalls ?? [],
                fallbackUsed: agentResult.fallbackUsed ?? false
              }
            : undefined
        });
        continue;
      }

      risk = calculateInitialRisk(riskInput);
      throwIfCancelled();
      await emit(node, "node_completed", { risk });
      continue;
    }

    if (node === "match_cases") {
      if (input.options.includeSimilarCases === false) {
        const reason = "相似案例匹配已在任务选项中关闭。";
        degradedReasons.push(reason);
        throwIfCancelled();
        await emit(node, "node_completed", { degraded: true, reason, cases: [] });
        continue;
      }

      if (!adapters.matchSimilarCases) {
        const reason = "本地相似案例匹配 adapter 尚未接入。";
        degradedReasons.push(reason);
        throwIfCancelled();
        await emit(node, "node_completed", { degraded: true, reason, cases: [] });
        continue;
      }

      const result = await adapters.matchSimilarCases({ asset, sources, marketData, onchainData, contractRiskData });
      similarCases = result.cases;
      if (result.degradedReason) degradedReasons.push(result.degradedReason);
      throwIfCancelled();
      await emit(node, "node_completed", {
        degraded: Boolean(result.degradedReason) || similarCases.length === 0,
        reason: result.degradedReason,
        cases: similarCases,
        agentTool: result.provider
          ? {
              provider: result.provider,
              model: result.model,
              degradedReason: result.degradedReason,
              activeTools: result.activeTools ?? [],
              toolCalls: result.toolCalls ?? [],
              fallbackUsed: result.fallbackUsed ?? false
            }
          : undefined
      });
      continue;
    }

    throwIfCancelled();
    await emit(node, "node_completed", { degraded: node === "index_knowledge" });
  }

  throwIfCancelled();
  const finalRiskInput = buildRiskInput({
    asset,
    sources,
    marketData,
    onchainData,
    contractRiskData,
    dexLiquidityData,
    holderConcentrationData,
    arkhamIntel,
    similarCases
  });
  const finalRisk = risk && finalRiskInput.hasSimilarCases === false ? risk : calculateInitialRisk(finalRiskInput);
  if (risk && finalRisk.totalScore !== risk.totalScore) {
    await emit("analyze_risk", "risk_recalculated_after_cases", {
      previousRisk: risk,
      risk: finalRisk,
      reason: "Final risk was recalculated after local similar-case matching."
    });
  }

  const deterministicReport = writeResearchReport({
    id: createId("report"),
    taskId,
    asset,
    risk: finalRisk,
    question: input.question,
    sources,
    marketData,
    onchainData,
    contractRiskData,
    dexLiquidityData,
    holderConcentrationData,
    arkhamIntel,
    similarCases,
    degradedReasons
  });
  let report = deterministicReport;

  if (adapters.draftResearchReport) {
    throwIfCancelled();
    await emit("write_report", "agent_report_started", { provider: "agent-runtime" });
    const draft = await adapters.draftResearchReport({
      baseReport: deterministicReport,
      researchContext: {
      taskId,
      asset,
      sources,
      marketData,
        onchainData,
        contractRiskData,
        dexLiquidityData,
        holderConcentrationData,
        arkhamIntel,
        similarCases,
        degradedReasons
      }
    });
    throwIfCancelled();
    if (draft.degradedReason || !draft.markdown || !draft.summary || !draft.recommendation || draft.confidence === undefined) {
      await emit("write_report", "agent_report_degraded", {
        provider: draft.provider,
        model: draft.model,
        reason: draft.degradedReason ?? "Agent report draft returned incomplete output.",
        agentTool: {
          provider: draft.provider,
          model: draft.model,
          degradedReason: draft.degradedReason,
          activeTools: draft.activeTools ?? [],
          toolCalls: draft.toolCalls ?? [],
          fallbackUsed: draft.fallbackUsed ?? false
        }
      });
    } else {
      report = {
        ...deterministicReport,
        markdown: appendDeterministicAuditAppendix(draft.markdown, deterministicReport.markdown, draft.provider, draft.model),
        summary: draft.summary,
        recommendation: draft.recommendation,
        confidence: draft.confidence
      };
      await emit("write_report", "agent_report_completed", {
        provider: draft.provider,
        model: draft.model,
        activeTools: draft.activeTools,
        toolCalls: draft.toolCalls,
        agentTool: {
          provider: draft.provider,
          model: draft.model,
          degradedReason: draft.degradedReason,
          activeTools: draft.activeTools ?? [],
          toolCalls: draft.toolCalls ?? [],
          fallbackUsed: draft.fallbackUsed ?? false
        },
        recommendation: report.recommendation,
        confidence: report.confidence
      });
    }
  }

  task.status = "completed";
  task.currentNode = "index_knowledge";
  task.completedAt = new Date().toISOString();
  task.updatedAt = task.completedAt;
  await persistTaskUpdate();
  await emit(undefined, "task_completed", {
    reportId: report.id,
    riskLevel: finalRisk.level,
    riskScore: finalRisk.totalScore,
    recommendation: report.recommendation
  });

  return { task, report };
}

function appendDeterministicAuditAppendix(markdown: string, deterministicMarkdown: string, provider: string, model?: string): string {
  const dataSources = deterministicMarkdown.split("## 13. 数据来源")[1]?.trim();
  const appendix = dataSources
    ? `## 附录：确定性数据来源与降级记录\n\n${dataSources}`
    : "## 附录：确定性数据来源与降级记录\n\n- 确定性报告未生成可解析的数据来源附录。";

  return `${markdown.trim()}

${appendix}

## Agent 生成说明

- Provider：${provider}
- Model：${model ?? "未返回"}
- 说明：本报告由 agent-runtime 基于确定性报告改写；不得视为新增数据源。若正文与附录冲突，以附录中的确定性数据来源和降级记录为准。
`;
}

function buildRiskInput(input: {
  asset: ResolvedAsset;
  sources: SourceCandidate[];
  marketData: MarketData[];
  onchainData?: OnchainData;
  contractRiskData?: ContractRiskData;
  dexLiquidityData?: DexLiquidityData;
  holderConcentrationData?: HolderConcentrationData;
  arkhamIntel?: ArkhamIntel;
  similarCases: SimilarCase[];
}): ResearchRiskInputSnapshot {
  return {
    hasResolvedAddress: Boolean(input.asset.address),
    hasMarketData: input.marketData.some((item) => !item.degradedReason),
    dexLiquidityData: input.dexLiquidityData,
    holderConcentrationData: input.holderConcentrationData,
    hasOnchainData: Boolean(
      (input.onchainData && !input.onchainData.degradedReason) ||
        (input.contractRiskData && !input.contractRiskData.degradedReason) ||
        (input.dexLiquidityData && !input.dexLiquidityData.degradedReason) ||
        (input.holderConcentrationData && !input.holderConcentrationData.degradedReason) ||
        (input.arkhamIntel && !input.arkhamIntel.degradedReason)
    ),
    hasArkhamIntel: Boolean(input.arkhamIntel && !input.arkhamIntel.degradedReason),
    contractRiskData: input.contractRiskData,
    hasSources: input.sources.length > 0,
    hasSimilarCases: input.similarCases.length > 0
  };
}
