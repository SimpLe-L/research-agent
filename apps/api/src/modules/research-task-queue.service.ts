import { Injectable } from "@nestjs/common";

type ResearchTaskQueueJob = {
  taskId: string;
  controller: AbortController;
  run: () => Promise<void>;
};

export type ResearchTaskExecutorMode = "local" | "api_only" | "worker";

export type ResearchTaskQueueStatus = {
  mode: "in_memory" | "external_worker";
  executorMode: ResearchTaskExecutorMode;
  concurrency: number;
  pending: number;
  running: number;
  pendingTaskIds: string[];
  runningTaskIds: string[];
  databaseReachable?: boolean;
  persistedPending?: number;
  persistedRunning?: number;
  persistedPendingTaskIds?: string[];
  persistedRunningTaskIds?: string[];
  degradedReason: string;
};

@Injectable()
export class ResearchTaskQueueService {
  private readonly pendingJobs: ResearchTaskQueueJob[] = [];
  private readonly runningJobs = new Map<string, ResearchTaskQueueJob>();
  private readonly concurrency = parseQueueConcurrency(process.env.RESEARCH_TASK_QUEUE_CONCURRENCY);
  private readonly executorMode = parseResearchTaskExecutorMode(process.env.RESEARCH_TASK_EXECUTOR_MODE);

  enqueue(job: ResearchTaskQueueJob): ResearchTaskQueueStatus {
    if (this.runningJobs.has(job.taskId) || this.pendingJobs.some((pendingJob) => pendingJob.taskId === job.taskId)) {
      return this.status();
    }

    this.pendingJobs.push(job);
    queueMicrotask(() => this.drain());
    return this.status();
  }

  cancel(taskId: string): boolean {
    const pendingIndex = this.pendingJobs.findIndex((job) => job.taskId === taskId);
    if (pendingIndex >= 0) {
      const [job] = this.pendingJobs.splice(pendingIndex, 1);
      job.controller.abort();
      return true;
    }

    const runningJob = this.runningJobs.get(taskId);
    if (!runningJob) return false;
    runningJob.controller.abort();
    return true;
  }

  hasTask(taskId: string): boolean {
    return this.runningJobs.has(taskId) || this.pendingJobs.some((pendingJob) => pendingJob.taskId === taskId);
  }

  status(): ResearchTaskQueueStatus {
    return {
      mode: this.executorMode === "local" ? "in_memory" : "external_worker",
      executorMode: this.executorMode,
      concurrency: this.concurrency,
      pending: this.pendingJobs.length,
      running: this.runningJobs.size,
      pendingTaskIds: this.pendingJobs.map((job) => job.taskId),
      runningTaskIds: Array.from(this.runningJobs.keys()),
      degradedReason: this.describeMode()
    };
  }

  private describeMode(): string {
    if (this.executorMode === "api_only") {
      return "This API process only persists pending research tasks. Start `pnpm worker:research` or `pnpm start:worker:research` to execute them from PostgreSQL.";
    }
    if (this.executorMode === "worker") {
      return "This process polls PostgreSQL for pending research tasks and executes them outside the HTTP API process. Scheduling is still PostgreSQL polling, not BullMQ or pg-boss.";
    }
    return "Research tasks are scheduled through this API process. PostgreSQL-backed pending tasks are rehydrated on startup when the database is reachable, but active execution is not yet backed by an external durable worker.";
  }

  private drain() {
    while (this.runningJobs.size < this.concurrency) {
      const job = this.pendingJobs.shift();
      if (!job) return;
      if (job.controller.signal.aborted) continue;

      this.runningJobs.set(job.taskId, job);
      void job.run().finally(() => {
        this.runningJobs.delete(job.taskId);
        this.drain();
      });
    }
  }
}

function parseQueueConcurrency(value: string | undefined): number {
  const parsed = Number(value ?? 2);
  if (!Number.isFinite(parsed)) return 2;
  return Math.max(1, Math.floor(parsed));
}

export function parseResearchTaskExecutorMode(value: string | undefined): ResearchTaskExecutorMode {
  if (value === "api_only" || value === "worker") return value;
  return "local";
}
