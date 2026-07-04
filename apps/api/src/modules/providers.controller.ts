import { Controller, Get, Inject, Post } from "@nestjs/common";
import { getAgentRuntimeStatus } from "@sp-agent/agent-runtime";
import { getProviderStatuses } from "@sp-agent/data-connectors";
import { DatabaseService } from "./database.service.js";

@Controller("providers")
export class ProvidersController {
  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  @Get("status")
  async status() {
    const vectorStatus = await this.databaseService.getVectorStore().status();
    return {
      providers: [
        this.databaseService.getStatus(),
        ...(await getProviderStatuses(process.env)),
        {
          name: "lancedb",
          ...vectorStatus
        },
        {
          name: "agent-runtime",
          ...(await getAgentRuntimeStatus())
        }
      ]
    };
  }

  @Post("verify")
  async verify() {
    return this.status();
  }
}
