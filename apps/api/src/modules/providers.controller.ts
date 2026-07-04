import { Controller, Get, Post } from "@nestjs/common";
import { getAgentRuntimeStatus } from "@sp-agent/agent-runtime";

@Controller("providers")
export class ProvidersController {
  @Get("status")
  async status() {
    return {
      providers: [
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
