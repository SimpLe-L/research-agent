import { z } from "zod";

export const taskNodeNames = [
  "resolve_asset",
  "collect_sources",
  "fetch_market_data",
  "fetch_onchain_data",
  "analyze_project",
  "analyze_risk",
  "match_cases",
  "write_report",
  "validate_report",
  "index_knowledge"
] as const;

export const taskNodeNameSchema = z.enum(taskNodeNames);
export type TaskNodeName = z.infer<typeof taskNodeNameSchema>;

export const taskStatusSchema = z.enum([
  "pending",
  "running",
  "needs_review",
  "completed",
  "failed",
  "cancelled"
]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const taskNodeStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
  "needs_review"
]);
export type TaskNodeStatus = z.infer<typeof taskNodeStatusSchema>;

export const researchInputTypeSchema = z.enum([
  "auto",
  "evm_address",
  "solana_mint",
  "symbol",
  "project_name",
  "url"
]);
export type ResearchInputType = z.infer<typeof researchInputTypeSchema>;

export const createResearchTaskSchema = z.object({
  input: z.string().min(1),
  inputType: researchInputTypeSchema.default("auto"),
  question: z.string().default("现在适合买入吗？"),
  options: z
    .object({
      deepResearch: z.boolean().default(false),
      includeSocial: z.boolean().default(true),
      includeOnchain: z.boolean().default(true),
      includeSimilarCases: z.boolean().default(true),
      resumeFromNode: taskNodeNameSchema.optional(),
      resumedFromTaskId: z.string().optional()
    })
    .default({})
});
export type CreateResearchTaskInput = z.infer<typeof createResearchTaskSchema>;

export const retryResearchTaskSchema = z.object({
  resumeFromNode: taskNodeNameSchema.optional()
});
export type RetryResearchTaskInput = z.infer<typeof retryResearchTaskSchema>;

export const providerStatusSchema = z.object({
  name: z.string(),
  configured: z.boolean(),
  reachable: z.boolean(),
  degradedReason: z.string().optional()
});
export type ProviderStatus = z.infer<typeof providerStatusSchema>;

export const providerReadinessItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(["ready", "missing", "degraded", "manual"]),
  capability: z.string(),
  envVars: z.array(z.string()).default([]),
  envTemplate: z.string().optional(),
  action: z.string(),
  docsHint: z.string().optional()
});
export type ProviderReadinessItem = z.infer<typeof providerReadinessItemSchema>;

export const resolvedAssetSchema = z.object({
  input: z.string(),
  inputType: researchInputTypeSchema,
  chain: z.string().optional(),
  address: z.string().optional(),
  symbol: z.string().optional(),
  name: z.string().optional(),
  confidence: z.number().min(0).max(100),
  degradedReason: z.string().optional()
});
export type ResolvedAsset = z.infer<typeof resolvedAssetSchema>;

export const marketDataSchema = z.object({
  provider: z.string(),
  coingeckoId: z.string().optional(),
  symbol: z.string().optional(),
  name: z.string().optional(),
  priceUsd: z.number().optional(),
  marketCapUsd: z.number().optional(),
  fdvUsd: z.number().optional(),
  volume24hUsd: z.number().optional(),
  change24hPct: z.number().optional(),
  totalLiquidityUsd: z.number().optional(),
  tvlUsd: z.number().optional(),
  sourceUrl: z.string().optional(),
  fetchedAt: z.string(),
  degradedReason: z.string().optional()
});
export type MarketData = z.infer<typeof marketDataSchema>;

export const marketSnapshotSchema = z.object({
  id: z.string(),
  scope: z.string(),
  metrics: z.record(z.unknown()),
  regime: z.enum(["Risk-On", "Risk-On Early", "Neutral", "Risk-Off", "Capitulation"]),
  recommendation: z.enum(["Buy", "Watch", "Avoid", "Reduce"]),
  confidence: z.number().min(0).max(100),
  summary: z.string(),
  degradedReasons: z.array(z.string()).default([]),
  createdAt: z.string()
});
export type MarketSnapshot = z.infer<typeof marketSnapshotSchema>;

