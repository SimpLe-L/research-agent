import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { findCapability, getExtensionManifest, getExtensionRuntimeStatus, parseExtensionCapabilityInput } from "@sp-agent/extensions";
import { getSpeechStatus } from "@sp-agent/speech";
import {
  consolidateMemorySchema,
  contextBriefingSchema,
  createMemoryCandidateSchema,
  localBookmarkConnectorFileSchema,
  localBookmarkDigestSchema,
  localBookmarkSearchSchema,
  mergeMemorySchema,
  projectPlanSchema,
  promoteMemorySchema,
  projectDocSearchSchema,
  researchFetchWebSourceSchema,
  researchBriefingSchema,
  researchGetReportSchema,
  researchImportSourceSchema,
  researchRequestSchema,
  researchWebSearchSchema,
  searchMemorySchema,
  type ExtensionCapability,
  type ExtensionInvocationAudit,
  type InvokeExtensionInput,
  updateMemorySchema
} from "@sp-agent/shared";
import { ApprovalsService } from "./approvals.service.js";
import { LocalJsonStore } from "./local-json-store.service.js";
import { MemoryService } from "./memory.service.js";
import { ResearchSourceService } from "./research-source.service.js";
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
    @Inject(ResearchSourceService) private readonly researchSourceService: ResearchSourceService,
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
          const result = await this.memoryService.createCandidate(createMemoryCandidateSchema.parse(request.input));
          return this.completedAfterApproval(
            approval.approval,
            "local.memory",
            "memory.write_candidate",
            audit,
            result
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
          const result = await this.memoryService.promote(id, promoteMemorySchema.parse(request.input));
          return this.completedAfterApproval(approval.approval, "local.memory", "memory.promote_fact", audit, result);
        }
      },
      {
        extensionId: "local.memory",
        capabilityId: "memory.update",
        handle: async (request, audit) => {
          const approval = await this.ensureApproved(request, audit, "Update a durable memory entry.");
          if (!approval.approved) return approval.response;
          const id = requiredString(request.input.id, "id");
          const result = await this.memoryService.update(id, updateMemorySchema.parse(request.input));
          return this.completedAfterApproval(approval.approval, "local.memory", "memory.update", audit, result);
        }
      },
      {
        extensionId: "local.memory",
        capabilityId: "memory.merge",
        handle: async (request, audit) => {
          const approval = await this.ensureApproved(request, audit, "Merge related memory entries and tombstone superseded sources.");
          if (!approval.approved) return approval.response;
          const result = await this.memoryService.merge(mergeMemorySchema.parse(request.input));
          return this.completedAfterApproval(approval.approval, "local.memory", "memory.merge", audit, result);
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
        extensionId: "local.context",
        capabilityId: "context.briefing",
        handle: async (request, audit) =>
          this.completed("local.context", "context.briefing", audit, await this.buildContextBriefing(contextBriefingSchema.parse(request.input ?? {})))
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
        extensionId: "personal.research",
        capabilityId: "research.run",
        handle: async (request, audit) =>
          this.completed(
            "personal.research",
            "research.run",
            audit,
            await this.workflowsService.runResearch(researchRequestSchema.parse(request.input))
          )
      },
      {
        extensionId: "personal.briefing",
        capabilityId: "briefing.recent_research",
        handle: async (request, audit) => {
          const input = researchBriefingSchema.parse(request.input);
          return this.completed("personal.briefing", "briefing.recent_research", audit, await this.workflowsService.recentResearchBriefing(input.limit));
        }
      },
      {
        extensionId: "personal.research",
        capabilityId: "research.import_source",
        handle: async (request, audit) => {
          const approval = await this.ensureApproved(request, audit, "Import user-provided research content into the local source store.");
          if (!approval.approved) return approval.response;
          const result = await this.researchSourceService.importUserSource(researchImportSourceSchema.parse(request.input));
          return this.completedAfterApproval(approval.approval, "personal.research", "research.import_source", audit, result);
        }
      },
      {
        extensionId: "personal.research",
        capabilityId: "research.fetch_web_source",
        handle: async (request, audit) => {
          const approval = await this.ensureApproved(request, audit, "Fetch one allowlisted remote research source and retain its provenance locally.");
          if (!approval.approved) return approval.response;
          const result = await this.researchSourceService.fetchWebSource(researchFetchWebSourceSchema.parse(request.input));
          return this.completedAfterApproval(approval.approval, "personal.research", "research.fetch_web_source", audit, result);
        }
      },
      {
        extensionId: "personal.research",
        capabilityId: "research.search_web",
        handle: async (request, audit) => {
          const input = researchWebSearchSchema.parse(request.input);
          const approval = await this.ensureApproved(request, audit, "Search the web with the configured Tavily connector and create a cited research report.");
          if (!approval.approved) return approval.response;
          const result = await this.workflowsService.runWebResearch(input);
          return this.completedAfterApproval(approval.approval, "personal.research", "research.search_web", audit, result);
        }
      },
      {
        extensionId: "personal.research",
        capabilityId: "research.get_report",
        handle: async (request, audit) => {
          const input = researchGetReportSchema.parse(request.input);
          return this.completed("personal.research", "research.get_report", audit, await this.workflowsService.getResearchReport(input.workflowId));
        }
      },
      {
        extensionId: "local.project",
        capabilityId: "project.plan",
        handle: async (request, audit) =>
          this.completed("local.project", "project.plan", audit, await this.createProjectPlan(projectPlanSchema.parse(request.input)))
      },
      {
        extensionId: "local.bookmarks",
        capabilityId: "bookmarks.search",
        handle: async (request, audit) =>
          this.completed("local.bookmarks", "bookmarks.search", audit, await this.searchLocalBookmarks(localBookmarkSearchSchema.parse(request.input)))
      },
      {
        extensionId: "local.bookmarks",
        capabilityId: "bookmarks.digest",
        handle: async (request, audit) =>
          this.completed("local.bookmarks", "bookmarks.digest", audit, await this.digestLocalBookmarks(localBookmarkDigestSchema.parse(request.input ?? {})))
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
    if (handler) return handler.handle({ ...request, input: parseExtensionCapabilityInput(id, requestedCapabilityId, request.input) }, audit);

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

  private async completedAfterApproval(
    approval: { id: string } | undefined,
    extensionId: string,
    capabilityId: string,
    permissionAudit: ExtensionInvocationAudit,
    result: unknown
  ) {
    if (approval) await this.approvalsService.consumeApproved(approval.id);
    return this.completed(extensionId, capabilityId, permissionAudit, result);
  }

  private async ensureApproved(request: InvokeExtensionInput, audit: ExtensionInvocationAudit, reason: string) {
    if (audit.mode === "read_only") return { approved: true as const, approval: undefined };
    if (request.approvalId) {
      const approved = await this.approvalsService.requireApprovedFor(request.approvalId, {
        extensionId: audit.extensionId,
        capabilityId: audit.capabilityId,
        input: request.input,
        idempotencyKey: request.idempotencyKey,
        sessionId: request.sessionId
      });
      if (approved) return { approved: true as const, approval: approved };
    }
    const approval = await this.approvalsService.create({
      extensionId: audit.extensionId,
      capabilityId: audit.capabilityId,
      action: `${audit.extensionId}.${audit.capabilityId}`,
      reason,
      permissions: audit.permissions,
      input: request.input,
      executionPolicy: "single_use",
      idempotencyKey: request.idempotencyKey,
      sessionId: request.sessionId
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

  private async digestLocalBookmarks(input: { query?: string; tag?: string; limit: number }) {
    const file = localBookmarkConnectorFileSchema.parse(await this.store.read("connectors/bookmarks.json", { bookmarks: [] }));
    const terms = tokenize(input.query ?? input.tag ?? "");
    const tag = input.tag?.trim().toLowerCase();
    const filtered = file.bookmarks
      .filter((bookmark) => !tag || bookmark.tags.some((item) => item.toLowerCase() === tag))
      .map((bookmark) => ({
        bookmark,
        score: terms.length > 0 ? scoreBookmark(bookmark, terms) : 1
      }))
      .filter((item) => terms.length === 0 || item.score > 0)
      .sort((a, b) => b.score - a.score || b.bookmark.createdAt.localeCompare(a.bookmark.createdAt))
      .slice(0, input.limit)
      .map((item) => item.bookmark);
    const tagCounts = new Map<string, number>();
    for (const bookmark of filtered) {
      for (const item of bookmark.tags) {
        tagCounts.set(item, (tagCounts.get(item) ?? 0) + 1);
      }
    }
    return {
      digest: {
        query: input.query,
        tag: input.tag,
        totalConfigured: file.bookmarks.length,
        matched: filtered.length,
        topTags: [...tagCounts.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 8)
          .map(([name, count]) => ({ name, count })),
        highlights: filtered.slice(0, 5).map((bookmark) => ({
          id: bookmark.id,
          title: bookmark.title,
          url: bookmark.url,
          tags: bookmark.tags,
          description: bookmark.description
        }))
      },
      bookmarks: filtered,
      degradedReason: file.bookmarks.length === 0
        ? "No local bookmark connector data is configured."
        : filtered.length === 0
          ? "No configured local bookmarks matched the digest filters."
          : undefined
    };
  }

  private async createProjectPlan(input: { goal: string; limit: number }) {
    const { workflow } = await this.workflowsService.runProjectDocSearch({ query: input.goal, limit: input.limit });
    const result = workflow.result as { hits?: Array<{ file: string; score: number; preview: string }>; searchedFiles?: string[] } | undefined;
    const hits = result?.hits ?? [];
    return {
      plan: {
        goal: input.goal,
        summary: hits.length > 0
          ? `Plan grounded in ${hits.length} allowlisted project document match${hits.length === 1 ? "" : "es"}.`
          : "No matching project documents were found; plan is limited to the requested goal and repository guardrails.",
        nextSteps: buildProjectPlanSteps(input.goal, hits),
        supportingFiles: hits.map((hit) => ({ file: hit.file, score: hit.score, preview: hit.preview })),
        searchedFiles: result?.searchedFiles ?? []
      },
      workflow,
      degradedReason: workflow.degradedReason
    };
  }

  private async buildContextBriefing(input: { includeWorkflows: boolean; workflowLimit: number }) {
    const status = await this.list();
    const extensions = status.extensions.map((extension) => ({
      id: extension.id,
      name: extension.name,
      kind: extension.kind,
      status: extension.status,
      degradedReason: extension.degradedReason,
      capabilities: extension.capabilities.map((capability) => ({
        id: capability.id,
        label: capability.label,
        permissions: capability.permissions,
        auditMode: buildPermissionAudit(extension.id, capability.id, capability).mode
      }))
    }));
    const workflowRecords = input.includeWorkflows ? await this.workflowsService.list() : [];
    const recentWorkflows = workflowRecords.slice(0, input.workflowLimit).map((workflow) => ({
      id: workflow.id,
      kind: workflow.kind,
      status: workflow.status,
      degradedReason: workflow.degradedReason,
      error: workflow.error,
      updatedAt: workflow.updatedAt,
      nodeEventCount: workflow.nodeEvents.length
    }));
    return {
      now: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      runtimeProvider: process.env.AGENT_RUNTIME_PROVIDER ?? "pi",
      safetyModel: status.safetyModel,
      extensionSummary: {
        total: extensions.length,
        active: extensions.filter((extension) => extension.status === "active").length,
        degraded: extensions.filter((extension) => extension.status === "degraded").length,
        planned: extensions.filter((extension) => extension.status === "planned").length,
        extensions
      },
      workflowSummary: input.includeWorkflows
        ? {
            total: workflowRecords.length,
            pending: workflowRecords.filter((workflow) => workflow.status === "pending").length,
            running: workflowRecords.filter((workflow) => workflow.status === "running").length,
            completed: workflowRecords.filter((workflow) => workflow.status === "completed").length,
            failed: workflowRecords.filter((workflow) => workflow.status === "failed").length,
            cancelled: workflowRecords.filter((workflow) => workflow.status === "cancelled").length,
            recent: recentWorkflows
          }
        : undefined
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

function buildProjectPlanSteps(goal: string, hits: Array<{ file: string; preview: string }>) {
  const steps = [
    {
      id: "scope",
      title: "Confirm scope",
      detail: `Keep the work scoped to: ${goal}`
    }
  ];
  if (hits.some((hit) => hit.file === "AGENTS.md")) {
    steps.push({
      id: "rules",
      title: "Apply repository rules",
      detail: "Use AGENTS.md as the source of development conventions, safety boundaries, and active product direction."
    });
  }
  if (hits.some((hit) => hit.file === "ARCHITECTURE.md")) {
    steps.push({
      id: "architecture",
      title: "Check architecture boundaries",
      detail: "Align package boundaries, API ownership, extension permissions, memory, workflow, and speech constraints with ARCHITECTURE.md."
    });
  }
  if (hits.some((hit) => hit.file === "PROCESS.md")) {
    steps.push({
      id: "process",
      title: "Update process state",
      detail: "Record meaningful implementation progress and verification results in PROCESS.md."
    });
  }
  steps.push({
    id: "verify",
    title: "Run focused verification",
    detail: "Run the smallest smoke/typecheck set that covers the touched API, extension, workflow, memory, or renderer boundary."
  });
  return steps;
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
