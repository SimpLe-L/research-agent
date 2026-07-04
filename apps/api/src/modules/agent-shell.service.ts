import { Inject, Injectable } from "@nestjs/common";
import { getAgentRuntimeStatus, runPersonalAgentTurnWithAgent } from "@sp-agent/agent-runtime";
import { getExtensionRuntimeStatus } from "@sp-agent/extensions";
import type { AgentMessageResponse, AgentShellStatus, CreateAgentMessageInput, CreateAgentResearchSessionInput } from "@sp-agent/shared";
import { ExtensionsService, isReadOnlyExtensionCapability } from "./extensions.service.js";
import { ResearchService } from "./research.service.js";

const piResearchSessionToolPlan = [
  "resolve_asset",
  "collect_sources",
  "fetch_market_data",
  "fetch_onchain_data",
  "analyze_risk",
  "search_knowledge",
  "write_report",
  "index_knowledge"
];

@Injectable()
export class AgentShellService {
  constructor(
    @Inject(ExtensionsService) private readonly extensionsService: ExtensionsService,
    @Inject(ResearchService) private readonly researchService: ResearchService
  ) {}

  async getStatus(): Promise<AgentShellStatus> {
    const extensionStatus = getExtensionRuntimeStatus();
    return {
      mode: "local_personal_agent",
      piRuntime: await getAgentRuntimeStatus(),
      safetyModel: extensionStatus.safetyModel,
      extensions: extensionStatus.extensions
    };
  }

  async runMessage(input: CreateAgentMessageInput): Promise<AgentMessageResponse> {
    const extensionStatus = getExtensionRuntimeStatus();
    const allowedExtensions =
      input.extensionIds.length > 0
        ? extensionStatus.extensions.filter((extension) => input.extensionIds.includes(extension.id))
        : extensionStatus.extensions;
    const result = await runPersonalAgentTurnWithAgent({
      message: input.content,
      sessionId: input.sessionId,
      extensionManifests: allowedExtensions,
      safetyModel: extensionStatus.safetyModel,
      extensionInvoker: async (request) => {
        const audit = this.extensionsService.getInvocationAudit(request.extensionId, request.capabilityId);
        if (!isReadOnlyExtensionCapability(audit)) {
          return {
            ok: false,
            status: "denied",
            permissionAudit: audit,
            degradedReason:
              "This agent turn only allows read-only/search extension capabilities. Use the app UI or explicit API routes for write/provider/task/indexing actions."
          };
        }
        try {
          const result = await this.extensionsService.invoke(request.extensionId, {
            capabilityId: request.capabilityId,
            input: request.input
          });
          return {
            ok: !result.degradedReason,
            status: result.status,
            result: result.result,
            degradedReason: result.degradedReason,
            permissionAudit: result.permissionAudit
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
    });

    return {
      sessionId: input.sessionId ?? `agent_session_${Date.now()}`,
      role: "assistant",
      content: result.content,
      provider: result.provider,
      model: result.model,
      degradedReason: result.degradedReason,
      activeTools: result.activeTools ?? [],
      toolCalls: result.toolCalls ?? []
    };
  }

  async createResearchSession(input: CreateAgentResearchSessionInput) {
    const created = await this.researchService.create({
      input: input.input,
      inputType: input.inputType,
      question: input.question,
      options: input.options
    }, undefined, { agentResearchSession: true });
    const audit = this.extensionsService.getInvocationAudit("web3.research", "research.create_task");
    const task = await this.researchService.recordAgentResearchSessionStarted(created.task.id, {
      coordinator: "pi",
      sessionId: input.sessionId,
      userMessage: input.userMessage,
      extensionId: audit.extensionId,
      capabilityId: audit.capabilityId,
      permissionMode: audit.mode,
      permissions: audit.permissions,
      plannedTools: piResearchSessionToolPlan,
      fallback: "deterministic_task_graph"
    });

    return {
      mode: "pi_research_session",
      coordinator: "pi",
      plannedTools: piResearchSessionToolPlan,
      permissionAudit: audit,
      task: task ?? created.task,
      queued: created.queued
    };
  }
}
