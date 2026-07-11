import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  projectDocSearchSchema,
  researchReportSchema,
  researchRequestSchema,
  researchWebSearchSchema,
  type ProjectDocSearchInput,
  type ResearchRequest,
  type ResearchWebSearchInput,
  type WorkflowNodeEvent,
  type WorkflowRun
} from "@sp-agent/shared";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { LocalJsonStore } from "./local-json-store.service.js";
import { ResearchService } from "./research.service.js";
import { ResearchSourceService } from "./research-source.service.js";

type WorkflowsFile = {
  workflows: WorkflowRun[];
};

type ProjectDocHit = {
  file: string;
  score: number;
  preview: string;
};

const PROJECT_DOC_ALLOWLIST = ["AGENTS.md", "ARCHITECTURE.md", "PROCESS.md", "package.json"];
const STALE_WORKFLOW_MS = 5 * 60 * 1000;

@Injectable()
export class WorkflowsService {
  constructor(
    @Inject(LocalJsonStore) private readonly store: LocalJsonStore,
    @Inject(ResearchService) private readonly researchService: ResearchService,
    @Inject(ResearchSourceService) private readonly researchSourceService: ResearchSourceService
  ) {}

  async list() {
    await this.recoverStaleWorkflows();
    return (await this.readFile()).workflows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string) {
    await this.recoverStaleWorkflows();
    return findWorkflow(await this.readFile(), id);
  }

  async cancel(id: string) {
    const file = await this.readFile();
    const workflow = findWorkflow(file, id);
    if (workflow.status === "completed" || workflow.status === "failed" || workflow.status === "cancelled") {
      workflow.degradedReason = `Workflow is already ${workflow.status}; cancellation was recorded as a no-op.`;
    } else {
      const now = new Date().toISOString();
      workflow.status = "cancelled";
      workflow.updatedAt = now;
      workflow.completedAt = now;
      workflow.nodeEvents.push(makeNodeEvent("cancel", "Cancellation request", "cancelled", { requestedAt: now }));
    }
    await this.writeFile(file);
    return { workflow };
  }

  async retry(id: string) {
    const workflow = await this.get(id);
    if (workflow.kind === "local.project.search_docs") {
      return this.runProjectDocSearch(projectDocSearchSchema.parse(workflow.input), { retriedFrom: id });
    }
    if (workflow.kind === "personal.research.run") {
      if ((workflow.input as Record<string, unknown>).remoteSearch === "tavily") {
        return this.runWebResearch(researchWebSearchSchema.parse(workflow.input), { retriedFrom: id });
      }
      return this.runResearch(researchRequestSchema.parse(workflow.input), { retriedFrom: id });
    }
    throw new BadRequestException(`Workflow ${workflow.kind} is not retryable by this runner`);
  }

  async startProjectDocSearch(input: ProjectDocSearchInput) {
    const workflow = await this.createWorkflow(input, "pending");
    setImmediate(() => {
      this.executeProjectDocSearch(workflow.id).catch((error) => {
        console.error(`Project doc workflow ${workflow.id} failed`, error);
      });
    });
    return { workflow };
  }

  async runProjectDocSearch(input: ProjectDocSearchInput, metadata: Record<string, unknown> = {}) {
    const workflow = await this.createWorkflow(input, "running", metadata);
    await this.executeProjectDocSearch(workflow.id);
    return { workflow: await this.get(workflow.id) };
  }

  async startResearch(input: ResearchRequest) {
    const workflow = await this.createWorkflow(input, "pending", {}, "personal.research.run");
    setImmediate(() => {
      this.executeResearch(workflow.id).catch((error) => {
        console.error(`Research workflow ${workflow.id} failed`, error);
      });
    });
    return { workflow };
  }

  async runResearch(input: ResearchRequest, metadata: Record<string, unknown> = {}) {
    const workflow = await this.createWorkflow(input, "running", metadata, "personal.research.run");
    await this.executeResearch(workflow.id);
    return { workflow: await this.get(workflow.id) };
  }

  async runWebResearch(input: ResearchWebSearchInput, metadata: Record<string, unknown> = {}) {
    const request: ResearchRequest = {
      question: input.question,
      sessionId: input.sessionId,
      sourceScopes: ["local_documents", "bookmarks", "web"],
      sourceIds: [],
      maxSources: 12,
      reportFormat: "brief",
      strategy: "deterministic"
    };
    const workflow = await this.createWorkflow(
      { ...request, remoteSearch: "tavily", maxResults: input.maxResults },
      "running",
      metadata,
      "personal.research.run"
    );
    await this.executeResearch(workflow.id);
    return { workflow: await this.get(workflow.id) };
  }

