import type {
  ChatMessage,
  ChatSession,
  CreateWatchlistItemInput,
  MarketSnapshot,
  PersistedSourceDocument,
  PersistedReportSource,
  ReportAnnotation,
  ResearchReport,
  SourceDocumentDetail,
  SourceCandidate,
  ResearchTask,
  ResearchTaskEvent,
  UpsertReportAnnotationInput,
  UpdateWatchlistItemInput,
  WatchlistItem
} from "@sp-agent/shared";
import { deriveTaskNodeRuns } from "@sp-agent/shared";
import { createHash } from "node:crypto";
import type { QueryResultRow } from "pg";
import type { DatabaseClient } from "./client.js";

type TaskRow = QueryResultRow & {
  id: string;
  input: string;
  input_type: ResearchTask["inputType"];
  status: ResearchTask["status"];
  current_node: ResearchTask["currentNode"] | null;
  question: string;
  options_json: Record<string, unknown>;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
};

type EventRow = QueryResultRow & {
  id: string;
  task_id: string;
  node: ResearchTaskEvent["node"] | null;
  event_type: string;
  payload_json: Record<string, unknown>;
  created_at: Date;
};

type ReportRow = QueryResultRow & {
  id: string;
  task_id: string;
  title: string;
  markdown: string;
  summary: string;
  recommendation: ResearchReport["recommendation"];
  confidence: string;
  created_at: Date;
};

type ReportAnnotationRow = QueryResultRow & {
  id: string;
  report_id: string;
  tags_json: unknown;
  note: string;
  confidence: string | null;
  created_at: Date;
  updated_at: Date;
};

type ReportSourceRow = QueryResultRow & {
  id: string;
  report_id: string;
  usage_type: string;
  source_type: string;
  url: string | null;
  title: string | null;
  content_text: string | null;
  content_hash: string | null;
  fetched_at: Date | null;
  metadata_json: Record<string, unknown>;
};

type SourceDocumentRow = QueryResultRow & {
  id: string;
  source_type: string;
  url: string | null;
  title: string | null;
  content_text: string | null;
  content_hash: string | null;
  fetched_at: Date | null;
  metadata_json: Record<string, unknown>;
  report_count: string;
  last_report_id: string | null;
};

type SourceReportUsageRow = QueryResultRow & {
  report_id: string;
  usage_type: string;
  title: string;
  recommendation: ResearchReport["recommendation"];
  confidence: string;
  created_at: Date;
};

type MarketSnapshotRow = QueryResultRow & {
  id: string;
  scope: string;
  metrics_json: Record<string, unknown>;
  regime: MarketSnapshot["regime"];
  recommendation: MarketSnapshot["recommendation"];
  confidence: string;
  created_at: Date;
};

type WatchlistRow = QueryResultRow & {
  id: string;
  token_id: string;
  input: string;
  note: string | null;
  risk_level: WatchlistItem["riskLevel"] | null;
  monitor_rules_json: Record<string, unknown>;
  created_at: Date;
};

type ChatSessionRow = QueryResultRow & {
  id: string;
  title: string;
  created_at: Date;
  updated_at: Date;
};

type ChatMessageRow = QueryResultRow & {
  id: string;
  session_id: string;
  role: ChatMessage["role"];
  content: string;
  metadata_json: Record<string, unknown>;
  created_at: Date;
};

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapEvent(row: EventRow): ResearchTaskEvent {
  return {
    id: row.id,
    taskId: row.task_id,
    node: row.node ?? undefined,
    eventType: row.event_type,
    payload: row.payload_json,
    createdAt: toIso(row.created_at)
  };
}

function mapTask(row: TaskRow, events: ResearchTaskEvent[] = []): ResearchTask {
  return {
    id: row.id,
    input: row.input,
    inputType: row.input_type,
    question: row.question,
    options: row.options_json,
    status: row.status,
    currentNode: row.current_node ?? undefined,
    errorMessage: row.error_message ?? undefined,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    completedAt: row.completed_at ? toIso(row.completed_at) : undefined,
    events,
    nodeRuns: deriveTaskNodeRuns(events)
  };
}

