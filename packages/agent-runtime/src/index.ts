import { Type } from "typebox";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type {
  ArkhamIntel,
  ContractRiskData,
  DexLiquidityData,
  HolderConcentrationData,
  MarketData,
  OnchainData,
  ResearchInputType,
  ResearchReport,
  ResolvedAsset,
  RiskAssessment,
  SimilarCase,
  SourceCandidate
} from "@sp-agent/shared";

export type AgentRuntimeStatus = {
  provider: "siliconflow" | "pi";
  configured: boolean;
  reachable: boolean;
  sdkLoaded?: boolean;
  selectedModelAvailable?: boolean;
  availableModelCount?: number;
  degradedReason?: string;
};

export type AgentRuntimeToolCallAudit = {
  toolCallId?: string;
  toolName: string;
  input?: unknown;
  isError?: boolean;
  outputPreview?: string;
};

export type AgentResearchContextSnapshot = {
  taskId?: string;
  asset?: unknown;
  sources?: unknown[];
  marketData?: unknown[];
  onchainData?: unknown;
  contractRiskData?: unknown;
  dexLiquidityData?: unknown;
  holderConcentrationData?: unknown;
  arkhamIntel?: unknown;
  similarCases?: unknown[];
  degradedReasons?: string[];
};

export type AgentReportDraftInput = {
  baseReportMarkdown: string;
  baseSummary: string;
  recommendation: "Buy" | "Watch" | "Avoid" | "Reduce";
  confidence: number;
  researchContext?: AgentResearchContextSnapshot;
  requireWriteReportTool?: boolean;
};

export type AgentReportDraftResult = {
  markdown?: string;
  summary?: string;
  recommendation?: "Buy" | "Watch" | "Avoid" | "Reduce";
  confidence?: number;
  provider: string;
  model?: string;
  degradedReason?: string;
  activeTools?: string[];
  toolCalls?: AgentRuntimeToolCallAudit[];
  fallbackUsed?: boolean;
};

export type PersonalAgentTurnInput = {
  message: string;
  sessionId?: string;
  extensionManifests?: unknown[];
  safetyModel?: unknown;
  extensionInvoker?: (request: PersonalAgentExtensionInvokeRequest) => Promise<PersonalAgentExtensionInvokeResult>;
};

export type PersonalAgentTurnResult = {
  content: string;
  provider: "pi" | "siliconflow";
  model?: string;
  degradedReason?: string;
  activeTools?: string[];
  toolCalls?: AgentRuntimeToolCallAudit[];
};

export type PersonalAgentExtensionInvokeRequest = {
  extensionId: string;
  capabilityId: string;
  input: Record<string, unknown>;
};

export type PersonalAgentExtensionInvokeResult = {
  ok: boolean;
  status: string;
  result?: unknown;
  degradedReason?: string;
  permissionAudit?: unknown;
};

export type AgentResolveAssetInput = {
  input: string;
  inputType: ResearchInputType;
  resolveAsset: (input: string, inputType: ResearchInputType) => ResolvedAsset;
};

export type AgentResolveAssetResult = {
  asset?: ResolvedAsset;
  provider: "pi";
  model?: string;
  degradedReason?: string;
  activeTools?: string[];
  toolCalls?: AgentRuntimeToolCallAudit[];
  fallbackUsed?: boolean;
};

export type AgentCollectSourcesInput = {
  asset: ResolvedAsset;
  collectSources: (asset: ResolvedAsset) => Promise<{ sources: SourceCandidate[]; degradedReason?: string }>;
};

export type AgentCollectSourcesResult = {
  sources: SourceCandidate[];
  provider: "pi";
  model?: string;
  degradedReason?: string;
  activeTools?: string[];
  toolCalls?: AgentRuntimeToolCallAudit[];
  fallbackUsed?: boolean;
};

export type AgentFetchMarketDataInput = {
  asset: ResolvedAsset;
  getTokenMarketData?: (asset: ResolvedAsset) => Promise<MarketData>;
  getDefiProtocolMetrics?: (asset: ResolvedAsset) => Promise<MarketData>;
};

export type AgentFetchMarketDataResult = {
  marketData: MarketData[];
  provider: "pi";
  model?: string;
  degradedReason?: string;
  activeTools?: string[];
  toolCalls?: AgentRuntimeToolCallAudit[];
  fallbackUsed?: boolean;
};

export type AgentFetchOnchainDataInput = {
  asset: ResolvedAsset;
  readErc20Metadata?: (asset: ResolvedAsset) => Promise<OnchainData>;
  readContractRisk?: (asset: ResolvedAsset) => Promise<ContractRiskData>;
  getDexLiquidityData?: (asset: ResolvedAsset) => Promise<DexLiquidityData>;
  getHolderConcentrationData?: (asset: ResolvedAsset) => Promise<HolderConcentrationData>;
  getArkhamAddressIntel?: (asset: ResolvedAsset) => Promise<ArkhamIntel>;
};

export type AgentFetchOnchainDataResult = {
  asset?: ResolvedAsset;
  onchainData?: OnchainData;
  contractRiskData?: ContractRiskData;
  dexLiquidityData?: DexLiquidityData;
  holderConcentrationData?: HolderConcentrationData;
  arkhamIntel?: ArkhamIntel;
  provider: "pi";
  model?: string;
  degradedReason?: string;
  activeTools?: string[];
  toolCalls?: AgentRuntimeToolCallAudit[];
  fallbackUsed?: boolean;
};

export type AgentSearchKnowledgeInput = {
  asset: ResolvedAsset;
  sources: SourceCandidate[];
  marketData: MarketData[];
  onchainData?: OnchainData;
  contractRiskData?: ContractRiskData;
  matchSimilarCases: (input: {
    asset: ResolvedAsset;
    sources: SourceCandidate[];
    marketData: MarketData[];
    onchainData?: OnchainData;
    contractRiskData?: ContractRiskData;
  }) => Promise<{ cases: SimilarCase[]; degradedReason?: string }>;
};

export type AgentSearchKnowledgeResult = {
  cases: SimilarCase[];
  provider: "pi";
  model?: string;
  degradedReason?: string;
  activeTools?: string[];
  toolCalls?: AgentRuntimeToolCallAudit[];
  fallbackUsed?: boolean;
};

