import { Inject, Injectable } from "@nestjs/common";
import {
  getAgentRuntimeStatus,
  listRuntimeAdapters,
  runPersonalAgentTurnWithAgent,
  streamPersonalAgentTurnWithAgent
} from "@sp-agent/agent-runtime";
import type { PersonalAgentExtensionInvokeRequest, PersonalAgentTurnInput, PersonalAgentTurnResult } from "@sp-agent/agent-runtime";
import type { AgentMessageResponse, AgentShellStatus, CreateAgentMessageInput } from "@sp-agent/shared";
import { ChatService } from "./chat.service.js";
import { ExtensionsService, isReadOnlyExtensionCapability } from "./extensions.service.js";
import { MemoryService } from "./memory.service.js";

@Injectable()
export class AgentShellService {
  constructor(
    @Inject(ExtensionsService) private readonly extensionsService: ExtensionsService,
    @Inject(MemoryService) private readonly memoryService: MemoryService,
    @Inject(ChatService) private readonly chatService: ChatService
  ) {}

  async getStatus(): Promise<AgentShellStatus> {
    const extensionStatus = await this.extensionsService.list();
    return {
      mode: "local_personal_agent",
      piRuntime: {
        name: "agent-runtime",
        ...(await getAgentRuntimeStatus())
      },
      runtimeAdapters: listRuntimeAdapters().map((adapter) => ({
        id: adapter.id,
        label: adapter.label,
        default: adapter.default
      })),
      safetyModel: extensionStatus.safetyModel,
      extensions: extensionStatus.extensions
    };
  }

  async runMessage(input: CreateAgentMessageInput, metadata: Record<string, unknown> = { source: "agent.messages" }): Promise<AgentMessageResponse> {
    const prepared = await this.prepareTurn(input, metadata);
    const result = await runPersonalAgentTurnWithAgent(prepared.turnInput);
    await this.persistAssistantMessage(prepared.sessionId, result, prepared.memoryContext.length, metadata);

    return {
      sessionId: prepared.sessionId,
      role: "assistant",
      content: result.content,
      provider: result.provider,
      model: result.model,
      degradedReason: result.degradedReason,
      memoryContext: prepared.memoryContext,
      activeTools: result.activeTools ?? [],
      toolCalls: result.toolCalls ?? []
    };
  }

  async *streamMessage(input: CreateAgentMessageInput, metadata: Record<string, unknown> = { source: "agent.messages.stream" }) {
    const prepared = await this.prepareTurn(input, metadata);
    yield {
      type: "metadata",
      sessionId: prepared.sessionId,
      memoryContextCount: prepared.memoryContext.length
    };
    for await (const event of streamPersonalAgentTurnWithAgent(prepared.turnInput)) {
      if (event.type === "text_delta") {
        yield event;
        continue;
      }
      await this.persistAssistantMessage(prepared.sessionId, event.result, prepared.memoryContext.length, metadata);
      yield {
        type: "done",
        sessionId: prepared.sessionId,
        result: {
          sessionId: prepared.sessionId,
          role: "assistant",
          content: event.result.content,
          provider: event.result.provider,
          model: event.result.model,
          degradedReason: event.result.degradedReason,
          memoryContext: prepared.memoryContext,
          activeTools: event.result.activeTools ?? [],
          toolCalls: event.result.toolCalls ?? []
        }
      };
    }
  }

  private async prepareTurn(input: CreateAgentMessageInput, metadata: Record<string, unknown>) {
    const extensionStatus = await this.extensionsService.list();
    const session = await this.chatService.getOrCreateSession(input.sessionId, { title: makeSessionTitle(input.content) });
    await this.chatService.createMessage(session.id, {
      role: "user",
      content: input.content,
      metadata
    });
    const memoryContext = await this.memoryService
      .retrieveForAgent({
        query: input.content,
        sessionId: session.id,
        limit: 5
      })
      .then((result) => result.memories);
    const allowedExtensions =
      input.extensionIds.length > 0
        ? extensionStatus.extensions.filter((extension) => input.extensionIds.includes(extension.id))
        : extensionStatus.extensions;
    const turnInput: PersonalAgentTurnInput = {
      message: input.content,
      sessionId: session.id,
      memoryContext,
      extensionManifests: allowedExtensions,
      safetyModel: extensionStatus.safetyModel,
      extensionInvoker: (request) => this.invokeReadOnlyExtension(request)
    };
    return { sessionId: session.id, memoryContext, turnInput };
  }

  private async invokeReadOnlyExtension(request: PersonalAgentExtensionInvokeRequest) {
    const audit = this.extensionsService.getInvocationAudit(request.extensionId, request.capabilityId);
    if (!isReadOnlyExtensionCapability(audit)) {
      return {
        ok: false,
        status: "denied",
        permissionAudit: audit,
        degradedReason: "This agent turn only allows read-only/search extension capabilities."
      };
    }
    try {
      const response = await this.extensionsService.invoke(request.extensionId, {
        capabilityId: request.capabilityId,
        input: request.input
      });
      return {
        ok: !response.degradedReason,
        status: response.status,
        result: response.result,
        degradedReason: response.degradedReason,
        permissionAudit: response.permissionAudit
      };
    } catch (error) {
      return {
        ok: false,
        status: "failed",
        permissionAudit: audit,
        degradedReason: error instanceof Error ? error.message : "Extension invocation failed."
      };
    }
  }

  private async persistAssistantMessage(sessionId: string, result: PersonalAgentTurnResult, memoryContextCount: number, metadata: Record<string, unknown>) {
    await this.chatService.createMessage(sessionId, {
      role: "assistant",
      content: result.content,
      metadata: {
        ...metadata,
        provider: result.provider,
        model: result.model,
        degradedReason: result.degradedReason,
        memoryContextCount,
        activeTools: result.activeTools ?? [],
        toolCalls: result.toolCalls ?? []
      }
    });
  }
}

function makeSessionTitle(content: string) {
  const clean = content.replace(/\s+/g, " ").trim();
  if (!clean) return "New Chat";
  return clean.length > 40 ? `${clean.slice(0, 40)}...` : clean;
}
