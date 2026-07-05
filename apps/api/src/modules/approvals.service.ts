import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ApprovalRequest, CreateApprovalRequestInput, DecideApprovalRequestInput } from "@sp-agent/shared";
import { LocalJsonStore } from "./local-json-store.service.js";

type ApprovalsFile = {
  requests: ApprovalRequest[];
};

@Injectable()
export class ApprovalsService {
  constructor(@Inject(LocalJsonStore) private readonly store: LocalJsonStore) {}

  async list(status?: ApprovalRequest["status"]) {
    const requests = (await this.readFile()).requests;
    return (status ? requests.filter((request) => request.status === status) : requests).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async create(input: CreateApprovalRequestInput) {
    const now = new Date().toISOString();
    const request: ApprovalRequest = {
      id: `approval_${crypto.randomUUID()}`,
      extensionId: input.extensionId,
      capabilityId: input.capabilityId,
      action: input.action,
      reason: input.reason,
      permissions: input.permissions,
      input: input.input,
      status: "pending",
      createdAt: now,
      updatedAt: now
    };
    const file = await this.readFile();
    file.requests.push(request);
    await this.writeFile(file);
    return { approval: request };
  }

  async decide(id: string, input: DecideApprovalRequestInput) {
    const file = await this.readFile();
    const request = findApproval(file, id);
    const now = new Date().toISOString();
    request.status = input.decision;
    request.updatedAt = now;
    request.decidedAt = now;
    if (input.reason) {
      request.reason = `${request.reason}\nDecision: ${input.reason}`;
    }
    await this.writeFile(file);
    return { approval: request };
  }

  async requireApproved(id: string) {
    const request = findApproval(await this.readFile(), id);
    return request.status === "approved" ? request : undefined;
  }

  private async readFile(): Promise<ApprovalsFile> {
    const file = await this.store.read<ApprovalsFile>("approvals.json", { requests: [] });
    return { requests: file.requests ?? [] };
  }

  private async writeFile(file: ApprovalsFile) {
    await this.store.write("approvals.json", file);
  }
}

function findApproval(file: ApprovalsFile, id: string) {
  const request = file.requests.find((item) => item.id === id);
  if (!request) throw new NotFoundException(`Approval request ${id} not found`);
  return request;
}