export const sourceCandidateSchema = z.object({
  title: z.string(),
  url: z.string(),
  sourceType: z.string(),
  provider: z.string(),
  fetchedAt: z.string().optional(),
  statusCode: z.number().optional(),
  snippet: z.string().optional(),
  degradedReason: z.string().optional()
});
export type SourceCandidate = z.infer<typeof sourceCandidateSchema>;

export const persistedReportSourceSchema = z.object({
  id: z.string(),
  reportId: z.string(),
  usageType: z.string(),
  sourceType: z.string(),
  url: z.string().optional(),
  title: z.string().optional(),
  contentText: z.string().optional(),
  contentHash: z.string().optional(),
  fetchedAt: z.string().optional(),
  metadata: z.record(z.unknown()).default({})
});
export type PersistedReportSource = z.infer<typeof persistedReportSourceSchema>;

export const persistedSourceDocumentSchema = z.object({
  id: z.string(),
  sourceType: z.string(),
  url: z.string().optional(),
  title: z.string().optional(),
  contentText: z.string().optional(),
  contentHash: z.string().optional(),
  fetchedAt: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
  reportCount: z.number().default(0),
  lastReportId: z.string().optional()
});
export type PersistedSourceDocument = z.infer<typeof persistedSourceDocumentSchema>;

export const sourceReportUsageSchema = z.object({
  reportId: z.string(),
  usageType: z.string(),
  title: z.string(),
  recommendation: z.enum(["Buy", "Watch", "Avoid", "Reduce"]),
  confidence: z.number().min(0).max(100),
  createdAt: z.string()
});
export type SourceReportUsage = z.infer<typeof sourceReportUsageSchema>;

export const sourceDocumentDetailSchema = z.object({
  source: persistedSourceDocumentSchema,
  reports: z.array(sourceReportUsageSchema)
});
export type SourceDocumentDetail = z.infer<typeof sourceDocumentDetailSchema>;

export const onchainDataSchema = z.object({
  provider: z.string(),
  chain: z.string().optional(),
  address: z.string().optional(),
  name: z.string().optional(),
  symbol: z.string().optional(),
  decimals: z.number().optional(),
  totalSupply: z.string().optional(),
  fetchedAt: z.string(),
  degradedReason: z.string().optional()
});
export type OnchainData = z.infer<typeof onchainDataSchema>;

export const arkhamIntelSchema = z.object({
  provider: z.literal("arkham"),
  chain: z.string().optional(),
  address: z.string().optional(),
  fetchedAt: z.string(),
  labelCount: z.number().default(0),
  transferCount: z.number().default(0),
  holdingCount: z.number().default(0),
  labels: z.array(z.string()).default([]),
  transferSample: z.array(z.record(z.unknown())).default([]),
  holdingSample: z.array(z.record(z.unknown())).default([]),
  sourceUrls: z.array(z.string()).default([]),
  degradedReason: z.string().optional()
});
export type ArkhamIntel = z.infer<typeof arkhamIntelSchema>;

export const contractRiskDataSchema = z.object({
  provider: z.literal("viem"),
  chain: z.string().optional(),
  address: z.string().optional(),
  fetchedAt: z.string(),
  hasBytecode: z.boolean().default(false),
  isProxyLike: z.boolean().default(false),
  owner: z.string().optional(),
  paused: z.boolean().optional(),
  detectedSelectors: z.array(z.string()).default([]),
  detectedCapabilities: z
    .object({
      mint: z.boolean().default(false),
      pause: z.boolean().default(false),
      upgrade: z.boolean().default(false),
      ownerControl: z.boolean().default(false),
      blacklist: z.boolean().default(false),
      taxOrFeeControl: z.boolean().default(false),
      tradingControl: z.boolean().default(false),
      dexPairControl: z.boolean().default(false),
      maxTxOrWalletControl: z.boolean().default(false)
    })
    .default({}),
  riskFlags: z.array(z.string()).default([]),
  degradedReason: z.string().optional()
});
export type ContractRiskData = z.infer<typeof contractRiskDataSchema>;

export const dexPairSchema = z.object({
  chainId: z.string().optional(),
  dexId: z.string().optional(),
  url: z.string().optional(),
  pairAddress: z.string().optional(),
  baseTokenSymbol: z.string().optional(),
  quoteTokenSymbol: z.string().optional(),
  liquidityUsd: z.number().optional(),
  volume24hUsd: z.number().optional(),
  txns24h: z.number().optional(),
  priceUsd: z.number().optional(),
  fdvUsd: z.number().optional(),
  marketCapUsd: z.number().optional(),
  pairCreatedAt: z.number().optional()
});
export type DexPair = z.infer<typeof dexPairSchema>;