function mapReport(row: ReportRow): ResearchReport {
  return {
    id: row.id,
    taskId: row.task_id,
    title: row.title,
    markdown: row.markdown,
    summary: row.summary,
    recommendation: row.recommendation,
    confidence: Number(row.confidence),
    createdAt: toIso(row.created_at)
  };
}

function mapReportAnnotation(row: ReportAnnotationRow): ReportAnnotation {
  return {
    id: row.id,
    reportId: row.report_id,
    tags: normalizeTags(row.tags_json),
    note: row.note,
    confidence: row.confidence === null ? undefined : Number(row.confidence),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapReportSource(row: ReportSourceRow): PersistedReportSource {
  return {
    id: row.id,
    reportId: row.report_id,
    usageType: row.usage_type,
    sourceType: row.source_type,
    url: row.url ?? undefined,
    title: row.title ?? undefined,
    contentText: row.content_text ?? undefined,
    contentHash: row.content_hash ?? undefined,
    fetchedAt: row.fetched_at ? toIso(row.fetched_at) : undefined,
    metadata: row.metadata_json
  };
}

function mapSourceDocument(row: SourceDocumentRow): PersistedSourceDocument {
  return {
    id: row.id,
    sourceType: row.source_type,
    url: row.url ?? undefined,
    title: row.title ?? undefined,
    contentText: row.content_text ?? undefined,
    contentHash: row.content_hash ?? undefined,
    fetchedAt: row.fetched_at ? toIso(row.fetched_at) : undefined,
    metadata: row.metadata_json,
    reportCount: Number(row.report_count),
    lastReportId: row.last_report_id ?? undefined
  };
}

function mapMarketSnapshot(row: MarketSnapshotRow): MarketSnapshot {
  const metrics = row.metrics_json;
  const degradedReasons = Array.isArray(metrics.degradedReasons) ? metrics.degradedReasons.filter((item): item is string => typeof item === "string") : [];
  return {
    id: row.id,
    scope: row.scope,
    metrics,
    regime: row.regime,
    recommendation: row.recommendation,
    confidence: Number(row.confidence),
    summary: typeof metrics.summary === "string" ? metrics.summary : "",
    degradedReasons,
    createdAt: toIso(row.created_at)
  };
}

function mapWatchlistItem(row: WatchlistRow): WatchlistItem {
  return {
    id: row.id,
    tokenId: row.token_id,
    input: row.input,
    note: row.note ?? undefined,
    riskLevel: row.risk_level ?? undefined,
    monitorRules: row.monitor_rules_json,
    createdAt: toIso(row.created_at)
  };
}

function mapChatMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    metadata: row.metadata_json,
    createdAt: toIso(row.created_at)
  };
}

function mapChatSession(row: ChatSessionRow, messages: ChatMessage[] = []): ChatSession {
  return {
    id: row.id,
    title: row.title,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    messages
  };
}

