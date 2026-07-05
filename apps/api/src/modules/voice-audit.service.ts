import { Inject, Injectable } from "@nestjs/common";
import type { VoiceAuditEvent } from "@sp-agent/shared";
import { LocalJsonStore } from "./local-json-store.service.js";

type VoiceAuditFile = {
  events: VoiceAuditEvent[];
};

type RecordVoiceAuditInput = Omit<VoiceAuditEvent, "id" | "createdAt" | "metadata"> & {
  metadata?: Record<string, unknown>;
};

@Injectable()
export class VoiceAuditService {
  constructor(@Inject(LocalJsonStore) private readonly store: LocalJsonStore) {}

  async list(sessionId?: string) {
    const events = (await this.readFile()).events;
    return (sessionId ? events.filter((event) => event.sessionId === sessionId) : events).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async record(input: RecordVoiceAuditInput) {
    const file = await this.readFile();
    const event: VoiceAuditEvent = {
      id: `voice_audit_${crypto.randomUUID()}`,
      action: input.action,
      sessionId: input.sessionId,
      provider: input.provider,
      status: input.status,
      degradedReason: input.degradedReason,
      metadata: input.metadata ?? {},
      createdAt: new Date().toISOString()
    };
    file.events.push(event);
    await this.writeFile(file);
    return event;
  }

  private async readFile(): Promise<VoiceAuditFile> {
    const file = await this.store.read<VoiceAuditFile>("voice-audit.json", { events: [] });
    return { events: file.events ?? [] };
  }

  private async writeFile(file: VoiceAuditFile) {
    await this.store.write("voice-audit.json", file);
  }
}
