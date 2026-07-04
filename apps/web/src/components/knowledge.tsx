import { Search } from "lucide-react";
import type { Report } from "./report";

export type SourceDocument = {
  id: string;
  sourceType: string;
  url?: string;
  title?: string;
  contentText?: string;
  fetchedAt?: string;
  metadata: Record<string, unknown>;
  reportCount: number;
  lastReportId?: string;
};

export type SourceReportUsage = {
  reportId: string;
  usageType: string;
  title: string;
  recommendation: string;
  confidence: number;
  createdAt: string;
};

export type SourceDocumentDetail = {
  source: SourceDocument;
  reports: SourceReportUsage[];
};

export function KnowledgeSearch({
  knowledgeQuery,
  degradedOnly,
  sources,
  reports,
  activeReportId,
  onQueryChange,
  onDegradedOnlyChange,
  onSearch,
  onReindex,
  reindexStatus,
  onOpenReport,
  onOpenSource
}: {
  knowledgeQuery: string;
  degradedOnly: boolean;
  sources: SourceDocument[];
  reports: Report[];
  activeReportId?: string;
  onQueryChange: (value: string) => void;
  onDegradedOnlyChange: (checked: boolean) => void;
  onSearch: () => void;
  onReindex: () => void;
  reindexStatus: string;
  onOpenReport: (reportId: string) => void;
  onOpenSource: (sourceId: string) => void;
}) {
  return (
    <section className="panel">
      <div className="sectionHeader">
        <h2>Search</h2>
        <button className="smallAction" onClick={onReindex}>Reindex</button>
      </div>
      <div className="searchBox">
        <input value={knowledgeQuery} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search reports and sources" />
        <button onClick={onSearch} title="Search knowledge">
          <Search size={15} />
        </button>
      </div>
      <label className="filterToggle">
        <input type="checkbox" checked={degradedOnly} onChange={(event) => onDegradedOnlyChange(event.target.checked)} />
        Degraded sources
      </label>
      {reindexStatus && <p className="actionStatus">{reindexStatus}</p>}
      <h2 className="sourceListHead">Reports</h2>
      <div className="taskList">
        {reports.map((report) => (
          <button key={report.id} className={report.id === activeReportId ? "task active" : "task"} onClick={() => onOpenReport(report.id)}>
            <span>{report.title}</span>
            <small>
              {report.recommendation} / confidence {report.confidence}
            </small>
          </button>
        ))}
        {!reports.length && <p className="empty">No reports matched.</p>}
      </div>
      <h2 className="sourceListHead">Sources</h2>
      <div className="sourceList">
        {sources.map((source) => (
          <button key={source.id} className="sourceListItem" onClick={() => onOpenSource(source.id)}>
            <strong>{source.title ?? source.url ?? source.id}</strong>
            <span>
              {String(source.metadata.provider ?? "source")} / {source.sourceType}
              {source.metadata.statusCode ? ` / ${String(source.metadata.statusCode)}` : ""}
              {` / reports ${source.reportCount}`}
            </span>
            {source.contentText && <small>{source.contentText}</small>}
            {typeof source.metadata.degradedReason === "string" && <em>{source.metadata.degradedReason}</em>}
          </button>
        ))}
        {!sources.length && <p className="empty">No sources matched.</p>}
      </div>
    </section>
  );
}

export function SourceDetail({ detail, onOpenReport }: { detail: SourceDocumentDetail | null; onOpenReport: (reportId: string) => void }) {
  return (
    <section className="panel">
      <div className="sectionHeader">
        <h2>Source Detail</h2>
        {detail?.source.url && (
          <a href={detail.source.url} target="_blank" rel="noreferrer" className="textLink">
            Open
          </a>
        )}
      </div>
      {detail ? (
        <div className="sourceDetail">
          <div className="sourceDetailBody">
            <strong>{detail.source.title ?? detail.source.url ?? detail.source.id}</strong>
            <span>
              {String(detail.source.metadata.provider ?? "source")} / {detail.source.sourceType}
              {detail.source.metadata.statusCode ? ` / ${String(detail.source.metadata.statusCode)}` : ""}
              {detail.source.fetchedAt ? ` / ${new Date(detail.source.fetchedAt).toLocaleString()}` : ""}
            </span>
            {detail.source.contentText && <p>{detail.source.contentText}</p>}
            {typeof detail.source.metadata.degradedReason === "string" && <em>{detail.source.metadata.degradedReason}</em>}
          </div>
          <div className="usageList">
            {detail.reports.map((report) => (
              <button key={report.reportId} className="usageItem" onClick={() => onOpenReport(report.reportId)}>
                <strong>{report.title}</strong>
                <span>
                  {report.usageType} / {report.recommendation} / confidence {report.confidence}
                </span>
                <small>{new Date(report.createdAt).toLocaleString()}</small>
              </button>
            ))}
            {!detail.reports.length && <p className="empty">No linked reports.</p>}
          </div>
        </div>
      ) : (
        <p className="empty">Select a source to inspect fetch status, degraded reason, and linked reports.</p>
      )}
    </section>
  );
}
