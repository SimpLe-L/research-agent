import { Inject, Injectable } from "@nestjs/common";
import { remoteResearchAccessSchema, type RemoteResearchAccess } from "@sp-agent/shared";
import { LocalJsonStore } from "./local-json-store.service.js";

type RemoteResearchAccessAudit = {
  id: string;
  action: "enabled" | "disabled";
  approvalId?: string;
  createdAt: string;
};

@Injectable()
export class ResearchAccessService {
  constructor(@Inject(LocalJsonStore) private readonly store: LocalJsonStore) {}

  async get(): Promise<RemoteResearchAccess> {
    return remoteResearchAccessSchema.parse(await this.store.read("research-access.json", { enabled: false }));
  }

  async isEnabled() {
    return (await this.get()).enabled;
  }

  async enableFromApproval(approvalId: string) {
    const current = await this.get();
    if (current.enabled) return current;
    const updatedAt = new Date().toISOString();
    const next = remoteResearchAccessSchema.parse({ enabled: true, updatedAt, approvalId });
    await this.store.write("research-access.json", next);
    await this.appendAudit({ action: "enabled", approvalId, createdAt: updatedAt });
    return next;
  }

  async disable() {
    const current = await this.get();
    if (!current.enabled) return current;
    const updatedAt = new Date().toISOString();
    const next = remoteResearchAccessSchema.parse({ enabled: false, updatedAt });
    await this.store.write("research-access.json", next);
    await this.appendAudit({ action: "disabled", createdAt: updatedAt });
    return next;
  }

  private async appendAudit(event: Omit<RemoteResearchAccessAudit, "id">) {
    const file = await this.store.read<{ events: RemoteResearchAccessAudit[] }>("research-access-audit.json", { events: [] });
    file.events.push({ id: `research_access_${crypto.randomUUID()}`, ...event });
    await this.store.write("research-access-audit.json", file);
  }
}