export const dexLiquidityDataSchema = z.object({
  provider: z.literal("dexscreener"),
  chain: z.string().optional(),
  address: z.string().optional(),
  fetchedAt: z.string(),
  pairCount: z.number().default(0),
  totalLiquidityUsd: z.number().optional(),
  topPairLiquidityUsd: z.number().optional(),
  totalVolume24hUsd: z.number().optional(),
  sourceUrls: z.array(z.string()).default([]),
  pairs: z.array(dexPairSchema).default([]),
  degradedReason: z.string().optional()
});
export type DexLiquidityData = z.infer<typeof dexLiquidityDataSchema>;

export const holderConcentrationDataSchema = z.object({
  provider: z.string(),
  chain: z.string().optional(),
  address: z.string().optional(),
  fetchedAt: z.string(),
  holderCount: z.number().default(0),
  top10Pct: z.number().optional(),
  top20Pct: z.number().optional(),
  topHolders: z
    .array(
      z.object({
        address: z.string().optional(),
        balance: z.string().optional(),
        pct: z.number().optional()
      })
    )
    .default([]),
  sourceUrl: z.string().optional(),
  degradedReason: z.string().optional()
});
export type HolderConcentrationData = z.infer<typeof holderConcentrationDataSchema>;

export const riskLevelSchema = z.enum(["Low", "Medium", "High", "Critical"]);
export type RiskLevel = z.infer<typeof riskLevelSchema>;

export const riskAssessmentSchema = z.object({
  totalScore: z.number().min(0).max(100),
  level: riskLevelSchema,
  contractScore: z.number().min(0).max(100),
  liquidityScore: z.number().min(0).max(100),
  concentrationScore: z.number().min(0).max(100),
  valuationScore: z.number().min(0).max(100),
  socialScore: z.number().min(0).max(100),
  missingDataScore: z.number().min(0).max(100),
  caseScore: z.number().min(0).max(100),
  detail: z.record(z.unknown())
});
export type RiskAssessment = z.infer<typeof riskAssessmentSchema>;

export const similarCaseSchema = z.object({
  reportId: z.string(),
  title: z.string(),
  recommendation: z.enum(["Buy", "Watch", "Avoid", "Reduce"]),
  confidence: z.number().min(0).max(100),
  similarityScore: z.number().min(0).max(100),
  matchedReasons: z.array(z.string()).default([]),
  createdAt: z.string()
});
export type SimilarCase = z.infer<typeof similarCaseSchema>;

export const researchTaskEventSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  node: taskNodeNameSchema.optional(),
  eventType: z.string(),
  payload: z.record(z.unknown()).default({}),
  createdAt: z.string()
});
export type ResearchTaskEvent = z.infer<typeof researchTaskEventSchema>;

export const taskNodeRunSchema = z.object({
  node: taskNodeNameSchema,
  status: taskNodeStatusSchema,
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  durationMs: z.number().optional(),
  error: z.string().optional(),
  payload: z.record(z.unknown()).default({})
});
export type TaskNodeRun = z.infer<typeof taskNodeRunSchema>;

export const researchTaskSchema = z.object({
  id: z.string(),
  input: z.string(),
  inputType: researchInputTypeSchema,
  question: z.string(),
  options: z.record(z.unknown()),
  status: taskStatusSchema,
  currentNode: taskNodeNameSchema.optional(),
  errorMessage: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional(),
  events: z.array(researchTaskEventSchema).default([]),
  nodeRuns: z.array(taskNodeRunSchema).default([])
});
export type ResearchTask = z.infer<typeof researchTaskSchema>;

