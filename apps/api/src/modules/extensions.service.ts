import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { getExtensionManifest, getExtensionRuntimeStatus } from "@sp-agent/extensions";
import {
  createResearchTaskSchema,
  upsertReportAnnotationSchema,
  type ExtensionCapability,
  type ExtensionInvocationAudit,
  type InvokeExtensionInput
} from "@sp-agent/shared";
import { DatabaseService } from "./database.service.js";
import { KnowledgeService } from "./knowledge.service.js";
import { MarketService } from "./market.service.js";
import { ResearchService } from "./research.service.js";
import { ResearchTaskQueueService } from "./research-task-queue.service.js";

export type ExtensionSseResponse = {
  setHeader(name: string, value: string): void;
  flushHeaders?: () => void;
  write(chunk: string): void;
  end(): void;
  on?(event: "close", listener: () => void): void;
};

@Injectable()
export class ExtensionsService {
  constructor(
    @Inject(ResearchService) private readonly researchService: ResearchService,
    @Inject(MarketService) private readonly marketService: MarketService,
    @Inject(KnowledgeService) private readonly knowledgeService: KnowledgeService,
    @Inject(ResearchTaskQueueService) private readonly queueService: ResearchTaskQueueService,
    @Inject(DatabaseService) private readonly databaseService: DatabaseService
  ) {}

  list() {
    return getExtensionRuntimeStatus();
  }