export type AgentRiskInputSnapshot = {
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

export type AgentAnalyzeRiskInput = {
  riskInput: AgentRiskInputSnapshot;
  calculateRisk: (input: AgentRiskInputSnapshot) => RiskAssessment;
};

export type AgentAnalyzeRiskResult = {
  risk: RiskAssessment;
  provider: "pi";
  model?: string;
  degradedReason?: string;
  activeTools?: string[];
  toolCalls?: AgentRuntimeToolCallAudit[];
  fallbackUsed?: boolean;
};

export type AgentIndexKnowledgeInput = {
  report: ResearchReport;
  indexReport: (report: ResearchReport) => Promise<{ indexed: boolean; degradedReason?: string }>;
};

export type AgentIndexKnowledgeResult = {
  indexed: boolean;
  provider: "pi";
  model?: string;
  degradedReason?: string;
  activeTools?: string[];
  toolCalls?: AgentRuntimeToolCallAudit[];
  fallbackUsed?: boolean;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type PiSdkModule = {
  AuthStorage: {
    inMemory(data?: Record<string, unknown>): {
      setRuntimeApiKey(provider: string, apiKey: string): void;
    };
  };
  createAgentSession(options?: Record<string, unknown>): Promise<{
    session: {
      prompt(text: string, options?: Record<string, unknown>): Promise<void>;
      subscribe(listener: (event: unknown) => void): () => void;
      dispose(): void;
      getActiveToolNames?: () => string[];
      agent?: {
        waitForIdle?: () => Promise<void>;
      };
    };
    modelFallbackMessage?: string;
  }>;
  ModelRegistry: {
    inMemory(authStorage: unknown): {
      find(provider: string, modelId: string): unknown | undefined;
      getAvailable(): unknown[];
      registerProvider(provider: string, config: Record<string, unknown>): void;
    };
  };
  SessionManager: {
    inMemory(cwd?: string): unknown;
  };
};

export async function getAgentRuntimeStatus(env: NodeJS.ProcessEnv = process.env): Promise<AgentRuntimeStatus> {
  const provider = agentRuntimeProvider(env);
  if (provider === "pi") {
    return getPiRuntimeStatus(env);
  }

  const configured = Boolean(env.SILICONFLOW_API_KEY);
  return {
    provider,
    configured,
    reachable: configured,
    degradedReason: configured
      ? "Legacy SiliconFlow direct drafting is configured. Pi remains the default Agent runtime; use this only as a fallback."
      : "SILICONFLOW_API_KEY is not configured, so deterministic report output will be used."
  };
}

export async function draftResearchReportWithAgent(
  input: AgentReportDraftInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<AgentReportDraftResult> {
  if (agentRuntimeProvider(env) === "pi") {
    return draftResearchReportWithPi(input, env);
  }

  // Compatibility fallback only; Pi is the target runtime path.
  if (!env.SILICONFLOW_API_KEY) {
    return {
      provider: "siliconflow",
      degradedReason: "SILICONFLOW_API_KEY is not configured, so deterministic report output was used."
    };
  }

  const baseUrl = env.SILICONFLOW_BASE_URL ?? "https://api.siliconflow.cn/v1";
  const model = env.SILICONFLOW_MODEL ?? "Qwen/Qwen2.5-72B-Instruct";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs(env));

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.SILICONFLOW_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a Web3 research report drafting assistant. Use only the supplied base report. Do not invent market, chain, social, holder, or source data. Preserve all source URLs and degraded reasons. Return strict JSON."
          },
          {
            role: "user",
            content: JSON.stringify({
              task: "Rewrite the supplied Markdown into a clearer evidence-backed Chinese Web3 research report. Keep every material data point, source URL, degraded reason, recommendation constraint, and risk caveat. If data is missing, say it is missing.",
              outputSchema: {
                markdown: "string",
                summary: "string",
                recommendation: "Buy | Watch | Avoid | Reduce",
                confidence: "number between 0 and 100"
              },
              baseReport: {
                markdown: input.baseReportMarkdown.slice(0, 24000),
                summary: input.baseSummary,
                recommendation: input.recommendation,
                confidence: input.confidence
              }
            })
          }
        ]
      })
    });

    if (!response.ok) {
      return {
        provider: "siliconflow",
        model,
        degradedReason: `SiliconFlow chat completion returned HTTP ${response.status}.`
      };
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return {
        provider: "siliconflow",
        model,
        degradedReason: "SiliconFlow chat completion returned no message content."
      };
    }

    return normalizeDraft(content, model);
  } catch (error) {
    return {
      provider: "siliconflow",
      model,
      degradedReason: error instanceof Error ? error.message : "SiliconFlow chat completion failed."
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runPersonalAgentTurnWithAgent(
  input: PersonalAgentTurnInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<PersonalAgentTurnResult> {
  if (agentRuntimeProvider(env) !== "pi") {
    return {
      content:
        "当前本地个人 agent 壳子已就绪，但 AGENT_RUNTIME_PROVIDER 被设置为 legacy SiliconFlow direct fallback。第一阶段目标是 Pi base，请切回 AGENT_RUNTIME_PROVIDER=pi 后再启用 LLM turn。",
      provider: "siliconflow",
      degradedReason: "Personal agent shell only supports Pi as the first-class runtime."
    };
  }

  const provider = piModelProvider(env);
  const modelId = piModelId(env);
  if (!piHasApiKey(provider, env)) {
    return {
      content:
        "本地个人 agent 壳子已就绪。当前没有可用的 Pi 模型密钥，所以这次返回 deterministic degraded response；已加载的 extensions 可以继续作为本地能力清单检查，但不会调用外部模型或高风险工具。",
      provider: "pi",
      model: `${provider}/${modelId}`,
      degradedReason:
        provider === "siliconflow"
          ? "AGENT_RUNTIME_PROVIDER=pi requires SILICONFLOW_API_KEY or PI_API_KEY for the built-in SiliconFlow Pi provider."
          : "AGENT_RUNTIME_PROVIDER=pi requires PI_API_KEY or the selected provider's standard environment API key.",
      activeTools: ["inspect_extension_registry", "invoke_extension_capability"],
      toolCalls: []
    };
  }

  try {
    const { pi, authStorage, modelRegistry, model } = await createPiModelContext(env, provider, modelId);
    if (!model) {
      return {
        content: "Pi runtime 已选择，但模型注册表里找不到当前模型。本地 agent shell 保持 degraded 可用。",
        provider: "pi",
        model: `${provider}/${modelId}`,
        degradedReason: `Pi model ${provider}/${modelId} was not found in the Pi model registry.`
      };
    }

    const chunks: string[] = [];
    const toolCalls: AgentRuntimeToolCallAudit[] = [];
    const customTools = createPiAgentShellTools(input);
    const appToolNames = customTools.map((tool) => tool.name);
    const { session, modelFallbackMessage } = await pi.createAgentSession({
      cwd: env.PI_WORKING_DIR || process.cwd(),
      authStorage,
      modelRegistry,
      model,
      thinkingLevel: parsePiThinkingLevel(env.PI_THINKING_LEVEL),
      noTools: "builtin",
      tools: appToolNames,
      excludeTools: ["read", "bash", "edit", "write", "grep", "find", "ls"],
      customTools,
      sessionManager: pi.SessionManager.inMemory(env.PI_WORKING_DIR || process.cwd())
    });

    const unsubscribe = session.subscribe((event) => {
      const delta = extractPiTextDelta(event);
      if (delta) chunks.push(delta);
      const toolAudit = extractPiToolAudit(event);
      if (toolAudit) mergePiToolAudit(toolCalls, toolAudit);
    });
    const activeTools = session.getActiveToolNames?.() ?? appToolNames;

    try {
      await withTimeout(
        (async () => {
          await session.prompt(buildPiAgentShellPrompt(input), {
            expandPromptTemplates: false,
            source: "api"
          });
          await session.agent?.waitForIdle?.();
        })(),
        piRequestTimeoutMs(env),
        "Pi SDK personal agent turn timed out."
      );
    } finally {
      unsubscribe();
      session.dispose();
    }

    const content = chunks.join("").trim();
    if (!content) {
      return {
        content: "Pi runtime 没有返回文本。本地 agent shell 保持 degraded 可用。",
        provider: "pi",
        model: `${provider}/${modelId}`,
        activeTools,
        toolCalls,
        degradedReason: modelFallbackMessage ? `Pi SDK returned no assistant text. ${modelFallbackMessage}` : "Pi SDK returned no assistant text."
      };
    }

    return {
      content,
      provider: "pi",
      model: `${provider}/${modelId}`,
      activeTools,
      toolCalls
    };
  } catch (error) {
    return {
      content: "Pi runtime 调用失败。本地 agent shell 保持 degraded 可用，未调用高风险工具。",
      provider: "pi",
      model: `${provider}/${modelId}`,
      degradedReason: error instanceof Error ? error.message : "Pi SDK personal agent turn failed."
    };
  }
}

export async function resolveResearchAssetWithAgent(
  input: AgentResolveAssetInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<AgentResolveAssetResult> {
  const provider = piModelProvider(env);
  const modelId = piModelId(env);
  const fallbackAsset = input.resolveAsset(input.input, input.inputType);
  const activeTools = ["resolve_research_asset"];

  if (agentRuntimeProvider(env) !== "pi") {
    return {
      asset: fallbackAsset,
      provider: "pi",
      model: `${provider}/${modelId}`,
      activeTools,
      fallbackUsed: true,
      degradedReason: "Research asset resolution app tool requires AGENT_RUNTIME_PROVIDER=pi; deterministic fallback was used."
    };
  }

  if (!piHasApiKey(provider, env)) {
    return {
      asset: fallbackAsset,
      provider: "pi",
      model: `${provider}/${modelId}`,
      activeTools,
      fallbackUsed: true,
      degradedReason:
        provider === "siliconflow"
          ? "AGENT_RUNTIME_PROVIDER=pi requires SILICONFLOW_API_KEY or PI_API_KEY for resolve_research_asset; deterministic fallback was used."
          : "AGENT_RUNTIME_PROVIDER=pi requires PI_API_KEY or the selected provider key for resolve_research_asset; deterministic fallback was used."
    };
  }

  try {
    const { pi, authStorage, modelRegistry, model } = await createPiModelContext(env, provider, modelId);
    if (!model) {
      return {
        asset: fallbackAsset,
        provider: "pi",
        model: `${provider}/${modelId}`,
        activeTools,
        fallbackUsed: true,
        degradedReason: `Pi model ${provider}/${modelId} was not found for resolve_research_asset; deterministic fallback was used.`
      };
    }

    const chunks: string[] = [];
    const toolCalls: AgentRuntimeToolCallAudit[] = [];
    let toolAsset: ResolvedAsset | undefined;
    const customTools = createPiResolveAssetTools(input, (asset) => {
      toolAsset = asset;
    });
    const appToolNames = customTools.map((tool) => tool.name);
    const { session, modelFallbackMessage } = await pi.createAgentSession({
      cwd: env.PI_WORKING_DIR || process.cwd(),
      authStorage,
      modelRegistry,
      model,
      thinkingLevel: parsePiThinkingLevel(env.PI_THINKING_LEVEL),
      noTools: "builtin",
      tools: appToolNames,
      excludeTools: ["read", "bash", "edit", "write", "grep", "find", "ls"],
      customTools,
      sessionManager: pi.SessionManager.inMemory(env.PI_WORKING_DIR || process.cwd())
    });

    const unsubscribe = session.subscribe((event) => {
      const delta = extractPiTextDelta(event);
      if (delta) chunks.push(delta);
      const toolAudit = extractPiToolAudit(event);
      if (toolAudit) mergePiToolAudit(toolCalls, toolAudit);
    });
    const sessionActiveTools = session.getActiveToolNames?.() ?? appToolNames;

    try {
      await withTimeout(
        (async () => {
          await session.prompt(buildPiResolveAssetPrompt(input), {
            expandPromptTemplates: false,
            source: "api"
          });
          await session.agent?.waitForIdle?.();
        })(),
        piResolveAssetTimeoutMs(env),
        "Pi SDK resolve_research_asset timed out."
      );
    } finally {
      unsubscribe();
      session.dispose();
    }

    if (!toolAsset) {
      return {
        asset: fallbackAsset,
        provider: "pi",
        model: `${provider}/${modelId}`,
        activeTools: sessionActiveTools,
        toolCalls,
        fallbackUsed: true,
        degradedReason: modelFallbackMessage
          ? `Pi did not call resolve_research_asset; deterministic fallback was used. ${modelFallbackMessage}`
          : "Pi did not call resolve_research_asset; deterministic fallback was used."
      };
    }

    return {
      asset: toolAsset,
      provider: "pi",
      model: `${provider}/${modelId}`,
      activeTools: sessionActiveTools,
      toolCalls,
      fallbackUsed: false
    };
  } catch (error) {
    return {
      asset: fallbackAsset,
      provider: "pi",
      model: `${provider}/${modelId}`,
      activeTools,
      fallbackUsed: true,
      degradedReason:
        error instanceof Error
          ? `Pi resolve_research_asset failed: ${error.message}; deterministic fallback was used.`
          : "Pi resolve_research_asset failed; deterministic fallback was used."
    };
  }
}

export async function collectResearchSourcesWithAgent(
  input: AgentCollectSourcesInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<AgentCollectSourcesResult> {
  const provider = piModelProvider(env);
  const modelId = piModelId(env);
  const activeTools = ["collect_research_sources"];

  if (agentRuntimeProvider(env) !== "pi") {
    const fallback = await safeCollectResearchSources(input);
    return {
      ...fallback,
      provider: "pi",
      model: `${provider}/${modelId}`,
      activeTools,
      fallbackUsed: true,
      degradedReason: appendDegradedReason(
        fallback.degradedReason,
        "Research source collection app tool requires AGENT_RUNTIME_PROVIDER=pi; deterministic fallback was used."
      )
    };
  }

  if (!piHasApiKey(provider, env)) {
    const fallback = await safeCollectResearchSources(input);
    return {
      ...fallback,
      provider: "pi",
      model: `${provider}/${modelId}`,
      activeTools,
      fallbackUsed: true,
      degradedReason: appendDegradedReason(
        fallback.degradedReason,
        provider === "siliconflow"
          ? "AGENT_RUNTIME_PROVIDER=pi requires SILICONFLOW_API_KEY or PI_API_KEY for collect_research_sources; deterministic fallback was used."
          : "AGENT_RUNTIME_PROVIDER=pi requires PI_API_KEY or the selected provider key for collect_research_sources; deterministic fallback was used."
      )
    };
  }

  try {
    const { pi, authStorage, modelRegistry, model } = await createPiModelContext(env, provider, modelId);
    if (!model) {
      const fallback = await safeCollectResearchSources(input);
      return {
        ...fallback,
        provider: "pi",
        model: `${provider}/${modelId}`,
        activeTools,
        fallbackUsed: true,
        degradedReason: appendDegradedReason(
          fallback.degradedReason,
          `Pi model ${provider}/${modelId} was not found for collect_research_sources; deterministic fallback was used.`
        )
      };
    }

    const chunks: string[] = [];
    const toolCalls: AgentRuntimeToolCallAudit[] = [];
    let toolResult: { sources: SourceCandidate[]; degradedReason?: string } | undefined;
    const customTools = createPiCollectSourcesTools(input, (result) => {
      toolResult = result;
    });
    const appToolNames = customTools.map((tool) => tool.name);
    const { session, modelFallbackMessage } = await pi.createAgentSession({
      cwd: env.PI_WORKING_DIR || process.cwd(),
      authStorage,
      modelRegistry,
      model,
      thinkingLevel: parsePiThinkingLevel(env.PI_THINKING_LEVEL),
      noTools: "builtin",
      tools: appToolNames,
      excludeTools: ["read", "bash", "edit", "write", "grep", "find", "ls"],
      customTools,
      sessionManager: pi.SessionManager.inMemory(env.PI_WORKING_DIR || process.cwd())
    });

    const unsubscribe = session.subscribe((event) => {
      const delta = extractPiTextDelta(event);
      if (delta) chunks.push(delta);
      const toolAudit = extractPiToolAudit(event);
      if (toolAudit) mergePiToolAudit(toolCalls, toolAudit);
    });
    const sessionActiveTools = session.getActiveToolNames?.() ?? appToolNames;

    try {
      await withTimeout(
        (async () => {
          await session.prompt(buildPiCollectSourcesPrompt(input), {
            expandPromptTemplates: false,
            source: "api"
          });
          await session.agent?.waitForIdle?.();
        })(),
        piCollectSourcesTimeoutMs(env),
        "Pi SDK collect_research_sources timed out."
      );
    } finally {
      unsubscribe();
      session.dispose();
    }

    if (!toolResult) {
      const fallback = await safeCollectResearchSources(input);
      return {
        ...fallback,
        provider: "pi",
        model: `${provider}/${modelId}`,
        activeTools: sessionActiveTools,
        toolCalls,
        fallbackUsed: true,
        degradedReason: appendDegradedReason(
          fallback.degradedReason,
          modelFallbackMessage
            ? `Pi did not call collect_research_sources; deterministic fallback was used. ${modelFallbackMessage}`
            : "Pi did not call collect_research_sources; deterministic fallback was used."
        )
      };
    }

    return {
      sources: toolResult.sources,
      provider: "pi",
      model: `${provider}/${modelId}`,
      degradedReason: toolResult.degradedReason,
      activeTools: sessionActiveTools,
      toolCalls,
      fallbackUsed: false
    };
  } catch (error) {
    const fallback = await safeCollectResearchSources(input);
    return {
      ...fallback,
      provider: "pi",
      model: `${provider}/${modelId}`,
      activeTools,
      fallbackUsed: true,
      degradedReason: appendDegradedReason(
        fallback.degradedReason,
        error instanceof Error
          ? `Pi collect_research_sources failed: ${error.message}; deterministic fallback was used.`
          : "Pi collect_research_sources failed; deterministic fallback was used."
      )
    };
  }
}

export async function fetchResearchMarketDataWithAgent(
  input: AgentFetchMarketDataInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<AgentFetchMarketDataResult> {
  const provider = piModelProvider(env);
  const modelId = piModelId(env);
  const activeTools = ["fetch_research_market_data"];

  if (agentRuntimeProvider(env) !== "pi") {
    const fallback = await safeFetchResearchMarketData(input);
    return {
      ...fallback,
      provider: "pi",
      model: `${provider}/${modelId}`,
      activeTools,
      fallbackUsed: true,
      degradedReason: appendDegradedReason(
        fallback.degradedReason,
        "Research market data app tool requires AGENT_RUNTIME_PROVIDER=pi; deterministic fallback was used."
      )
    };
  }

  if (!piHasApiKey(provider, env)) {
    const fallback = await safeFetchResearchMarketData(input);
    return {
      ...fallback,
      provider: "pi",
      model: `${provider}/${modelId}`,
      activeTools,
      fallbackUsed: true,
      degradedReason: appendDegradedReason(
        fallback.degradedReason,
        provider === "siliconflow"
          ? "AGENT_RUNTIME_PROVIDER=pi requires SILICONFLOW_API_KEY or PI_API_KEY for fetch_research_market_data; deterministic fallback was used."
          : "AGENT_RUNTIME_PROVIDER=pi requires PI_API_KEY or the selected provider key for fetch_research_market_data; deterministic fallback was used."
      )
    };
  }

  try {
    const { pi, authStorage, modelRegistry, model } = await createPiModelContext(env, provider, modelId);
    if (!model) {
      const fallback = await safeFetchResearchMarketData(input);
      return {
        ...fallback,
        provider: "pi",
        model: `${provider}/${modelId}`,
        activeTools,
        fallbackUsed: true,
        degradedReason: appendDegradedReason(
          fallback.degradedReason,
          `Pi model ${provider}/${modelId} was not found for fetch_research_market_data; deterministic fallback was used.`
        )
      };
    }

    const chunks: string[] = [];
    const toolCalls: AgentRuntimeToolCallAudit[] = [];
    let toolResult: { marketData: MarketData[]; degradedReason?: string } | undefined;
    const customTools = createPiFetchMarketDataTools(input, (result) => {
      toolResult = result;
    });
    const appToolNames = customTools.map((tool) => tool.name);
    const { session, modelFallbackMessage } = await pi.createAgentSession({
      cwd: env.PI_WORKING_DIR || process.cwd(),
      authStorage,
      modelRegistry,
      model,
      thinkingLevel: parsePiThinkingLevel(env.PI_THINKING_LEVEL),
      noTools: "builtin",
      tools: appToolNames,
      excludeTools: ["read", "bash", "edit", "write", "grep", "find", "ls"],
      customTools,
      sessionManager: pi.SessionManager.inMemory(env.PI_WORKING_DIR || process.cwd())
    });

    const unsubscribe = session.subscribe((event) => {
      const delta = extractPiTextDelta(event);
      if (delta) chunks.push(delta);
      const toolAudit = extractPiToolAudit(event);
      if (toolAudit) mergePiToolAudit(toolCalls, toolAudit);
    });
    const sessionActiveTools = session.getActiveToolNames?.() ?? appToolNames;

    try {
      await withTimeout(
        (async () => {
          await session.prompt(buildPiFetchMarketDataPrompt(input), {
            expandPromptTemplates: false,
            source: "api"
          });
          await session.agent?.waitForIdle?.();
        })(),
        piFetchMarketDataTimeoutMs(env),
        "Pi SDK fetch_research_market_data timed out."
      );
    } finally {
      unsubscribe();
      session.dispose();
    }

    if (!toolResult) {
      const fallback = await safeFetchResearchMarketData(input);
      return {
        ...fallback,
        provider: "pi",
        model: `${provider}/${modelId}`,
        activeTools: sessionActiveTools,
        toolCalls,
        fallbackUsed: true,
        degradedReason: appendDegradedReason(
          fallback.degradedReason,
          modelFallbackMessage
            ? `Pi did not call fetch_research_market_data; deterministic fallback was used. ${modelFallbackMessage}`
            : "Pi did not call fetch_research_market_data; deterministic fallback was used."
        )
      };
    }

    return {
      marketData: toolResult.marketData,
      provider: "pi",
      model: `${provider}/${modelId}`,
      degradedReason: toolResult.degradedReason,
      activeTools: sessionActiveTools,
      toolCalls,
      fallbackUsed: false
    };
  } catch (error) {
    const fallback = await safeFetchResearchMarketData(input);
    return {
      ...fallback,
      provider: "pi",
      model: `${provider}/${modelId}`,
      activeTools,
      fallbackUsed: true,
      degradedReason: appendDegradedReason(
        fallback.degradedReason,
        error instanceof Error
          ? `Pi fetch_research_market_data failed: ${error.message}; deterministic fallback was used.`
          : "Pi fetch_research_market_data failed; deterministic fallback was used."
      )
    };
  }
}

export async function fetchResearchOnchainDataWithAgent(
  input: AgentFetchOnchainDataInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<AgentFetchOnchainDataResult> {
  const provider = piModelProvider(env);
  const modelId = piModelId(env);
  const activeTools = ["fetch_research_onchain_data"];

  if (agentRuntimeProvider(env) !== "pi") {
    const fallback = await safeFetchResearchOnchainData(input);
    return {
      ...fallback,
      provider: "pi",
      model: `${provider}/${modelId}`,
      activeTools,
      fallbackUsed: true,
      degradedReason: appendDegradedReason(
        fallback.degradedReason,
        "Research on-chain data app tool requires AGENT_RUNTIME_PROVIDER=pi; deterministic fallback was used."
      )
    };
  }

  if (!piHasApiKey(provider, env)) {
    const fallback = await safeFetchResearchOnchainData(input);
    return {
      ...fallback,
      provider: "pi",
      model: `${provider}/${modelId}`,
      activeTools,
      fallbackUsed: true,
      degradedReason: appendDegradedReason(
        fallback.degradedReason,
        provider === "siliconflow"
          ? "AGENT_RUNTIME_PROVIDER=pi requires SILICONFLOW_API_KEY or PI_API_KEY for fetch_research_onchain_data; deterministic fallback was used."
          : "AGENT_RUNTIME_PROVIDER=pi requires PI_API_KEY or the selected provider key for fetch_research_onchain_data; deterministic fallback was used."
      )
    };
  }

  try {
    const { pi, authStorage, modelRegistry, model } = await createPiModelContext(env, provider, modelId);
    if (!model) {
      const fallback = await safeFetchResearchOnchainData(input);
      return {
        ...fallback,
        provider: "pi",
        model: `${provider}/${modelId}`,
        activeTools,
        fallbackUsed: true,
        degradedReason: appendDegradedReason(
          fallback.degradedReason,
          `Pi model ${provider}/${modelId} was not found for fetch_research_onchain_data; deterministic fallback was used.`
        )
      };
    }

    const chunks: string[] = [];
    const toolCalls: AgentRuntimeToolCallAudit[] = [];
    let toolResult:
      | {
          asset?: ResolvedAsset;
          onchainData?: OnchainData;
          contractRiskData?: ContractRiskData;
          dexLiquidityData?: DexLiquidityData;
          holderConcentrationData?: HolderConcentrationData;
          arkhamIntel?: ArkhamIntel;
          degradedReason?: string;
        }
      | undefined;
    const customTools = createPiFetchOnchainDataTools(input, (result) => {
      toolResult = result;
    });
    const appToolNames = customTools.map((tool) => tool.name);
    const { session, modelFallbackMessage } = await pi.createAgentSession({
      cwd: env.PI_WORKING_DIR || process.cwd(),
      authStorage,
      modelRegistry,
      model,
      thinkingLevel: parsePiThinkingLevel(env.PI_THINKING_LEVEL),
      noTools: "builtin",
      tools: appToolNames,
      excludeTools: ["read", "bash", "edit", "write", "grep", "find", "ls"],
      customTools,
      sessionManager: pi.SessionManager.inMemory(env.PI_WORKING_DIR || process.cwd())
    });

    const unsubscribe = session.subscribe((event) => {
      const delta = extractPiTextDelta(event);
      if (delta) chunks.push(delta);
      const toolAudit = extractPiToolAudit(event);
      if (toolAudit) mergePiToolAudit(toolCalls, toolAudit);
    });
    const sessionActiveTools = session.getActiveToolNames?.() ?? appToolNames;

    try {
      await withTimeout(
        (async () => {
          await session.prompt(buildPiFetchOnchainDataPrompt(input), {
            expandPromptTemplates: false,
            source: "api"
          });
          await session.agent?.waitForIdle?.();
        })(),
        piFetchOnchainDataTimeoutMs(env),
        "Pi SDK fetch_research_onchain_data timed out."
      );
    } finally {
      unsubscribe();
      session.dispose();
    }

    if (!toolResult) {
      const fallback = await safeFetchResearchOnchainData(input);
      return {
        ...fallback,
        provider: "pi",
        model: `${provider}/${modelId}`,
        activeTools: sessionActiveTools,
        toolCalls,
        fallbackUsed: true,
        degradedReason: appendDegradedReason(
          fallback.degradedReason,
          modelFallbackMessage
            ? `Pi did not call fetch_research_onchain_data; deterministic fallback was used. ${modelFallbackMessage}`
            : "Pi did not call fetch_research_onchain_data; deterministic fallback was used."
        )
      };
    }

    return {
      ...toolResult,
      provider: "pi",
      model: `${provider}/${modelId}`,
      activeTools: sessionActiveTools,
      toolCalls,
      fallbackUsed: false
    };
  } catch (error) {
    const fallback = await safeFetchResearchOnchainData(input);
    return {
      ...fallback,
      provider: "pi",
      model: `${provider}/${modelId}`,
      activeTools,
      fallbackUsed: true,
      degradedReason: appendDegradedReason(
        fallback.degradedReason,
        error instanceof Error
          ? `Pi fetch_research_onchain_data failed: ${error.message}; deterministic fallback was used.`
          : "Pi fetch_research_onchain_data failed; deterministic fallback was used."
      )
    };
  }
}

export async function searchResearchKnowledgeWithAgent(
  input: AgentSearchKnowledgeInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<AgentSearchKnowledgeResult> {
  const provider = piModelProvider(env);
  const modelId = piModelId(env);
  const activeTools = ["search_research_knowledge"];

  if (agentRuntimeProvider(env) !== "pi") {
    const fallback = await safeSearchResearchKnowledge(input);
    return {
      ...fallback,
      provider: "pi",
      model: `${provider}/${modelId}`,
      activeTools,
      fallbackUsed: true,
      degradedReason: appendDegradedReason(
        fallback.degradedReason,
        "Research knowledge search app tool requires AGENT_RUNTIME_PROVIDER=pi; deterministic fallback was used."
      )
    };
  }

  if (!piHasApiKey(provider, env)) {
    const fallback = await safeSearchResearchKnowledge(input);
    return {
      ...fallback,
      provider: "pi",
      model: `${provider}/${modelId}`,
      activeTools,
      fallbackUsed: true,
      degradedReason: appendDegradedReason(
        fallback.degradedReason,
        provider === "siliconflow"
          ? "AGENT_RUNTIME_PROVIDER=pi requires SILICONFLOW_API_KEY or PI_API_KEY for search_research_knowledge; deterministic fallback was used."
          : "AGENT_RUNTIME_PROVIDER=pi requires PI_API_KEY or the selected provider key for search_research_knowledge; deterministic fallback was used."
      )
    };
  }

  try {
    const { pi, authStorage, modelRegistry, model } = await createPiModelContext(env, provider, modelId);
    if (!model) {
      const fallback = await safeSearchResearchKnowledge(input);
      return {
        ...fallback,
        provider: "pi",
        model: `${provider}/${modelId}`,
        activeTools,
        fallbackUsed: true,
        degradedReason: appendDegradedReason(
          fallback.degradedReason,
          `Pi model ${provider}/${modelId} was not found for search_research_knowledge; deterministic fallback was used.`
        )
      };
    }

    const chunks: string[] = [];
    const toolCalls: AgentRuntimeToolCallAudit[] = [];
    let toolResult: { cases: SimilarCase[]; degradedReason?: string } | undefined;
    const customTools = createPiSearchKnowledgeTools(input, (result) => {
      toolResult = result;
    });
    const appToolNames = customTools.map((tool) => tool.name);
    const { session, modelFallbackMessage } = await pi.createAgentSession({
      cwd: env.PI_WORKING_DIR || process.cwd(),
      authStorage,
      modelRegistry,
      model,
      thinkingLevel: parsePiThinkingLevel(env.PI_THINKING_LEVEL),
      noTools: "builtin",
      tools: appToolNames,
      excludeTools: ["read", "bash", "edit", "write", "grep", "find", "ls"],
      customTools,
      sessionManager: pi.SessionManager.inMemory(env.PI_WORKING_DIR || process.cwd())
    });

    const unsubscribe = session.subscribe((event) => {
      const delta = extractPiTextDelta(event);
      if (delta) chunks.push(delta);
      const toolAudit = extractPiToolAudit(event);
      if (toolAudit) mergePiToolAudit(toolCalls, toolAudit);
    });
    const sessionActiveTools = session.getActiveToolNames?.() ?? appToolNames;

    try {
      await withTimeout(
        (async () => {
          await session.prompt(buildPiSearchKnowledgePrompt(input), {
            expandPromptTemplates: false,
            source: "api"
          });
          await session.agent?.waitForIdle?.();
        })(),
        piSearchKnowledgeTimeoutMs(env),
        "Pi SDK search_research_knowledge timed out."
      );
    } finally {
      unsubscribe();
      session.dispose();
    }

    if (!toolResult) {
      const fallback = await safeSearchResearchKnowledge(input);
      return {
        ...fallback,
        provider: "pi",
        model: `${provider}/${modelId}`,
        activeTools: sessionActiveTools,
        toolCalls,
        fallbackUsed: true,
        degradedReason: appendDegradedReason(
          fallback.degradedReason,
          modelFallbackMessage
            ? `Pi did not call search_research_knowledge; deterministic fallback was used. ${modelFallbackMessage}`
            : "Pi did not call search_research_knowledge; deterministic fallback was used."
        )
      };
    }

    return {
      cases: toolResult.cases,
      provider: "pi",
      model: `${provider}/${modelId}`,
      degradedReason: toolResult.degradedReason,
      activeTools: sessionActiveTools,
      toolCalls,
      fallbackUsed: false
    };
  } catch (error) {
    const fallback = await safeSearchResearchKnowledge(input);
    return {
      ...fallback,
      provider: "pi",
      model: `${provider}/${modelId}`,
      activeTools,
      fallbackUsed: true,
      degradedReason: appendDegradedReason(
        fallback.degradedReason,
        error instanceof Error
          ? `Pi search_research_knowledge failed: ${error.message}; deterministic fallback was used.`
          : "Pi search_research_knowledge failed; deterministic fallback was used."
      )
    };
  }
}

export async function analyzeResearchRiskWithAgent(
  input: AgentAnalyzeRiskInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<AgentAnalyzeRiskResult> {
  const provider = piModelProvider(env);
  const modelId = piModelId(env);
  const activeTools = ["analyze_research_risk"];

  if (agentRuntimeProvider(env) !== "pi") {
    return {
      risk: safeAnalyzeResearchRisk(input),
      provider: "pi",
      model: `${provider}/${modelId}`,
      activeTools,
      fallbackUsed: true,
      degradedReason: "Research risk analysis app tool requires AGENT_RUNTIME_PROVIDER=pi; deterministic fallback was used."
    };
  }

  if (!piHasApiKey(provider, env)) {
    return {
      risk: safeAnalyzeResearchRisk(input),
      provider: "pi",
      model: `${provider}/${modelId}`,
      activeTools,
      fallbackUsed: true,
      degradedReason:
        provider === "siliconflow"
          ? "AGENT_RUNTIME_PROVIDER=pi requires SILICONFLOW_API_KEY or PI_API_KEY for analyze_research_risk; deterministic fallback was used."
          : "AGENT_RUNTIME_PROVIDER=pi requires PI_API_KEY or the selected provider key for analyze_research_risk; deterministic fallback was used."
    };
  }

  try {
    const { pi, authStorage, modelRegistry, model } = await createPiModelContext(env, provider, modelId);
    if (!model) {
      return {
        risk: safeAnalyzeResearchRisk(input),
        provider: "pi",
        model: `${provider}/${modelId}`,
        activeTools,
        fallbackUsed: true,
        degradedReason: `Pi model ${provider}/${modelId} was not found for analyze_research_risk; deterministic fallback was used.`
      };
    }

    const chunks: string[] = [];
    const toolCalls: AgentRuntimeToolCallAudit[] = [];
    let toolRisk: RiskAssessment | undefined;
    const customTools = createPiAnalyzeRiskTools(input, (risk) => {
      toolRisk = risk;
    });
    const appToolNames = customTools.map((tool) => tool.name);
    const { session, modelFallbackMessage } = await pi.createAgentSession({
      cwd: env.PI_WORKING_DIR || process.cwd(),
      authStorage,
      modelRegistry,
      model,
      thinkingLevel: parsePiThinkingLevel(env.PI_THINKING_LEVEL),
      noTools: "builtin",
      tools: appToolNames,
      excludeTools: ["read", "bash", "edit", "write", "grep", "find", "ls"],
      customTools,
      sessionManager: pi.SessionManager.inMemory(env.PI_WORKING_DIR || process.cwd())
    });

    const unsubscribe = session.subscribe((event) => {
      const delta = extractPiTextDelta(event);
      if (delta) chunks.push(delta);
      const toolAudit = extractPiToolAudit(event);
      if (toolAudit) mergePiToolAudit(toolCalls, toolAudit);
    });
    const sessionActiveTools = session.getActiveToolNames?.() ?? appToolNames;

    try {
      await withTimeout(
        (async () => {
          await session.prompt(buildPiAnalyzeRiskPrompt(input), {
            expandPromptTemplates: false,
            source: "api"
          });
          await session.agent?.waitForIdle?.();
        })(),
        piAnalyzeRiskTimeoutMs(env),
        "Pi SDK analyze_research_risk timed out."
      );
    } finally {
      unsubscribe();
      session.dispose();
    }

    if (!toolRisk) {
      return {
        risk: safeAnalyzeResearchRisk(input),
        provider: "pi",
        model: `${provider}/${modelId}`,
        activeTools: sessionActiveTools,
        toolCalls,
        fallbackUsed: true,
        degradedReason: modelFallbackMessage
          ? `Pi did not call analyze_research_risk; deterministic fallback was used. ${modelFallbackMessage}`
          : "Pi did not call analyze_research_risk; deterministic fallback was used."
      };
    }

    return {
      risk: toolRisk,
      provider: "pi",
      model: `${provider}/${modelId}`,
      activeTools: sessionActiveTools,
      toolCalls,
      fallbackUsed: false
    };
  } catch (error) {
    return {
      risk: safeAnalyzeResearchRisk(input),
      provider: "pi",
      model: `${provider}/${modelId}`,
      activeTools,
      fallbackUsed: true,
      degradedReason:
        error instanceof Error
          ? `Pi analyze_research_risk failed: ${error.message}; deterministic fallback was used.`
          : "Pi analyze_research_risk failed; deterministic fallback was used."
    };
  }
}

export async function indexResearchKnowledgeWithAgent(
  input: AgentIndexKnowledgeInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<AgentIndexKnowledgeResult> {
  const provider = piModelProvider(env);
  const modelId = piModelId(env);
  const activeTools = ["index_research_knowledge"];

  if (agentRuntimeProvider(env) !== "pi") {
    const fallback = await safeIndexResearchKnowledge(input);
    return {
      ...fallback,
      provider: "pi",
      model: `${provider}/${modelId}`,
      activeTools,
      fallbackUsed: true,
      degradedReason: appendDegradedReason(
        fallback.degradedReason,
        "Research knowledge indexing app tool requires AGENT_RUNTIME_PROVIDER=pi; deterministic fallback was used."
      )
    };
  }

  if (!piHasApiKey(provider, env)) {
    const fallback = await safeIndexResearchKnowledge(input);
    return {
      ...fallback,
      provider: "pi",
      model: `${provider}/${modelId}`,
      activeTools,
      fallbackUsed: true,
      degradedReason: appendDegradedReason(
        fallback.degradedReason,
        provider === "siliconflow"
          ? "AGENT_RUNTIME_PROVIDER=pi requires SILICONFLOW_API_KEY or PI_API_KEY for index_research_knowledge; deterministic fallback was used."
          : "AGENT_RUNTIME_PROVIDER=pi requires PI_API_KEY or the selected provider key for index_research_knowledge; deterministic fallback was used."
      )
    };
  }

  try {
    const { pi, authStorage, modelRegistry, model } = await createPiModelContext(env, provider, modelId);
    if (!model) {
      const fallback = await safeIndexResearchKnowledge(input);
      return {
        ...fallback,
        provider: "pi",
        model: `${provider}/${modelId}`,
        activeTools,
        fallbackUsed: true,
        degradedReason: appendDegradedReason(
          fallback.degradedReason,
          `Pi model ${provider}/${modelId} was not found for index_research_knowledge; deterministic fallback was used.`
        )
      };
    }

    const chunks: string[] = [];
    const toolCalls: AgentRuntimeToolCallAudit[] = [];
    let toolResult: { indexed: boolean; degradedReason?: string } | undefined;
    const customTools = createPiIndexKnowledgeTools(input, (result) => {
      toolResult = result;
    });
    const appToolNames = customTools.map((tool) => tool.name);
    const { session, modelFallbackMessage } = await pi.createAgentSession({
      cwd: env.PI_WORKING_DIR || process.cwd(),
      authStorage,
      modelRegistry,
      model,
      thinkingLevel: parsePiThinkingLevel(env.PI_THINKING_LEVEL),
      noTools: "builtin",
      tools: appToolNames,
      excludeTools: ["read", "bash", "edit", "write", "grep", "find", "ls"],
      customTools,
      sessionManager: pi.SessionManager.inMemory(env.PI_WORKING_DIR || process.cwd())
    });

    const unsubscribe = session.subscribe((event) => {
      const delta = extractPiTextDelta(event);
      if (delta) chunks.push(delta);
      const toolAudit = extractPiToolAudit(event);
      if (toolAudit) mergePiToolAudit(toolCalls, toolAudit);
    });
    const sessionActiveTools = session.getActiveToolNames?.() ?? appToolNames;

    try {
      await withTimeout(
        (async () => {
          await session.prompt(buildPiIndexKnowledgePrompt(input), {
            expandPromptTemplates: false,
            source: "api"
          });
          await session.agent?.waitForIdle?.();
        })(),
        piIndexKnowledgeTimeoutMs(env),
        "Pi SDK index_research_knowledge timed out."
      );
    } finally {
      unsubscribe();
      session.dispose();
    }

    if (!toolResult) {
      const fallback = await safeIndexResearchKnowledge(input);
      return {
        ...fallback,
        provider: "pi",
        model: `${provider}/${modelId}`,
        activeTools: sessionActiveTools,
        toolCalls,
        fallbackUsed: true,
        degradedReason: appendDegradedReason(
          fallback.degradedReason,
          modelFallbackMessage
            ? `Pi did not call index_research_knowledge; deterministic fallback was used. ${modelFallbackMessage}`
            : "Pi did not call index_research_knowledge; deterministic fallback was used."
        )
      };
    }

    return {
      ...toolResult,
      provider: "pi",
      model: `${provider}/${modelId}`,
      activeTools: sessionActiveTools,
      toolCalls,
      fallbackUsed: false
    };
  } catch (error) {
    const fallback = await safeIndexResearchKnowledge(input);
    return {
      ...fallback,
      provider: "pi",
      model: `${provider}/${modelId}`,
      activeTools,
      fallbackUsed: true,
      degradedReason: appendDegradedReason(
        fallback.degradedReason,
        error instanceof Error
          ? `Pi index_research_knowledge failed: ${error.message}; deterministic fallback was used.`
          : "Pi index_research_knowledge failed; deterministic fallback was used."
      )
    };
  }
}

async function draftResearchReportWithPi(
  input: AgentReportDraftInput,
  env: NodeJS.ProcessEnv
): Promise<AgentReportDraftResult> {
  const provider = piModelProvider(env);
  const modelId = piModelId(env);
  const declaredTools = ["write_research_report", "inspect_research_context", "inspect_deterministic_report"];
  if (!piHasApiKey(provider, env)) {
    return {
      provider: "pi",
      model: `${provider}/${modelId}`,
      activeTools: declaredTools,
      fallbackUsed: true,
      degradedReason:
        provider === "siliconflow"
          ? "AGENT_RUNTIME_PROVIDER=pi requires SILICONFLOW_API_KEY or PI_API_KEY for the built-in SiliconFlow Pi provider."
          : "AGENT_RUNTIME_PROVIDER=pi requires PI_API_KEY or the selected provider's standard environment API key."
    };
  }

  try {
    const { pi, authStorage, modelRegistry, model } = await createPiModelContext(env, provider, modelId);
    if (!model) {
      return {
        provider: "pi",
        model: `${provider}/${modelId}`,
        activeTools: declaredTools,
        fallbackUsed: true,
        degradedReason: `Pi model ${provider}/${modelId} was not found in the Pi model registry.`
      };
    }

    const chunks: string[] = [];
    const toolCalls: AgentRuntimeToolCallAudit[] = [];
    let writeToolCalled = false;
    const customTools = createPiResearchTools(input, () => {
      writeToolCalled = true;
    });
    const appToolNames = customTools.map((tool) => tool.name);
    const { session, modelFallbackMessage } = await pi.createAgentSession({
      cwd: env.PI_WORKING_DIR || process.cwd(),
      authStorage,
      modelRegistry,
      model,
      thinkingLevel: parsePiThinkingLevel(env.PI_THINKING_LEVEL),
      noTools: "builtin",
      tools: appToolNames,
      excludeTools: ["read", "bash", "edit", "write", "grep", "find", "ls"],
      customTools,
      sessionManager: pi.SessionManager.inMemory(env.PI_WORKING_DIR || process.cwd())
    });

    const unsubscribe = session.subscribe((event) => {
      const delta = extractPiTextDelta(event);
      if (delta) chunks.push(delta);
      const toolAudit = extractPiToolAudit(event);
      if (toolAudit) mergePiToolAudit(toolCalls, toolAudit);
    });
    const sessionActiveTools = session.getActiveToolNames?.() ?? appToolNames;

    try {
      await withTimeout(
        (async () => {
          await session.prompt(buildPiReportPrompt(input), {
            expandPromptTemplates: false,
            source: "api"
          });
          await session.agent?.waitForIdle?.();
        })(),
        piRequestTimeoutMs(env),
        "Pi SDK report draft timed out."
      );
    } finally {
      unsubscribe();
      session.dispose();
    }

    const content = chunks.join("").trim();
    if (!content) {
      return {
        provider: "pi",
        model: `${provider}/${modelId}`,
        activeTools: sessionActiveTools,
        toolCalls,
        fallbackUsed: !writeToolCalled,
        degradedReason: modelFallbackMessage
          ? `Pi SDK returned no assistant text. ${modelFallbackMessage}`
          : "Pi SDK returned no assistant text."
      };
    }

    return {
      markdown: content,
      summary: input.baseSummary,
      recommendation: input.recommendation,
      confidence: input.confidence,
      provider: "pi",
      model: `${provider}/${modelId}`,
      activeTools: sessionActiveTools,
      toolCalls,
      fallbackUsed: !writeToolCalled
    };
  } catch (error) {
    return {
      provider: "pi",
      model: provider && modelId ? `${provider}/${modelId}` : undefined,
      activeTools: declaredTools,
      fallbackUsed: true,
      degradedReason: error instanceof Error ? error.message : "Pi SDK report draft failed."
    };
  }
}

async function getPiRuntimeStatus(env: NodeJS.ProcessEnv): Promise<AgentRuntimeStatus> {
  const provider = piModelProvider(env);
  const modelId = piModelId(env);
  const hasConfig = piHasApiKey(provider, env);

  try {
    const pi = await loadPiSdk();
    const authStorage = pi.AuthStorage.inMemory();
    const apiKey = piApiKey(provider, env);
    if (apiKey) authStorage.setRuntimeApiKey(provider, apiKey);
    const modelRegistry = pi.ModelRegistry.inMemory(authStorage);
    registerSiliconFlowPiProvider(modelRegistry, env);
    const selectedModel = modelRegistry.find(provider, modelId);
    const availableModelCount = modelRegistry.getAvailable().length;

    if (!hasConfig) {
      return {
        provider: "pi",
        configured: false,
        reachable: false,
        sdkLoaded: true,
        selectedModelAvailable: Boolean(selectedModel),
        availableModelCount,
        degradedReason:
          provider === "siliconflow"
            ? "AGENT_RUNTIME_PROVIDER=pi defaults to siliconflow/deepseek-ai/DeepSeek-V4-Flash and requires SILICONFLOW_API_KEY or PI_API_KEY."
            : "AGENT_RUNTIME_PROVIDER=pi requires PI_API_KEY or the selected provider's standard environment API key."
      };
    }

    if (!selectedModel) {
      return {
        provider: "pi",
        configured: true,
        reachable: false,
        sdkLoaded: true,
        selectedModelAvailable: false,
        availableModelCount,
        degradedReason: `Pi SDK loaded, but model ${provider}/${modelId} was not found in the Pi model registry.`
      };
    }

    return {
      provider: "pi",
      configured: true,
      reachable: true,
      sdkLoaded: true,
      selectedModelAvailable: true,
      availableModelCount,
      degradedReason:
        "Pi SDK runtime is selected and locally ready. Provider status does not perform a live model call; run the Pi runtime smoke with real credentials to verify drafting."
    };
  } catch (error) {
    return {
      provider: "pi",
      configured: hasConfig,
      reachable: false,
      sdkLoaded: false,
      degradedReason: error instanceof Error ? `Pi SDK could not be loaded: ${error.message}` : "Pi SDK could not be loaded."
    };
  }
}

async function createPiModelContext(env: NodeJS.ProcessEnv, provider: string, modelId: string) {
  const pi = await loadPiSdk();
  const authStorage = pi.AuthStorage.inMemory();
  const apiKey = piApiKey(provider, env);
  if (apiKey) authStorage.setRuntimeApiKey(provider, apiKey);
  const modelRegistry = pi.ModelRegistry.inMemory(authStorage);
  registerSiliconFlowPiProvider(modelRegistry, env);
  const model = modelRegistry.find(provider, modelId);
  return { pi, authStorage, modelRegistry, model };
}

async function loadPiSdk(): Promise<PiSdkModule> {
  return (await import("@earendil-works/pi-coding-agent")) as PiSdkModule;
}

function requestTimeoutMs(env: NodeJS.ProcessEnv): number {
  const value = Number(env.AGENT_RUNTIME_TIMEOUT_MS ?? env.DATA_CONNECTOR_TIMEOUT_MS ?? 20000);
  return Number.isFinite(value) && value > 0 ? value : 20000;
}

function piRequestTimeoutMs(env: NodeJS.ProcessEnv): number {
  const value = Number(env.PI_AGENT_RUNTIME_TIMEOUT_MS);
  if (Number.isFinite(value) && value > 0) return value;
  return Math.max(requestTimeoutMs(env), 120000);
}

function piResolveAssetTimeoutMs(env: NodeJS.ProcessEnv): number {
  const value = Number(env.PI_RESOLVE_ASSET_TIMEOUT_MS);
  const resolveTimeout = Number.isFinite(value) && value > 0 ? value : 60000;
  return Math.min(piRequestTimeoutMs(env), resolveTimeout);
}

function piCollectSourcesTimeoutMs(env: NodeJS.ProcessEnv): number {
  const value = Number(env.PI_COLLECT_SOURCES_TIMEOUT_MS);
  const collectTimeout = Number.isFinite(value) && value > 0 ? value : 90000;
  return Math.min(piRequestTimeoutMs(env), collectTimeout);
}

function piFetchMarketDataTimeoutMs(env: NodeJS.ProcessEnv): number {
  const value = Number(env.PI_FETCH_MARKET_DATA_TIMEOUT_MS);
  const marketTimeout = Number.isFinite(value) && value > 0 ? value : 90000;
  return Math.min(piRequestTimeoutMs(env), marketTimeout);
}

function piFetchOnchainDataTimeoutMs(env: NodeJS.ProcessEnv): number {
  const value = Number(env.PI_FETCH_ONCHAIN_DATA_TIMEOUT_MS);
  const onchainTimeout = Number.isFinite(value) && value > 0 ? value : 120000;
  return Math.min(piRequestTimeoutMs(env), onchainTimeout);
}

function piSearchKnowledgeTimeoutMs(env: NodeJS.ProcessEnv): number {
  const value = Number(env.PI_SEARCH_KNOWLEDGE_TIMEOUT_MS);
  const searchTimeout = Number.isFinite(value) && value > 0 ? value : 90000;
  return Math.min(piRequestTimeoutMs(env), searchTimeout);
}

function piAnalyzeRiskTimeoutMs(env: NodeJS.ProcessEnv): number {
  const value = Number(env.PI_ANALYZE_RISK_TIMEOUT_MS);
  const analyzeTimeout = Number.isFinite(value) && value > 0 ? value : 60000;
  return Math.min(piRequestTimeoutMs(env), analyzeTimeout);
}

function piIndexKnowledgeTimeoutMs(env: NodeJS.ProcessEnv): number {
  const value = Number(env.PI_INDEX_KNOWLEDGE_TIMEOUT_MS);
  const indexTimeout = Number.isFinite(value) && value > 0 ? value : 90000;
  return Math.min(piRequestTimeoutMs(env), indexTimeout);
}

function normalizeDraft(content: string, model: string, provider: "siliconflow" | "pi" = "siliconflow"): AgentReportDraftResult {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const markdown =
      typeof parsed.markdown === "string"
        ? parsed.markdown.trim()
        : Array.isArray(parsed.markdownLines)
          ? parsed.markdownLines.filter((line): line is string => typeof line === "string").join("\n").trim()
          : "";
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    const recommendation = parseRecommendation(parsed.recommendation);
    const confidence = typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence) ? Math.max(0, Math.min(100, parsed.confidence)) : undefined;

    if (!markdown || !summary || !recommendation || confidence === undefined) {
      return {
        provider,
        model,
        degradedReason: `${provider === "pi" ? "Pi SDK" : "SiliconFlow"} report draft did not match the expected JSON contract.`
      };
    }

    return {
      provider,
      model,
      markdown,
      summary,
      recommendation,
      confidence
    };
  } catch (error) {
    return {
      provider,
      model,
      degradedReason: error instanceof Error ? error.message : `${provider === "pi" ? "Pi SDK" : "SiliconFlow"} report draft JSON parse failed.`
    };
  }
}

function parseRecommendation(value: unknown): AgentReportDraftResult["recommendation"] {
  return value === "Buy" || value === "Watch" || value === "Avoid" || value === "Reduce" ? value : undefined;
}

function normalizeResearchInputType(value: unknown): ResearchInputType {
  return value === "auto" ||
    value === "evm_address" ||
    value === "solana_mint" ||
    value === "symbol" ||
    value === "project_name" ||
    value === "url"
    ? value
    : "auto";
}

function agentRuntimeProvider(env: NodeJS.ProcessEnv): "siliconflow" | "pi" {
  return env.AGENT_RUNTIME_PROVIDER?.toLowerCase() === "siliconflow" ? "siliconflow" : "pi";
}

function piModelProvider(env: NodeJS.ProcessEnv): string {
  return env.PI_MODEL_PROVIDER || "siliconflow";
}

function piModelId(env: NodeJS.ProcessEnv): string {
  return env.PI_MODEL_ID || env.PI_SILICONFLOW_MODEL || "deepseek-ai/DeepSeek-V4-Flash";
}

function piApiKey(provider: string, env: NodeJS.ProcessEnv): string | undefined {
  if (env.PI_API_KEY) return env.PI_API_KEY;
  if (provider.toLowerCase() === "siliconflow") return env.SILICONFLOW_API_KEY;
  return knownPiProviderEnvKey(provider, env);
}

function piHasApiKey(provider: string, env: NodeJS.ProcessEnv): boolean {
  return Boolean(piApiKey(provider, env));
}

function registerSiliconFlowPiProvider(modelRegistry: PiSdkModule["ModelRegistry"]["inMemory"] extends (authStorage: unknown) => infer R ? R : never, env: NodeJS.ProcessEnv): void {
  modelRegistry.registerProvider("siliconflow", {
    name: "SiliconFlow",
    baseUrl: env.SILICONFLOW_BASE_URL ?? "https://api.siliconflow.cn/v1",
    apiKey: "$SILICONFLOW_API_KEY",
    api: "openai-completions",
    authHeader: true,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens"
    },
    models: [
      {
        id: "deepseek-ai/DeepSeek-V4-Flash",
        name: "DeepSeek V4 Flash (SiliconFlow)",
        reasoning: false,
        input: ["text"],
        contextWindow: 64000,
        maxTokens: 2048,
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0
        }
      }
    ]
  });
}

function knownPiProviderEnvKey(provider: string, env: NodeJS.ProcessEnv): string | undefined {
  const normalized = provider.toLowerCase();
  if (normalized === "openai") return env.OPENAI_API_KEY;
  if (normalized === "anthropic") return env.ANTHROPIC_API_KEY;
  if (normalized === "google") return env.GOOGLE_API_KEY || env.GEMINI_API_KEY;
  if (normalized === "mistral") return env.MISTRAL_API_KEY;
  return undefined;
}

function hasKnownPiProviderEnvKey(provider: string, env: NodeJS.ProcessEnv): boolean {
  return Boolean(knownPiProviderEnvKey(provider, env));
}

function parsePiThinkingLevel(value: string | undefined): "off" | "minimal" | "low" | "medium" | "high" | "xhigh" {
  if (value === "off" || value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh") {
    return value;
  }
  return "off";
}

function buildPiReportPrompt(input: AgentReportDraftInput): string {
  const instruction = input.requireWriteReportTool
    ? "You are the Pi Agent runtime for a local-first personal agent with a Web3 research extension. You must call the write_research_report app tool exactly once before writing the final body. The deterministic report and API-collected context are the source of truth. Rewrite the supplied Markdown into a concise Chinese Web3 research report body. Use only supplied data and tool outputs. Do not invent market, chain, social, holder, or source data. Preserve material source URLs, degraded reasons, recommendation constraints, and risk caveats. Keep the rewritten body under 40 Markdown lines. Use only these sections: # title, ## 一句话结论, ## 关键证据, ## 主要风险, ## 后续验证. Return only the final Markdown report body. Do not return JSON. Do not wrap the answer in a Markdown code fence."
    : "You are the Pi Agent runtime for a local-first personal agent with a Web3 research extension. The supplied deterministic report and API-collected context are already sufficient for this turn, so do not call tools unless a critical field is missing from the prompt. Rewrite the supplied Markdown into a concise Chinese Web3 research report body. Use only supplied data and tool outputs. Do not invent market, chain, social, holder, or source data. Preserve material source URLs, degraded reasons, recommendation constraints, and risk caveats. Keep the rewritten body under 40 Markdown lines. Use only these sections: # title, ## 一句话结论, ## 关键证据, ## 主要风险, ## 后续验证. Return only the final Markdown report body. Do not return JSON. Do not wrap the answer in a Markdown code fence.";
  return JSON.stringify({
    instruction,
    availableAppTools: [
      "write_research_report: read the deterministic report generated by the app pipeline and mark this write_report node as app-tool coordinated.",
      "inspect_research_context: read the typed research snapshot collected by the API task graph.",
      "inspect_deterministic_report: read the deterministic Markdown report that must remain the audit source of truth."
    ],
    outputContract:
      "Return concise Markdown only. The API will append the complete deterministic source/degraded-reason audit after your body and will keep the deterministic summary, recommendation, and confidence as authoritative structured fields.",
    baseReport: {
      markdown: input.baseReportMarkdown.slice(0, 6000),
      summary: input.baseSummary,
      recommendation: input.recommendation,
      confidence: input.confidence
    },
    researchContextAvailable: Boolean(input.researchContext)
  });
}

const inspectExtensionRegistryParams = Type.Object({
  maxChars: Type.Optional(Type.Number({ description: "Maximum registry characters to return. Default 12000." }))
});

const resolveResearchAssetParams = Type.Object({
  input: Type.String({ description: "Original token, project, address, mint, symbol, or URL input." }),
  inputType: Type.String({ description: "Input type: auto, evm_address, solana_mint, symbol, project_name, or url." })
});

const collectResearchSourcesParams = Type.Object({
  maxSources: Type.Optional(Type.Number({ description: "Maximum source candidates to return. Default 8." }))
});

const fetchResearchMarketDataParams = Type.Object({
  includeTokenMarket: Type.Optional(Type.Boolean({ description: "Fetch token market data through the configured app adapter. Default true." })),
  includeDefiProtocol: Type.Optional(Type.Boolean({ description: "Fetch protocol TVL metrics through the configured app adapter. Default true." }))
});

const fetchResearchOnchainDataParams = Type.Object({
  includeErc20Metadata: Type.Optional(Type.Boolean({ description: "Read ERC-20 metadata through the configured RPC adapter. Default true." })),
  includeContractRisk: Type.Optional(Type.Boolean({ description: "Run contract-risk inspection through the app adapter. Default true." })),
  includeDexLiquidity: Type.Optional(Type.Boolean({ description: "Fetch DEX liquidity through the app adapter. Default true." })),
  includeHolderConcentration: Type.Optional(Type.Boolean({ description: "Fetch holder concentration through the app adapter. Default true." })),
  includeArkhamIntel: Type.Optional(Type.Boolean({ description: "Fetch Arkham-compatible address intelligence through the app adapter. Default true." }))
});

const searchResearchKnowledgeParams = Type.Object({
  maxCases: Type.Optional(Type.Number({ description: "Maximum similar local reports to return. Default 5." }))
});

const analyzeResearchRiskParams = Type.Object({
  includeDetail: Type.Optional(Type.Boolean({ description: "Return complete deterministic risk detail. Default true." }))
});

const invokeExtensionCapabilityParams = Type.Object({
  extensionId: Type.String({ description: "Registered extension id, such as local.knowledge or local.reports." }),
  capabilityId: Type.String({ description: "Registered capability id, such as knowledge.search or reports.read." }),
  inputJson: Type.Optional(Type.String({ description: "Optional JSON object string passed as the extension input." }))
});

function createPiResolveAssetTools(input: AgentResolveAssetInput, onResolved: (asset: ResolvedAsset) => void): ToolDefinition[] {
  return [
    {
      name: "resolve_research_asset",
      label: "Resolve research asset",
      description:
        "Resolve the user's token/project input using the app's typed deterministic resolver. This tool is read-only and does not fetch external provider data.",
      promptSnippet: "Resolve a token, project, address, mint, symbol, or URL through the app resolver",
      promptGuidelines: [
        "Call this tool exactly once before answering the research-session preflight.",
        "Use the original input and inputType supplied in the prompt.",
        "Do not invent chain, market, social, holder, or source data beyond the tool result."
      ],
      parameters: resolveResearchAssetParams,
      async execute(_toolCallId, params) {
        const toolParams = params as { input?: string; inputType?: ResearchInputType };
        const asset = input.resolveAsset(toolParams.input ?? input.input, normalizeResearchInputType(toolParams.inputType ?? input.inputType));
        onResolved(asset);
        return {
          content: [
            {
              type: "text",
              text: truncateJson(
                {
                  ok: true,
                  asset,
                  degradedReason: asset.degradedReason
                },
                8000
              )
            }
          ],
          details: {
            input: asset.input,
            inputType: asset.inputType,
            confidence: asset.confidence
          }
        };
      }
    }
  ];
}

function buildPiResolveAssetPrompt(input: AgentResolveAssetInput): string {
  return JSON.stringify({
    instruction:
      "You are the Pi coordinator for a local research session. You must call the resolve_research_asset app tool exactly once using the supplied input and inputType, then return one short Chinese sentence confirming the resolved asset state. Do not fetch external data. Do not invent missing fields.",
    node: "resolve_asset",
    input: {
      input: input.input,
      inputType: input.inputType
    },
    availableAppTools: ["resolve_research_asset: read-only deterministic app resolver for asset preflight"],
    outputContract: "After the tool call, return one short Chinese sentence. The API will use the tool result as the node payload."
  });
}

function createPiCollectSourcesTools(
  input: AgentCollectSourcesInput,
  onCollected: (result: { sources: SourceCandidate[]; degradedReason?: string }) => void
): ToolDefinition[] {
  return [
    {
      name: "collect_research_sources",
      label: "Collect research sources",
      description:
        "Collect auditable source candidates for the resolved asset through the app's typed source collector. This tool is read-only and returns degraded reasons instead of inventing evidence.",
      promptSnippet: "Collect source candidates for the resolved research asset",
      promptGuidelines: [
        "Call this tool exactly once before answering the source-collection step.",
        "Use only the resolved asset supplied in the prompt.",
        "Do not invent source URLs, snippets, social data, market data, or citations beyond the tool result."
      ],
      parameters: collectResearchSourcesParams,
      async execute(_toolCallId, params) {
        const toolParams = params as { maxSources?: number };
        const maxSources =
          Number.isFinite(toolParams.maxSources) && toolParams.maxSources && toolParams.maxSources > 0
            ? Math.min(Math.floor(toolParams.maxSources), 20)
            : 8;
        const result = await safeCollectResearchSources(input);
        const limited = {
          sources: result.sources.slice(0, maxSources),
          degradedReason: result.degradedReason
        };
        onCollected(limited);
        return {
          content: [
            {
              type: "text",
              text: truncateJson(
                {
                  ok: true,
                  sourceCount: limited.sources.length,
                  sources: limited.sources,
                  degradedReason: limited.degradedReason
                },
                12000
              )
            }
          ],
          details: {
            sourceCount: limited.sources.length,
            degraded: Boolean(limited.degradedReason)
          }
        };
      }
    }
  ];
}

function buildPiCollectSourcesPrompt(input: AgentCollectSourcesInput): string {
  return JSON.stringify({
    instruction:
      "You are the Pi coordinator for a local research session. You must call the collect_research_sources app tool exactly once for the supplied resolved asset, then return one short Chinese sentence summarizing whether source collection completed or degraded. Do not fetch external data yourself. Do not invent citations.",
    node: "collect_sources",
    asset: input.asset,
    availableAppTools: ["collect_research_sources: read-only app source collector returning auditable source candidates"],
    outputContract: "After the tool call, return one short Chinese sentence. The API will use the tool result as the node payload."
  });
}

function createPiFetchMarketDataTools(
  input: AgentFetchMarketDataInput,
  onFetched: (result: { marketData: MarketData[]; degradedReason?: string }) => void
): ToolDefinition[] {
  return [
    {
      name: "fetch_research_market_data",
      label: "Fetch research market data",
      description:
        "Fetch token market and protocol metrics through the app's typed market adapters. This tool is read-only/provider-backed and returns degraded reasons instead of inventing market data.",
      promptSnippet: "Fetch market data for the resolved research asset",
      promptGuidelines: [
        "Call this tool exactly once before answering the market-data step.",
        "Use only the resolved asset supplied in the prompt.",
        "Do not invent prices, market caps, TVL, volume, liquidity, tickers, or source URLs beyond the tool result."
      ],
      parameters: fetchResearchMarketDataParams,
      async execute(_toolCallId, params) {
        const toolParams = params as { includeTokenMarket?: boolean; includeDefiProtocol?: boolean };
        const result = await safeFetchResearchMarketData(input, {
          includeTokenMarket: toolParams.includeTokenMarket !== false,
          includeDefiProtocol: toolParams.includeDefiProtocol !== false
        });
        onFetched(result);
        return {
          content: [
            {
              type: "text",
              text: truncateJson(
                {
                  ok: true,
                  marketDataCount: result.marketData.length,
                  marketData: result.marketData,
                  degradedReason: result.degradedReason
                },
                12000
              )
            }
          ],
          details: {
            marketDataCount: result.marketData.length,
            degraded: Boolean(result.degradedReason || result.marketData.some((item) => item.degradedReason))
          }
        };
      }
    }
  ];
}

function buildPiFetchMarketDataPrompt(input: AgentFetchMarketDataInput): string {
  return JSON.stringify({
    instruction:
      "You are the Pi coordinator for a local research session. You must call the fetch_research_market_data app tool exactly once for the supplied resolved asset, then return one short Chinese sentence summarizing whether market data completed or degraded. Do not fetch external data yourself. Do not invent market metrics.",
    node: "fetch_market_data",
    asset: input.asset,
    availableAppTools: ["fetch_research_market_data: read-only/provider-backed app market adapter returning auditable market metrics and degraded reasons"],
    outputContract: "After the tool call, return one short Chinese sentence. The API will use the tool result as the node payload."
  });
}

function createPiFetchOnchainDataTools(
  input: AgentFetchOnchainDataInput,
  onFetched: (result: {
    asset?: ResolvedAsset;
    onchainData?: OnchainData;
    contractRiskData?: ContractRiskData;
    dexLiquidityData?: DexLiquidityData;
    holderConcentrationData?: HolderConcentrationData;
    arkhamIntel?: ArkhamIntel;
    degradedReason?: string;
  }) => void
): ToolDefinition[] {
  return [
    {
      name: "fetch_research_onchain_data",
      label: "Fetch research on-chain data",
      description:
        "Fetch ERC-20 metadata, contract risk, DEX liquidity, holder concentration, and Arkham-compatible address intelligence through typed app adapters. This tool is provider-backed and returns degraded reasons instead of inventing on-chain data.",
      promptSnippet: "Fetch on-chain and address-intelligence data for the resolved research asset",
      promptGuidelines: [
        "Call this tool exactly once before answering the on-chain step.",
        "Use only the resolved asset supplied in the prompt.",
        "Do not invent bytecode, owners, holder percentages, DEX liquidity, Arkham labels, balances, transfers, or source URLs beyond the tool result."
      ],
      parameters: fetchResearchOnchainDataParams,
      async execute(_toolCallId, params) {
        const toolParams = params as {
          includeErc20Metadata?: boolean;
          includeContractRisk?: boolean;
          includeDexLiquidity?: boolean;
          includeHolderConcentration?: boolean;
          includeArkhamIntel?: boolean;
        };
        const result = await safeFetchResearchOnchainData(input, {
          includeErc20Metadata: toolParams.includeErc20Metadata !== false,
          includeContractRisk: toolParams.includeContractRisk !== false,
          includeDexLiquidity: toolParams.includeDexLiquidity !== false,
          includeHolderConcentration: toolParams.includeHolderConcentration !== false,
          includeArkhamIntel: toolParams.includeArkhamIntel !== false
        });
        onFetched(result);
        return {
          content: [
            {
              type: "text",
              text: truncateJson(
                {
                  ok: true,
                  asset: result.asset,
                  onchainData: result.onchainData,
                  contractRiskData: result.contractRiskData,
                  dexLiquidityData: result.dexLiquidityData,
                  holderConcentrationData: result.holderConcentrationData,
                  arkhamIntel: result.arkhamIntel,
                  degradedReason: result.degradedReason
                },
                16000
              )
            }
          ],
          details: {
            hasOnchainData: Boolean(result.onchainData && !result.onchainData.degradedReason),
            hasContractRiskData: Boolean(result.contractRiskData && !result.contractRiskData.degradedReason),
            hasDexLiquidityData: Boolean(result.dexLiquidityData && !result.dexLiquidityData.degradedReason),
            hasHolderConcentrationData: Boolean(result.holderConcentrationData && !result.holderConcentrationData.degradedReason),
            hasArkhamIntel: Boolean(result.arkhamIntel && !result.arkhamIntel.degradedReason),
            degraded: Boolean(
              result.degradedReason ||
                result.onchainData?.degradedReason ||
                result.contractRiskData?.degradedReason ||
                result.dexLiquidityData?.degradedReason ||
                result.holderConcentrationData?.degradedReason ||
                result.arkhamIntel?.degradedReason
            )
          }
        };
      }
    }
  ];
}

function buildPiFetchOnchainDataPrompt(input: AgentFetchOnchainDataInput): string {
  return JSON.stringify({
    instruction:
      "You are the Pi coordinator for a local research session. You must call the fetch_research_onchain_data app tool exactly once for the supplied resolved asset, then return one short Chinese sentence summarizing whether on-chain data completed or degraded. Do not fetch external data yourself. Do not invent on-chain or address-intelligence facts.",
    node: "fetch_onchain_data",
    asset: input.asset,
    availableAppTools: [
      "fetch_research_onchain_data: provider-backed app adapters for ERC-20 metadata, contract risk, DEX liquidity, holder concentration, and Arkham-compatible address intelligence"
    ],
    outputContract: "After the tool call, return one short Chinese sentence. The API will use the tool result as the node payload."
  });
}

function createPiSearchKnowledgeTools(
  input: AgentSearchKnowledgeInput,
  onSearched: (result: { cases: SimilarCase[]; degradedReason?: string }) => void
): ToolDefinition[] {
  return [
    {
      name: "search_research_knowledge",
      label: "Search research knowledge",
      description:
        "Search the local report library for similar historical cases through the app's typed matcher. This tool is read-only and returns degraded reasons instead of inventing comparable cases.",
      promptSnippet: "Search local research reports for similar cases",
      promptGuidelines: [
        "Call this tool exactly once before answering the knowledge-search step.",
        "Use only the resolved asset, collected sources, market data, and on-chain data supplied in the prompt.",
        "Do not invent similar projects, report ids, recommendations, confidence values, or matched reasons beyond the tool result."
      ],
      parameters: searchResearchKnowledgeParams,
      async execute(_toolCallId, params) {
        const toolParams = params as { maxCases?: number };
        const maxCases =
          Number.isFinite(toolParams.maxCases) && toolParams.maxCases && toolParams.maxCases > 0
            ? Math.min(Math.floor(toolParams.maxCases), 20)
            : 5;
        const result = await safeSearchResearchKnowledge(input);
        const limited = {
          cases: result.cases.slice(0, maxCases),
          degradedReason: result.degradedReason
        };
        onSearched(limited);
        return {
          content: [
            {
              type: "text",
              text: truncateJson(
                {
                  ok: true,
                  caseCount: limited.cases.length,
                  cases: limited.cases,
                  degradedReason: limited.degradedReason
                },
                12000
              )
            }
          ],
          details: {
            caseCount: limited.cases.length,
            degraded: Boolean(limited.degradedReason) || limited.cases.length === 0
          }
        };
      }
    }
  ];
}

function buildPiSearchKnowledgePrompt(input: AgentSearchKnowledgeInput): string {
  return JSON.stringify({
    instruction:
      "You are the Pi coordinator for a local research session. You must call the search_research_knowledge app tool exactly once for the supplied research context, then return one short Chinese sentence summarizing whether similar local cases were found or degraded. Do not search the web yourself. Do not invent case evidence.",
    node: "match_cases",
    asset: input.asset,
    sourceCount: input.sources.length,
    marketDataProviders: input.marketData.map((item) => item.provider),
    hasOnchainData: Boolean(input.onchainData),
    hasContractRiskData: Boolean(input.contractRiskData),
    availableAppTools: ["search_research_knowledge: read-only local report matcher returning similar cases and degraded reasons"],
    outputContract: "After the tool call, return one short Chinese sentence. The API will use the tool result as the node payload."
  });
}

function createPiAnalyzeRiskTools(input: AgentAnalyzeRiskInput, onAnalyzed: (risk: RiskAssessment) => void): ToolDefinition[] {
  return [
    {
      name: "analyze_research_risk",
      label: "Analyze research risk",
      description:
        "Calculate the current research risk score through the app's deterministic scorer. This tool is read-only and does not let the model alter scores.",
      promptSnippet: "Calculate deterministic research risk from collected evidence flags",
      promptGuidelines: [
        "Call this tool exactly once before answering the risk-analysis step.",
        "Use only the supplied riskInput snapshot.",
        "Do not invent, smooth, or override any risk score; the tool result is authoritative."
      ],
      parameters: analyzeResearchRiskParams,
      async execute(_toolCallId, params) {
        const toolParams = params as { includeDetail?: boolean };
        const risk = safeAnalyzeResearchRisk(input);
        onAnalyzed(risk);
        return {
          content: [
            {
              type: "text",
              text: truncateJson(
                {
                  ok: true,
                  risk: toolParams.includeDetail === false ? { totalScore: risk.totalScore, level: risk.level } : risk
                },
                8000
              )
            }
          ],
          details: {
            totalScore: risk.totalScore,
            level: risk.level
          }
        };
      }
    }
  ];
}

function buildPiAnalyzeRiskPrompt(input: AgentAnalyzeRiskInput): string {
  return JSON.stringify({
    instruction:
      "You are the Pi coordinator for a local research session. You must call the analyze_research_risk app tool exactly once for the supplied risk input snapshot, then return one short Chinese sentence summarizing the deterministic risk level. Do not recalculate scores yourself. Do not invent missing evidence.",
    node: "analyze_risk",
    riskInput: input.riskInput,
    availableAppTools: ["analyze_research_risk: read-only deterministic risk scorer returning the authoritative current risk assessment"],
    outputContract: "After the tool call, return one short Chinese sentence. The API will use the tool result as the node payload."
  });
}

function createPiAgentShellTools(input: PersonalAgentTurnInput): ToolDefinition[] {
  return [
    {
      name: "inspect_extension_registry",
      label: "Inspect extension registry",
      description:
        "Read the local app extension registry and safety policy. This tool is read-only and cannot execute extension actions.",
      promptSnippet: "Inspect local agent extensions and safety policy",
      promptGuidelines: [
        "Use this tool to explain which local skills are available and how their permissions are scoped.",
        "Do not claim an extension was executed; this tool only inspects the registry."
      ],
      parameters: inspectExtensionRegistryParams,
      async execute(_toolCallId, params) {
        const toolParams = params as { maxChars?: number };
        const maxChars = Number.isFinite(toolParams.maxChars) && toolParams.maxChars && toolParams.maxChars > 0 ? Math.min(toolParams.maxChars, 24000) : 12000;
        return {
          content: [
            {
              type: "text",
              text: truncateJson(
                {
                  safetyModel: input.safetyModel,
                  extensions: input.extensionManifests ?? []
                },
                maxChars
              )
            }
          ],
          details: { maxChars }
        };
      }
    },
    {
      name: "invoke_extension_capability",
      label: "Invoke extension capability",
      description:
        "Invoke one registered local extension capability through the app permission boundary. This tool is restricted to read-only/search capabilities by the API shell.",
      promptSnippet: "Invoke a registered local extension capability through the permissioned app boundary",
      promptGuidelines: [
        "Use this only for read-only/search capabilities like local.knowledge/knowledge.search, local.reports/reports.read, web3.research/research.get_task, or web3.research/research.get_report.",
        "Do not use this tool for create_task, market.snapshot, indexing, writes, provider-costly actions, wallet, posting, shell, file, or browser actions.",
        "Always report the permissionAudit returned by the app if invocation is denied or degraded."
      ],
      parameters: invokeExtensionCapabilityParams,
      async execute(_toolCallId, params) {
        const toolParams = params as { extensionId?: string; capabilityId?: string; inputJson?: string };
        if (!input.extensionInvoker) {
          return {
            content: [
              {
                type: "text",
                text: truncateJson(
                  {
                    ok: false,
                    status: "denied",
                    degradedReason: "The API shell did not provide an extension invoker for this agent turn."
                  },
                  4000
                )
              }
            ],
            details: { ok: false, status: "denied" }
          };
        }
        if (!toolParams.extensionId || !toolParams.capabilityId) {
          return {
            content: [
              {
                type: "text",
                text: truncateJson({ ok: false, status: "denied", degradedReason: "extensionId and capabilityId are required." }, 4000)
              }
            ],
            details: { ok: false, status: "denied" }
          };
        }
        const extensionInput = parseOptionalJsonObject(toolParams.inputJson);
        if (!extensionInput.ok) {
          return {
            content: [{ type: "text", text: truncateJson(extensionInput, 4000) }],
            details: { ok: false, status: "denied" }
          };
        }
        const result = await input.extensionInvoker({
          extensionId: toolParams.extensionId,
          capabilityId: toolParams.capabilityId,
          input: extensionInput.value
        });
        return {
          content: [{ type: "text", text: truncateJson(redactLargeExtensionResult(result), 12000) }],
          details: {
            ok: result.ok,
            status: result.status,
            extensionId: toolParams.extensionId,
            capabilityId: toolParams.capabilityId
          }
        };
      }
    }
  ];
}

function buildPiAgentShellPrompt(input: PersonalAgentTurnInput): string {
  return JSON.stringify({
    instruction:
      "You are the Pi base for a local-first single-user personal agent prototype. Reply in concise Chinese. You may inspect the extension registry, but you must not claim to execute skills unless a tool result proves it. Do not request private keys. Do not suggest wallet transactions, swaps, transfers, posting automation, shell tools, file-write tools, or unrestricted browser control. If the user asks for Web3 research, explain that research is currently mounted as a legacy extension and can be invoked through the app's permissioned skill boundary. Keep the response under 10 lines.",
    userMessage: input.message,
    sessionId: input.sessionId,
    availableAppTools: [
      "inspect_extension_registry: read local extensions and safety policy only",
      "invoke_extension_capability: invoke read-only/search extension capabilities through the API permission boundary"
    ],
    extensionInvocationPolicy:
      "Only read-only/search capability invocations are allowed from this agent turn. Write/provider/task creation/indexing/shell/file/browser/wallet/posting actions are denied by the API shell.",
    extensionCount: input.extensionManifests?.length ?? 0
  });
}

function parseOptionalJsonObject(inputJson: string | undefined): { ok: true; value: Record<string, unknown> } | { ok: false; status: "denied"; degradedReason: string } {
  if (!inputJson || !inputJson.trim()) return { ok: true, value: {} };
  try {
    const parsed = JSON.parse(inputJson) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, status: "denied", degradedReason: "inputJson must decode to a JSON object." };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch (error) {
    return {
      ok: false,
      status: "denied",
      degradedReason: error instanceof Error ? `inputJson parse failed: ${error.message}` : "inputJson parse failed."
    };
  }
}

function redactLargeExtensionResult(result: PersonalAgentExtensionInvokeResult): PersonalAgentExtensionInvokeResult {
  return {
    ...result,
    result: truncateDeepStrings(result.result, 1200)
  };
}

function truncateDeepStrings(value: unknown, maxLength: number): unknown {
  if (typeof value === "string") {
    return value.length > maxLength ? `${value.slice(0, maxLength)}... [truncated ${value.length - maxLength} chars]` : value;
  }
  if (Array.isArray(value)) return value.slice(0, 8).map((item) => truncateDeepStrings(item, maxLength));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, truncateDeepStrings(child, maxLength)])
  );
}

async function safeCollectResearchSources(input: AgentCollectSourcesInput): Promise<{ sources: SourceCandidate[]; degradedReason?: string }> {
  try {
    return await input.collectSources(input.asset);
  } catch (error) {
    return {
      sources: [],
      degradedReason: error instanceof Error ? error.message : "Source collection failed."
    };
  }
}

async function safeFetchResearchMarketData(
  input: AgentFetchMarketDataInput,
  options: { includeTokenMarket?: boolean; includeDefiProtocol?: boolean } = {}
): Promise<{ marketData: MarketData[]; degradedReason?: string }> {
  const includeTokenMarket = options.includeTokenMarket !== false;
  const includeDefiProtocol = options.includeDefiProtocol !== false;
  const marketData: MarketData[] = [];
  const degradedReasons: string[] = [];

  if (includeTokenMarket) {
    if (input.getTokenMarketData) {
      try {
        marketData.push(await input.getTokenMarketData(input.asset));
      } catch (error) {
        degradedReasons.push(error instanceof Error ? error.message : "Token market data fetch failed.");
      }
    } else {
      degradedReasons.push("CoinGecko market adapter 尚未接入，市场价格数据为空。");
    }
  }

  if (includeDefiProtocol) {
    if (input.getDefiProtocolMetrics) {
      try {
        marketData.push(await input.getDefiProtocolMetrics(input.asset));
      } catch (error) {
        degradedReasons.push(error instanceof Error ? error.message : "Defi protocol metrics fetch failed.");
      }
    } else {
      degradedReasons.push("DefiLlama protocol adapter 尚未接入，TVL/协议指标为空。");
    }
  }

  return {
    marketData,
    degradedReason: degradedReasons.length ? degradedReasons.join(" ") : undefined
  };
}

async function safeFetchResearchOnchainData(
  input: AgentFetchOnchainDataInput,
  options: {
    includeErc20Metadata?: boolean;
    includeContractRisk?: boolean;
    includeDexLiquidity?: boolean;
    includeHolderConcentration?: boolean;
    includeArkhamIntel?: boolean;
  } = {}
): Promise<{
  asset?: ResolvedAsset;
  onchainData?: OnchainData;
  contractRiskData?: ContractRiskData;
  dexLiquidityData?: DexLiquidityData;
  holderConcentrationData?: HolderConcentrationData;
  arkhamIntel?: ArkhamIntel;
  degradedReason?: string;
}> {
  const degradedReasons: string[] = [];
  let asset = input.asset;
  let onchainData: OnchainData | undefined;
  let contractRiskData: ContractRiskData | undefined;
  let dexLiquidityData: DexLiquidityData | undefined;
  let holderConcentrationData: HolderConcentrationData | undefined;
  let arkhamIntel: ArkhamIntel | undefined;

  if (options.includeErc20Metadata !== false) {
    if (!input.readErc20Metadata) {
      degradedReasons.push("Viem/RPC 链上读取 adapter 尚未接入，合约和持仓风险仅按缺失数据处理。");
      return { asset, degradedReason: degradedReasons.join(" ") };
    }
    try {
      onchainData = await input.readErc20Metadata(asset);
      if (onchainData.degradedReason) degradedReasons.push(onchainData.degradedReason);
      if (!asset.symbol && onchainData.symbol) asset = { ...asset, symbol: onchainData.symbol };
      if (!asset.name && onchainData.name) asset = { ...asset, name: onchainData.name };
      if (!asset.chain && onchainData.chain) asset = { ...asset, chain: onchainData.chain };
    } catch (error) {
      degradedReasons.push(error instanceof Error ? error.message : "ERC-20 metadata fetch failed.");
    }
  }

  if (options.includeContractRisk !== false) {
    if (input.readContractRisk) {
      try {
        contractRiskData = await input.readContractRisk(asset);
        if (contractRiskData.degradedReason) degradedReasons.push(contractRiskData.degradedReason);
      } catch (error) {
        degradedReasons.push(error instanceof Error ? error.message : "Contract risk fetch failed.");
      }
    } else {
      degradedReasons.push("Contract risk adapter 尚未接入，owner/proxy/mint/pause 检查为空。");
    }
  }

  if (options.includeDexLiquidity !== false) {
    if (input.getDexLiquidityData) {
      try {
        dexLiquidityData = await input.getDexLiquidityData(asset);
        if (dexLiquidityData.degradedReason) degradedReasons.push(dexLiquidityData.degradedReason);
      } catch (error) {
        degradedReasons.push(error instanceof Error ? error.message : "DEX liquidity fetch failed.");
      }
    } else {
      degradedReasons.push("DEX liquidity adapter 尚未接入，LP/池子深度分析为空。");
    }
  }

  if (options.includeHolderConcentration !== false) {
    if (input.getHolderConcentrationData) {
      try {
        holderConcentrationData = await input.getHolderConcentrationData(asset);
        if (holderConcentrationData.degradedReason) degradedReasons.push(holderConcentrationData.degradedReason);
      } catch (error) {
        degradedReasons.push(error instanceof Error ? error.message : "Holder concentration fetch failed.");
      }
    } else {
      degradedReasons.push("Holder concentration adapter 尚未接入，top holders 集中度分析为空。");
    }
  }

  if (options.includeArkhamIntel !== false) {
    if (input.getArkhamAddressIntel) {
      try {
        arkhamIntel = await input.getArkhamAddressIntel(asset);
        if (arkhamIntel.degradedReason) degradedReasons.push(arkhamIntel.degradedReason);
      } catch (error) {
        degradedReasons.push(error instanceof Error ? error.message : "Arkham address intelligence fetch failed.");
      }
    } else {
      degradedReasons.push("Arkham address intelligence adapter 尚未接入，实体标签和资金流分析为空。");
    }
  }

  return {
    asset,
    onchainData,
    contractRiskData,
    dexLiquidityData,
    holderConcentrationData,
    arkhamIntel,
    degradedReason: degradedReasons.length ? degradedReasons.join(" ") : undefined
  };
}

async function safeSearchResearchKnowledge(input: AgentSearchKnowledgeInput): Promise<{ cases: SimilarCase[]; degradedReason?: string }> {
  try {
    return await input.matchSimilarCases({
      asset: input.asset,
      sources: input.sources,
      marketData: input.marketData,
      onchainData: input.onchainData,
      contractRiskData: input.contractRiskData
    });
  } catch (error) {
    return {
      cases: [],
      degradedReason: error instanceof Error ? error.message : "Local research knowledge search failed."
    };
  }
}

function safeAnalyzeResearchRisk(input: AgentAnalyzeRiskInput): RiskAssessment {
  return input.calculateRisk(input.riskInput);
}

async function safeIndexResearchKnowledge(input: AgentIndexKnowledgeInput): Promise<{ indexed: boolean; degradedReason?: string }> {
  try {
    return await input.indexReport(input.report);
  } catch (error) {
    return {
      indexed: false,
      degradedReason: error instanceof Error ? error.message : "Research knowledge indexing failed."
    };
  }
}

function appendDegradedReason(current: string | undefined, next: string): string {
  return current ? `${current} ${next}` : next;
}

const inspectResearchContextParams = Type.Object({
  section: Type.Optional(
    Type.String({
      description:
        "Optional section to inspect: asset, sources, marketData, onchainData, contractRiskData, dexLiquidityData, holderConcentrationData, arkhamIntel, similarCases, degradedReasons, or all."
    })
  )
});

const inspectDeterministicReportParams = Type.Object({
  maxChars: Type.Optional(Type.Number({ description: "Maximum report characters to return. Default 24000." }))
});

const writeResearchReportParams = Type.Object({
  includeContextSummary: Type.Optional(Type.Boolean({ description: "Return compact context counts with the deterministic report. Default true." }))
});

const indexResearchKnowledgeParams = Type.Object({
  confirmReportId: Type.Optional(Type.String({ description: "Report id that the model intends to index. Must match the supplied report id when present." }))
});

function createPiResearchTools(input: AgentReportDraftInput, onWritten: () => void): ToolDefinition[] {
  const researchContext = input.researchContext ?? {};
  return [
    {
      name: "write_research_report",
      label: "Write research report",
      description:
        "Return the deterministic research report snapshot generated by the typed app pipeline. This write-report app tool is the audited source for Pi's final wording pass.",
      promptSnippet: "Read the deterministic research report that should be rewritten into the final concise body",
      promptGuidelines: [
        "Call this tool exactly once before producing the final report body.",
        "Use the returned deterministic report as the source of truth for recommendation, confidence, sources, and degraded reasons.",
        "Do not create new market, chain, social, holder, citation, or risk facts beyond the tool result."
      ],
      parameters: writeResearchReportParams,
      async execute(_toolCallId, params) {
        const toolParams = params as { includeContextSummary?: boolean };
        onWritten();
        return {
          content: [
            {
              type: "text",
              text: truncateJson(
                {
                  ok: true,
                  report: {
                    markdown: input.baseReportMarkdown,
                    summary: input.baseSummary,
                    recommendation: input.recommendation,
                    confidence: input.confidence
                  },
                  contextSummary:
                    toolParams.includeContextSummary === false
                      ? undefined
                      : {
                          taskId: researchContext.taskId,
                          sourceCount: researchContext.sources?.length ?? 0,
                          marketDataCount: researchContext.marketData?.length ?? 0,
                          similarCaseCount: researchContext.similarCases?.length ?? 0,
                          degradedReasonCount: researchContext.degradedReasons?.length ?? 0
                        }
                },
                24000
              )
            }
          ],
          details: {
            recommendation: input.recommendation,
            confidence: input.confidence,
            markdownChars: input.baseReportMarkdown.length
          }
        };
      }
    },
    {
      name: "inspect_research_context",
      label: "Inspect research context",
      description:
        "Read the structured, already-collected Web3 research evidence from the API task graph. This tool is read-only and cannot fetch new external data.",
      promptSnippet: "Inspect structured Web3 research context already collected by the API",
      promptGuidelines: [
        "Use inspect_research_context when structured context is needed for claims about market, on-chain, holder, liquidity, source, or degraded data.",
        "Treat missing fields and degradedReasons as material evidence; do not fill gaps from memory."
      ],
      parameters: inspectResearchContextParams,
      async execute(_toolCallId, params) {
        const toolParams = params as { section?: string };
        const section = toolParams.section && toolParams.section !== "all" ? toolParams.section : undefined;
        const value = section ? (researchContext as Record<string, unknown>)[section] : researchContext;
        return {
          content: [{ type: "text", text: truncateJson({ section: section ?? "all", value }, 18000) }],
          details: { section: section ?? "all" }
        };
      }
    },
    {
      name: "inspect_deterministic_report",
      label: "Inspect deterministic report",
      description:
        "Read the deterministic Markdown report produced by the typed API research pipeline. This is the audit source of truth for the final Pi draft.",
      promptSnippet: "Inspect the deterministic Markdown research report",
      promptGuidelines: [
        "Preserve all source URLs, degraded reasons, recommendations, risk caveats, and data-source notes from inspect_deterministic_report.",
        "If tool context conflicts with the deterministic report, explicitly prefer the deterministic report unless the conflict is only formatting."
      ],
      parameters: inspectDeterministicReportParams,
      async execute(_toolCallId, params) {
        const toolParams = params as { maxChars?: number };
        const maxChars = Number.isFinite(toolParams.maxChars) && toolParams.maxChars && toolParams.maxChars > 0 ? Math.min(toolParams.maxChars, 32000) : 24000;
        return {
          content: [{ type: "text", text: input.baseReportMarkdown.slice(0, maxChars) }],
          details: { maxChars }
        };
      }
    }
  ];
}

function createPiIndexKnowledgeTools(
  input: AgentIndexKnowledgeInput,
  onIndexed: (result: { indexed: boolean; degradedReason?: string }) => void
): ToolDefinition[] {
  return [
    {
      name: "index_research_knowledge",
      label: "Index research knowledge",
      description:
        "Index the generated research report through the app's knowledge service. This tool may use embeddings when configured and returns degraded reasons instead of failing silently.",
      promptSnippet: "Index the completed research report into the local knowledge base",
      promptGuidelines: [
        "Call this tool exactly once before answering the knowledge-indexing step.",
        "Use only the supplied report id.",
        "Do not create or mutate report content; this tool only indexes the already-generated report."
      ],
      parameters: indexResearchKnowledgeParams,
      async execute(_toolCallId, params) {
        const toolParams = params as { confirmReportId?: string };
        if (toolParams.confirmReportId && toolParams.confirmReportId !== input.report.id) {
          const result = {
            indexed: false,
            degradedReason: `index_research_knowledge refused mismatched report id ${toolParams.confirmReportId}; expected ${input.report.id}.`
          };
          onIndexed(result);
          return {
            content: [{ type: "text", text: truncateJson({ ok: false, ...result }, 4000) }],
            details: { indexed: false, reportId: input.report.id }
          };
        }
        const result = await safeIndexResearchKnowledge(input);
        onIndexed(result);
        return {
          content: [
            {
              type: "text",
              text: truncateJson(
                {
                  ok: result.indexed,
                  reportId: input.report.id,
                  title: input.report.title,
                  indexed: result.indexed,
                  degradedReason: result.degradedReason
                },
                8000
              )
            }
          ],
          details: {
            reportId: input.report.id,
            indexed: result.indexed,
            degraded: Boolean(result.degradedReason)
          }
        };
      }
    }
  ];
}

function buildPiIndexKnowledgePrompt(input: AgentIndexKnowledgeInput): string {
  return JSON.stringify({
    instruction:
      "You are the Pi coordinator for a local research session. You must call the index_research_knowledge app tool exactly once for the supplied completed report, then return one short Chinese sentence summarizing whether knowledge indexing completed or degraded. Do not alter report content. Do not invent index/vector status.",
    node: "index_knowledge",
    report: {
      id: input.report.id,
      taskId: input.report.taskId,
      title: input.report.title,
      recommendation: input.report.recommendation,
      confidence: input.report.confidence
    },
    availableAppTools: ["index_research_knowledge: write/provider-backed app knowledge indexer returning indexed/degraded status"],
    outputContract: "After the tool call, return one short Chinese sentence. The API will use the tool result as the node payload."
  });
}

function extractPiTextDelta(event: unknown): string | undefined {
  if (!event || typeof event !== "object") return undefined;
  const record = event as Record<string, unknown>;
  if (record.type !== "message_update") return undefined;
  const assistantMessageEvent = record.assistantMessageEvent;
  if (!assistantMessageEvent || typeof assistantMessageEvent !== "object") return undefined;
  const assistantRecord = assistantMessageEvent as Record<string, unknown>;
  return assistantRecord.type === "text_delta" && typeof assistantRecord.delta === "string" ? assistantRecord.delta : undefined;
}

function extractPiToolAudit(event: unknown): AgentRuntimeToolCallAudit | undefined {
  if (!event || typeof event !== "object") return undefined;
  const record = event as Record<string, unknown>;
  if (record.type === "tool_call") {
    return {
      toolCallId: typeof record.toolCallId === "string" ? record.toolCallId : undefined,
      toolName: typeof record.toolName === "string" ? record.toolName : "unknown",
      input: record.input
    };
  }
  if (record.type === "tool_result") {
    return {
      toolCallId: typeof record.toolCallId === "string" ? record.toolCallId : undefined,
      toolName: typeof record.toolName === "string" ? record.toolName : "unknown",
      isError: Boolean(record.isError),
      outputPreview: extractPiToolResultPreview(record.content)
    };
  }
  return undefined;
}

function mergePiToolAudit(toolCalls: AgentRuntimeToolCallAudit[], audit: AgentRuntimeToolCallAudit): void {
  const existing = audit.toolCallId ? toolCalls.find((item) => item.toolCallId === audit.toolCallId) : undefined;
  if (existing) {
    Object.assign(existing, audit);
    return;
  }
  toolCalls.push(audit);
}

function extractPiToolResultPreview(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  const text = content
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const record = item as Record<string, unknown>;
      return record.type === "text" && typeof record.text === "string" ? record.text : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
  return text ? text.slice(0, 1000) : undefined;
}

function truncateJson(value: unknown, maxChars: number): string {
  const text = JSON.stringify(value, null, 2);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n... [truncated ${text.length - maxChars} chars]`;
}

function extractJsonObjectText(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
