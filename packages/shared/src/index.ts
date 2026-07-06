import { z } from "zod";

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

export const settingsSchema = z.object({
  llmProvider: z.string().default("pi"),
  model: z.string().optional(),
  dataRetentionDays: z.number().int().positive().default(365)
});
export type AppSettings = z.infer<typeof settingsSchema>;

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

export const updateChatSessionSchema = z.object({
  title: z.string().min(1).max(120)
});
export type UpdateChatSessionInput = z.infer<typeof updateChatSessionSchema>;

export const createChatMessageSchema = z.object({
  role: chatRoleSchema.default("user"),
  content: z.string().min(1),
  metadata: z.record(z.unknown()).default({})
});
export type CreateChatMessageInput = z.infer<typeof createChatMessageSchema>;

export const memoryScopeSchema = z.enum(["global", "session"]);
export type MemoryScope = z.infer<typeof memoryScopeSchema>;

export const memoryKindSchema = z.enum(["core", "journal", "summary", "procedural", "project"]);
export type MemoryKind = z.infer<typeof memoryKindSchema>;

export const memorySensitivitySchema = z.enum(["normal", "sensitive"]);
export type MemorySensitivity = z.infer<typeof memorySensitivitySchema>;

export const memorySourceSchema = z.object({
  type: z.enum(["user", "assistant", "import", "system", "voice"]),
  id: z.string().optional(),
  label: z.string().optional()
});
export type MemorySource = z.infer<typeof memorySourceSchema>;

export const memoryEntrySchema = z.object({
  id: z.string(),
  kind: memoryKindSchema.default("core"),
  scope: memoryScopeSchema.default("global"),
  sessionId: z.string().optional(),
  content: z.string(),
  source: memorySourceSchema,
  provenance: z.record(z.unknown()).default({}),
  confidence: z.number().min(0).max(1).default(0.7),
  sensitivity: memorySensitivitySchema.default("normal"),
  tags: z.array(z.string()).default([]),
  status: z.enum(["candidate", "active", "tombstoned"]).default("candidate"),
  supersedes: z.array(z.string()).default([]),
  conflictsWith: z.array(z.string()).default([]),
  conflictGroupId: z.string().optional(),
  conflictReason: z.string().optional(),
  occurredAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  promotedAt: z.string().optional(),
  tombstonedAt: z.string().optional()
});
export type MemoryEntry = z.infer<typeof memoryEntrySchema>;

export const createMemoryCandidateSchema = z.object({
  content: z.string().min(1),
  kind: memoryKindSchema.default("core"),
  scope: memoryScopeSchema.default("global"),
  sessionId: z.string().optional(),
  source: memorySourceSchema.default({ type: "user" }),
  provenance: z.record(z.unknown()).default({}),
  confidence: z.number().min(0).max(1).default(0.7),
  sensitivity: memorySensitivitySchema.default("normal"),
  occurredAt: z.string().optional(),
  tags: z.array(z.string()).default([])
});
export type CreateMemoryCandidateInput = z.infer<typeof createMemoryCandidateSchema>;

export const searchMemorySchema = z.object({
  query: z.string().min(1),
  strategy: z.enum(["auto", "core_semantic", "journal_temporal", "hybrid"]).default("auto"),
  kind: memoryKindSchema.optional(),
  scope: memoryScopeSchema.optional(),
  sessionId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  includeSensitive: z.coerce.boolean().default(false),
  statuses: z.preprocess(
    (value) => typeof value === "string" ? value.split(",").map((item) => item.trim()).filter(Boolean) : value,
    z.array(z.enum(["candidate", "active", "tombstoned"])).optional()
  ),
  limit: z.coerce.number().int().positive().max(50).default(10)
});
export type SearchMemoryInput = z.infer<typeof searchMemorySchema>;

export const memorySearchResultSchema = z.object({
  entry: memoryEntrySchema,
  score: z.number(),
  matchedTerms: z.array(z.string()).default([]),
  rankingSignals: z.array(z.string()).default([])
});
export type MemorySearchResult = z.infer<typeof memorySearchResultSchema>;

export const updateMemorySchema = z.object({
  content: z.string().min(1).optional(),
  kind: memoryKindSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  sensitivity: memorySensitivitySchema.optional(),
  tags: z.array(z.string()).optional(),
  provenance: z.record(z.unknown()).optional(),
  occurredAt: z.string().optional()
});
export type UpdateMemoryInput = z.infer<typeof updateMemorySchema>;

