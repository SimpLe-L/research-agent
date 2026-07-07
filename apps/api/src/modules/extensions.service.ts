import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { findCapability, getExtensionManifest, getExtensionRuntimeStatus } from "@sp-agent/extensions";
import { getSpeechStatus } from "@sp-agent/speech";
import {
  consolidateMemorySchema,
  createMemoryCandidateSchema,
  localBookmarkConnectorFileSchema,
  localBookmarkSearchSchema,
  mergeMemorySchema,
  promoteMemorySchema,
  projectDocSearchSchema,
  searchMemorySchema,
  type ExtensionCapability,
  type ExtensionInvocationAudit,
  type InvokeExtensionInput,
  updateMemorySchema
} from "@sp-agent/shared";
import { ApprovalsService } from "./approvals.service.js";
import { LocalJsonStore } from "./local-json-store.service.js";
import { MemoryService } from "./memory.service.js";
import { WorkflowsService } from "./workflows.service.js";

type ExtensionInvocationResponse = {
  extensionId: string;
  capabilityId: string;
  permissionAudit: ExtensionInvocationAudit;
  status: "completed" | "degraded" | "pending_approval";
  result: unknown;
  degradedReason?: string;
  approval?: unknown;
};

type ExtensionHandler = {
  extensionId: string;
  capabilityId: string;
  handle: (request: InvokeExtensionInput, audit: ExtensionInvocationAudit) => Promise<ExtensionInvocationResponse>;
};

@Injectable()
export class ExtensionsService {
  private readonly handlers: ExtensionHandler[];

  constructor(
    @Inject(MemoryService) private readonly memoryService: MemoryService,
    @Inject(ApprovalsService) private readonly approvalsService: ApprovalsService,
    @Inject(WorkflowsService) private readonly workflowsService: WorkflowsService,
    @Inject(LocalJsonStore) private readonly store: LocalJsonStore
  ) {
    this.handlers = [
      {
        extensionId: "core.agent-shell",
        capabilityId: "extensions.inspect",
        handle: async (_request, audit) => this.completed("core.agent-shell", "extensions.inspect", audit, await this.list())
      },
      {
        extensionId: "local.memory",
        capabilityId: "memory.search",
        handle: async (request, audit) => this.completed("local.memory", "memory.search", audit, await this.memoryService.search(searchMemorySchema.parse(request.input)))
      },
      {
        extensionId: "local.memory",
        capabilityId: "memory.write_candidate",
        handle: async (request, audit) => {
          const approval = await this.ensureApproved(request, audit, "Create durable memory write candidate.");
          if (!approval.approved) return approval.response;
          return this.completed(
            "local.memory",
            "memory.write_candidate",
            audit,
            await this.memoryService.createCandidate(createMemoryCandidateSchema.parse(request.input))
          );
        }
      },
      {
        extensionId: "local.memory",
        capabilityId: "memory.promote_fact",
        handle: async (request, audit) => {
          const approval = await this.ensureApproved(request, audit, "Promote a memory candidate into an accepted durable fact.");
          if (!approval.approved) return approval.response;
          const id = requiredString(request.input.id, "id");
          return this.completed("local.memory", "memory.promote_fact", audit, await this.memoryService.promote(id, promoteMemorySchema.parse(request.input)));
        }
      },
      {
        extensionId: "local.memory",
        capabilityId: "memory.update",
        handle: async (request, audit) => {
          const approval = await this.ensureApproved(request, audit, "Update a durable memory entry.");
          if (!approval.approved) return approval.response;
          const id = requiredString(request.input.id, "id");
          return this.completed("local.memory", "memory.update", audit, await this.memoryService.update(id, updateMemorySchema.parse(request.input)));
        }
      },
      {
        extensionId: "local.memory",
        capabilityId: "memory.merge",
        handle: async (request, audit) => {
          const approval = await this.ensureApproved(request, audit, "Merge related memory entries and tombstone superseded sources.");
          if (!approval.approved) return approval.response;
          return this.completed("local.memory", "memory.merge", audit, await this.memoryService.merge(mergeMemorySchema.parse(request.input)));
        }
      },
      {
        extensionId: "local.memory",
        capabilityId: "memory.consolidate",
        handle: async (request, audit) =>
          this.completed("local.memory", "memory.consolidate", audit, await this.memoryService.consolidate(consolidateMemorySchema.parse(request.input ?? {})))
      },
      {
        extensionId: "local.context",
        capabilityId: "context.snapshot",
        handle: async (_request, audit) =>
          this.completed("local.context", "context.snapshot", audit, {
            now: new Date().toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            runtimeProvider: process.env.AGENT_RUNTIME_PROVIDER ?? "pi",
            extensionIds: (await this.list()).extensions.map((item) => item.id)
          })
      },
      {
        extensionId: "local.project",
        capabilityId: "project.search_docs",
        handle: async (request, audit) =>
          this.completed(
            "local.project",
            "project.search_docs",
            audit,
            await this.workflowsService.runProjectDocSearch(projectDocSearchSchema.parse(request.input))
          )
      },
      {
        extensionId: "local.bookmarks",
        capabilityId: "bookmarks.search",
        handle: async (request, audit) =>
          this.completed("local.bookmarks", "bookmarks.search", audit, await this.searchLocalBookmarks(localBookmarkSearchSchema.parse(request.input)))
      }
    ];
  }