  get(id: string) {
    const extension = getExtensionManifest(id);
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

    if (id === "web3.research") {
      const capabilityId = requestedCapabilityId;
      if (capabilityId === "research.create_task") {
        const result = await this.researchService.create(createResearchTaskSchema.parse(request.input));
        const task = await this.researchService.recordExtensionInvocation(result.task.id, audit, result.queued ? "queued" : "accepted", {
          inputKeys: Object.keys(request.input)
        });
        if (task) result.task = task;
        return {
          extensionId: id,
          capabilityId,
          permissionAudit: audit,
          status: result.queued ? "queued" : "accepted",
          result
        };
      }

      if (capabilityId === "research.list_tasks") {
        return {
          extensionId: id,
          capabilityId,
          permissionAudit: audit,
          status: "completed",
          result: await this.researchService.list()
        };
      }

      if (capabilityId === "research.queue_status") {
        return {
          extensionId: id,
          capabilityId,
          permissionAudit: audit,
          status: "completed",
          result: await this.getResearchQueueStatus()
        };
      }

      if (capabilityId === "research.list_events") {
        const taskId = readRequiredString(request.input, "taskId");
        const result = await this.researchService.getEvents(taskId);
        if (!result) throw new NotFoundException(`Research task ${taskId} not found`);
        await this.researchService.recordExtensionInvocation(taskId, audit, "completed", {
          inputKeys: Object.keys(request.input),
          resultCount: result.length
        });
        return { extensionId: id, capabilityId, permissionAudit: audit, status: "completed", result: { events: result } };
      }

      if (capabilityId === "research.get_task") {
        const taskId = readRequiredString(request.input, "taskId");
        const result = await this.researchService.get(taskId);
        if (!result) throw new NotFoundException(`Research task ${taskId} not found`);
        const task = await this.researchService.recordExtensionInvocation(taskId, audit, "completed", {
          inputKeys: Object.keys(request.input)
        });
        return { extensionId: id, capabilityId, permissionAudit: audit, status: "completed", result: task ?? result };
      }

      if (capabilityId === "research.get_report") {
        const taskId = readRequiredString(request.input, "taskId");
        const result = await this.researchService.getReport(taskId);
        if (!result) throw new NotFoundException(`Report for task ${taskId} not found`);
        await this.researchService.recordExtensionInvocation(taskId, audit, "completed", {
          reportId: result.id,
          inputKeys: Object.keys(request.input)
        });
        return { extensionId: id, capabilityId, permissionAudit: audit, status: "completed", result };
      }

      if (capabilityId === "research.cancel_task") {
        const taskId = readRequiredString(request.input, "taskId");
        const result = await this.researchService.cancel(taskId);
        if (!result) throw new NotFoundException(`Research task ${taskId} not found`);
        const task = await this.researchService.recordExtensionInvocation(taskId, audit, result.cancelled ? "cancelled" : "completed", {
          inputKeys: Object.keys(request.input)
        });
        return {
          extensionId: id,
          capabilityId,
          permissionAudit: audit,
          status: result.cancelled ? "cancelled" : "completed",
          result: { ...result, task: task ?? result.task }
        };
      }

      if (capabilityId === "research.retry_task") {
        const taskId = readRequiredString(request.input, "taskId");
        const resumeFromNode = readOptionalString(request.input, "resumeFromNode");
        const result = await this.researchService.retry(taskId, resumeFromNode ? { resumeFromNode: resumeFromNode as never } : {});
        if (!result) throw new NotFoundException(`Research task ${taskId} not found`);
        const task = await this.researchService.recordExtensionInvocation(result.task.id, audit, result.queued ? "queued" : "accepted", {
          retriedFromTaskId: taskId,
          inputKeys: Object.keys(request.input)
        });
        return {
          extensionId: id,
          capabilityId,
          permissionAudit: audit,
          status: result.queued ? "queued" : "accepted",
          result: { ...result, task: task ?? result.task }
        };
      }

      throw new BadRequestException(`Capability ${capabilityId} is not invokable for ${id}`);
    }

    if (id === "web3.market") {
      const capabilityId = requestedCapabilityId;
      if (capabilityId === "market.snapshot") {
        const shouldAnalyze = request.input.analyze !== false;
        const result = shouldAnalyze ? await this.marketService.analyze() : await this.marketService.getLatestSnapshot();
        return {
          extensionId: id,
          capabilityId,
          permissionAudit: audit,
          status: result ? "completed" : "degraded",
          result,
          degradedReason: result ? undefined : "No market snapshot is available yet."
        };
      }

      if (capabilityId === "market.list_snapshots") {
        return {
          extensionId: id,
          capabilityId,
          permissionAudit: audit,
          status: "completed",
          result: { snapshots: await this.marketService.listSnapshots() }
        };
      }

      throw new BadRequestException(`Capability ${capabilityId} is not invokable for ${id}`);
    }

    if (id === "local.knowledge") {
      const capabilityId = requestedCapabilityId;

      if (capabilityId === "knowledge.search") {
        const query = readOptionalString(request.input, "query") ?? readOptionalString(request.input, "q") ?? "";
        const result = await this.knowledgeService.searchReports(query);
        await Promise.all(
          result.reports.slice(0, 10).map((report) =>
            this.researchService.recordExtensionInvocation(report.taskId, audit, result.degradedReason ? "degraded" : "completed", {
              reportId: report.id,
              queryPresent: Boolean(query),
              resultCount: result.reports.length
            })
          )
        );
        return {
          extensionId: id,
          capabilityId,
          permissionAudit: audit,
          status: result.degradedReason ? "degraded" : "completed",
          result,
          degradedReason: result.degradedReason
        };
      }

      if (capabilityId === "knowledge.index_report") {
        const reportId = readOptionalString(request.input, "reportId");
        const report = reportId ? await this.knowledgeService.getReport(reportId) : undefined;
        const result = reportId ? await this.knowledgeService.reindexReport(reportId) : await this.knowledgeService.reindexReports();
        if (!result) throw new NotFoundException(`Report ${reportId} not found`);
        if (report) {
          await this.researchService.recordExtensionInvocation(report.taskId, audit, "indexed" in result && result.indexed === false ? "degraded" : "completed", {
            reportId: report.id,
            inputKeys: Object.keys(request.input)
          });
        }
        return {
          extensionId: id,
          capabilityId,
          permissionAudit: audit,
          status: "indexed" in result && result.indexed === false ? "degraded" : "completed",
          result,
          degradedReason: "degradedReason" in result ? result.degradedReason : undefined
        };
      }

      if (capabilityId === "knowledge.delete_report_vector") {
        const reportId = readRequiredString(request.input, "reportId");
        const report = await this.knowledgeService.getReport(reportId);
        const result = await this.knowledgeService.deleteReportVector(reportId);
        if (!result) throw new NotFoundException(`Report ${reportId} not found`);
        if (report) {
          await this.researchService.recordExtensionInvocation(report.taskId, audit, result.degradedReason ? "degraded" : "completed", {
            reportId: report.id,
            inputKeys: Object.keys(request.input)
          });
        }
        return {
          extensionId: id,
          capabilityId,
          permissionAudit: audit,
          status: result.degradedReason ? "degraded" : "completed",
          result,
          degradedReason: result.degradedReason
        };
      }

      if (capabilityId === "knowledge.search_sources") {
        const result = await this.knowledgeService.listSources({
          query: readOptionalString(request.input, "query") ?? readOptionalString(request.input, "q"),
          degradedOnly: readOptionalBoolean(request.input, "degradedOnly") ?? false
        });
        return { extensionId: id, capabilityId, permissionAudit: audit, status: "completed", result: { sources: result } };
      }

      if (capabilityId === "knowledge.get_source") {
        const sourceId = readRequiredString(request.input, "sourceId");
        const result = await this.knowledgeService.getSourceDetail(sourceId);
        if (!result) throw new NotFoundException(`Source ${sourceId} not found`);
        return { extensionId: id, capabilityId, permissionAudit: audit, status: "completed", result };
      }

      throw new BadRequestException(`Capability ${capabilityId} is not invokable for ${id}`);
    }

    if (id === "local.reports") {
      const capabilityId = requestedCapabilityId;

      if (capabilityId === "reports.read") {
        const reports = await this.knowledgeService.listReports();
        await Promise.all(
          reports.slice(0, 10).map((report) =>
            this.researchService.recordExtensionInvocation(report.taskId, audit, "completed", {
              reportId: report.id,
              resultCount: reports.length
            })
          )
        );
        return {
          extensionId: id,
          capabilityId,
          permissionAudit: audit,
          status: "completed",
          result: { reports }
        };
      }

      if (capabilityId === "reports.read_one") {
        const reportId = readRequiredString(request.input, "reportId");
        const result = await this.knowledgeService.getReport(reportId);
        if (!result) throw new NotFoundException(`Report ${reportId} not found`);
        await this.researchService.recordExtensionInvocation(result.taskId, audit, "completed", {
          reportId: result.id,
          inputKeys: Object.keys(request.input)
        });
        return { extensionId: id, capabilityId, permissionAudit: audit, status: "completed", result };
      }

      if (capabilityId === "reports.read_sources") {
        const reportId = readRequiredString(request.input, "reportId");
        const report = await this.knowledgeService.getReport(reportId);
        if (!report) throw new NotFoundException(`Report ${reportId} not found`);
        await this.researchService.recordExtensionInvocation(report.taskId, audit, "completed", {
          reportId: report.id,
          inputKeys: Object.keys(request.input)
        });
        return {
          extensionId: id,
          capabilityId,
          permissionAudit: audit,
          status: "completed",
          result: { sources: await this.knowledgeService.getReportSources(reportId) }
        };
      }

      if (capabilityId === "reports.read_annotations") {
        const reportId = readRequiredString(request.input, "reportId");
        const report = await this.knowledgeService.getReport(reportId);
        const annotations = await this.knowledgeService.listReportAnnotations(reportId);
        if (!report || !annotations) throw new NotFoundException(`Report ${reportId} not found`);
        await this.researchService.recordExtensionInvocation(report.taskId, audit, "completed", {
          reportId: report.id,
          resultCount: annotations.length
        });
        return {
          extensionId: id,
          capabilityId,
          permissionAudit: audit,
          status: "completed",
          result: { annotations }
        };
      }

      if (capabilityId === "reports.upsert_annotation") {
        const reportId = readRequiredString(request.input, "reportId");
        const report = await this.knowledgeService.getReport(reportId);
        const annotation = await this.knowledgeService.upsertReportAnnotation(reportId, upsertReportAnnotationSchema.parse(request.input));
        if (!report || !annotation) throw new NotFoundException(`Report ${reportId} not found`);
        await this.researchService.recordExtensionInvocation(report.taskId, audit, "completed", {
          reportId: report.id,
          inputKeys: Object.keys(request.input)
        });
        return {
          extensionId: id,
          capabilityId,
          permissionAudit: audit,
          status: "completed",
          result: annotation
        };
      }

      if (capabilityId === "reports.delete_annotation") {
        const reportId = readRequiredString(request.input, "reportId");
        const annotationId = readRequiredString(request.input, "annotationId");
        const report = await this.knowledgeService.getReport(reportId);
        const deleted = await this.knowledgeService.deleteReportAnnotation(reportId, annotationId);
        if (!report || deleted === undefined) throw new NotFoundException(`Report ${reportId} not found`);
        await this.researchService.recordExtensionInvocation(report.taskId, audit, "completed", {
          reportId: report.id,
          inputKeys: Object.keys(request.input)
        });
        return {
          extensionId: id,
          capabilityId,
          permissionAudit: audit,
          status: "completed",
          result: { deleted }
        };
      }

      throw new BadRequestException(`Capability ${capabilityId} is not invokable for ${id}`);
    }

    throw new BadRequestException(`Extension ${id} is registered but does not have an invokable Phase 2 adapter yet.`);
  }

