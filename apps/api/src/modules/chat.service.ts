import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  ChatMessage,
  ChatSession,
  CreateChatMessageInput,
  CreateChatSessionInput,
  UpdateChatSessionInput
} from "@sp-agent/shared";
import { LocalJsonStore } from "./local-json-store.service.js";

type ChatFile = {
  sessions: ChatSession[];
};

@Injectable()
export class ChatService {
  constructor(@Inject(LocalJsonStore) private readonly store: LocalJsonStore) {}

  async createSession(input: CreateChatSessionInput) {
    const now = new Date().toISOString();
    const session: ChatSession = {
      id: `chat_${crypto.randomUUID()}`,
      title: input.title?.trim() || "New Chat",
      createdAt: now,
      updatedAt: now,
      messages: []
    };
    const file = await this.readFile();
    file.sessions.push(session);
    await this.writeFile(file);
    return session;
  }

  async getOrCreateSession(id: string | undefined, input: CreateChatSessionInput = {}) {
    if (id) {
      const existing = await this.getSession(id);
      if (existing) return existing;
    }
    const now = new Date().toISOString();
    const session: ChatSession = {
      id: id?.trim() || `chat_${crypto.randomUUID()}`,
      title: input.title?.trim() || "New Chat",
      createdAt: now,
      updatedAt: now,
      messages: []
    };
    const file = await this.readFile();
    file.sessions.push(session);
    await this.writeFile(file);
    return session;
  }

  async listSessions() {
    return (await this.readFile()).sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getSession(id: string) {
    return (await this.readFile()).sessions.find((session) => session.id === id);
  }

  async updateSession(id: string, input: UpdateChatSessionInput) {
    const file = await this.readFile();
    const session = file.sessions.find((item) => item.id === id);
    if (!session) throw new NotFoundException(`Chat session ${id} not found`);
    session.title = input.title.trim();
    session.updatedAt = new Date().toISOString();
    await this.writeFile(file);
    return session;
  }

  async createMessage(sessionId: string, input: CreateChatMessageInput) {
    const file = await this.readFile();
    const session = file.sessions.find((item) => item.id === sessionId);
    if (!session) throw new NotFoundException(`Chat session ${sessionId} not found`);
    const message = this.appendMessage(session, {
      sessionId,
      role: input.role,
      content: input.content,
      metadata: input.metadata
    });
    await this.writeFile(file);
    return { message };
  }

  private appendMessage(session: ChatSession, input: Omit<ChatMessage, "id" | "createdAt">): ChatMessage {
    const message: ChatMessage = {
      ...input,
      id: `msg_${crypto.randomUUID()}`,
      createdAt: new Date().toISOString()
    };
    session.messages.push(message);
    session.updatedAt = message.createdAt;
    return message;
  }

  private async readFile(): Promise<ChatFile> {
    return this.store.read<ChatFile>("chat.json", { sessions: [] });
  }

  private async writeFile(file: ChatFile) {
    await this.store.write("chat.json", file);
  }
}