function hashSourceId(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 32);
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export class ResearchRepository {
  constructor(private readonly client: DatabaseClient) {}

  async recoverInterruptedTasks(reason = "API process restarted before task completion."): Promise<ResearchTask[]> {
    const connection = await this.client.pool.connect();
    try {
      await connection.query("begin");
      const interrupted = await connection.query<TaskRow>(
        "select * from research_tasks where status = $1 order by created_at asc for update",
        ["running"]
      );

      const recovered: ResearchTask[] = [];
      for (const row of interrupted.rows) {
        const now = new Date().toISOString();
        const previousEvents = await connection.query<EventRow>(
          "select * from research_task_events where task_id = $1 order by created_at asc",
          [row.id]
        );
        const event: ResearchTaskEvent = {
          id: `event_${crypto.randomUUID()}`,
          taskId: row.id,
          node: row.current_node ?? undefined,
          eventType: "task_recovered_failed",
          payload: { reason, previousStatus: row.status, previousNode: row.current_node },
          createdAt: now
        };

        await connection.query(
          `update research_tasks
           set status = 'failed',
               error_message = $2,
               updated_at = $3,
               completed_at = $3
           where id = $1`,
          [row.id, reason, now]
        );
        await connection.query(
          `insert into research_task_events (id, task_id, node, event_type, payload_json, created_at)
           values ($1,$2,$3,$4,$5,$6)
           on conflict (id) do nothing`,
          [event.id, row.id, row.current_node, event.eventType, JSON.stringify(event.payload), event.createdAt]
        );

        recovered.push(
          mapTask(
            {
              ...row,
              status: "failed",
              error_message: reason,
              updated_at: new Date(now),
              completed_at: new Date(now)
            },
            [...previousEvents.rows.map(mapEvent), event]
          )
        );
      }

      await connection.query("commit");
      return recovered;
    } catch (error) {
      await connection.query("rollback");
      throw error;
    } finally {
      connection.release();
    }
  }

  async saveTaskState(task: ResearchTask): Promise<void> {
    await this.client.pool.query(
      `insert into research_tasks (
        id, input, input_type, status, current_node, question, options_json, error_message, created_at, updated_at, completed_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      on conflict (id) do update set
        status = excluded.status,
        current_node = excluded.current_node,
        options_json = excluded.options_json,
        error_message = excluded.error_message,
        updated_at = excluded.updated_at,
        completed_at = excluded.completed_at`,
      [
        task.id,
        task.input,
        task.inputType,
        task.status,
        task.currentNode ?? null,
        task.question,
        JSON.stringify(task.options),
        task.errorMessage ?? null,
        task.createdAt,
        task.updatedAt,
        task.completedAt ?? null
      ]
    );
  }

  async claimPendingTask(id: string): Promise<ResearchTask | undefined> {
    const connection = await this.client.pool.connect();
    try {
      await connection.query("begin");
      const claimed = await connection.query<TaskRow>(
        `update research_tasks
         set status = 'running',
             error_message = null,
             completed_at = null,
             updated_at = $2
         where id = $1 and status = 'pending'
         returning *`,
        [id, new Date().toISOString()]
      );
      if (!claimed.rows[0]) {
        await connection.query("commit");
        return undefined;
      }

      const events = await connection.query<EventRow>(
        "select * from research_task_events where task_id = $1 order by created_at asc",
        [id]
      );
      await connection.query("commit");
      return mapTask(claimed.rows[0], events.rows.map(mapEvent));
    } catch (error) {
      await connection.query("rollback");
      throw error;
    } finally {
      connection.release();
    }
  }

  async appendTaskEvent(event: ResearchTaskEvent): Promise<void> {
    await this.client.pool.query(
      `insert into research_task_events (id, task_id, node, event_type, payload_json, created_at)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (id) do nothing`,
      [event.id, event.taskId, event.node ?? null, event.eventType, JSON.stringify(event.payload), event.createdAt]
    );
  }

  async saveReport(report: ResearchReport): Promise<void> {
    await this.client.pool.query(
      `insert into reports (id, task_id, title, markdown, summary, recommendation, confidence, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (id) do update set
        title = excluded.title,
        markdown = excluded.markdown,
        summary = excluded.summary,
        recommendation = excluded.recommendation,
        confidence = excluded.confidence`,
      [report.id, report.taskId, report.title, report.markdown, report.summary, report.recommendation, report.confidence, report.createdAt]
    );
  }

  async saveReportSources(reportId: string, sources: SourceCandidate[]): Promise<void> {
    if (!sources.length) return;
    const connection = await this.client.pool.connect();
    try {
      await connection.query("begin");
      for (const source of sources) {
        const sourceDocumentId = `source_${hashSourceId(source.url)}`;
        const contentHash = createHash("sha256").update(`${source.url}\n${source.snippet ?? ""}`).digest("hex");
        await connection.query(
          `insert into source_documents (
            id, source_type, url, title, content_text, content_hash, fetched_at, metadata_json
          ) values ($1,$2,$3,$4,$5,$6,$7,$8)
          on conflict (id) do update set
            source_type = excluded.source_type,
            url = excluded.url,
            title = excluded.title,
            content_text = excluded.content_text,
            content_hash = excluded.content_hash,
            fetched_at = excluded.fetched_at,
            metadata_json = excluded.metadata_json`,
          [
            sourceDocumentId,
            source.sourceType,
            source.url,
            source.title,
            source.snippet ?? null,
            contentHash,
            source.fetchedAt ?? null,
            JSON.stringify({
              provider: source.provider,
              statusCode: source.statusCode,
              degradedReason: source.degradedReason
            })
          ]
        );

        await connection.query(
          `insert into report_sources (report_id, source_document_id, usage_type)
           values ($1,$2,$3)
           on conflict (report_id, source_document_id) do update set usage_type = excluded.usage_type`,
          [reportId, sourceDocumentId, "candidate"]
        );
      }

      await connection.query("commit");
    } catch (error) {
      await connection.query("rollback");
      throw error;
    } finally {
      connection.release();
    }
  }

  async saveTaskRun(task: ResearchTask, report: ResearchReport): Promise<void> {
    const db = this.client.pool;
    const connection = await db.connect();
    try {
      await connection.query("begin");
      await connection.query(
        `insert into research_tasks (
          id, input, input_type, status, current_node, question, options_json, error_message, created_at, updated_at, completed_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        on conflict (id) do update set
          status = excluded.status,
          current_node = excluded.current_node,
          options_json = excluded.options_json,
          error_message = excluded.error_message,
          updated_at = excluded.updated_at,
          completed_at = excluded.completed_at`,
        [
          task.id,
          task.input,
          task.inputType,
          task.status,
          task.currentNode ?? null,
          task.question,
          JSON.stringify(task.options),
          task.errorMessage ?? null,
          task.createdAt,
          task.updatedAt,
          task.completedAt ?? null
        ]
      );

      for (const event of task.events) {
        await connection.query(
          `insert into research_task_events (id, task_id, node, event_type, payload_json, created_at)
           values ($1,$2,$3,$4,$5,$6)
           on conflict (id) do nothing`,
          [event.id, event.taskId, event.node ?? null, event.eventType, JSON.stringify(event.payload), event.createdAt]
        );
      }

      await connection.query(
        `insert into reports (id, task_id, title, markdown, summary, recommendation, confidence, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         on conflict (id) do update set
          title = excluded.title,
          markdown = excluded.markdown,
          summary = excluded.summary,
          recommendation = excluded.recommendation,
          confidence = excluded.confidence`,
        [report.id, report.taskId, report.title, report.markdown, report.summary, report.recommendation, report.confidence, report.createdAt]
      );

      await connection.query("commit");
    } catch (error) {
      await connection.query("rollback");
      throw error;
    } finally {
      connection.release();
    }
  }

  async listTasks(): Promise<ResearchTask[]> {
    const tasks = await this.client.pool.query<TaskRow>("select * from research_tasks order by created_at desc");
    if (tasks.rows.length === 0) return [];

    const events = await this.client.pool.query<EventRow>(
      "select * from research_task_events where task_id = any($1::text[]) order by created_at asc",
      [tasks.rows.map((task) => task.id)]
    );
    const eventsByTask = new Map<string, ResearchTaskEvent[]>();
    for (const event of events.rows) {
      const list = eventsByTask.get(event.task_id) ?? [];
      list.push(mapEvent(event));
      eventsByTask.set(event.task_id, list);
    }

    return tasks.rows.map((task) => mapTask(task, eventsByTask.get(task.id) ?? []));
  }

  async listPendingTasks(limit = 100): Promise<ResearchTask[]> {
    const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 500);
    const tasks = await this.client.pool.query<TaskRow>(
      "select * from research_tasks where status = 'pending' order by created_at asc limit $1",
      [safeLimit]
    );
    if (tasks.rows.length === 0) return [];

    const events = await this.client.pool.query<EventRow>(
      "select * from research_task_events where task_id = any($1::text[]) order by created_at asc",
      [tasks.rows.map((task) => task.id)]
    );
    const eventsByTask = new Map<string, ResearchTaskEvent[]>();
    for (const event of events.rows) {
      const list = eventsByTask.get(event.task_id) ?? [];
      list.push(mapEvent(event));
      eventsByTask.set(event.task_id, list);
    }

    return tasks.rows.map((task) => mapTask(task, eventsByTask.get(task.id) ?? []));
  }

  async listActiveQueueTasks(limit = 100): Promise<{ pending: ResearchTask[]; running: ResearchTask[] }> {
    const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 500);
    const tasks = await this.client.pool.query<TaskRow>(
      "select * from research_tasks where status = any($1::text[]) order by created_at asc limit $2",
      [["pending", "running"], safeLimit]
    );

    const mapped = tasks.rows.map((task) => mapTask(task));
    return {
      pending: mapped.filter((task) => task.status === "pending"),
      running: mapped.filter((task) => task.status === "running")
    };
  }

  async getTask(id: string): Promise<ResearchTask | undefined> {
    const task = await this.client.pool.query<TaskRow>("select * from research_tasks where id = $1", [id]);
    if (!task.rows[0]) return undefined;
    const events = await this.client.pool.query<EventRow>(
      "select * from research_task_events where task_id = $1 order by created_at asc",
      [id]
    );
    return mapTask(task.rows[0], events.rows.map(mapEvent));
  }

  async listTaskEvents(taskId: string): Promise<ResearchTaskEvent[]> {
    const events = await this.client.pool.query<EventRow>(
      "select * from research_task_events where task_id = $1 order by created_at asc",
      [taskId]
    );
    return events.rows.map(mapEvent);
  }

  async getReportByTaskId(taskId: string): Promise<ResearchReport | undefined> {
    const report = await this.client.pool.query<ReportRow>("select * from reports where task_id = $1 order by created_at desc limit 1", [
      taskId
    ]);
    return report.rows[0] ? mapReport(report.rows[0]) : undefined;
  }

  async listReports(): Promise<ResearchReport[]> {
    const reports = await this.client.pool.query<ReportRow>("select * from reports order by created_at desc limit 200");
    return reports.rows.map(mapReport);
  }

  async getReport(id: string): Promise<ResearchReport | undefined> {
    const report = await this.client.pool.query<ReportRow>("select * from reports where id = $1", [id]);
    return report.rows[0] ? mapReport(report.rows[0]) : undefined;
  }

  async listReportAnnotations(reportId: string): Promise<ReportAnnotation[]> {
    const rows = await this.client.pool.query<ReportAnnotationRow>(
      "select * from report_annotations where report_id = $1 order by updated_at desc",
      [reportId]
    );
    return rows.rows.map(mapReportAnnotation);
  }

  async upsertReportAnnotation(reportId: string, input: UpsertReportAnnotationInput): Promise<ReportAnnotation> {
    const report = await this.getReport(reportId);
    if (!report) throw new Error(`Report ${reportId} not found`);
    const id = `annotation_${reportId}`;
    const now = new Date().toISOString();
    const tags = normalizeTags(input.tags);
    const rows = await this.client.pool.query<ReportAnnotationRow>(
      `insert into report_annotations (id, report_id, tags_json, note, confidence, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$6)
       on conflict (id) do update set
         tags_json = excluded.tags_json,
         note = excluded.note,
         confidence = excluded.confidence,
         updated_at = excluded.updated_at
       returning *`,
      [id, reportId, JSON.stringify(tags), input.note ?? "", input.confidence ?? null, now]
    );
    return mapReportAnnotation(rows.rows[0]);
  }

  async deleteReportAnnotation(reportId: string, id: string): Promise<boolean> {
    const result = await this.client.pool.query("delete from report_annotations where report_id = $1 and id = $2", [reportId, id]);
    return (result.rowCount ?? 0) > 0;
  }

  async previewRetention(cutoffIso: string) {
    const [tasks, reports, chats, snapshots, sources] = await Promise.all([
      this.client.pool.query<{ count: string }>("select count(*)::text as count from research_tasks where created_at < $1", [cutoffIso]),
      this.client.pool.query<{ count: string }>("select count(*)::text as count from reports where created_at < $1", [cutoffIso]),
      this.client.pool.query<{ count: string }>("select count(*)::text as count from chat_sessions where created_at < $1", [cutoffIso]),
      this.client.pool.query<{ count: string }>("select count(*)::text as count from market_snapshots where created_at < $1", [cutoffIso]),
      this.client.pool.query<{ count: string }>(
        `select count(*)::text as count
         from source_documents sd
         where sd.fetched_at < $1
           and not exists (select 1 from report_sources rs where rs.source_document_id = sd.id)`,
        [cutoffIso]
      )
    ]);
    return {
      researchTasks: Number(tasks.rows[0]?.count ?? 0),
      reports: Number(reports.rows[0]?.count ?? 0),
      chatSessions: Number(chats.rows[0]?.count ?? 0),
      marketSnapshots: Number(snapshots.rows[0]?.count ?? 0),
      sourceDocuments: Number(sources.rows[0]?.count ?? 0)
    };
  }

  async pruneRetention(cutoffIso: string) {
    const preview = await this.previewRetention(cutoffIso);
    const connection = await this.client.pool.connect();
    try {
      await connection.query("begin");
      const tasks = await connection.query("delete from research_tasks where created_at < $1", [cutoffIso]);
      await connection.query(
        `delete from chat_messages
         where session_id in (select id from chat_sessions where created_at < $1)`,
        [cutoffIso]
      );
      const chats = await connection.query("delete from chat_sessions where created_at < $1", [cutoffIso]);
      const snapshots = await connection.query("delete from market_snapshots where created_at < $1", [cutoffIso]);
      const sources = await connection.query(
        `delete from source_documents sd
         where sd.fetched_at < $1
           and not exists (select 1 from report_sources rs where rs.source_document_id = sd.id)`,
        [cutoffIso]
      );
      await connection.query("commit");
      return {
        researchTasks: tasks.rowCount ?? 0,
        reports: preview.reports,
        chatSessions: chats.rowCount ?? 0,
        marketSnapshots: snapshots.rowCount ?? 0,
        sourceDocuments: sources.rowCount ?? 0
      };
    } catch (error) {
      await connection.query("rollback");
      throw error;
    } finally {
      connection.release();
    }
  }

  async listReportSources(reportId: string): Promise<PersistedReportSource[]> {
    const sources = await this.client.pool.query<ReportSourceRow>(
      `select
        sd.id,
        rs.report_id,
        rs.usage_type,
        sd.source_type,
        sd.url,
        sd.title,
        sd.content_text,
        sd.content_hash,
        sd.fetched_at,
        sd.metadata_json
       from report_sources rs
       join source_documents sd on sd.id = rs.source_document_id
       where rs.report_id = $1
       order by rs.usage_type, sd.source_type, sd.url`,
      [reportId]
    );
    return sources.rows.map(mapReportSource);
  }

  async listSourceDocuments(options: { query?: string; degradedOnly?: boolean; limit?: number } = {}): Promise<PersistedSourceDocument[]> {
    const where: string[] = [];
    const values: unknown[] = [];
    const query = options.query?.trim();
    if (query) {
      values.push(`%${query}%`);
      where.push(`(sd.title ilike $${values.length} or sd.url ilike $${values.length} or sd.content_text ilike $${values.length})`);
    }
    if (options.degradedOnly) {
      where.push("(sd.metadata_json->>'degradedReason') is not null");
    }
    values.push(Math.min(Math.max(options.limit ?? 100, 1), 300));

    const sources = await this.client.pool.query<SourceDocumentRow>(
      `select
        sd.id,
        sd.source_type,
        sd.url,
        sd.title,
        sd.content_text,
        sd.content_hash,
        sd.fetched_at,
        sd.metadata_json,
        count(rs.report_id)::text as report_count,
        max(rs.report_id) as last_report_id
       from source_documents sd
       left join report_sources rs on rs.source_document_id = sd.id
       ${where.length ? `where ${where.join(" and ")}` : ""}
       group by sd.id
       order by sd.fetched_at desc nulls last, sd.title asc
       limit $${values.length}`,
      values
    );
    return sources.rows.map(mapSourceDocument);
  }

  async getSourceDocumentDetail(id: string): Promise<SourceDocumentDetail | undefined> {
    const source = await this.client.pool.query<SourceDocumentRow>(
      `select
        sd.id,
        sd.source_type,
        sd.url,
        sd.title,
        sd.content_text,
        sd.content_hash,
        sd.fetched_at,
        sd.metadata_json,
        count(rs.report_id)::text as report_count,
        max(rs.report_id) as last_report_id
       from source_documents sd
       left join report_sources rs on rs.source_document_id = sd.id
       where sd.id = $1
       group by sd.id`,
      [id]
    );
    if (!source.rows[0]) return undefined;

    const reports = await this.client.pool.query<SourceReportUsageRow>(
      `select
        rs.report_id,
        rs.usage_type,
        r.title,
        r.recommendation,
        r.confidence,
        r.created_at
       from report_sources rs
       join reports r on r.id = rs.report_id
       where rs.source_document_id = $1
       order by r.created_at desc`,
      [id]
    );

    return {
      source: mapSourceDocument(source.rows[0]),
      reports: reports.rows.map((row) => ({
        reportId: row.report_id,
        usageType: row.usage_type,
        title: row.title,
        recommendation: row.recommendation,
        confidence: Number(row.confidence),
        createdAt: toIso(row.created_at)
      }))
    };
  }

  async searchReports(query: string): Promise<ResearchReport[]> {
    const normalized = query.trim();
    if (!normalized) return this.listReports();
    const reports = await this.client.pool.query<ReportRow>(
      `select * from reports
       where title ilike $1 or summary ilike $1 or markdown ilike $1 or recommendation ilike $1
       order by created_at desc
       limit 50`,
      [`%${normalized}%`]
    );
    return reports.rows.map(mapReport);
  }

  async saveMarketSnapshot(snapshot: MarketSnapshot): Promise<void> {
    await this.client.pool.query(
      `insert into market_snapshots (id, scope, metrics_json, regime, recommendation, confidence, created_at)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (id) do nothing`,
      [
        snapshot.id,
        snapshot.scope,
        JSON.stringify({
          ...snapshot.metrics,
          summary: snapshot.summary,
          degradedReasons: snapshot.degradedReasons
        }),
        snapshot.regime,
        snapshot.recommendation,
        snapshot.confidence,
        snapshot.createdAt
      ]
    );
  }

  async listMarketSnapshots(): Promise<MarketSnapshot[]> {
    const snapshots = await this.client.pool.query<MarketSnapshotRow>("select * from market_snapshots order by created_at desc limit 100");
    return snapshots.rows.map(mapMarketSnapshot);
  }

  async getLatestMarketSnapshot(): Promise<MarketSnapshot | undefined> {
    const snapshots = await this.client.pool.query<MarketSnapshotRow>("select * from market_snapshots order by created_at desc limit 1");
    return snapshots.rows[0] ? mapMarketSnapshot(snapshots.rows[0]) : undefined;
  }

  async createWatchlistItem(input: CreateWatchlistItemInput): Promise<WatchlistItem> {
    const id = `watch_${crypto.randomUUID()}`;
    const tokenId = `token_${crypto.randomUUID()}`;
    const createdAt = new Date().toISOString();
    const connection = await this.client.pool.connect();
    try {
      await connection.query("begin");
      await connection.query(
        `insert into tokens (id, chain, address, symbol, name, created_at, updated_at)
         values ($1,$2,$3,$4,$5,$6,$6)`,
        [tokenId, "unknown", input.input, input.input.toUpperCase().slice(0, 24), input.input, createdAt]
      );
      await connection.query(
        `insert into watchlist_items (id, token_id, note, risk_level, monitor_rules_json, created_at)
         values ($1,$2,$3,$4,$5,$6)`,
        [id, tokenId, input.note ?? null, input.riskLevel ?? null, JSON.stringify({ ...input.monitorRules, input: input.input }), createdAt]
      );
      await connection.query("commit");
    } catch (error) {
      await connection.query("rollback");
      throw error;
    } finally {
      connection.release();
    }

    return {
      id,
      tokenId,
      input: input.input,
      note: input.note,
      riskLevel: input.riskLevel,
      monitorRules: input.monitorRules,
      createdAt
    };
  }

  async listWatchlistItems(): Promise<WatchlistItem[]> {
    const rows = await this.client.pool.query<WatchlistRow>(
      `select
        w.id,
        w.token_id,
        coalesce(w.monitor_rules_json->>'input', t.name, t.symbol, t.address) as input,
        w.note,
        w.risk_level,
        w.monitor_rules_json,
        w.created_at
      from watchlist_items w
      join tokens t on t.id = w.token_id
      order by w.created_at desc`
    );
    return rows.rows.map(mapWatchlistItem);
  }

  async getWatchlistItem(id: string): Promise<WatchlistItem | undefined> {
    const rows = await this.client.pool.query<WatchlistRow>(
      `select
        w.id,
        w.token_id,
        coalesce(w.monitor_rules_json->>'input', t.name, t.symbol, t.address) as input,
        w.note,
        w.risk_level,
        w.monitor_rules_json,
        w.created_at
      from watchlist_items w
      join tokens t on t.id = w.token_id
      where w.id = $1`,
      [id]
    );
    return rows.rows[0] ? mapWatchlistItem(rows.rows[0]) : undefined;
  }

  async updateWatchlistItem(id: string, input: UpdateWatchlistItemInput): Promise<WatchlistItem | undefined> {
    const current = await this.getWatchlistItem(id);
    if (!current) return undefined;
    const nextRules = {
      ...current.monitorRules,
      ...(input.monitorRules ?? {}),
      input: current.input
    };
    await this.client.pool.query(
      `update watchlist_items
       set note = $2,
           risk_level = $3,
           monitor_rules_json = $4
       where id = $1`,
      [id, input.note ?? current.note ?? null, input.riskLevel ?? current.riskLevel ?? null, JSON.stringify(nextRules)]
    );
    return this.getWatchlistItem(id);
  }

  async deleteWatchlistItem(id: string): Promise<boolean> {
    const result = await this.client.pool.query("delete from watchlist_items where id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async createChatSession(title: string): Promise<ChatSession> {
    const id = `chat_${crypto.randomUUID()}`;
    const createdAt = new Date().toISOString();
    const row = await this.client.pool.query<ChatSessionRow>(
      `insert into chat_sessions (id, title, created_at, updated_at)
       values ($1,$2,$3,$3)
       returning *`,
      [id, title, createdAt]
    );
    return mapChatSession(row.rows[0]);
  }

  async listChatSessions(): Promise<ChatSession[]> {
    const sessions = await this.client.pool.query<ChatSessionRow>("select * from chat_sessions order by updated_at desc limit 100");
    return sessions.rows.map((row) => mapChatSession(row));
  }

  async getChatSession(id: string): Promise<ChatSession | undefined> {
    const session = await this.client.pool.query<ChatSessionRow>("select * from chat_sessions where id = $1", [id]);
    if (!session.rows[0]) return undefined;
    const messages = await this.client.pool.query<ChatMessageRow>("select * from chat_messages where session_id = $1 order by created_at asc", [id]);
    return mapChatSession(session.rows[0], messages.rows.map(mapChatMessage));
  }

  async appendChatMessage(input: Omit<ChatMessage, "id" | "createdAt">): Promise<ChatMessage> {
    const id = `msg_${crypto.randomUUID()}`;
    const createdAt = new Date().toISOString();
    const message = await this.client.pool.query<ChatMessageRow>(
      `insert into chat_messages (id, session_id, role, content, metadata_json, created_at)
       values ($1,$2,$3,$4,$5,$6)
       returning *`,
      [id, input.sessionId, input.role, input.content, JSON.stringify(input.metadata), createdAt]
    );
    await this.client.pool.query("update chat_sessions set updated_at = $1 where id = $2", [createdAt, input.sessionId]);
    return mapChatMessage(message.rows[0]);
  }
}