  async list() {
    const status = getExtensionRuntimeStatus();
    const speechStatus = await getSpeechStatus();
    return {
      ...status,
      extensions: status.extensions.map((extension) => {
        if (extension.id !== "local.speech") return extension;
        return {
          ...extension,
          status: speechStatus.ready ? "active" as const : "degraded" as const,
          degradedReason: speechStatus.ready ? undefined : speechStatus.degradedReason ?? extension.degradedReason
        };
      })
    };
  }

  async get(id: string) {
    const extension = (await this.list()).extensions.find((item) => item.id === id);
    if (!extension) throw new NotFoundException(`Extension ${id} not found`);
    return extension;
  }

  getInvocationAudit(id: string, capabilityId?: string): ExtensionInvocationAudit {
    const extension = getExtensionManifest(id);
    if (!extension) throw new NotFoundException(`Extension ${id} not found`);
    const requestedCapabilityId = capabilityId ?? defaultCapabilityId(id);
    return buildPermissionAudit(id, requestedCapabilityId, findCapability(extension.capabilities, requestedCapabilityId));
  }

  async invoke(id: string, request: InvokeExtensionInput) {
    const extension = getExtensionManifest(id);
    if (!extension) throw new NotFoundException(`Extension ${id} not found`);
    const requestedCapabilityId = request.capabilityId ?? defaultCapabilityId(id);
    const audit = buildPermissionAudit(id, requestedCapabilityId, findCapability(extension.capabilities, requestedCapabilityId));

    const handler = this.handlers.find((item) => item.extensionId === id && item.capabilityId === requestedCapabilityId);
    if (handler) return handler.handle(request, audit);

    if (id === "local.speech") {
      return {
        extensionId: id,
        capabilityId: requestedCapabilityId,
        permissionAudit: audit,
        status: "degraded",
        result: null,
        degradedReason: extension.degradedReason ?? `${id} is planned but not implemented yet.`
      };
    }

    throw new BadRequestException(`Capability ${requestedCapabilityId} is not invokable for ${id}`);
  }

  private completed(extensionId: string, capabilityId: string, permissionAudit: ExtensionInvocationAudit, result: unknown): ExtensionInvocationResponse {
    return {
      extensionId,
      capabilityId,
      permissionAudit,
      status: "completed",
      result
    };
  }

