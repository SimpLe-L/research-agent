import { Inject, Injectable, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import {
  analyzeResearchRiskWithAgent,
  collectResearchSourcesWithAgent,
  draftResearchReportWithAgent,
  fetchResearchMarketDataWithAgent,
  fetchResearchOnchainDataWithAgent,
  indexResearchKnowledgeWithAgent,
  resolveResearchAssetWithAgent,
  searchResearchKnowledgeWithAgent
} from "@sp-agent/agent-runtime";
import {
  deriveTaskNodeRuns,
  sourceCandidateSchema,
  taskNodeNames,
  type CreateResearchTaskInput,
  type ExtensionInvocationAudit,
  type ResearchReport,
  type ResearchTask,
  type ResearchTaskEvent,
  type RetryResearchTaskInput,
  type SimilarCase,
  type SourceCandidate,
  type TaskNodeName
} from "@sp-agent/shared";
import { calculateInitialRisk, ResearchTaskCancelledError, resolveAsset, runBootstrapResearchTask, type ResearchTaskResumeState } from "@sp-agent/research-core";
import {
  getArkhamAddressIntel,
  getDefiProtocolMetrics,
  getDexLiquidityData,
  getHolderConcentrationData,
  getTokenMarketData,
  readContractRisk,
  readErc20Metadata,
  searchProjectSources
} from "@sp-agent/data-connectors";
import { DatabaseService } from "./database.service.js";
import { KnowledgeService } from "./knowledge.service.js";
import { parseResearchTaskExecutorMode, ResearchTaskQueueService } from "./research-task-queue.service.js";

@Injectable()
export class ResearchService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly tasks = new Map<string, ResearchTask>();
  private readonly reportsByTask = new Map<string, ResearchReport>();
  private readonly eventSubscribers = new Map<string, Set<(event: ResearchTaskEvent) => void>>();
  private readonly agentResearchSessionTaskIds = new Set<string>();
  private readonly executorMode = parseResearchTaskExecutorMode(process.env.RESEARCH_TASK_EXECUTOR_MODE);
  private readonly workerPollIntervalMs = parseWorkerPollInterval(process.env.RESEARCH_WORKER_POLL_INTERVAL_MS);
  private workerPollTimer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
    @Inject(KnowledgeService) private readonly knowledgeService: KnowledgeService,
    @Inject(ResearchTaskQueueService) private readonly taskQueue: ResearchTaskQueueService
  ) {}

  async onApplicationBootstrap() {
    if (this.executorMode === "api_only") return;

    const repository = this.databaseService.getResearchRepository();
    if (!repository) return;

    const recoveredTasks = await repository.recoverInterruptedTasks();
    for (const task of recoveredTasks) {
      this.tasks.set(task.id, task);
      const recoveryEvent = task.events.at(-1);
      if (recoveryEvent) this.publishEvent(recoveryEvent);
      const resumeFromNode = this.getAutomaticResumeNode(task);
      if (!resumeFromNode) continue;

      const resumed = await this.create(
        {
          input: task.input,
          inputType: task.inputType,
          question: task.question,
          options: {
            deepResearch: Boolean(task.options.deepResearch),
            includeSocial: task.options.includeSocial !== false,
            includeOnchain: task.options.includeOnchain !== false,
            includeSimilarCases: task.options.includeSimilarCases !== false,
            resumeFromNode,
            resumedFromTaskId: task.id
          }
        },
        this.extractResumeState(task)
      );
      await this.addEvent(task, {
        id: `event_${crypto.randomUUID()}`,
        taskId: task.id,
        eventType: "task_auto_resume_queued",
        payload: { resumedTaskId: resumed.task.id, resumeFromNode },
        createdAt: new Date().toISOString()
      });
    }

    await this.enqueuePersistedPendingTasks("task_requeued_after_restart", "Persisted pending task was re-enqueued after executor startup.");

    if (this.executorMode === "worker") {
      this.workerPollTimer = setInterval(() => {
        void this.enqueuePersistedPendingTasks("task_worker_queued", "Worker poll found a persisted pending task.");
      }, this.workerPollIntervalMs);
      this.workerPollTimer.unref();
    }
  }

  onApplicationShutdown() {
    if (this.workerPollTimer) clearInterval(this.workerPollTimer);
  }

  private async enqueuePersistedPendingTasks(eventType: string, reason: string) {
    const repository = this.databaseService.getResearchRepository();
    if (!repository) return;

    const pendingTasks = await repository.listPendingTasks();
    for (const task of pendingTasks) {
      if (this.taskQueue.hasTask(task.id)) continue;

      this.tasks.set(task.id, this.withNodeRuns(task));
      if (!task.events.some((event) => event.eventType === eventType)) {
        await this.addEvent(task, {
          id: `event_${crypto.randomUUID()}`,
          taskId: task.id,
          eventType,
          payload: { reason },
          createdAt: new Date().toISOString()
        });
      }

      const resumeState = await this.resolvePendingResumeState(task);
      this.enqueueExistingTask(task, this.toCreateInput(task), resumeState);
    }
  }

  async create(input: CreateResearchTaskInput, resumeState?: ResearchTaskResumeState, options: { agentResearchSession?: boolean } = {}) {
    const task: ResearchTask = {
      id: `task_${crypto.randomUUID()}`,
      input: input.input,
      inputType: input.inputType,
      question: input.question,
      options: input.options,
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      events: [],
      nodeRuns: deriveTaskNodeRuns([])
    };
    this.tasks.set(task.id, task);
    if (options.agentResearchSession) this.agentResearchSessionTaskIds.add(task.id);
    await this.persistTask(task);
    const queued = this.executorMode === "local";
    if (queued) {
      this.enqueueExistingTask(task, input, resumeState);
    } else {
      await this.addEvent(task, {
        id: `event_${crypto.randomUUID()}`,
        taskId: task.id,
        eventType: "task_waiting_for_worker",
        payload: {
          reason: "Task was persisted and is waiting for an external research worker.",
          executorMode: this.executorMode
        },
        createdAt: new Date().toISOString()
      });
    }

    return {
      task: this.withNodeRuns({
        ...task,
        events: [...task.events],
        nodeRuns: [...task.nodeRuns]
      }),
      queued
    };
  }

  async retry(id: string, retryInput: RetryResearchTaskInput = {}) {
    const task = await this.get(id);
    if (!task) return undefined;

    const resumeFromNode = retryInput.resumeFromNode;
    return this.create({
      input: task.input,
      inputType: task.inputType,
      question: task.question,
      options: {
        deepResearch: Boolean(task.options.deepResearch),
        includeSocial: task.options.includeSocial !== false,
        includeOnchain: task.options.includeOnchain !== false,
        includeSimilarCases: task.options.includeSimilarCases !== false,
        resumeFromNode,
        resumedFromTaskId: resumeFromNode ? task.id : undefined
      }
    }, resumeFromNode ? this.extractResumeState(task) : undefined);
  }

  async cancel(id: string) {
    const task = await this.get(id);
    if (!task) return undefined;
    if (!["pending", "running"].includes(task.status)) return { task, cancelled: false };

    this.taskQueue.cancel(id);
    await this.markTaskCancelled(id, "user_requested");
    const updatedTask = await this.get(id);
    return { task: updatedTask ?? task, cancelled: true };
  }

  async list() {
    const repository = this.databaseService.getResearchRepository();
    if (repository) {
      return { tasks: await repository.listTasks() };
    }

    return {
      tasks: Array.from(this.tasks.values())
        .map((task) => this.withNodeRuns(task))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    };
  }

  async get(id: string) {
    const repository = this.databaseService.getResearchRepository();
    const task = (repository ? await repository.getTask(id) : undefined) ?? this.tasks.get(id);
    return task ? this.withNodeRuns(task) : undefined;
  }

  async getReport(taskId: string) {
    const repository = this.databaseService.getResearchRepository();
    return (repository ? await repository.getReportByTaskId(taskId) : undefined) ?? this.reportsByTask.get(taskId);
  }

  async getEvents(taskId: string) {
    const repository = this.databaseService.getResearchRepository();
    if (repository) {
      const task = await repository.getTask(taskId);
      return task ? task.events : undefined;
    }
    return this.tasks.get(taskId)?.events;
  }

  async recordExtensionInvocation(
    taskId: string,
    audit: ExtensionInvocationAudit,
    status: string,
    metadata: Record<string, unknown> = {}
  ): Promise<ResearchTask | undefined> {
    const task = await this.get(taskId);
    if (!task) return undefined;
    await this.addEvent(task, {
      id: `event_${crypto.randomUUID()}`,
      taskId,
      eventType: "extension_invoked",
      payload: {
        extensionId: audit.extensionId,
        capabilityId: audit.capabilityId,
        permissions: audit.permissions,
        permissionMode: audit.mode,
        allowed: audit.allowed,
        status,
        ...metadata
      },
      createdAt: new Date().toISOString()
    });
    return this.get(taskId);
  }

  async recordAgentResearchSessionStarted(taskId: string, metadata: Record<string, unknown>): Promise<ResearchTask | undefined> {
    const task = await this.get(taskId);
    if (!task) return undefined;
    await this.addEvent(task, {
      id: `event_${crypto.randomUUID()}`,
      taskId,
      eventType: "agent_research_session_started",
      payload: metadata,
      createdAt: new Date().toISOString()
    });
    return this.get(taskId);
  }

  subscribeToEvents(taskId: string, listener: (event: ResearchTaskEvent) => void) {
    const subscribers = this.eventSubscribers.get(taskId) ?? new Set<(event: ResearchTaskEvent) => void>();
    subscribers.add(listener);
    this.eventSubscribers.set(taskId, subscribers);
    return () => {
      subscribers.delete(listener);
      if (subscribers.size === 0) this.eventSubscribers.delete(taskId);
    };
  }

  private async executeTask(
    input: CreateResearchTaskInput,
    taskId: string,
    controller: AbortController,
    resumeState?: ResearchTaskResumeState
  ) {
    try {
      const claimedTask = await this.claimTaskForExecution(taskId);
      if (!claimedTask) return;
      const isAgentResearchSession = this.isAgentResearchSessionTask(claimedTask);

      const result = await runBootstrapResearchTask(
        input,
        {
          resolveAsset: isAgentResearchSession
            ? (assetInput) =>
                resolveResearchAssetWithAgent(
                  {
                    input: assetInput.input,
                    inputType: assetInput.inputType,
                    resolveAsset
                  },
                  process.env
                )
            : undefined,
          collectSources: isAgentResearchSession
            ? (sourceInput) =>
                collectResearchSourcesWithAgent(
                  {
                    asset: sourceInput.asset,
                    collectSources: (asset) => searchProjectSources(asset, process.env)
                  },
                  process.env
                )
            : undefined,
          fetchMarketData: isAgentResearchSession
            ? (marketInput) =>
                fetchResearchMarketDataWithAgent(
                  {
                    asset: marketInput.asset,
                    getTokenMarketData: (asset) => getTokenMarketData(asset, process.env),
                    getDefiProtocolMetrics: (asset) => getDefiProtocolMetrics(asset, process.env)
                  },
                  process.env
                )
            : undefined,
          fetchOnchainData: isAgentResearchSession
            ? (onchainInput) =>
                fetchResearchOnchainDataWithAgent(
                  {
                    asset: onchainInput.asset,
                    readErc20Metadata: (asset) => readErc20Metadata(asset, process.env),
                    readContractRisk: (asset) => readContractRisk(asset, process.env),
                    getDexLiquidityData: (asset) => getDexLiquidityData(asset, process.env),
                    getHolderConcentrationData: (asset) => getHolderConcentrationData(asset, process.env),
                    getArkhamAddressIntel: (asset) => getArkhamAddressIntel(asset, process.env)
                  },
                  process.env
                )
            : undefined,
          searchProjectSources: (asset) => searchProjectSources(asset, process.env),
          getTokenMarketData: (asset) => getTokenMarketData(asset, process.env),
          getDefiProtocolMetrics: (asset) => getDefiProtocolMetrics(asset, process.env),
          readErc20Metadata: (asset) => readErc20Metadata(asset, process.env),
          readContractRisk: (asset) => readContractRisk(asset, process.env),
          getDexLiquidityData: (asset) => getDexLiquidityData(asset, process.env),
          getHolderConcentrationData: (asset) => getHolderConcentrationData(asset, process.env),
          getArkhamAddressIntel: (asset) => getArkhamAddressIntel(asset, process.env),
          matchSimilarCases: isAgentResearchSession
            ? (caseInput) =>
                searchResearchKnowledgeWithAgent(
                  {
                    asset: caseInput.asset,
                    sources: caseInput.sources,
                    marketData: caseInput.marketData,
                    onchainData: caseInput.onchainData,
                    contractRiskData: caseInput.contractRiskData,
                    matchSimilarCases: (input) => this.matchSimilarCases(input)
                  },
                  process.env
                )
            : (caseInput) => this.matchSimilarCases(caseInput),
          analyzeRisk: isAgentResearchSession
            ? (riskInput) =>
                analyzeResearchRiskWithAgent(
                  {
                    riskInput: riskInput.riskInput,
                    calculateRisk: calculateInitialRisk
                  },
                  process.env
                )
            : undefined,
          draftResearchReport: ({ baseReport, researchContext }) =>
            draftResearchReportWithAgent(
              {
                baseReportMarkdown: baseReport.markdown,
                baseSummary: baseReport.summary,
                recommendation: baseReport.recommendation,
                confidence: baseReport.confidence,
                researchContext,
                requireWriteReportTool: isAgentResearchSession
              },
              process.env
            )
        },
        {
          taskId,
          signal: controller.signal,
          resumeFromNode: input.options.resumeFromNode,
          resumeState,
          onTaskUpdated: async (task) => {
            const mergedTask = this.mergeRunnerTask(task);
            this.tasks.set(mergedTask.id, this.withNodeRuns(mergedTask));
            await this.persistTask(mergedTask);
          },
          onEvent: async (event, task) => {
            const mergedTask = this.mergeRunnerTask(task);
            this.tasks.set(mergedTask.id, this.withNodeRuns(mergedTask));
            await this.persistEvent(event);
            this.publishEvent(event);
          }
        }
      );

      const finalTask = this.mergeRunnerTask(result.task);
      this.tasks.set(finalTask.id, this.withNodeRuns(finalTask));
      this.reportsByTask.set(result.task.id, result.report);
      const repository = this.databaseService.getResearchRepository();
      if (repository) {
        await repository.saveReport(result.report);
        await repository.saveReportSources(result.report.id, this.extractSourceCandidates(result.task));
      }

      const indexResult = isAgentResearchSession
        ? await indexResearchKnowledgeWithAgent(
            {
              report: result.report,
              indexReport: (report) => this.knowledgeService.indexReport(report)
            },
            process.env
          )
        : await this.knowledgeService.indexReport(result.report);
      await this.addEvent(finalTask, {
        id: `event_${crypto.randomUUID()}`,
        taskId: result.task.id,
        node: "index_knowledge",
        eventType: "knowledge_indexed",
        payload: {
          indexed: indexResult.indexed,
          degradedReason: indexResult.degradedReason,
          agentTool:
            "provider" in indexResult
              ? {
                  provider: indexResult.provider,
                  model: indexResult.model,
                  degradedReason: indexResult.degradedReason,
                  activeTools: indexResult.activeTools ?? [],
                  toolCalls: indexResult.toolCalls ?? [],
                  fallbackUsed: indexResult.fallbackUsed ?? false
                }
              : undefined
        },
        createdAt: new Date().toISOString()
      });
      await this.persistTask(finalTask);
    } catch (error) {
      if (error instanceof ResearchTaskCancelledError) {
        await this.markTaskCancelled(taskId, "cancelled_during_execution");
        return;
      }
      const task = this.tasks.get(taskId);
      if (!task) return;
      task.status = "failed";
      task.errorMessage = error instanceof Error ? error.message : String(error);
      task.updatedAt = new Date().toISOString();
      task.completedAt = task.updatedAt;
      await this.persistTask(task);
      await this.addEvent(task, {
        id: `event_${crypto.randomUUID()}`,
        taskId,
        eventType: "task_failed",
        payload: { error: task.errorMessage },
        createdAt: task.updatedAt
      });
    }
  }

  private async markTaskCancelled(taskId: string, reason: string) {
    const task = (await this.get(taskId)) ?? this.tasks.get(taskId);
    if (!task || task.status === "cancelled") return;
    task.status = "cancelled";
    task.errorMessage = "Task cancelled by user.";
    task.updatedAt = new Date().toISOString();
    task.completedAt = task.updatedAt;
    this.tasks.set(task.id, task);
    await this.persistTask(task);
    await this.addEvent(task, {
      id: `event_${crypto.randomUUID()}`,
      taskId,
      eventType: "task_cancelled",
      payload: { reason },
      createdAt: task.updatedAt
    });
  }

  private isAgentResearchSessionTask(task: ResearchTask): boolean {
    return this.agentResearchSessionTaskIds.has(task.id) || task.events.some((event) => event.eventType === "agent_research_session_started");
  }

  private async addEvent(task: ResearchTask, event: ResearchTaskEvent) {
    task.events.push(event);
    task.nodeRuns = deriveTaskNodeRuns(task.events);
    this.tasks.set(task.id, task);
    await this.persistEvent(event);
    this.publishEvent(event);
  }

  private publishEvent(event: ResearchTaskEvent) {
    const subscribers = this.eventSubscribers.get(event.taskId);
    if (!subscribers) return;
    for (const subscriber of subscribers) subscriber(event);
  }

  private extractSourceCandidates(task: ResearchTask): SourceCandidate[] {
    const collectSourcesEvent = task.events.find((event) => event.node === "collect_sources" && event.eventType === "node_completed");
    const sources = collectSourcesEvent?.payload.sources;
    if (!Array.isArray(sources)) return [];

    return sources.flatMap((source) => {
      const parsed = sourceCandidateSchema.safeParse(source);
      return parsed.success ? [parsed.data] : [];
    });
  }

  private async persistTask(task: ResearchTask) {
    const repository = this.databaseService.getResearchRepository();
    if (repository) await repository.saveTaskState(task);
  }

  private async persistEvent(event: ResearchTaskEvent) {
    const repository = this.databaseService.getResearchRepository();
    if (repository) await repository.appendTaskEvent(event);
  }

  private withNodeRuns(task: ResearchTask): ResearchTask {
    return {
      ...task,
      nodeRuns: deriveTaskNodeRuns(task.events)
    };
  }

  private mergeRunnerTask(task: ResearchTask): ResearchTask {
    const existing = this.tasks.get(task.id);
    if (!existing) return task;
    const events = mergeTaskEvents(existing.events, task.events);

    return {
      ...task,
      createdAt: existing.createdAt,
      events,
      nodeRuns: deriveTaskNodeRuns(events)
    };
  }

  private enqueueExistingTask(task: ResearchTask, input: CreateResearchTaskInput, resumeState?: ResearchTaskResumeState) {
    const controller = new AbortController();
    this.taskQueue.enqueue({
      taskId: task.id,
      controller,
      run: () => this.executeTask(input, task.id, controller, resumeState)
    });
  }

  private async claimTaskForExecution(taskId: string): Promise<ResearchTask | undefined> {
    const repository = this.databaseService.getResearchRepository();
    const task = (repository ? await repository.getTask(taskId) : undefined) ?? this.tasks.get(taskId);
    if (!task) return undefined;
    if (task.status !== "pending") {
      this.tasks.set(task.id, this.withNodeRuns(task));
      return undefined;
    }

    if (repository) {
      const claimed = await repository.claimPendingTask(taskId);
      if (!claimed) {
        const latest = await repository.getTask(taskId);
        if (latest) this.tasks.set(latest.id, this.withNodeRuns(latest));
        return undefined;
      }
      this.tasks.set(claimed.id, this.withNodeRuns(claimed));
      return claimed;
    }

    const claimed: ResearchTask = {
      ...task,
      status: "running",
      errorMessage: undefined,
      completedAt: undefined,
      updatedAt: new Date().toISOString()
    };
    this.tasks.set(claimed.id, this.withNodeRuns(claimed));
    await this.persistTask(claimed);
    return claimed;
  }

  private toCreateInput(task: ResearchTask): CreateResearchTaskInput {
    return {
      input: task.input,
      inputType: task.inputType,
      question: task.question,
      options: {
        deepResearch: Boolean(task.options.deepResearch),
        includeSocial: task.options.includeSocial !== false,
        includeOnchain: task.options.includeOnchain !== false,
        includeSimilarCases: task.options.includeSimilarCases !== false,
        resumeFromNode: isTaskNodeName(task.options.resumeFromNode) ? task.options.resumeFromNode : undefined,
        resumedFromTaskId: typeof task.options.resumedFromTaskId === "string" ? task.options.resumedFromTaskId : undefined
      }
    };
  }

  private async resolvePendingResumeState(task: ResearchTask): Promise<ResearchTaskResumeState | undefined> {
    if (!isTaskNodeName(task.options.resumeFromNode) || typeof task.options.resumedFromTaskId !== "string") return undefined;
    const originalTask = await this.get(task.options.resumedFromTaskId);
    return originalTask ? this.extractResumeState(originalTask) : undefined;
  }

  private getAutomaticResumeNode(task: ResearchTask): TaskNodeName | undefined {
    if (task.events.some((event) => event.eventType === "task_completed")) return undefined;

    const completedNodeIndexes = task.events
      .filter((event) => event.eventType === "node_completed" && event.node)
      .map((event) => taskNodeNames.indexOf(event.node as TaskNodeName))
      .filter((index) => index >= 0);

    const lastCompletedIndex = completedNodeIndexes.length ? Math.max(...completedNodeIndexes) : -1;
    const nextIndex = lastCompletedIndex + 1;
    return taskNodeNames[nextIndex] ?? taskNodeNames[lastCompletedIndex] ?? taskNodeNames[0];
  }

  private async matchSimilarCases(input: {
    asset: { input: string; symbol?: string; name?: string; address?: string; chain?: string };
    sources: SourceCandidate[];
  }): Promise<{ cases: SimilarCase[]; degradedReason?: string }> {
    const reports = await this.knowledgeService.listReports();
    if (!reports.length) {
      return { cases: [], degradedReason: "本地报告库暂无历史报告，无法匹配相似案例。" };
    }

    const queryTerms = new Set(
      [input.asset.symbol, input.asset.name, input.asset.address, input.asset.chain, input.asset.input]
        .flatMap((value) => tokenizeCaseText(value))
        .filter((value) => value.length >= 2)
    );
    for (const source of input.sources.slice(0, 5)) {
      for (const token of tokenizeCaseText(`${source.title} ${source.url}`)) {
        if (token.length >= 4) queryTerms.add(token);
      }
    }

    const scored = reports
      .map((report) => scoreSimilarCase(report, queryTerms, input.asset.input))
      .filter((item) => item.similarityScore > 0)
      .sort((a, b) => b.similarityScore - a.similarityScore || b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5);

    return {
      cases: scored,
      degradedReason: scored.length ? undefined : "本地报告库存在报告，但未找到可解释的文本相似案例。"
    };
  }

  private extractResumeState(task: ResearchTask): ResearchTaskResumeState {
    const state: ResearchTaskResumeState = {
      degradedReasons: []
    };
    const pushReason = (value: unknown) => {
      if (typeof value === "string" && value.trim()) state.degradedReasons?.push(value.trim());
    };
    const pushObjectReason = (value: unknown) => {
      if (value && typeof value === "object" && "degradedReason" in value) {
        pushReason((value as { degradedReason?: unknown }).degradedReason);
      }
    };

    for (const event of [...task.events].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      if (event.eventType !== "node_completed") continue;
      pushReason(event.payload.reason);

      if (event.node === "resolve_asset") {
        if (event.payload.asset && typeof event.payload.asset === "object") {
          state.asset = event.payload.asset as ResearchTaskResumeState["asset"];
          pushObjectReason(state.asset);
        }
      }

      if (event.node === "collect_sources") {
        const sources = event.payload.sources;
        if (Array.isArray(sources)) {
          state.sources = sources.flatMap((source) => {
            const parsed = sourceCandidateSchema.safeParse(source);
            return parsed.success ? [parsed.data] : [];
          });
        }
      }

      if (event.node === "fetch_market_data") {
        const marketData = event.payload.marketData;
        if (Array.isArray(marketData)) {
          state.marketData = marketData as ResearchTaskResumeState["marketData"];
          for (const item of marketData) pushObjectReason(item);
        }
      }

      if (event.node === "fetch_onchain_data") {
        state.onchainData = event.payload.onchainData as ResearchTaskResumeState["onchainData"];
        state.contractRiskData = event.payload.contractRiskData as ResearchTaskResumeState["contractRiskData"];
        state.dexLiquidityData = event.payload.dexLiquidityData as ResearchTaskResumeState["dexLiquidityData"];
        state.holderConcentrationData = event.payload.holderConcentrationData as ResearchTaskResumeState["holderConcentrationData"];
        state.arkhamIntel = event.payload.arkhamIntel as ResearchTaskResumeState["arkhamIntel"];
        pushObjectReason(state.onchainData);
        pushObjectReason(state.contractRiskData);
        pushObjectReason(state.dexLiquidityData);
        pushObjectReason(state.holderConcentrationData);
        pushObjectReason(state.arkhamIntel);
      }

      if (event.node === "match_cases") {
        const cases = event.payload.cases;
        if (Array.isArray(cases)) state.similarCases = cases as ResearchTaskResumeState["similarCases"];
      }
    }

    state.degradedReasons = [...new Set(state.degradedReasons)];
    return state;
  }
}

