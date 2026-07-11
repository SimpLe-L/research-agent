import React, { useState } from "react";
import { AlertTriangle, BookOpenCheck, Bookmark, Play, RefreshCw, RotateCcw, Save, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiBase, fetchJson } from "@/app/api";
import type { ExtensionInvocationResponse, ResearchClaim, ResearchReport, ResearchSourceScope, WorkflowRun } from "@/app/types";
import { cn } from "@/lib/utils";

type ResearchWorkflowResult = { workflow: WorkflowRun };
type ResearchReportResult = { workflow: WorkflowRun; report: ResearchReport };

const scopeOptions: Array<{ id: ResearchSourceScope; label: string; description: string }> = [
  { id: "local_documents", label: "Local documents", description: "Allowlisted project documents" },
  { id: "bookmarks", label: "Bookmarks", description: "Local bookmark records" }
];

export function ResearchReview() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [scopes, setScopes] = useState<ResearchSourceScope[]>(["local_documents", "bookmarks"]);
  const [workflow, setWorkflow] = useState<WorkflowRun | null>(null);
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function runResearch() {
    const normalized = question.trim();
    if (normalized.length < 3 || scopes.length === 0) return;
    setLoading(true);
    setStatus("Collecting permitted sources");
    try {
      const response = await fetchJson<ExtensionInvocationResponse>(`${apiBase}/extensions/personal.research/invoke`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ capabilityId: "research.run", input: { question: normalized, sourceScopes: scopes } })
      });
      if (response.status !== "completed") throw new Error(response.degradedReason ?? "Research did not complete");
      applyWorkflow((response.result as ResearchWorkflowResult).workflow);
      setStatus("Research report ready");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Research failed");
    } finally {
      setLoading(false);
    }
  }

  async function refreshReport() {
    if (!workflow) return;
    setLoading(true);
    try {
      const response = await fetchJson<ExtensionInvocationResponse>(`${apiBase}/extensions/personal.research/invoke`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ capabilityId: "research.get_report", input: { workflowId: workflow.id } })
      });
      if (response.status !== "completed") throw new Error(response.degradedReason ?? "Could not read research report");
      const result = response.result as ResearchReportResult;
      setWorkflow(result.workflow);
      setReport(result.report);
      setStatus("Report refreshed");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Report refresh failed");
    } finally {
      setLoading(false);
    }
  }

  async function retry() {
    if (!workflow) return;
    setLoading(true);
    try {
      const data = await fetchJson<ResearchWorkflowResult>(`${apiBase}/workflows/${workflow.id}/retry`, { method: "POST" });
      applyWorkflow(data.workflow);
      setStatus("Research retried");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Retry failed");
    } finally {
      setLoading(false);
    }
  }

  async function cancel() {
    if (!workflow) return;
    setLoading(true);
    try {
      const data = await fetchJson<ResearchWorkflowResult>(`${apiBase}/workflows/${workflow.id}/cancel`, { method: "POST" });
      setWorkflow(data.workflow);
      setStatus(data.workflow.degradedReason ?? "Research cancelled");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Cancel failed");
    } finally {
      setLoading(false);
    }
  }

  async function saveClaim(claim: ResearchClaim) {
    if (!report || claim.status === "insufficient") return;
    setLoading(true);
    try {
      const response = await fetchJson<ExtensionInvocationResponse>(`${apiBase}/extensions/local.memory/invoke`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          capabilityId: "memory.write_candidate",
          input: {
            content: claim.statement,
            kind: "project",
            scope: "global",
            source: { type: "system", id: report.id, label: "cited research report" },
            provenance: { workflowId: report.workflowId, reportId: report.id, claimId: claim.id, evidenceIds: claim.supportingEvidenceIds, conflictingEvidenceIds: claim.conflictingEvidenceIds },
            confidence: claim.confidence,
            tags: ["research", claim.status]
          }
        })
      });
      if (response.status !== "pending_approval") throw new Error(response.degradedReason ?? "Memory candidate was not queued for approval");
      window.dispatchEvent(new CustomEvent("sp-agent:approval-requested", { detail: response.approval }));
      setStatus("Memory approval requested");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not request memory approval");
    } finally {
      setLoading(false);
    }
  }

  function applyWorkflow(nextWorkflow: WorkflowRun) {
    setWorkflow(nextWorkflow);
    const nextReport = nextWorkflow.result as ResearchReport | undefined;
    setReport(nextReport?.id && nextReport.workflowId ? nextReport : null);
  }

  function toggleScope(scope: ResearchSourceScope) {
    setScopes((current) => current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]);
  }

  const canRun = question.trim().length >= 3 && scopes.length > 0 && !loading;
  const canCancel = workflow?.status === "pending" || workflow?.status === "running";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger render={<SheetTrigger render={<Button variant="ghost" size="icon" className="text-muted-foreground" data-testid="research-review-button" />} />}>
          <BookOpenCheck size={18} />
          <span className="sr-only">Run research</span>
        </TooltipTrigger>
        <TooltipContent>Research and decisions</TooltipContent>
      </Tooltip>
      <SheetContent side="right" className="w-[min(620px,96vw)] max-w-[min(620px,96vw)] gap-0 p-0" data-testid="research-review-panel">
        <header className="flex min-h-18 items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="m-0 text-lg font-bold">Research</h2>
            <p className="m-0 text-[13px] text-muted-foreground">Evidence-backed conclusions from permitted sources</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => void refreshReport()} disabled={!workflow || loading} title="Refresh report">
            <RefreshCw size={16} />
          </Button>
        </header>
        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
          <section className="grid gap-3 border-b p-4" data-testid="research-controls">
            <Textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What would you like to investigate?" rows={3} />
            <div className="flex flex-wrap gap-2">
              {scopeOptions.map((option) => (
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs text-foreground" key={option.id} title={option.description}>
                  <Input type="checkbox" checked={scopes.includes(option.id)} onChange={() => toggleScope(option.id)} className="size-3.5 accent-primary" />
                  {option.label}
                </label>
              ))}
              <span className="flex-1" />
              <Button size="sm" onClick={() => void runResearch()} disabled={!canRun} data-testid="research-run-button">
                <Play size={14} />
                Research
              </Button>
            </div>
          </section>
          <div className="min-h-0 overflow-auto p-4" data-testid="research-report">
            {status && <p className="mb-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground" data-testid="research-status">{status}</p>}
            {report ? (
              <ResearchReportView report={report} workflow={workflow} loading={loading} onRetry={() => void retry()} onCancel={() => void cancel()} onSaveClaim={(claim) => void saveClaim(claim)} />
            ) : (
              <div className="flex min-h-52 flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-5 text-center text-sm text-muted-foreground">
                <Bookmark className="size-5" />
                Select permitted sources and ask a question to create an inspectable report.
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ResearchReportView({ report, workflow, loading, onRetry, onCancel, onSaveClaim }: { report: ResearchReport; workflow: WorkflowRun | null; loading: boolean; onRetry: () => void; onCancel: () => void; onSaveClaim: (claim: ResearchClaim) => void }) {
  const sourceById = new Map(report.sources.map((source) => [source.id, source]));
  const canCancel = workflow?.status === "pending" || workflow?.status === "running";
  return (
    <article className="grid gap-5">
      <section className="grid gap-2 rounded-lg border border-l-3 border-l-emerald-500 p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{report.metrics.sourceCount} sources</span>
          <span>{report.metrics.evidenceCount} evidence items</span>
          <span>{report.metrics.totalMs} ms</span>
        </div>
        <p className="m-0 text-[15px] leading-relaxed text-foreground">{report.answer}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onRetry} disabled={loading}>
            <RotateCcw size={14} />
            Retry
          </Button>
          <Button variant="outline" size="sm" onClick={onCancel} disabled={!canCancel || loading}>
            <XCircle size={14} />
            Cancel
          </Button>
        </div>
      </section>

      <section className="grid gap-2" data-testid="research-claims">
        <h3 className="text-[11px] font-bold uppercase text-muted-foreground">Claims</h3>
        {report.claims.map((claim) => (
          <article className={cn("grid gap-2 rounded-lg border border-l-3 p-3", claim.status === "supported" ? "border-l-emerald-500" : claim.status === "contested" ? "border-l-amber-500" : "border-l-slate-400")} key={claim.id}>
            <div className="flex gap-2">
              <p className="m-0 min-w-0 flex-1 text-[13px] leading-relaxed text-foreground">{claim.statement}</p>
              <span className="rounded-full border px-2 py-1 text-[11px] text-muted-foreground">{claim.status}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[...claim.supportingEvidenceIds, ...claim.conflictingEvidenceIds].map((evidenceId) => {
                const evidence = report.evidence.find((item) => item.id === evidenceId);
                const source = evidence ? sourceById.get(evidence.sourceId) : undefined;
                return evidence ? <span className="rounded border bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground" key={evidence.id}>{source?.title ?? evidence.sourceId}</span> : null;
              })}
            </div>
            {claim.status !== "insufficient" && <Button variant="outline" size="sm" className="w-fit" onClick={() => onSaveClaim(claim)}>
              <Save size={14} />
              Save to memory
            </Button>}
          </article>
        ))}
      </section>

      <section className="grid gap-2" data-testid="research-evidence">
        <h3 className="text-[11px] font-bold uppercase text-muted-foreground">Evidence</h3>
        {report.evidence.map((evidence) => {
          const source = sourceById.get(evidence.sourceId);
          return (
            <article className="grid gap-1 rounded-lg border p-3" key={evidence.id}>
              <strong className="text-[13px] text-foreground">{source?.title ?? evidence.sourceId}</strong>
              <p className="m-0 text-xs leading-relaxed text-muted-foreground">{evidence.excerpt}</p>
              <span className="text-[11px] text-muted-foreground">{evidence.locator ?? source?.locator} · relevance {Math.round(evidence.relevance * 100)}%</span>
            </article>
          );
        })}
      </section>

      {(report.uncertainty.length > 0 || report.openQuestions.length > 0) && (
        <section className="grid gap-2 rounded-lg border border-l-3 border-l-amber-500 p-3" data-testid="research-uncertainty">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground"><AlertTriangle size={15} /> Uncertainty and open questions</div>
          {report.uncertainty.map((item) => <p className="m-0 text-xs leading-relaxed text-muted-foreground" key={item}>{item}</p>)}
          {report.openQuestions.map((item) => <p className="m-0 text-xs leading-relaxed text-muted-foreground" key={item}>{item}</p>)}
        </section>
      )}
    </article>
  );
}