  private async ensureApproved(request: InvokeExtensionInput, audit: ExtensionInvocationAudit, reason: string) {
    if (audit.mode === "read_only") return { approved: true as const };
    if (request.approvalId) {
      const approved = await this.approvalsService.requireApproved(request.approvalId);
      if (approved) return { approved: true as const };
    }
    const approval = await this.approvalsService.create({
      extensionId: audit.extensionId,
      capabilityId: audit.capabilityId,
      action: `${audit.extensionId}.${audit.capabilityId}`,
      reason,
      permissions: audit.permissions,
      input: request.input
    });
    return {
      approved: false as const,
      response: {
        extensionId: audit.extensionId,
        capabilityId: audit.capabilityId,
        permissionAudit: audit,
        status: "pending_approval" as const,
        result: null,
        approval: approval.approval,
        degradedReason: "Capability requires explicit approval before execution."
      }
    };
  }

  private async searchLocalBookmarks(input: { query: string; limit: number }) {
    const file = localBookmarkConnectorFileSchema.parse(await this.store.read("connectors/bookmarks.json", { bookmarks: [] }));
    const terms = tokenize(input.query);
    const bookmarks = file.bookmarks
      .map((bookmark) => ({
        bookmark,
        score: scoreBookmark(bookmark, terms)
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.bookmark.title.localeCompare(b.bookmark.title))
      .slice(0, input.limit)
      .map((item) => item.bookmark);
    return {
      bookmarks,
      searched: file.bookmarks.length,
      degradedReason: file.bookmarks.length === 0 ? "No local bookmark connector data is configured." : bookmarks.length === 0 ? "No configured local bookmarks matched the query." : undefined
    };
  }
}

export function isReadOnlyExtensionCapability(audit: ExtensionInvocationAudit) {
  return audit.allowed && audit.mode === "read_only";
}

function defaultCapabilityId(id: string) {
  if (id === "core.agent-shell") return "extensions.inspect";
  if (id === "local.memory") return "memory.search";
  if (id === "local.context") return "context.snapshot";
  if (id === "local.project") return "project.search_docs";
  if (id === "local.bookmarks") return "bookmarks.search";
  if (id === "local.speech") return "speech.transcribe";
  return "extensions.inspect";
}

function buildPermissionAudit(extensionId: string, capabilityId: string, capability?: ExtensionCapability): ExtensionInvocationAudit {
  if (!capability) {
    return {
      extensionId,
      capabilityId,
      permissions: [],
      allowed: false,
      mode: "write_or_provider",
      reason: "Capability is not registered."
    };
  }
  const permissions = capability.permissions ?? [];
  const writeOrProvider = permissions.some((permission) => {
    const normalized = permission.toLowerCase();
    return (
      normalized.includes("write") ||
      normalized.includes("provider") ||
      normalized.includes("audio:") ||
      normalized.includes("transcribe") ||
      normalized.includes("synthesize")
    );
  });
  return {
    extensionId,
    capabilityId,
    permissions,
    allowed: true,
    mode: writeOrProvider ? "write_or_provider" : "read_only",
    reason: writeOrProvider ? "Capability may create state, use provider resources, or process audio." : "Capability is read-only."
  };
}

function requiredString(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) throw new BadRequestException(`${name} is required`);
  return value;
}

function tokenize(value: string) {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .split(/[^a-z0-9\u4e00-\u9fa5._-]+/u)
        .map((term) => term.trim())
        .filter(Boolean)
    )
  );
}

function scoreBookmark(bookmark: { title: string; url: string; description?: string; tags: string[] }, terms: string[]) {
  const weightedText = [
    bookmark.title,
    bookmark.title,
    bookmark.description ?? "",
    bookmark.url,
    bookmark.tags.join(" "),
    bookmark.tags.join(" ")
  ]
    .join(" ")
    .toLowerCase();
  return terms.reduce((score, term) => score + countOccurrences(weightedText, term), 0);
}

function countOccurrences(value: string, term: string) {
  if (!term) return 0;
  let count = 0;
  let index = value.indexOf(term);
  while (index >= 0) {
    count += 1;
    index = value.indexOf(term, index + term.length);
  }
  return count;
}
