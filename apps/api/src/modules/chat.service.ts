import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
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

type ChatSessionRow = QueryResultRow & {
  id: string;
  title: string;
  created_at: Date | string;
  updated_at: Date | string;
};

type ChatMessageRow = QueryResultRow & {
  id: string;
  session_id: string;
  role: ChatMessage["role"];
  content: string;
  metadata_json: Record<string, unknown>;
  created_at: Date | string;
};

@Injectable()
export class ChatService {
  private readonly pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : undefined;
  private dbReady: Promise<boolean> | undefined;

  constructor(@Inject(LocalJsonStore) private readonly store: LocalJsonStore) {}

  async createSession(input: CreateChatSessionInput) {
    if (await this.canUsePostgres()) return this.createPostgresSession(input);
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
    if (await this.canUsePostgres()) return this.createPostgresSession(input, id?.trim() || undefined);
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
    if (await this.canUsePostgres()) {
      const result = await this.query<ChatSessionRow>(
        "select id, title, created_at, updated_at from chat_sessions where exists (select 1 from chat_messages where chat_messages.session_id = chat_sessions.id) order by updated_at desc"
      );
      return result.rows.map((row) => toChatSession(row, []));
    }
    return (await this.readFile()).sessions.filter((session) => (session.messages?.length ?? 0) > 0).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getSession(id: string) {
    if (await this.canUsePostgres()) return this.getPostgresSession(id);
    return (await this.readFile()).sessions.find((session) => session.id === id);
  }

  async updateSession(id: string, input: UpdateChatSessionInput) {
    if (await this.canUsePostgres()) {
      const result = await this.query<ChatSessionRow>(
        "update chat_sessions set title = $2, updated_at = now() where id = $1 returning id, title, created_at, updated_at",
        [id, input.title.trim()]
      );
      const row = result.rows[0];
      if (!row) throw new NotFoundException(`Chat session ${id} not found`);
      const messages = await this.listPostgresMessages(id);
      return toChatSession(row, messages);
    }
    const file = await this.readFile();
    const session = file.sessions.find((item) => item.id === id);
    if (!session) throw new NotFoundException(`Chat session ${id} not found`);
    session.title = input.title.trim();
    session.updatedAt = new Date().toISOString();
    await this.writeFile(file);
    return session;
  }

  async deleteSession(id: string) {
    if (await this.canUsePostgres()) {
      const deleted = await this.withClient(async (client) => {
        await client.query("begin");
        try {
          const session = await client.query<{ id: string }>("select id from chat_sessions where id = $1", [id]);
          if (!session.rows[0]) throw new NotFoundException(`Chat session ${id} not found`);
          await client.query("delete from chat_messages where session_id = $1", [id]);
          await client.query("delete from chat_sessions where id = $1", [id]);
          await client.query("commit");
          return session.rows[0].id;
        } catch (error) {
          await client.query("rollback");
          throw error;
        }
      });
      return { deleted: true, sessionId: deleted };
    }
    const file = await this.readFile();
    const index = file.sessions.findIndex((item) => item.id === id);
    if (index === -1) throw new NotFoundException(`Chat session ${id} not found`);
    const [session] = file.sessions.splice(index, 1);
    await this.writeFile(file);
    return { deleted: true, sessionId: session.id };
  }

  async createMessage(sessionId: string, input: CreateChatMessageInput) {
    if (await this.canUsePostgres()) {
      const message = await this.createPostgresMessage(sessionId, input);
      return { message };
    }
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

  private async canUsePostgres() {
    if (!this.pool) return false;
    this.dbReady ??= this.ensurePostgresSchema()
      .then(() => true)
      .catch((error) => {
        console.warn(`ChatService falling back to local JSON store: ${error instanceof Error ? error.message : "Postgres unavailable"}`);
        return false;
      });
    return this.dbReady;
  }

  private async ensurePostgresSchema() {
    await this.query(`
      create table if not exists chat_sessions (
        id text primary key,
        title text not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `);
    await this.query(`
      create table if not exists chat_messages (
        id text primary key,
        session_id text not null,
        role text not null,
        content text not null,
        metadata_json jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      )
    `);
    await this.query("create index if not exists chat_messages_session_created_idx on chat_messages (session_id, created_at)");
  }

  private async createPostgresSession(input: CreateChatSessionInput, id = `chat_${crypto.randomUUID()}`) {
    const result = await this.query<ChatSessionRow>(
      "insert into chat_sessions (id, title) values ($1, $2) returning id, title, created_at, updated_at",
      [id, input.title?.trim() || "New Chat"]
    );
    return toChatSession(result.rows[0], []);
  }

  private async getPostgresSession(id: string) {
    const result = await this.query<ChatSessionRow>("select id, title, created_at, updated_at from chat_sessions where id = $1", [id]);
    const row = result.rows[0];
    if (!row) return undefined;
    return toChatSession(row, await this.listPostgresMessages(id));
  }

  private async listPostgresMessages(sessionId: string) {
    const result = await this.query<ChatMessageRow>(
      "select id, session_id, role, content, metadata_json, created_at from chat_messages where session_id = $1 order by created_at asc",
      [sessionId]
    );
    return result.rows.map(toChatMessage);
  }

  private async createPostgresMessage(sessionId: string, input: CreateChatMessageInput) {
    const session = await this.query<{ id: string }>("select id from chat_sessions where id = $1", [sessionId]);
    if (!session.rows[0]) throw new NotFoundException(`Chat session ${sessionId} not found`);
    const result = await this.withClient(async (client) => {
      await client.query("begin");
      try {
        const message = await client.query<ChatMessageRow>(
          `insert into chat_messages (id, session_id, role, content, metadata_json)
           values ($1, $2, $3, $4, $5::jsonb)
           returning id, session_id, role, content, metadata_json, created_at`,
          [`msg_${crypto.randomUUID()}`, sessionId, input.role, input.content, JSON.stringify(input.metadata ?? {})]
        );
        await client.query("update chat_sessions set updated_at = $2 where id = $1", [sessionId, message.rows[0].created_at]);
        await client.query("commit");
        return message.rows[0];
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    });
    return toChatMessage(result);
  }

  private async query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) {
    if (!this.pool) throw new Error("DATABASE_URL is not configured.");
    return this.pool.query<T>(text, values);
  }

  private async withClient<T>(fn: (client: PoolClient) => Promise<T>) {
    if (!this.pool) throw new Error("DATABASE_URL is not configured.");
    const client = await this.pool.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toChatSession(row: ChatSessionRow, messages: ChatMessage[]): ChatSession {
  return {
    id: row.id,
    title: row.title,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    messages
  };
}

function toChatMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    metadata: row.metadata_json ?? {},
    createdAt: toIsoString(row.created_at)
  };
}
