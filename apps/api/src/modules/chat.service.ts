import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ChatMessage, ChatSession, CreateChatMessageInput, CreateChatSessionInput } from "@sp-agent/shared";
import { DatabaseService } from "./database.service.js";
import { ResearchService } from "./research.service.js";

@Injectable()
export class ChatService {
  private readonly fallbackSessions = new Map<string, ChatSession>();

  constructor(
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
    @Inject(ResearchService) private readonly researchService: ResearchService
  ) {}

  async createSession(input: CreateChatSessionInput) {
    const title = input.title?.trim() || "New research chat";
    const repository = this.databaseService.getResearchRepository();
    if (repository) return repository.createChatSession(title);

    const session: ChatSession = {
      id: `chat_${crypto.randomUUID()}`,
      title,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: []
    };
    this.fallbackSessions.set(session.id, session);
    return session;
  }

  async listSessions() {
    const repository = this.databaseService.getResearchRepository();
    if (repository) return repository.listChatSessions();
    return Array.from(this.fallbackSessions.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getSession(id: string) {
    const repository = this.databaseService.getResearchRepository();
    return (repository ? await repository.getChatSession(id) : undefined) ?? this.fallbackSessions.get(id);
  }

  async createMessage(sessionId: string, input: CreateChatMessageInput) {
    const session = await this.getSession(sessionId);
    if (!session) throw new NotFoundException(`Chat session ${sessionId} not found`);

    const userMessage = await this.appendMessage({
      sessionId,
      role: input.role,
      content: input.content,
      metadata: {}
    });

    if (input.role !== "user" || !input.triggerResearch) {
      return { message: userMessage };
    }

    const result = await this.researchService.create({
      input: extractResearchInput(input.content),
      inputType: "auto",
      question: input.content,
      options: {
        deepResearch: false,
        includeSocial: true,
        includeOnchain: true,
        includeSimilarCases: true
      }
    });

    const assistantMessage = await this.appendMessage({
      sessionId,
      role: "assistant",
      content: [
        "Research task started. The report will appear when the task completes.",
        "",
        `Task: ${result.task.id}`,
        `Status: ${result.task.status}`
      ].join("\n"),
      metadata: {
        taskId: result.task.id,
        queued: result.queued
      }
    });

    return {
      message: userMessage,
      assistantMessage,
      task: result.task
    };
  }

  private async appendMessage(input: Omit<ChatMessage, "id" | "createdAt">): Promise<ChatMessage> {
    const repository = this.databaseService.getResearchRepository();
    if (repository) return repository.appendChatMessage(input);

    const message: ChatMessage = {
      ...input,
      id: `msg_${crypto.randomUUID()}`,
      createdAt: new Date().toISOString()
    };
    const session = this.fallbackSessions.get(input.sessionId);
    if (session) {
      session.messages.push(message);
      session.updatedAt = message.createdAt;
    }
    return message;
  }
}

function extractResearchInput(content: string): string {
  const evm = content.match(/0x[a-fA-F0-9]{40}/);
  if (evm) return evm[0];
  const solana = content.match(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/);
  if (solana) return solana[0];
  const symbol = content.match(/\b[A-Z0-9]{2,12}\b/);
  if (symbol) return symbol[0];
  return content.trim();
}