export const promoteMemorySchema = z.object({
  reason: z.string().min(1).default("Accepted by user or API policy.")
});
export type PromoteMemoryInput = z.infer<typeof promoteMemorySchema>;

export const mergeMemorySchema = z.object({
  sourceIds: z.array(z.string()).min(1),
  content: z.string().min(1),
  kind: memoryKindSchema.default("core"),
  reason: z.string().min(1).default("Merged related memories."),
  confidence: z.number().min(0).max(1).default(0.8),
  sensitivity: memorySensitivitySchema.default("normal"),
  occurredAt: z.string().optional(),
  tags: z.array(z.string()).default([])
});
export type MergeMemoryInput = z.infer<typeof mergeMemorySchema>;

export const memoryAuditEventSchema = z.object({
  id: z.string(),
  memoryId: z.string(),
  action: z.enum(["candidate_created", "promoted", "updated", "merged", "forgotten", "conflict_detected", "conflict_resolved"]),
  reason: z.string().optional(),
  sourceMemoryIds: z.array(z.string()).default([]),
  createdAt: z.string()
});
export type MemoryAuditEvent = z.infer<typeof memoryAuditEventSchema>;

export const approvalRequestSchema = z.object({
  id: z.string(),
  extensionId: z.string().optional(),
  capabilityId: z.string().optional(),
  action: z.string(),
  reason: z.string(),
  permissions: z.array(z.string()).default([]),
  input: z.record(z.unknown()).default({}),
  status: z.enum(["pending", "approved", "denied", "expired"]).default("pending"),
  createdAt: z.string(),
  updatedAt: z.string(),
  decidedAt: z.string().optional()
});
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;

export const createApprovalRequestSchema = z.object({
  extensionId: z.string().optional(),
  capabilityId: z.string().optional(),
  action: z.string().min(1),
  reason: z.string().min(1),
  permissions: z.array(z.string()).default([]),
  input: z.record(z.unknown()).default({})
});
export type CreateApprovalRequestInput = z.infer<typeof createApprovalRequestSchema>;

export const decideApprovalRequestSchema = z.object({
  decision: z.enum(["approved", "denied"]),
  reason: z.string().optional()
});
export type DecideApprovalRequestInput = z.infer<typeof decideApprovalRequestSchema>;

export const workflowNodeEventSchema = z.object({
  id: z.string(),
  nodeId: z.string(),
  label: z.string(),
  status: z.enum(["pending", "running", "completed", "failed", "cancelled"]),
  payload: z.record(z.unknown()).default({}),
  error: z.string().optional(),
  degradedReason: z.string().optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  createdAt: z.string()
});
export type WorkflowNodeEvent = z.infer<typeof workflowNodeEventSchema>;

export const workflowRunSchema = z.object({
  id: z.string(),
  kind: z.string(),
  status: z.enum(["pending", "running", "completed", "failed", "cancelled"]),
  input: z.record(z.unknown()).default({}),
  result: z.unknown().optional(),
  degradedReason: z.string().optional(),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  nodeEvents: z.array(workflowNodeEventSchema).default([])
});
export type WorkflowRun = z.infer<typeof workflowRunSchema>;

export const startWorkflowSchema = z.object({
  kind: z.string().min(1),
  input: z.record(z.unknown()).default({})
});
export type StartWorkflowInput = z.infer<typeof startWorkflowSchema>;

export const projectDocSearchSchema = z.object({
  query: z.string().min(1),
  limit: z.coerce.number().int().positive().max(10).default(5)
});
export type ProjectDocSearchInput = z.infer<typeof projectDocSearchSchema>;

export const localBookmarkSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().url(),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
  source: z.string().default("local-json"),
  createdAt: z.string()
});
export type LocalBookmark = z.infer<typeof localBookmarkSchema>;

export const localBookmarkConnectorFileSchema = z.object({
  bookmarks: z.array(localBookmarkSchema).default([])
});
export type LocalBookmarkConnectorFile = z.infer<typeof localBookmarkConnectorFileSchema>;

export const localBookmarkSearchSchema = z.object({
  query: z.string().min(1),
  limit: z.coerce.number().int().positive().max(20).default(5)
});
export type LocalBookmarkSearchInput = z.infer<typeof localBookmarkSearchSchema>;

export const speechProviderStatusSchema = z.object({
  name: z.string(),
  configured: z.boolean(),
  reachable: z.boolean(),
  degradedReason: z.string().optional()
});
export type SpeechProviderStatus = z.infer<typeof speechProviderStatusSchema>;