export function deriveTaskNodeRuns(events: ResearchTaskEvent[]): TaskNodeRun[] {
  const byNode = new Map<TaskNodeName, TaskNodeRun>(
    taskNodeNames.map((node) => [
      node,
      {
        node,
        status: "pending",
        payload: {}
      }
    ])
  );

  for (const event of [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (!event.node) continue;
    const current = byNode.get(event.node);
    if (!current) continue;
    const next: TaskNodeRun = {
      ...current,
      payload: event.payload
    };

    if (event.eventType === "node_started" || event.eventType === "agent_report_started") {
      next.status = "running";
      next.startedAt = next.startedAt ?? event.createdAt;
      next.error = undefined;
    } else if (event.eventType === "node_completed") {
      next.status = event.payload.degraded ? "needs_review" : "completed";
      next.completedAt = event.createdAt;
    } else if (event.eventType === "node_skipped") {
      next.status = "skipped";
      next.completedAt = event.createdAt;
      next.error = undefined;
    } else if (event.eventType === "knowledge_indexed" || event.eventType === "agent_report_completed") {
      next.status = "completed";
      next.completedAt = event.createdAt;
      next.error = undefined;
    } else if (event.eventType === "agent_report_degraded") {
      next.status = "needs_review";
      next.completedAt = event.createdAt;
      next.error = stringFromUnknown(event.payload.reason ?? event.payload.error);
    } else if (event.eventType.includes("failed") || event.eventType.includes("cancelled")) {
      next.status = "failed";
      next.completedAt = event.createdAt;
      next.error = stringFromUnknown(event.payload.error ?? event.payload.reason) ?? event.eventType;
    }

    if (next.startedAt && next.completedAt) {
      const started = Date.parse(next.startedAt);
      const completed = Date.parse(next.completedAt);
      if (Number.isFinite(started) && Number.isFinite(completed) && completed >= started) {
        next.durationMs = completed - started;
      }
    }

    byNode.set(event.node, next);
  }

  return taskNodeNames.map((node) => byNode.get(node)!);
}

function stringFromUnknown(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export const reportSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  title: z.string(),
  markdown: z.string(),
  summary: z.string(),
  recommendation: z.enum(["Buy", "Watch", "Avoid", "Reduce"]),
  confidence: z.number().min(0).max(100),
  createdAt: z.string()
});
export type ResearchReport = z.infer<typeof reportSchema>;

export const reportAnnotationSchema = z.object({
  id: z.string(),
  reportId: z.string(),
  tags: z.array(z.string()).default([]),
  note: z.string().default(""),
  confidence: z.number().min(0).max(100).optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type ReportAnnotation = z.infer<typeof reportAnnotationSchema>;

export const upsertReportAnnotationSchema = z.object({
  tags: z.array(z.string()).default([]),
  note: z.string().default(""),
  confidence: z.number().min(0).max(100).optional()
});
export type UpsertReportAnnotationInput = z.infer<typeof upsertReportAnnotationSchema>;

export const settingsSchema = z.object({
  llmProvider: z.string().default("siliconflow"),
  model: z.string().optional(),
  embeddingModel: z.string().optional(),
  rpcUrlsConfigured: z.record(z.boolean()).default({}),
  dataRetentionDays: z.number().int().positive().default(365)
});
export type AppSettings = z.infer<typeof settingsSchema>;

export const retentionPreviewSchema = z.object({
  days: z.number().int().positive(),
  cutoff: z.string(),
  databaseReachable: z.boolean(),
  counts: z.object({
    researchTasks: z.number().default(0),
    reports: z.number().default(0),
    chatSessions: z.number().default(0),
    marketSnapshots: z.number().default(0),
    sourceDocuments: z.number().default(0)
  }),
  degradedReason: z.string().optional()
});
export type RetentionPreview = z.infer<typeof retentionPreviewSchema>;

export const pruneRetentionSchema = z.object({
  days: z.number().int().positive().optional(),
  dryRun: z.boolean().default(true)
});
export type PruneRetentionInput = z.infer<typeof pruneRetentionSchema>;

export const createWatchlistItemSchema = z.object({
  input: z.string().min(1),
  note: z.string().optional(),
  riskLevel: riskLevelSchema.optional(),
  monitorRules: z.record(z.unknown()).default({})
});
export type CreateWatchlistItemInput = z.infer<typeof createWatchlistItemSchema>;

export const updateWatchlistItemSchema = z.object({
  note: z.string().optional(),
  riskLevel: riskLevelSchema.optional(),
  monitorRules: z.record(z.unknown()).optional()
});
export type UpdateWatchlistItemInput = z.infer<typeof updateWatchlistItemSchema>;

export const watchlistItemSchema = z.object({
  id: z.string(),
  tokenId: z.string(),
  input: z.string(),
  note: z.string().optional(),
  riskLevel: riskLevelSchema.optional(),
  monitorRules: z.record(z.unknown()).default({}),
  createdAt: z.string()
});
export type WatchlistItem = z.infer<typeof watchlistItemSchema>;

export const chatRoleSchema = z.enum(["user", "assistant", "system", "tool"]);
export type ChatRole = z.infer<typeof chatRoleSchema>;

export const chatMessageSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  role: chatRoleSchema,
  content: z.string(),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.string()
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatSessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  messages: z.array(chatMessageSchema).default([])
});
export type ChatSession = z.infer<typeof chatSessionSchema>;

