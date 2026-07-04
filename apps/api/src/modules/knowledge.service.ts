import { Inject, Injectable } from "@nestjs/common";
import type { ReportAnnotation, ResearchReport, UpsertReportAnnotationInput } from "@sp-agent/shared";
import { createEmbedding } from "@sp-agent/data-connectors";
import { DatabaseService } from "./database.service.js";

const VECTOR_SEARCH_LIMIT = 20;

@Injectable()
export class KnowledgeService {
  private readonly fallbackReports = new Map<string, ResearchReport>();
  private readonly fallbackAnnotations = new Map<string, ReportAnnotation[]>();

  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  rememberFallbackReport(report: ResearchReport) {
    this.fallbackReports.set(report.id, report);
  }

  async indexReport(report: ResearchReport) {
    this.rememberFallbackReport(report);
    const embedding = await createEmbedding(`${report.title}\n${report.summary}\n${report.markdown}`, process.env);
    if (!embedding.embedding) {
      return {
        indexed: false,
        degradedReason: embedding.degradedReason
      };
    }

    try {
      await this.databaseService.getVectorStore().indexReport(report, embedding.embedding);
      return { indexed: true };
    } catch (error) {
      return {
        indexed: false,
        degradedReason: error instanceof Error ? error.message : "Vector report indexing failed."
      };
    }
  }

  async reindexReports() {
    const reports = await this.listReports();
    let indexed = 0;
    const failures: Array<{ reportId: string; title: string; degradedReason: string }> = [];

    for (const report of reports) {
      const result = await this.indexReport(report);
      if (result.indexed) {
        indexed += 1;
      } else {
        failures.push({
          reportId: report.id,
          title: report.title,
          degradedReason: result.degradedReason ?? "Report vector indexing did not complete."
        });
      }
    }

    return {
      total: reports.length,
      indexed,
      failed: failures.length,
      failures,
      degradedReason: failures.length
        ? `Indexed ${indexed}/${reports.length} reports. ${failures[0]?.degradedReason ?? "Some reports were not indexed."}`
        : undefined
    };
  }

  async reindexReport(id: string) {
    const report = await this.getReport(id);
    if (!report) return undefined;
    const result = await this.indexReport(report);
    return {
      reportId: report.id,
      title: report.title,
      indexed: result.indexed,
      degradedReason: result.degradedReason
    };
  }

  async deleteReportVector(id: string) {
    const report = await this.getReport(id);
    if (!report) return undefined;
    try {
      const result = await this.databaseService.getVectorStore().deleteReport(id);
      return {
        reportId: report.id,
        title: report.title,
        deleted: result.deleted
      };
    } catch (error) {
      return {
        reportId: report.id,
        title: report.title,
        deleted: false,
        degradedReason: error instanceof Error ? error.message : "Report vector delete failed."
      };
    }
  }

  async listReports() {
    const repository = this.databaseService.getResearchRepository();
    if (repository) return repository.listReports();
    return Array.from(this.fallbackReports.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getReport(id: string) {
    const repository = this.databaseService.getResearchRepository();
    return (repository ? await repository.getReport(id) : undefined) ?? this.fallbackReports.get(id);
  }

  async listReportAnnotations(reportId: string) {
    const report = await this.getReport(reportId);
    if (!report) return undefined;
    const repository = this.databaseService.getResearchRepository();
    return repository ? repository.listReportAnnotations(reportId) : (this.fallbackAnnotations.get(reportId) ?? []);
  }

  async upsertReportAnnotation(reportId: string, input: UpsertReportAnnotationInput) {
    const report = await this.getReport(reportId);
    if (!report) return undefined;
    const repository = this.databaseService.getResearchRepository();
    if (repository) return repository.upsertReportAnnotation(reportId, input);

    const now = new Date().toISOString();
    const annotation: ReportAnnotation = {
      id: `annotation_${reportId}`,
      reportId,
      tags: normalizeTags(input.tags),
      note: input.note ?? "",
      confidence: input.confidence,
      createdAt: this.fallbackAnnotations.get(reportId)?.[0]?.createdAt ?? now,
      updatedAt: now
    };
    this.fallbackAnnotations.set(reportId, [annotation]);
    return annotation;
  }

  async deleteReportAnnotation(reportId: string, id: string) {
    const report = await this.getReport(reportId);
    if (!report) return undefined;
    const repository = this.databaseService.getResearchRepository();
    if (repository) return repository.deleteReportAnnotation(reportId, id);

    const current = this.fallbackAnnotations.get(reportId) ?? [];
    const next = current.filter((annotation) => annotation.id !== id);
    this.fallbackAnnotations.set(reportId, next);
    return next.length !== current.length;
  }

  async getReportSources(id: string) {
    const repository = this.databaseService.getResearchRepository();
    return repository ? repository.listReportSources(id) : [];
  }

  async listSources(options: { query?: string; degradedOnly?: boolean }) {
    const repository = this.databaseService.getResearchRepository();
    return repository ? repository.listSourceDocuments(options) : [];
  }

  async getSourceDetail(id: string) {
    const repository = this.databaseService.getResearchRepository();
    return repository ? repository.getSourceDocumentDetail(id) : undefined;
  }

  async searchReports(query: string) {
    const repository = this.databaseService.getResearchRepository();
    const reports = repository ? await repository.searchReports(query) : await this.searchFallbackReports(query);
    const embedding = await createEmbedding(query, process.env);
    if (!embedding.embedding) return { reports, vectorHits: [], degradedReason: embedding.degradedReason };
    try {
      const vectorHits = await this.databaseService.getVectorStore().searchReports(embedding.embedding, VECTOR_SEARCH_LIMIT);
      const sqlReportIds = new Set(reports.map((report) => report.id));
      const vectorCoveredSqlResult = vectorHits.some((hit) => sqlReportIds.has(hit.reportId));
      return {
        reports,
        vectorHits,
        degradedReason:
          reports.length > 0 && !vectorCoveredSqlResult
            ? "Vector search did not return any SQL-matched report in its top results; SQL search results remain authoritative."
            : undefined
      };
    } catch (error) {
      return {
        reports,
        vectorHits: [],
        degradedReason: error instanceof Error ? error.message : "Vector report search failed."
      };
    }
  }

  private async searchFallbackReports(query: string) {
    const normalized = query.trim().toLowerCase();
    const reports = Array.from(this.fallbackReports.values());
    if (!normalized) return reports;
    return reports.filter((report) =>
      [report.title, report.summary, report.markdown, report.recommendation].some((value) => value.toLowerCase().includes(normalized))
    );
  }
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}