export const voiceStatusSchema = z.object({
  stt: speechProviderStatusSchema,
  tts: speechProviderStatusSchema,
  ready: z.boolean(),
  degradedReason: z.string().optional()
});
export type VoiceStatus = z.infer<typeof voiceStatusSchema>;

export const voiceTranscribeSchema = z.object({
  audioBase64: z.string().min(1),
  mimeType: z.string().default("audio/webm"),
  sessionId: z.string().optional()
});
export type VoiceTranscribeInput = z.infer<typeof voiceTranscribeSchema>;

export const voiceTranscribeResponseSchema = z.object({
  transcript: z.string().optional(),
  provider: z.string(),
  degradedReason: z.string().optional()
});
export type VoiceTranscribeResponse = z.infer<typeof voiceTranscribeResponseSchema>;

export const voiceSynthesizeSchema = z.object({
  text: z.string().min(1),
  voice: z.string().optional(),
  sessionId: z.string().optional()
});
export type VoiceSynthesizeInput = z.infer<typeof voiceSynthesizeSchema>;

export const voiceSynthesizeResponseSchema = z.object({
  audioBase64: z.string().optional(),
  mimeType: z.string().optional(),
  provider: z.string(),
  degradedReason: z.string().optional()
});
export type VoiceSynthesizeResponse = z.infer<typeof voiceSynthesizeResponseSchema>;

export const voiceChatSchema = z.object({
  audioBase64: z.string().min(1),
  mimeType: z.string().default("audio/webm"),
  sessionId: z.string().optional(),
  voice: z.string().optional()
});
export type VoiceChatInput = z.infer<typeof voiceChatSchema>;

export const voiceChatResponseSchema = z.object({
  sessionId: z.string(),
  transcript: z.string().optional(),
  assistantText: z.string(),
  audioBase64: z.string().optional(),
  mimeType: z.string().optional(),
  degradedReason: z.string().optional()
});
export type VoiceChatResponse = z.infer<typeof voiceChatResponseSchema>;

export const voiceAuditEventSchema = z.object({
  id: z.string(),
  action: z.enum([
    "voice.transcribe_requested",
    "voice.transcribe_completed",
    "voice.synthesize_requested",
    "voice.synthesize_completed",
    "voice.degraded"
  ]),
  sessionId: z.string().optional(),
  provider: z.string().optional(),
  status: z.enum(["requested", "completed", "degraded"]),
  degradedReason: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.string()
});
export type VoiceAuditEvent = z.infer<typeof voiceAuditEventSchema>;

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
  kind: z.enum(["core", "skill", "connector", "workflow"]),
  phase: z.string(),
  status: z.enum(["active", "disabled", "planned", "degraded"]),
  entrypoint: z.string().optional(),
  capabilities: z.array(extensionCapabilitySchema),
  degradedReason: z.string().optional()
});
export type ExtensionManifest = z.infer<typeof extensionManifestSchema>;

export const extensionInvocationAuditSchema = z.object({
  extensionId: z.string(),
  capabilityId: z.string(),
  permissions: z.array(z.string()).default([]),
  allowed: z.boolean(),
  mode: z.enum(["read_only", "write_or_provider"]),
  reason: z.string()
});
export type ExtensionInvocationAudit = z.infer<typeof extensionInvocationAuditSchema>;

export const invokeExtensionSchema = z.object({
  capabilityId: z.string().optional(),
  input: z.record(z.unknown()).default({}),
  approvalId: z.string().optional()
});
export type InvokeExtensionInput = z.infer<typeof invokeExtensionSchema>;

export const agentShellStatusSchema = z.object({
  mode: z.literal("local_personal_agent"),
  piRuntime: providerStatusSchema.extend({
    provider: z.string().optional(),
    sdkLoaded: z.boolean().optional(),
    selectedModelAvailable: z.boolean().optional(),
    availableModelCount: z.number().optional()
  }),
  runtimeAdapters: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      default: z.boolean()
    })
  ).default([]),
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

export const agentMessageResponseSchema = z.object({
  sessionId: z.string(),
  role: z.literal("assistant"),
  content: z.string(),
  provider: z.string(),
  model: z.string().optional(),
  degradedReason: z.string().optional(),
  memoryContext: z.array(memorySearchResultSchema).default([]),
  activeTools: z.array(z.string()).default([]),
  toolCalls: z.array(z.record(z.unknown())).default([])
});
export type AgentMessageResponse = z.infer<typeof agentMessageResponseSchema>;
