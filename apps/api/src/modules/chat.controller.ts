import { Body, Controller, Get, Inject, NotFoundException, Param, Post } from "@nestjs/common";
import { createChatMessageSchema, createChatSessionSchema } from "@sp-agent/shared";
import { ChatService } from "./chat.service.js";

@Controller("chat/sessions")
export class ChatController {
  constructor(@Inject(ChatService) private readonly chatService: ChatService) {}

  @Post()
  async createSession(@Body() body: unknown) {
    const input = createChatSessionSchema.parse(body);
    return this.chatService.createSession(input);
  }

  @Get()
  async listSessions() {
    return {
      sessions: await this.chatService.listSessions()
    };
  }

  @Get(":id")
  async getSession(@Param("id") id: string) {
    const session = await this.chatService.getSession(id);
    if (!session) throw new NotFoundException(`Chat session ${id} not found`);
    return session;
  }

  @Post(":id/messages")
  async createMessage(@Param("id") id: string, @Body() body: unknown) {
    const input = createChatMessageSchema.parse(body);
    return this.chatService.createMessage(id, input);
  }
}

