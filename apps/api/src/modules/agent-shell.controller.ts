import { Body, Controller, Get, Inject, Post, Res } from "@nestjs/common";
import { createAgentMessageSchema } from "@sp-agent/shared";
import { AgentShellService } from "./agent-shell.service.js";

type SseResponse = {
  setHeader(name: string, value: string): void;
  flushHeaders?: () => void;
  write(chunk: string): void;
  end(): void;
};

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

  @Post("messages/stream")
  async messageStream(@Body() body: unknown, @Res() res: SseResponse) {
    const input = createAgentMessageSchema.parse(body);
    res.setHeader("content-type", "text/event-stream; charset=utf-8");
    res.setHeader("cache-control", "no-cache, no-transform");
    res.setHeader("connection", "keep-alive");
    res.flushHeaders?.();
    try {
      for await (const event of this.agentShellService.streamMessage(input)) {
        res.write(`event: ${event.type}\n`);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (error) {
      res.write("event: error\n");
      res.write(`data: ${JSON.stringify({ type: "error", message: error instanceof Error ? error.message : "Agent stream failed." })}\n\n`);
    } finally {
      res.end();
    }
  }
}