  async getResearchReport(id: string) {
    const workflow = await this.get(id);
    if (workflow.kind !== "personal.research.run") throw new BadRequestException(`Workflow ${id} is not a research run`);
    if (!workflow.result) throw new BadRequestException(`Research workflow ${id} does not have a report yet`);
    return { workflow, report: researchReportSchema.parse(workflow.result) };
  }

  async recentResearchBriefing(limit: number) {
    const workflows = (await this.list()).filter((workflow) => workflow.kind === "personal.research.run").slice(0, limit);
    return {
      runs: workflows.map((workflow) => {
        const report = workflow.result ? researchReportSchema.safeParse(workflow.result).data : undefined;
        return { workflowId: workflow.id, status: workflow.status, question: report?.request.question, answer: report?.answer, degradedReason: workflow.degradedReason, updatedAt: workflow.updatedAt };
      })
    };
  }

  private async createWorkflow(
    input: Record<string, unknown>,
    status: WorkflowRun["status"],
    metadata: Record<string, unknown> = {},
    kind = "local.project.search_docs"
  ) {
    const now = new Date().toISOString();
    const workflow: WorkflowRun = {
      id: `workflow_${crypto.randomUUID()}`,
      kind,
      status,
      input,
      createdAt: now,
      updatedAt: now,
      startedAt: status === "running" ? now : undefined,
      nodeEvents: [
        makeNodeEvent(
          "start",
          status === "pending"
            ? kind === "personal.research.run" ? "Queue research workflow" : "Queue project document search"
            : kind === "personal.research.run" ? "Start research workflow" : "Start project document search",
          status === "pending" ? "pending" : "completed",
          { input, ...metadata },
          status === "running" ? now : undefined,
          status === "running" ? now : undefined
        )
      ]
    };
    const file = await this.readFile();
    file.workflows.push(workflow);
    await this.writeFile(file);
    return workflow;
  }

  private async executeProjectDocSearch(id: string) {
    const file = await this.readFile();
    const workflow = findWorkflow(file, id);
    if (workflow.status === "cancelled") return;
    if (workflow.status === "pending") {
      const now = new Date().toISOString();
      workflow.status = "running";
      workflow.startedAt = now;
      workflow.updatedAt = now;
      workflow.nodeEvents.push(makeNodeEvent("run", "Run queued project document search", "running", {}, now));
      await this.replaceWorkflow(workflow);
    }
    try {
      const input = projectDocSearchSchema.parse(workflow.input);
      const docs = await this.readProjectDocs();
      workflow.nodeEvents.push(makeNodeEvent("read_docs", "Read allowlisted project docs", "completed", { files: docs.map((doc) => doc.file) }));
      const terms = tokenize(input.query);
      const hits = docs
        .map((doc) => ({ file: doc.file, score: scoreText(doc.content, terms), preview: makePreview(doc.content, terms) }))
        .filter((hit) => hit.score > 0)
        .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
        .slice(0, input.limit);
      workflow.nodeEvents.push(makeNodeEvent("rank", "Rank document matches", "completed", { hitCount: hits.length, terms }));
      workflow.result = {
        query: input.query,
        hits,
        searchedFiles: docs.map((doc) => doc.file)
      };
      if (hits.length === 0) workflow.degradedReason = "No allowlisted project documents matched the query.";
      const completedAt = new Date().toISOString();
      workflow.status = "completed";
      workflow.updatedAt = completedAt;
      workflow.completedAt = completedAt;
    } catch (error) {
      const completedAt = new Date().toISOString();
      workflow.status = "failed";
      workflow.updatedAt = completedAt;
      workflow.completedAt = completedAt;
      workflow.error = error instanceof Error ? error.message : "Project document workflow failed.";
      workflow.nodeEvents.push(makeNodeEvent("error", "Workflow failed", "failed", {}, undefined, completedAt, workflow.error));
    }

    await this.replaceWorkflow(workflow);
  }