function tokenizeCaseText(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .toLowerCase()
    .replace(/https?:\/\//g, " ")
    .split(/[^a-z0-9\u4e00-\u9fa5]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function mergeTaskEvents(left: ResearchTaskEvent[], right: ResearchTaskEvent[]): ResearchTaskEvent[] {
  const byId = new Map<string, ResearchTaskEvent>();
  for (const event of [...left, ...right]) {
    byId.set(event.id, event);
  }
  return Array.from(byId.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function isTaskNodeName(value: unknown): value is TaskNodeName {
  return typeof value === "string" && (taskNodeNames as readonly string[]).includes(value);
}

function parseWorkerPollInterval(value: string | undefined): number {
  const parsed = Number(value ?? 2000);
  if (!Number.isFinite(parsed)) return 2000;
  return Math.max(250, Math.floor(parsed));
}

function scoreSimilarCase(report: ResearchReport, queryTerms: Set<string>, rawInput: string): SimilarCase {
  const haystack = `${report.title}\n${report.summary}\n${report.markdown}`.toLowerCase();
  const matchedReasons: string[] = [];
  let score = 0;
  const raw = rawInput.trim().toLowerCase();

  if (raw && haystack.includes(raw)) {
    score += 45;
    matchedReasons.push("input exact match");
  }

  for (const term of queryTerms) {
    if (!term || term === raw) continue;
    if (haystack.includes(term)) {
      score += term.length >= 8 ? 12 : 7;
      if (matchedReasons.length < 4) matchedReasons.push(`term:${term}`);
    }
  }

  if (report.recommendation === "Avoid" || report.recommendation === "Reduce") {
    score += 5;
    if (matchedReasons.length < 4) matchedReasons.push(`risk:${report.recommendation}`);
  }

  return {
    reportId: report.id,
    title: report.title,
    recommendation: report.recommendation,
    confidence: report.confidence,
    similarityScore: Math.min(100, score),
    matchedReasons,
    createdAt: report.createdAt
  };
}
