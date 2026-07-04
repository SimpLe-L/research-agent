import { Body, Controller, Get, Inject, Post } from "@nestjs/common";
import { createAgentMessageSchema, createAgentResearchSessionSchema } from "@sp-agent/shared";
import { AgentShellService } from "./agent-shell.service.js";

@Controller("agent")
export class AgentShellController {
  constructor(@Inject(AgentShellService) private readonly agentShellService: AgentShellService) {}

  @Get("status")
  async status() {
    return this.agentShellService.getStatus();
  }

  @Post("messages")
  async message(@Body() body: unknown) {
    const input = createAgentMessageSchema.parse(body);
    return this.agentShellService.runMessage(input);
  }

  @Post("research-sessions")
  async researchSession(@Body() body: unknown) {
    const input = createAgentResearchSessionSchema.parse(body);
    return this.agentShellService.createResearchSession(input);
  }
}
