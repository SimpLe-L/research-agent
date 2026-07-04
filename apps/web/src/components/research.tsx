import { RefreshCw, RotateCcw, XCircle } from "lucide-react";

export type Task = {
  id: string;
  input: string;
  inputType?: string;
  status: string;
  currentNode?: string;
  question?: string;
  createdAt: string;
  updatedAt?: string;
  events: Array<{ id: string; node?: string; eventType: string; createdAt: string; payload: Record<string, unknown> }>;
  nodeRuns?: TaskNodeRun[];
};

export type TaskEvent = Task["events"][number];

export type TaskNodeRun = {
  node: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
  payload: Record<string, unknown>;
};

export type QueueStatus = {
  mode: string;
  executorMode?: string;
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
  degradedReason?: string;
};

export function QueueStatusPanel({
  status,
  onRefresh
}: {
  status: QueueStatus | null;
  onRefresh: () => void;
}) {
  return (
    <section className="panel queuePanel" data-testid="queue-status-panel">
      <div className="panelHeader">
        <h2>Queue</h2>
        <button className="iconButton" onClick={onRefresh} title="Refresh queue">
          <RefreshCw size={15} />
        </button>
      </div>
      {status ? (
        <>
          <div className="queueStats">
            <span>
              <strong>{status.pending}</strong>
              pending
            </span>
            <span>
              <strong>{status.running}</strong>
              running
            </span>
            <span>
              <strong>{status.concurrency}</strong>
              concurrency
            </span>
          </div>
          <small className="queueMode">
            {status.executorMode ? `${status.mode} / ${status.executorMode}` : status.mode}
          </small>
          {status.databaseReachable && (
            <small className="queueMode">
              persisted {status.persistedPending ?? 0} pending / {status.persistedRunning ?? 0} running
            </small>
          )}
          {status.degradedReason && <p className="notice">{status.degradedReason}</p>}
        </>
      ) : (
        <p className="empty">Queue status unavailable.</p>
      )}
    </section>
  );
}

export function TaskList({
  tasks,
  activeTaskId,
  onRefresh,
  onOpen
}: {
  tasks: Task[];
  activeTaskId: string | null;
  onRefresh: () => void;
  onOpen: (taskId: string) => void;
}) {
  return (
    <section className="panel" data-testid="task-list-panel">
      <div className="panelHeader">
        <h2>Tasks</h2>
        <button className="iconButton" onClick={onRefresh} title="Refresh tasks">
          <RefreshCw size={15} />
        </button>
      </div>
      <div className="taskList">
        {tasks.map((task) => (
          <button key={task.id} className={task.id === activeTaskId ? "task active" : "task"} onClick={() => onOpen(task.id)}>
            <span>{task.input}</span>
            <small>
              {task.status} / {task.currentNode ?? "queued"}
            </small>
          </button>
        ))}
        {!tasks.length && <p className="empty">No tasks yet.</p>}
      </div>
    </section>
  );
}