export const createChatSessionSchema = z.object({
  title: z.string().optional()
});
export type CreateChatSessionInput = z.infer<typeof createChatSessionSchema>;

export const createChatMessageSchema = z.object({
  content: z.string().min(1),
  role: chatRoleSchema.default("user"),
  triggerResearch: z.boolean().default(true)
});
export type CreateChatMessageInput = z.infer<typeof createChatMessageSchema>;

export const extensionKindSchema = z.enum(["core", "skill", "connector", "workflow"]);
export type ExtensionKind = z.infer<typeof extensionKindSchema>;

export const extensionStatusSchema = z.enum(["active", "disabled", "planned", "degraded"]);
export type ExtensionStatus = z.infer<typeof extensionStatusSchema>;

export const extensionCapabilitySchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  permissions: z.array(z.string()).default([]),
  inputSchema: z.string().optional(),
  outputSchema: z.string().optional()
});
export type ExtensionCapability = z.infer<typeof extensionCapabilitySchema>;

export const extensionManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  kind: extensionKindSchema,
  phase: z.string(),
  status: extensionStatusSchema,
  entrypoint: z.string().optional(),
  capabilities: z.array(extensionCapabilitySchema).default([]),
  degradedReason: z.string().optional()
});
export type ExtensionManifest = z.infer<typeof extensionManifestSchema>;

export const invokeExtensionSchema = z.object({
  capabilityId: z.string().optional(),
  input: z.record(z.unknown()).default({})
});
export type InvokeExtensionInput = z.infer<typeof invokeExtensionSchema>;

export const extensionInvocationAuditSchema = z.object({
  extensionId: z.string(),
  capabilityId: z.string(),
  permissions: z.array(z.string()).default([]),
  allowed: z.boolean(),
  mode: z.enum(["read_only", "write_or_provider"]),
  reason: z.string()
});
export type ExtensionInvocationAudit = z.infer<typeof extensionInvocationAuditSchema>;

export const agentShellStatusSchema = z.object({
  mode: z.literal("local_personal_agent"),
  piRuntime: z.record(z.unknown()),
  safetyModel: z.object({
    defaultToolPolicy: z.literal("read_only"),
    disabledToolClasses: z.array(z.string()).default([]),
    highRiskActions: z.array(z.string()).default([])
  }),
  extensions: z.array(extensionManifestSchema).default([])
});
export type AgentShellStatus = z.infer<typeof agentShellStatusSchema>;

export const createAgentMessageSchema = z.object({
  content: z.string().min(1),
  sessionId: z.string().optional(),
  extensionIds: z.array(z.string()).default([])
});
export type CreateAgentMessageInput = z.infer<typeof createAgentMessageSchema>;

export const createAgentResearchSessionSchema = createResearchTaskSchema.extend({
  sessionId: z.string().optional(),
  userMessage: z.string().optional()
});
export type CreateAgentResearchSessionInput = z.infer<typeof createAgentResearchSessionSchema>;

export const agentMessageResponseSchema = z.object({
  sessionId: z.string(),
  role: z.literal("assistant"),
  content: z.string(),
  provider: z.string(),
  model: z.string().optional(),
  degradedReason: z.string().optional(),
  activeTools: z.array(z.string()).default([]),
  toolCalls: z.array(z.record(z.unknown())).default([])
});
export type AgentMessageResponse = z.infer<typeof agentMessageResponseSchema>;
