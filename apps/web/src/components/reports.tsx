import { RefreshCw } from "lucide-react";
import { ReportPanel, type Report, type ReportAnnotation, type ReportSource } from "./report";

export function ReportsView({
  reports,
  activeReport,
  activeReportSources,
  activeReportAnnotations,
  annotationDraft,
  onRefreshReports,
  onOpenReport,
  onAnnotationDraftChange,
  onSaveAnnotation,
  onDeleteAnnotation,
  onReindexVector,
  onDeleteVector
}: {
  reports: Report[];
  activeReport: Report | null;
  activeReportSources: ReportSource[];
  activeReportAnnotations: ReportAnnotation[];
  annotationDraft: { tags: string; note: string; confidence: string };
  onRefreshReports: () => void | Promise<void>;
  onOpenReport: (reportId: string) => void | Promise<void>;
  onAnnotationDraftChange: (draft: { tags: string; note: string; confidence: string }) => void;
  onSaveAnnotation: (reportId: string) => Promise<string>;
  onDeleteAnnotation: (reportId: string, annotationId: string) => Promise<string>;
  onReindexVector: (reportId: string) => Promise<string>;
  onDeleteVector: (reportId: string) => Promise<string>;
}) {
  return (
    <section className="viewGrid reportsGrid" data-testid="view-reports">
      <section className="panel">
        <div className="panelHeader">
          <h2>Report Library</h2>
          <button className="iconButton" onClick={() => { void onRefreshReports(); }} title="Refresh reports">
            <RefreshCw size={15} />
          </button>
        </div>
        <div className="taskList">
          {reports.map((report) => (
            <button
              key={report.id}
              className={report.id === activeReport?.id ? "task active" : "task"}
              onClick={() => { void onOpenReport(report.id); }}
            >
              <span>{report.title}</span>
              <small>
                {report.recommendation} / confidence {report.confidence}
              </small>
            </button>
          ))}
          {!reports.length && <p className="empty">No reports yet.</p>}
        </div>
      </section>
      <ReportPanel
        report={activeReport}
        sources={activeReportSources}
        annotations={activeReportAnnotations}
        annotationDraft={annotationDraft}
        onAnnotationDraftChange={onAnnotationDraftChange}
        onSaveAnnotation={onSaveAnnotation}
        onDeleteAnnotation={onDeleteAnnotation}
        onReindexVector={onReindexVector}
        onDeleteVector={onDeleteVector}
      />
    </section>
  );
}