export function TaskProgress({
  task,
  canCancel,
  canRetry,
  onCancel,
  onRetry,
  onRetryFromNode
}: {
  task: Task | undefined;
  canCancel: boolean;
  canRetry: boolean;
  onCancel: (taskId: string) => void;
  onRetry: (taskId: string) => void;
  onRetryFromNode: (taskId: string, resumeFromNode: string) => void;
}) {
  return (
    <section className="panel" data-testid="task-progress-panel">
      <div className="sectionHeader">
        <h2>Task Progress</h2>
        {task && (
          <div className="actionGroup">
            {canCancel && (
              <button className="iconButton danger" onClick={() => onCancel(task.id)} title="Cancel task">
                <XCircle size={15} />
              </button>
            )}
            {canRetry && (
              <>
                <button className="iconButton" onClick={() => onRetry(task.id)} title="Retry full task">
                  <RotateCcw size={15} />
                </button>
                {task.currentNode && (
                  <button className="smallAction" onClick={() => onRetryFromNode(task.id, task.currentNode!)} title="Retry from current node">
                    From node
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
      {task ? (
        <>
          <div className="taskSummary">
            <strong>{task.status}</strong>
            <span>{task.currentNode ?? "task"}</span>
            <small>{task.question ?? task.input}</small>
          </div>
          <div className="nodeRunList">
            {(task.nodeRuns ?? deriveNodeRunsFromEvents(task.events)).map((nodeRun) => (
              <div key={nodeRun.node} className={`nodeRun ${nodeRun.status}`}>
                <div>
                  <strong>{nodeRun.node}</strong>
                  <span>{nodeRun.status}</span>
                </div>
                <small>
                  {nodeRun.startedAt ? new Date(nodeRun.startedAt).toLocaleTimeString() : "not started"}
                  {nodeRun.completedAt ? ` -> ${new Date(nodeRun.completedAt).toLocaleTimeString()}` : ""}
                  {nodeRun.durationMs !== undefined ? ` / ${formatDuration(nodeRun.durationMs)}` : ""}
                </small>
                {nodeRun.error && <em>{nodeRun.error}</em>}
                {Object.keys(nodeRun.payload).length > 0 && <code>{summarizePayload(nodeRun.payload)}</code>}
              </div>
            ))}
          </div>
          <ol className="events">
            {task.events.map((event) => (
              <li key={event.id}>
                <strong>{event.node ?? "task"}</strong>
                <span>{event.eventType}</span>
                <small>{new Date(event.createdAt).toLocaleTimeString()}</small>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="empty">Create or select a research task to inspect node events.</p>
      )}
    </section>
  );
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function summarizePayload(payload: Record<string, unknown>): string {
  const keys = Object.keys(payload);
  if (!keys.length) return "{}";
  return keys.slice(0, 4).join(", ") + (keys.length > 4 ? ` +${keys.length - 4}` : "");
}

function deriveNodeRunsFromEvents(events: TaskEvent[]): TaskNodeRun[] {
  const nodeNames = [
    "resolve_asset",
    "collect_sources",
    "fetch_market_data",
    "fetch_onchain_data",
    "analyze_project",
    "analyze_risk",
    "match_cases",
    "write_report",
    "validate_report",
    "index_knowledge"
  ];
  const byNode = new Map<string, TaskNodeRun>(nodeNames.map((node) => [node, { node, status: "pending", payload: {} }]));
  for (const event of [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (!event.node) continue;
    const current = byNode.get(event.node);
    if (!current) continue;
    const next: TaskNodeRun = { ...current, payload: event.payload };
    if (event.eventType === "node_started" || event.eventType === "agent_report_started") {
      next.status = "running";
      next.startedAt = next.startedAt ?? event.createdAt;
    } else if (event.eventType === "node_completed") {
      next.status = event.payload.degraded ? "needs_review" : "completed";
      next.completedAt = event.createdAt;
    } else if (event.eventType === "node_skipped") {
      next.status = "skipped";
      next.completedAt = event.createdAt;
    } else if (event.eventType === "knowledge_indexed" || event.eventType === "agent_report_completed") {
      next.status = "completed";
      next.completedAt = event.createdAt;
    } else if (event.eventType === "agent_report_degraded") {
      next.status = "needs_review";
      next.completedAt = event.createdAt;
      next.error = typeof event.payload.reason === "string" ? event.payload.reason : undefined;
    } else if (event.eventType.includes("failed") || event.eventType.includes("cancelled")) {
      next.status = "failed";
      next.completedAt = event.createdAt;
      next.error = typeof event.payload.error === "string" ? event.payload.error : event.eventType;
    }
    if (next.startedAt && next.completedAt) {
      const started = Date.parse(next.startedAt);
      const completed = Date.parse(next.completedAt);
      if (Number.isFinite(started) && Number.isFinite(completed) && completed >= started) {
        next.durationMs = completed - started;
      }
    }
    byNode.set(event.node, next);
  }
  return nodeNames.map((node) => byNode.get(node)!);
}
