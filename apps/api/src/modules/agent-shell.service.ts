import { Inject, Injectable } from "@nestjs/common";
import {
  getAgentRuntimeStatus,
  listRuntimeAdapters,
  runPersonalAgentTurnWithAgent,
  streamPersonalAgentTurnWithAgent
} from "@sp-agent/agent-runtime";
import type { PersonalAgentExtensionInvokeRequest, PersonalAgentTurnInput, PersonalAgentTurnResult } from "@sp-agent/agent-runtime";
import type { AgentMessageResponse, AgentShellStatus, CreateAgentMessageInput, ExtensionManifest, MemorySearchResult } from "@sp-agent/shared";
import type { LocalSkillRecord } from "@sp-agent/shared";
import { ChatService } from "./chat.service.js";
import { ExtensionsService } from "./extensions.service.js";
import { LocalSkillsService } from "./local-skills.service.js";

@Injectable()
export class AgentShellService {
  constructor(
    @Inject(ExtensionsService) private readonly extensionsService: ExtensionsService,
    @Inject(LocalSkillsService) private readonly localSkillsService: LocalSkillsService,
    @Inject(ChatService) private readonly chatService: ChatService
  ) {}

  async getStatus(): Promise<AgentShellStatus> {
    const extensionStatus = await this.extensionsService.list();
    const localSkills = await this.localSkillsService.activeManifests();
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
      extensions: [...extensionStatus.extensions, ...localSkills.map(toLocalSkillManifest)]
    };
  }

  async runMessage(input: CreateAgentMessageInput, metadata: Record<string, unknown> = { source: "agent.messages" }): Promise<AgentMessageResponse> {
    const prepared = await this.prepareTurn(input, metadata);
    const result = await runPersonalAgentTurnWithAgent(prepared.turnInput);
    await this.persistAssistantMessage(prepared.sessionId, result, prepared.memoryContext, metadata);

    return {
      sessionId: prepared.sessionId,
      role: "assistant",
      content: result.content,
      provider: result.provider,
      model: result.model,
      degradedReason: result.degradedReason,
      memoryContext: prepared.memoryContext,
      activeTools: result.activeTools ?? [],
      toolCalls: result.toolCalls ?? [],
      artifacts: result.artifacts ?? []
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
      await this.persistAssistantMessage(prepared.sessionId, event.result, prepared.memoryContext, metadata);
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
          toolCalls: event.result.toolCalls ?? [],
          artifacts: event.result.artifacts ?? []
        }
      };
    }
  }

  private async prepareTurn(input: CreateAgentMessageInput, metadata: Record<string, unknown>) {
    const extensionStatus = await this.extensionsService.list();
    const localSkills = await this.localSkillsService.activeManifests();
    const session = await this.chatService.getOrCreateSession(input.sessionId, { title: makeSessionTitle(input.content) });
    await this.chatService.createMessage(session.id, {
      role: "user",
      content: input.content,
      metadata
    });
    // Phase one deliberately keeps durable memory outside the runtime context.
    const memoryContext: MemorySearchResult[] = [];
    const allowedExtensions =
      input.extensionIds.length > 0
        ? extensionStatus.extensions.filter((extension) => input.extensionIds.includes(extension.id))
        : [...extensionStatus.extensions, ...localSkills.map(toLocalSkillManifest)];
    const agentVisibleExtensions = allowedExtensions
      .map((extension) => ({
        ...extension,
        capabilities: extension.capabilities.filter((capability) =>
          extension.id.startsWith("local.skill.") || this.extensionsService.getInvocationAudit(extension.id, capability.id).allowed
        )
      }))
      .filter((extension) => extension.capabilities.length > 0) as ExtensionManifest[];
    let loadedLocalSkillId: string | undefined;
    const turnInput: PersonalAgentTurnInput = {
      message: input.content,
      sessionId: session.id,
      memoryContext,
      extensionManifests: agentVisibleExtensions,
      safetyModel: extensionStatus.safetyModel,
      extensionInvoker: async (request) => {
        if (request.extensionId.startsWith("local.skill.")) loadedLocalSkillId = request.extensionId.slice("local.skill.".length);
        if (loadedLocalSkillId && !request.extensionId.startsWith("local.skill.")) {
          const skill = await this.localSkillsService.get(loadedLocalSkillId);
          const requestedTool = `${request.extensionId}.${request.capabilityId}`;
          if (!skill.requestedTools.includes(requestedTool)) {
            return { ok: false, status: "denied", degradedReason: `Local Skill ${loadedLocalSkillId} did not declare ${requestedTool}.` };
          }
        }
        return this.invokeAgentExtension(request);
      }
    };
    return { sessionId: session.id, memoryContext, turnInput };
  }

  private async invokeAgentExtension(request: PersonalAgentExtensionInvokeRequest) {
    if (request.extensionId.startsWith("local.skill.")) {
      try {
        const skillId = request.extensionId.slice("local.skill.".length);
        if (request.capabilityId === "skill.load_instructions") {
          return { ok: true, status: "completed", result: await this.localSkillsService.loadInstructions(skillId) };
        }
        if (request.capabilityId === "skill.read_reference") {
          const path = request.input.path;
          if (typeof path !== "string" || !path.trim()) return { ok: false, status: "denied", degradedReason: "Reference path is required." };
          return { ok: true, status: "completed", result: await this.localSkillsService.loadReference(skillId, path) };
        }
        return { ok: false, status: "denied", degradedReason: `Local Skill capability ${request.capabilityId} is not available.` };
      } catch (error) {
        return { ok: false, status: "failed", degradedReason: error instanceof Error ? error.message : "Local Skill could not be loaded." };
      }
    }
    const audit = this.extensionsService.getInvocationAudit(request.extensionId, request.capabilityId);
    if (!audit.allowed) {
      return {
        ok: false,
        status: "denied",
        permissionAudit: audit,
        degradedReason: "This agent turn requested an unavailable capability."
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

  private async persistAssistantMessage(sessionId: string, result: PersonalAgentTurnResult, memoryContext: MemorySearchResult[], metadata: Record<string, unknown>) {
    await this.chatService.createMessage(sessionId, {
      role: "assistant",
      content: result.content,
      metadata: {
        ...metadata,
        provider: result.provider,
        model: result.model,
        degradedReason: result.degradedReason,
        memoryContextCount: memoryContext.length,
        memoryContextDebug: memoryContext.map(toMemoryContextDebug),
        activeTools: result.activeTools ?? [],
        toolCalls: result.toolCalls ?? [],
        artifacts: result.artifacts ?? []
      }
    });
  }
}

function makeSessionTitle(content: string) {
  const clean = content.replace(/\s+/g, " ").trim();
  if (!clean) return "New Chat";
  return clean.length > 40 ? `${clean.slice(0, 40)}...` : clean;
}

function toMemoryContextDebug(memory: MemorySearchResult) {
  return {
    memoryId: memory.entry.id,
    kind: memory.entry.kind,
    score: memory.score,
    matchedTerms: memory.matchedTerms,
    rankingSignals: memory.rankingSignals,
    citation: memory.citation,
    debug: memory.debug
  };
}

function toLocalSkillManifest(skill: LocalSkillRecord): ExtensionManifest {
  return {
    id: `local.skill.${skill.id}`,
    name: skill.name,
    description: skill.description,
    kind: "skill",
    phase: "local-import",
    status: skill.status,
    capabilities: [
      {
        id: "skill.load_instructions",
        label: "Load Skill instructions",
        description: "Load this local Skill's instructions and declared API tools for the current turn.",
        permissions: ["skills:read"],
        inputSchema: "{}",
        outputSchema: "{ instructions: string, requestedTools: string[] }"
      },
      {
        id: "skill.read_reference",
        label: "Read Skill reference",
        description: "Read one file from this installed Skill package by its relative path.",
        permissions: ["skills:read"],
        inputSchema: "{ path: string }",
        outputSchema: "{ path: string, content: string }"
      }
    ]
  };
}
