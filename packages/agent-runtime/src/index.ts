import { Type } from "typebox";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

type PiSdkModule = typeof import("@earendil-works/pi-coding-agent");
type PiModelRegistry = {
  registerProvider(provider: string, config: Record<string, unknown>): void;
  find(provider: string, modelId: string): unknown;
  getAvailable(): unknown[];
};

export type AgentRuntimeStatus = {
  provider: string;
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

export type PersonalAgentTurnInput = {
  message: string;
  sessionId?: string;
  memoryContext?: unknown[];
  extensionManifests?: unknown[];
  safetyModel?: unknown;
  extensionInvoker?: (request: PersonalAgentExtensionInvokeRequest) => Promise<PersonalAgentExtensionInvokeResult>;
};

export type PersonalAgentTurnResult = {
  content: string;
  provider: string;
  model?: string;
  degradedReason?: string;
  activeTools?: string[];
  toolCalls?: AgentRuntimeToolCallAudit[];
};

export type RuntimeAdapter = {
  id: string;
  label: string;
  default: boolean;
  getStatus(env?: NodeJS.ProcessEnv): Promise<AgentRuntimeStatus>;
  runTurn(input: PersonalAgentTurnInput, env?: NodeJS.ProcessEnv): Promise<PersonalAgentTurnResult>;
};

const piRuntimeAdapter: RuntimeAdapter = {
  id: "pi",
  label: "Pi",
  default: true,
  getStatus: getPiAgentRuntimeStatus,
  runTurn: runPiPersonalAgentTurn
};

const localDeterministicRuntimeAdapter: RuntimeAdapter = {
  id: "local-deterministic",
  label: "Local Deterministic",
  default: false,
  getStatus: async () => ({
    provider: "local-deterministic",
    configured: true,
    reachable: true
  }),
  runTurn: async (input) => {
    const memoryCount = input.memoryContext?.length ?? 0;
    const extensionCount = input.extensionManifests?.length ?? 0;
    return {
      content:
        `本地确定性 runtime 已接管本轮回复。收到用户消息：${truncateForReply(input.message)}\n` +
        `当前可见扩展 ${extensionCount} 个，检索到相关记忆 ${memoryCount} 条。该 adapter 不调用外部模型，适合作为离线降级和注册表验证路径。`,
      provider: "local-deterministic",
      model: "deterministic-v0",
      activeTools: []
    };
  }
};

const runtimeAdapters: RuntimeAdapter[] = [piRuntimeAdapter, localDeterministicRuntimeAdapter];

export function listRuntimeAdapters(): RuntimeAdapter[] {
  return runtimeAdapters;
}

export function getRuntimeAdapter(id: string): RuntimeAdapter | undefined {
  return runtimeAdapters.find((adapter) => adapter.id === id);
}

export function getSelectedRuntimeAdapter(env: NodeJS.ProcessEnv = process.env): RuntimeAdapter {
  const selected = env.AGENT_RUNTIME_PROVIDER || runtimeAdapters.find((adapter) => adapter.default)?.id || "pi";
  return getRuntimeAdapter(selected) ?? piRuntimeAdapter;
}

function truncateForReply(value: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > 80 ? `${clean.slice(0, 80)}...` : clean;
}

const inspectExtensionRegistryParams = Type.Object({
  maxChars: Type.Optional(Type.Number({ description: "Maximum JSON characters to return. Default 12000." }))
});

const invokeExtensionCapabilityParams = Type.Object({
  extensionId: Type.String({ description: "Registered extension id." }),
  capabilityId: Type.String({ description: "Registered capability id." }),
  inputJson: Type.Optional(Type.String({ description: "Optional JSON object string for the capability input." }))
});

export async function getAgentRuntimeStatus(env: NodeJS.ProcessEnv = process.env): Promise<AgentRuntimeStatus> {
  return getSelectedRuntimeAdapter(env).getStatus(env);
}

export async function runPersonalAgentTurnWithAgent(
  input: PersonalAgentTurnInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<PersonalAgentTurnResult> {
  return getSelectedRuntimeAdapter(env).runTurn(input, env);
}

async function getPiAgentRuntimeStatus(env: NodeJS.ProcessEnv = process.env): Promise<AgentRuntimeStatus> {
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
      availableModelCount
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

async function runPiPersonalAgentTurn(
  input: PersonalAgentTurnInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<PersonalAgentTurnResult> {
  const provider = piModelProvider(env);
  const modelId = piModelId(env);
  const modelLabel = `${provider}/${modelId}`;

  if (!piHasApiKey(provider, env)) {
    const memoryNote =
      input.memoryContext && input.memoryContext.length > 0
        ? ` 已检索到 ${input.memoryContext.length} 条相关本地记忆，但当前缺少模型密钥，未进入模型推理。`
        : "";
    return {
      content:
        `本地个人 agent 基座已启动。当前缺少 Pi 模型密钥，所以这次使用确定性降级回复；你仍然可以继续搭建 memory、speech 和 skills 边界。${memoryNote}`,
      provider: "pi",
      model: modelLabel,
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
        content: "Pi runtime 已选择，但当前模型不在 Pi model registry 中。本地 agent shell 保持降级可用。",
        provider: "pi",
        model: modelLabel,
        degradedReason: `Pi model ${provider}/${modelId} was not found in the Pi model registry.`
      };
    }

    const chunks: string[] = [];
    const toolCalls: AgentRuntimeToolCallAudit[] = [];
    let finalAssistantText = "";
    let finalMessages: unknown;
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
      const finalText = extractPiFinalAssistantText(event);
      if (finalText) finalAssistantText = finalText;
      const toolAudit = extractPiToolAudit(event);
      if (toolAudit) mergePiToolAudit(toolCalls, toolAudit);
    });
    const activeTools = session.getActiveToolNames?.() ?? appToolNames;

    try {
      await withTimeout(
        (async () => {
          await session.prompt(buildPiAgentShellPrompt(input), {
            expandPromptTemplates: false
          });
        })(),
        piRequestTimeoutMs(env),
        "Pi SDK personal agent turn timed out."
      );
    } finally {
      finalMessages = session.state?.messages ?? session.messages;
      unsubscribe();
      session.dispose();
    }

    const content = (chunks.join("").trim() || finalAssistantText || extractLastAssistantText(finalMessages) || "").trim();
    if (!content) {
      return {
        content: "Pi runtime 已返回空输出。本地 agent shell 保持降级可用。",
        provider: "pi",
        model: modelLabel,
        degradedReason: modelFallbackMessage ? `Pi SDK returned no assistant text. ${modelFallbackMessage}` : "Pi SDK returned no assistant text.",
        activeTools,
        toolCalls
      };
    }

    return {
      content,
      provider: "pi",
      model: modelLabel,
      degradedReason: modelFallbackMessage,
      activeTools,
      toolCalls
    };
  } catch (error) {
    return {
      content: "Pi runtime 调用失败。本地 agent shell 保持降级可用，后续可以继续走确定性本地能力。",
      provider: "pi",
      model: modelLabel,
      degradedReason: error instanceof Error ? error.message : "Pi SDK personal agent turn failed.",
      activeTools: ["inspect_extension_registry", "invoke_extension_capability"],
      toolCalls: []
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

function createPiAgentShellTools(input: PersonalAgentTurnInput): ToolDefinition[] {
  return [
    {
      name: "inspect_extension_registry",
      label: "Inspect extension registry",
      description: "Read the local app extension registry and safety policy. This tool is read-only.",
      promptSnippet: "Inspect local agent extensions and safety policy",
      promptGuidelines: ["Use this tool to explain available local skills.", "Do not claim an extension was executed."],
      parameters: inspectExtensionRegistryParams,
      async execute(_toolCallId, params) {
        const toolParams = params as { maxChars?: number };
        const maxChars = Number.isFinite(toolParams.maxChars) && toolParams.maxChars && toolParams.maxChars > 0 ? Math.min(toolParams.maxChars, 24000) : 12000;
        return {
          content: [
            {
              type: "text",
              text: truncateJson({ safetyModel: input.safetyModel, extensions: input.extensionManifests ?? [] }, maxChars)
            }
          ],
          details: { maxChars }
        };
      }
    },
    {
      name: "invoke_extension_capability",
      label: "Invoke extension capability",
      description: "Invoke one registered local extension capability through the app permission boundary.",
      promptSnippet: "Invoke a registered local extension capability through the permissioned app boundary",
      promptGuidelines: [
        "Use this only for read-only/search capabilities unless the API explicitly allows more.",
        "Never request wallet, posting, shell, file-write, browser-control, or credential actions.",
        "Always report permissionAudit if invocation is denied or degraded."
      ],
      parameters: invokeExtensionCapabilityParams,
      async execute(_toolCallId, params) {
        const toolParams = params as { extensionId?: string; capabilityId?: string; inputJson?: string };
        if (!input.extensionInvoker) {
          return {
            content: [{ type: "text", text: truncateJson({ ok: false, status: "denied", degradedReason: "The API shell did not provide an extension invoker." }, 4000) }],
            details: { ok: false, status: "denied" }
          };
        }
        if (!toolParams.extensionId || !toolParams.capabilityId) {
          return {
            content: [{ type: "text", text: truncateJson({ ok: false, status: "denied", degradedReason: "extensionId and capabilityId are required." }, 4000) }],
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
      "You are the Pi runtime for a local-first single-user personal Agent OS. Reply in concise Chinese. You may use provided memoryContext as retrieved local memory. You may inspect the extension registry, but you must not claim to execute skills unless a tool result proves it. Do not request private keys. Do not suggest wallet transactions, swaps, transfers, posting automation, shell tools, file-write tools, or unrestricted browser control. Speech is a planned app-owned layer; describe it as planned unless tool results prove availability. Keep the response under 10 lines.",
    userMessage: input.message,
    sessionId: input.sessionId,
    memoryContext: input.memoryContext ?? [],
    availableAppTools: [
      "inspect_extension_registry: read local extensions and safety policy only",
      "invoke_extension_capability: invoke allowed extension capabilities through the API permission boundary"
    ],
    extensionInvocationPolicy:
      "Only API-allowed capability invocations may run. Shell/file/browser/wallet/posting actions are unavailable in this v0.x path.",
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

function truncateDeepStrings(value: unknown, maxChars: number): unknown {
  if (typeof value === "string") return value.length > maxChars ? `${value.slice(0, maxChars)}...` : value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => truncateDeepStrings(item, maxChars));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, truncateDeepStrings(nested, maxChars)]));
  }
  return value;
}

function truncateJson(value: unknown, maxChars: number): string {
  const text = JSON.stringify(value, null, 2);
  return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;
}

function extractPiTextDelta(event: unknown): string | undefined {
  const record = event as Record<string, unknown>;
  const assistantMessageEvent = record.assistantMessageEvent as Record<string, unknown> | undefined;
  if (record.type === "message_update" && assistantMessageEvent?.type === "text_delta" && typeof assistantMessageEvent.delta === "string") {
    return assistantMessageEvent.delta;
  }
  const delta = record.delta ?? record.textDelta ?? record.contentDelta;
  if (typeof delta === "string") return delta;
  const message = record.message as Record<string, unknown> | undefined;
  const content = message?.content ?? record.content;
  return typeof content === "string" ? content : undefined;
}

function extractPiFinalAssistantText(event: unknown): string | undefined {
  const record = event as Record<string, unknown>;
  if (record.type === "agent_end" && Array.isArray(record.messages)) {
    return extractLastAssistantText(record.messages);
  }
  if (record.type === "message_end") {
    return extractMessageText(record.message);
  }
  return undefined;
}

function extractPiToolAudit(event: unknown): AgentRuntimeToolCallAudit | undefined {
  const record = event as Record<string, unknown>;
  const toolExecution = (record.toolExecution ?? record.toolCall ?? record.tool) as Record<string, unknown> | undefined;
  const toolName = record.toolName ?? toolExecution?.toolName ?? toolExecution?.name ?? record.name;
  if (typeof toolName !== "string") return undefined;
  return {
    toolCallId: typeof record.toolCallId === "string" ? record.toolCallId : undefined,
    toolName,
    input: record.input,
    isError: Boolean(record.isError),
    outputPreview: extractPiToolResultPreview(record.content)
  };
}

function extractLastAssistantText(messages: unknown): string | undefined {
  if (!Array.isArray(messages)) return undefined;
  for (const item of [...messages].reverse()) {
    const text = extractMessageText(item);
    if (text) return text;
  }
  return undefined;
}

function extractMessageText(message: unknown): string | undefined {
  const record = message as Record<string, unknown> | undefined;
  if (!record || record.role !== "assistant") return undefined;
  const content = record.content;
  if (typeof content === "string") return content.trim() || undefined;
  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === "string") return part;
        const partRecord = part as Record<string, unknown>;
        return typeof partRecord.text === "string" ? partRecord.text : "";
      })
      .join("")
      .trim();
    return text || undefined;
  }
  return undefined;
}


function mergePiToolAudit(toolCalls: AgentRuntimeToolCallAudit[], audit: AgentRuntimeToolCallAudit): void {
  const index = toolCalls.findIndex((item) => item.toolCallId && item.toolCallId === audit.toolCallId);
  if (index >= 0) {
    toolCalls[index] = { ...toolCalls[index], ...audit };
    return;
  }
  toolCalls.push(audit);
}

function extractPiToolResultPreview(content: unknown): string | undefined {
  if (typeof content === "string") return content.slice(0, 500);
  if (content === undefined) return undefined;
  return JSON.stringify(content).slice(0, 500);
}

function piRequestTimeoutMs(env: NodeJS.ProcessEnv): number {
  const value = Number(env.PI_AGENT_RUNTIME_TIMEOUT_MS);
  if (Number.isFinite(value) && value > 0) return value;
  return 120000;
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

function registerSiliconFlowPiProvider(modelRegistry: PiModelRegistry, env: NodeJS.ProcessEnv): void {
  modelRegistry.registerProvider("siliconflow", {
    name: "SiliconFlow",
    baseUrl: env.SILICONFLOW_BASE_URL ?? "https://api.siliconflow.cn/v1",
    apiKey: env.SILICONFLOW_API_KEY || "$SILICONFLOW_API_KEY",
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

function parsePiThinkingLevel(value: string | undefined): "off" | "minimal" | "low" | "medium" | "high" | "xhigh" {
  if (value === "off" || value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh") {
    return value;
  }
  return "off";
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
