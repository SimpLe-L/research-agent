import { useState } from "react";

export type Report = {
  id: string;
  taskId: string;
  title: string;
  markdown: string;
  summary: string;
  recommendation: string;
  confidence: number;
  createdAt: string;
};

export type ReportSource = {
  id: string;
  usageType: string;
  sourceType: string;
  url?: string;
  title?: string;
  contentText?: string;
  fetchedAt?: string;
  metadata: Record<string, unknown>;
};

export type ReportAnnotation = {
  id: string;
  reportId: string;
  tags: string[];
  note: string;
  confidence?: number;
  createdAt: string;
  updatedAt: string;
};

export function ReportPanel({
  report,
  sources,
  annotations = [],
  annotationDraft,
  onAnnotationDraftChange,
  onSaveAnnotation,
  onDeleteAnnotation,
  onReindexVector,
  onDeleteVector
}: {
  report: Report | null;
  sources: ReportSource[];
  annotations?: ReportAnnotation[];
  annotationDraft?: { tags: string; note: string; confidence: string };
  onAnnotationDraftChange?: (draft: { tags: string; note: string; confidence: string }) => void;
  onSaveAnnotation?: (reportId: string) => Promise<string>;
  onDeleteAnnotation?: (reportId: string, annotationId: string) => Promise<string>;
  onReindexVector?: (reportId: string) => Promise<string>;
  onDeleteVector?: (reportId: string) => Promise<string>;
}) {
  const [actionStatus, setActionStatus] = useState("");

  async function copyMarkdown() {
    if (!report) return;
    try {
      await navigator.clipboard?.writeText(report.markdown);
      setActionStatus("Markdown copied.");
    } catch {
      setActionStatus("Clipboard write was blocked by the browser.");
    }
  }

  function downloadMarkdown() {
    if (!report) return;
    const filename = `${safeFileName(report.title || report.id)}.md`;
    const blob = new Blob([report.markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setActionStatus(`Download started: ${filename}`);
  }

  async function reindexVector() {
    if (!report || !onReindexVector) return;
    setActionStatus("Reindexing vector...");
    setActionStatus(await onReindexVector(report.id));
  }

  async function deleteVector() {
    if (!report || !onDeleteVector) return;
    setActionStatus("Clearing vector...");
    setActionStatus(await onDeleteVector(report.id));
  }

  async function saveAnnotation() {
    if (!report || !onSaveAnnotation) return;
    setActionStatus("Saving annotation...");
    setActionStatus(await onSaveAnnotation(report.id));
  }

  async function deleteAnnotation(annotationId: string) {
    if (!report || !onDeleteAnnotation) return;
    setActionStatus("Deleting annotation...");
    setActionStatus(await onDeleteAnnotation(report.id, annotationId));
  }

  return (
    <section className="panel report">
      <div className="sectionHeader">
        <h2>Report</h2>
        {report && (
          <div className="actionGroup">
            <button className="smallAction" data-testid="copy-report-markdown" onClick={() => { void copyMarkdown(); }}>Copy</button>
            <button className="smallAction" data-testid="download-report-markdown" onClick={downloadMarkdown}>Download .md</button>
            {onReindexVector && (
              <button className="smallAction" data-testid="reindex-report-vector" onClick={() => { void reindexVector(); }}>Reindex vector</button>
            )}
            {onDeleteVector && (
              <button className="smallAction" data-testid="delete-report-vector" onClick={() => { void deleteVector(); }}>Clear vector</button>
            )}
          </div>
        )}
      </div>
      {report ? (
        <>
          <div className="reportMeta">
            <strong>{report.recommendation}</strong>
            <span>confidence {report.confidence}</span>
            <span>{new Date(report.createdAt).toLocaleString()}</span>
          </div>
          {actionStatus && <p className="actionStatus" data-testid="report-action-status">{actionStatus}</p>}
          {(annotationDraft || annotations.length > 0) && (
            <div className="annotationBox" data-testid="report-annotation-panel">
              <div className="annotationList">
                {annotations.map((annotation) => (
                  <div key={annotation.id} className="annotationItem">
                    <div>
                      <strong>{annotation.tags.length ? annotation.tags.join(", ") : "Untagged"}</strong>
                      <span>
                        {annotation.confidence !== undefined ? `confidence ${annotation.confidence}` : "manual note"} /{" "}
                        {new Date(annotation.updatedAt).toLocaleString()}
                      </span>
                      {annotation.note && <p>{annotation.note}</p>}
                    </div>
                    {onDeleteAnnotation && (
                      <button className="smallAction" onClick={() => { void deleteAnnotation(annotation.id); }}>Delete</button>
                    )}
                  </div>
                ))}
                {!annotations.length && <p className="empty compact">No manual annotations yet.</p>}
              </div>
              {annotationDraft && onAnnotationDraftChange && onSaveAnnotation && (
                <div className="annotationForm">
                  <input
                    value={annotationDraft.tags}
                    onChange={(event) => onAnnotationDraftChange({ ...annotationDraft, tags: event.target.value })}
                    placeholder="Tags, comma separated"
                  />
                  <input
                    value={annotationDraft.confidence}
                    onChange={(event) => onAnnotationDraftChange({ ...annotationDraft, confidence: event.target.value })}
                    placeholder="Manual confidence 0-100"
                  />
                  <textarea
                    value={annotationDraft.note}
                    onChange={(event) => onAnnotationDraftChange({ ...annotationDraft, note: event.target.value })}
                    placeholder="Manual case note, thesis, or post-mortem"
                  />
                  <button className="smallAction" data-testid="save-report-annotation" onClick={() => { void saveAnnotation(); }}>Save annotation</button>
                </div>
              )}
            </div>
          )}
          <div className="sourceStrip">
            {sources.map((source) => (
              <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="sourceItem">
                <strong>{source.title ?? source.url ?? source.id}</strong>
                <span>
                  {String(source.metadata.provider ?? "source")} / {source.sourceType}
                  {source.metadata.statusCode ? ` / ${String(source.metadata.statusCode)}` : ""}
                </span>
                {source.contentText && <small>{source.contentText}</small>}
                {typeof source.metadata.degradedReason === "string" && <em>{source.metadata.degradedReason}</em>}
              </a>
            ))}
          </div>
          <pre>{report.markdown}</pre>
        </>
      ) : (
        <p className="empty">No report selected.</p>
      )}
    </section>
  );
}

function safeFileName(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "research-report";
}