  async streamResearchTaskEvents(id: string, taskId: string, response: ExtensionSseResponse) {
    if (id !== "web3.research") throw new BadRequestException(`Extension ${id} does not expose research task event streams.`);
    const audit = this.getInvocationAudit(id, "research.stream_events");
    const task = await this.researchService.get(taskId);
    if (!task) throw new NotFoundException(`Research task ${taskId} not found`);

    await this.researchService.recordExtensionInvocation(taskId, audit, "streaming", {
      inputKeys: ["taskId"],
      stream: true
    });
    const events = await this.researchService.getEvents(taskId);
    if (!events) throw new NotFoundException(`Research task ${taskId} not found`);

    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders?.();

    const writeEvent = (event: { eventType: string; [key: string]: unknown }) => {
      response.write(`event: ${event.eventType}\n`);
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    for (const event of events) {
      writeEvent(event);
    }

    const latestTask = await this.researchService.get(taskId);
    const hasIndexedEvent = events.some((event) => event.eventType === "knowledge_indexed");
    if (!latestTask || ["failed", "cancelled"].includes(latestTask.status) || (latestTask.status === "completed" && hasIndexedEvent)) {
      response.write(`event: done\n`);
      response.write(`data: ${JSON.stringify({ taskId, replay: true, status: latestTask?.status ?? "missing" })}\n\n`);
      response.end();
      return;
    }

    const heartbeat = setInterval(() => {
      response.write(`: heartbeat\n\n`);
    }, 15000);

    const unsubscribe = this.researchService.subscribeToEvents(taskId, (event) => {
      writeEvent(event);
      if (["knowledge_indexed", "task_failed", "task_cancelled"].includes(event.eventType)) {
        response.write(`event: done\n`);
        response.write(`data: ${JSON.stringify({ taskId, replay: false, status: event.eventType })}\n\n`);
        clearInterval(heartbeat);
        unsubscribe();
        response.end();
      }
    });

    response.on?.("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  }

  private async getResearchQueueStatus() {
    const status = this.queueService.status();
    const repository = this.databaseService.getResearchRepository();
    if (!repository) {
      return {
        ...status,
        databaseReachable: false,
        persistedPending: 0,
        persistedRunning: 0,
        persistedPendingTaskIds: [],
        persistedRunningTaskIds: []
      };
    }

    const activeTasks = await repository.listActiveQueueTasks();
    return {
      ...status,
      databaseReachable: true,
      persistedPending: activeTasks.pending.length,
      persistedRunning: activeTasks.running.length,
      persistedPendingTaskIds: activeTasks.pending.map((task) => task.id),
      persistedRunningTaskIds: activeTasks.running.map((task) => task.id)
    };
  }
}

export function isReadOnlyExtensionCapability(audit: ExtensionInvocationAudit): boolean {
  return audit.allowed && audit.mode === "read_only";
}

function defaultCapabilityId(extensionId: string): string {
  if (extensionId === "web3.research") return "research.create_task";
  if (extensionId === "web3.market") return "market.snapshot";
  if (extensionId === "local.knowledge") return "knowledge.search";
  if (extensionId === "local.reports") return "reports.read";
  return "unknown";
}

function findCapability(capabilities: ExtensionCapability[], capabilityId: string): ExtensionCapability | undefined {
  return capabilities.find((capability) => capability.id === capabilityId);
}

function buildPermissionAudit(
  extensionId: string,
  capabilityId: string,
  capability: ExtensionCapability | undefined
): ExtensionInvocationAudit {
  const permissions = capability?.permissions ?? [];
  const isReadOnly = permissions.length > 0 && permissions.every(isReadOnlyPermission);
  return {
    extensionId,
    capabilityId,
    permissions,
    allowed: Boolean(capability),
    mode: isReadOnly ? "read_only" : "write_or_provider",
    reason: capability
      ? isReadOnly
        ? "Capability is registered and uses read-only permissions."
        : "Capability is registered but uses write, provider, task, runtime, or optional vector permissions."
      : "Capability is not registered in the extension manifest."
  };
}

function isReadOnlyPermission(permission: string): boolean {
  return (
    permission.endsWith(":read") ||
    permission === "extensions:read" ||
    permission === "tasks:read" ||
    permission === "database:read" ||
    permission === "vectors:optional"
  );
}

function readRequiredString(input: Record<string, unknown>, key: string): string {
  const value = readOptionalString(input, key);
  if (!value) throw new BadRequestException(`Missing required input.${key}`);
  return value;
}

function readOptionalString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readOptionalBoolean(input: Record<string, unknown>, key: string): boolean | undefined {
  const value = input[key];
  return typeof value === "boolean" ? value : undefined;
}
