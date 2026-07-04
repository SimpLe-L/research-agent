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

export const memorySourceSchema = z.object({
  type: z.enum(["user", "assistant", "import", "system"]),
  id: z.string().optional(),
  label: z.string().optional()
});
export type MemorySource = z.infer<typeof memorySourceSchema>;

export const memoryEntrySchema = z.object({
  id: z.string(),
  scope: memoryScopeSchema.default("global"),
  sessionId: z.string().optional(),
  content: z.string(),
  source: memorySourceSchema,
  provenance: z.record(z.unknown()).default({}),
  confidence: z.number().min(0).max(1).default(0.7),
  tags: z.array(z.string()).default([]),
  status: z.enum(["active", "tombstoned"]).default("active"),
  createdAt: z.string(),
  updatedAt: z.string(),
  tombstonedAt: z.string().optional()
});
export type MemoryEntry = z.infer<typeof memoryEntrySchema>;

export const createMemoryCandidateSchema = z.object({
  content: z.string().min(1),
  scope: memoryScopeSchema.default("global"),
  sessionId: z.string().optional(),
  source: memorySourceSchema.default({ type: "user" }),
  provenance: z.record(z.unknown()).default({}),
  confidence: z.number().min(0).max(1).default(0.7),
  tags: z.array(z.string()).default([])
});
export type CreateMemoryCandidateInput = z.infer<typeof createMemoryCandidateSchema>;

export const searchMemorySchema = z.object({
  query: z.string().min(1),
  scope: memoryScopeSchema.optional(),
  sessionId: z.string().optional(),
  limit: z.coerce.number().int().positive().max(50).default(10)
});
export type SearchMemoryInput = z.infer<typeof searchMemorySchema>;

export const memorySearchResultSchema = z.object({
  entry: memoryEntrySchema,
  score: z.number()
});
export type MemorySearchResult = z.infer<typeof memorySearchResultSchema>;

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
  input: z.record(z.unknown()).default({})
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