  private async executeResearch(id: string) {
    const file = await this.readFile();
    const workflow = findWorkflow(file, id);
    if (workflow.status === "cancelled") return;
    if (workflow.status === "pending") {
      const now = new Date().toISOString();
      workflow.status = "running";
      workflow.startedAt = now;
      workflow.updatedAt = now;
      workflow.nodeEvents.push(makeNodeEvent("run", "Run queued research workflow", "running", {}, now));
      await this.replaceWorkflow(workflow);
    }
    try {
      const input = researchRequestSchema.parse(workflow.input);
      const remoteSearch = (workflow.input as Record<string, unknown>).remoteSearch === "tavily"
        ? await this.researchSourceService.searchWeb(researchWebSearchSchema.parse(workflow.input))
        : undefined;
      const execution = await this.researchService.execute(input, workflow.id, remoteSearch);
      for (const node of execution.nodes) {
        workflow.nodeEvents.push(makeNodeEvent(node.nodeId, node.label, "completed", node.payload, undefined, undefined, undefined, node.degradedReason));
      }
      workflow.result = execution.report;
      workflow.degradedReason = execution.report.degradedReason;
      const completedAt = new Date().toISOString();
      workflow.status = "completed";
      workflow.updatedAt = completedAt;
      workflow.completedAt = completedAt;
    } catch (error) {
      const completedAt = new Date().toISOString();
      workflow.status = "failed";
      workflow.updatedAt = completedAt;
      workflow.completedAt = completedAt;
      workflow.error = error instanceof Error ? error.message : "Research workflow failed.";
      workflow.nodeEvents.push(makeNodeEvent("error", "Research workflow failed", "failed", {}, undefined, completedAt, workflow.error));
    }
    await this.replaceWorkflow(workflow);
  }

  private async recoverStaleWorkflows() {
    const file = await this.readFile();
    const nowMs = Date.now();
    let changed = false;
    for (const workflow of file.workflows) {
      if (workflow.status !== "pending" && workflow.status !== "running") continue;
      const reference = Date.parse(workflow.updatedAt || workflow.createdAt);
      if (!Number.isFinite(reference) || nowMs - reference < STALE_WORKFLOW_MS) continue;
      const completedAt = new Date().toISOString();
      workflow.status = "failed";
      workflow.updatedAt = completedAt;
      workflow.completedAt = completedAt;
      workflow.degradedReason = "Workflow was recovered after API restart or stalled execution and marked failed.";
      workflow.error = "Workflow did not complete inside the local recovery window.";
      workflow.nodeEvents.push(
        makeNodeEvent("recover_stale", "Recover stale workflow", "failed", { staleAfterMs: STALE_WORKFLOW_MS }, undefined, completedAt, workflow.error)
      );
      changed = true;
    }
    if (changed) await this.writeFile(file);
  }

  private async readProjectDocs() {
    const root = resolve(process.env.SP_AGENT_PROJECT_ROOT ?? process.cwd());
    const docs = await Promise.all(
      PROJECT_DOC_ALLOWLIST.map(async (file) => {
        const absolutePath = resolve(root, file);
        const content = await readFile(absolutePath, "utf8");
        return { file: basename(absolutePath), content };
      })
    );
    return docs;
  }

  private async replaceWorkflow(workflow: WorkflowRun) {
    const file = await this.readFile();
    const index = file.workflows.findIndex((item) => item.id === workflow.id);
    if (index >= 0) file.workflows[index] = workflow;
    else file.workflows.push(workflow);
    await this.writeFile(file);
  }

  private async readFile(): Promise<WorkflowsFile> {
    const file = await this.store.read<WorkflowsFile>("workflows.json", { workflows: [] });
    return { workflows: file.workflows ?? [] };
  }

  private async writeFile(file: WorkflowsFile) {
    await this.store.write("workflows.json", file);
  }
}

function findWorkflow(file: WorkflowsFile, id: string) {
  const workflow = file.workflows.find((item) => item.id === id);
  if (!workflow) throw new NotFoundException(`Workflow ${id} not found`);
  return workflow;
}

function makeNodeEvent(
  nodeId: string,
  label: string,
  status: WorkflowNodeEvent["status"],
  payload: Record<string, unknown> = {},
  startedAt?: string,
  completedAt?: string,
  error?: string,
  degradedReason?: string
): WorkflowNodeEvent {
  const now = new Date().toISOString();
  return {
    id: `workflow_node_${crypto.randomUUID()}`,
    nodeId,
    label,
    status,
    payload,
    error,
    degradedReason,
    createdAt: now,
    startedAt: startedAt ?? now,
    completedAt: completedAt ?? now
  };
}

function scoreText(content: string, terms: string[]) {
  const haystack = content.toLowerCase();
  return terms.reduce((score, term) => score + countOccurrences(haystack, term), 0);
}

function makePreview(content: string, terms: string[]) {
  const lower = content.toLowerCase();
  const firstIndex = terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, firstIndex - 120);
  return content.slice(start, start + 360).replace(/\s+/g, " ").trim();
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

function tokenize(value: string) {
  const terms = value
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5._-]+/u)
    .map((term) => term.trim())
    .filter(Boolean);
  return Array.from(new Set(terms.length > 0 ? terms : [value.toLowerCase()]));
}
