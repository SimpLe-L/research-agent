import React, { useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Check, RefreshCw, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiBase, fetchJson } from "@/app/api";
import type { ApprovalRequest, ExtensionInvocationResponse } from "@/app/types";

type CompletedResearchSummary = {
  answer: string;
  sourceCount: number;
  citedClaimCount: number;
  degradedReason?: string;
};

type RemoteResearchAccess = {
  enabled: boolean;
  updatedAt?: string;
};

export function ApprovalReview() {
  const [open, setOpen] = useState(false);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [completedResearch, setCompletedResearch] = useState<CompletedResearchSummary | null>(null);
  const [remoteResearchAccess, setRemoteResearchAccess] = useState<RemoteResearchAccess>({ enabled: false });
  const [remoteResearchPrompt, setRemoteResearchPrompt] = useState<ApprovalRequest | null>(null);

  const pending = approvals.filter((approval) => approval.status === "pending");

  async function refreshApprovals(openRemoteResearchPrompt = false) {
    setLoading(true);
    try {
      const data = await fetchJson<{ approvals: ApprovalRequest[] }>(`${apiBase}/approvals?status=pending`);
      setApprovals(data.approvals);
      if (openRemoteResearchPrompt) {
        const request = data.approvals.find(isRemoteResearchApproval);
        if (request) setRemoteResearchPrompt(request);
      }
      setStatus(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Approvals unavailable");
    } finally {
      setLoading(false);
    }
  }

  async function refreshRemoteResearchAccess() {
    try {
      setRemoteResearchAccess(await fetchJson<RemoteResearchAccess>(`${apiBase}/research/access`));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Remote research access unavailable");
    }
  }

  useEffect(() => {
    void refreshApprovals();
    void refreshRemoteResearchAccess();
  }, []);

  useEffect(() => {
    if (open) void refreshApprovals();
  }, [open]);

  useEffect(() => {
    function handleApprovalRequested() {
      void refreshApprovals(true);
      void refreshRemoteResearchAccess();
    }
    window.addEventListener("sp-agent:approval-requested", handleApprovalRequested);
    return () => window.removeEventListener("sp-agent:approval-requested", handleApprovalRequested);
  }, []);

  async function decide(id: string, decision: "approved" | "denied") {
    const request = approvals.find((approval) => approval.id === id) ?? remoteResearchPrompt;
    setDecidingId(id);
    setStatus(decision === "approved" ? "Approving" : "Denying");
    try {
      const data = await fetchJson<{ approval: ApprovalRequest }>(`${apiBase}/approvals/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, reason: "Reviewed in renderer approval queue." })
      });
      if (decision === "approved") {
        const result = await executeApprovedAction(data.approval);
        setCompletedResearch(result ? toCompletedResearchSummary(result) : null);
      } else {
        setCompletedResearch(null);
      }
      await refreshApprovals();
      await refreshRemoteResearchAccess();
      if (request && isRemoteResearchApproval(request)) setRemoteResearchPrompt(null);
      setStatus(decision === "approved" ? "Approved and executed" : "Denied");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Approval update failed");
    } finally {
      setDecidingId(null);
    }
  }

  async function disableRemoteResearchAccess() {
    setLoading(true);
    try {
      setRemoteResearchAccess(await fetchJson<RemoteResearchAccess>(`${apiBase}/research/access`, { method: "DELETE" }));
      setStatus("Remote research will ask again before the next provider request");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not update remote research access");
    } finally {
      setLoading(false);
    }
  }

  async function executeApprovedAction(approval: ApprovalRequest) {
    if (!approval.extensionId || !approval.capabilityId) return;
    const result = await fetchJson<ExtensionInvocationResponse>(`${apiBase}/extensions/${approval.extensionId}/invoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        capabilityId: approval.capabilityId,
        input: approval.input,
        approvalId: approval.id
      })
    });
    if (result.status !== "completed") {
      throw new Error(result.degradedReason ?? `Approved action returned ${result.status}`);
    }
    window.dispatchEvent(new CustomEvent("sp-agent:approval-executed", { detail: approval }));
    return result;
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <SheetTrigger
              render={<Button variant="ghost" size="icon" className="approvalButton" data-testid="approval-review-button" />}
            />
          }
        >
          <ShieldCheck size={18} />
          {pending.length > 0 && <span className="approvalBadge" data-testid="approval-pending-count">{pending.length}</span>}
          <span className="sr-only">Review approvals</span>
        </TooltipTrigger>
        <TooltipContent>Review approvals</TooltipContent>
      </Tooltip>
      <SheetContent side="right" className="approvalSheet" data-testid="approval-review-panel">
        <div className="approvalHeader">
          <div>
            <h2>Approvals</h2>
            <p>{pending.length} pending request{pending.length === 1 ? "" : "s"}</p>
          </div>
          <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={() => void refreshApprovals()} disabled={loading}>
            <RefreshCw size={16} />
          </Button>
        </div>
        {status && <p className="approvalStatus" data-testid="approval-review-status">{status}</p>}
        <section className="grid gap-2 border-b px-5 py-4 text-sm" data-testid="remote-research-access">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-foreground">Remote research</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {remoteResearchAccess.enabled ? "Allowed for web search and provider-assisted research." : "Ask before sending a research question or evidence to a provider."}
              </p>
            </div>
            {remoteResearchAccess.enabled && (
              <Button variant="outline" size="sm" onClick={() => void disableRemoteResearchAccess()} disabled={loading}>
                Turn off
              </Button>
            )}
          </div>
        </section>
        {completedResearch && (
          <section className="border-b border-border px-5 py-4 text-sm" data-testid="approved-research-result">
            <p className="font-medium text-foreground">{completedResearch.answer}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {completedResearch.sourceCount} sources · {completedResearch.citedClaimCount} cited claims
            </p>
            {completedResearch.degradedReason && <p className="mt-2 text-xs text-muted-foreground">{completedResearch.degradedReason}</p>}
          </section>
        )}
        <div className="approvalList" data-testid="approval-list">
          {pending.length === 0 ? (
            <div className="approvalEmpty">No pending approvals</div>
          ) : (
            pending.map((approval) => (
              <article className="approvalItem" key={approval.id}>
                <div className="approvalItemHeader">
                  <strong>{approval.action}</strong>
                  <span>{new Date(approval.createdAt).toLocaleString()}</span>
                </div>
                <p>{approval.reason}</p>
                <dl>
                  <div>
                    <dt>Capability</dt>
                    <dd>{approval.extensionId ?? "unknown"} / {approval.capabilityId ?? "unknown"}</dd>
                  </div>
                  <div>
                    <dt>Permissions</dt>
                    <dd>{approval.permissions.join(", ") || "none"}</dd>
                  </div>
                </dl>
                <pre>{JSON.stringify(approval.input, null, 2)}</pre>
                <div className="approvalActions">
                  <Button variant="outline" className="approvalDeny" onClick={() => void decide(approval.id, "denied")} disabled={decidingId === approval.id}>
                    <X size={15} />
                    Deny
                  </Button>
                  <Button className="approvalApprove" onClick={() => void decide(approval.id, "approved")} disabled={decidingId === approval.id}>
                    <Check size={15} />
                    Approve
                  </Button>
                </div>
              </article>
            ))
          )}
        </div>
      </SheetContent>
      <DialogPrimitive.Root open={Boolean(remoteResearchPrompt)} onOpenChange={(nextOpen) => !nextOpen && setRemoteResearchPrompt(null)}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop className="fixed inset-0 z-[60] bg-black/20 backdrop-blur-[1px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
          <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-[60] grid w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 gap-5 rounded-lg border bg-popover p-5 text-popover-foreground shadow-xl outline-none transition duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0" data-testid="remote-research-approval-dialog">
            <div className="grid gap-2">
              <DialogPrimitive.Title className="text-base font-semibold text-foreground">Allow remote research?</DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-sm leading-relaxed text-muted-foreground">
                This first approval enables automatic web search and provider-assisted research until you turn it off. Memory, imports, and external writes still require separate approval.
              </DialogPrimitive.Description>
            </div>
            {remoteResearchPrompt && (
              <dl className="grid gap-3 border-y py-4 text-sm">
                <div className="grid gap-1">
                  <dt className="text-xs font-medium text-muted-foreground">Question sent to providers</dt>
                  <dd className="m-0 [overflow-wrap:anywhere] text-foreground">{approvalQuestion(remoteResearchPrompt)}</dd>
                </div>
                <div className="grid gap-1">
                  <dt className="text-xs font-medium text-muted-foreground">Data scope</dt>
                  <dd className="m-0 text-foreground">Question, search terms, and collected evidence excerpts</dd>
                </div>
              </dl>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setRemoteResearchPrompt(null)}>Not now</Button>
              <Button variant="outline" onClick={() => remoteResearchPrompt && void decide(remoteResearchPrompt.id, "denied")} disabled={decidingId === remoteResearchPrompt?.id}>Deny</Button>
              <Button onClick={() => remoteResearchPrompt && void decide(remoteResearchPrompt.id, "approved")} disabled={decidingId === remoteResearchPrompt?.id}>
                Allow and research
              </Button>
            </div>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </Sheet>
  );
}

function isRemoteResearchApproval(approval: ApprovalRequest) {
  return approval.extensionId === "personal.research" && (
    approval.capabilityId === "research.search_web" || approval.capabilityId === "research.run_provider_assisted"
  );
}

function approvalQuestion(approval: ApprovalRequest) {
  const question = approval.input.question;
  return typeof question === "string" && question.trim() ? question : approval.action;
}

function toCompletedResearchSummary(response: ExtensionInvocationResponse): CompletedResearchSummary | null {
  const report = (response.result as {
    workflow?: {
      result?: {
        answer?: unknown;
        degradedReason?: unknown;
        metrics?: { sourceCount?: unknown; citedClaimCount?: unknown };
      };
    };
  } | null)?.workflow?.result;
  if (!report || typeof report.answer !== "string") return null;
  return {
    answer: report.answer,
    sourceCount: typeof report.metrics?.sourceCount === "number" ? report.metrics.sourceCount : 0,
    citedClaimCount: typeof report.metrics?.citedClaimCount === "number" ? report.metrics.citedClaimCount : 0,
    degradedReason: typeof report.degradedReason === "string" ? report.degradedReason : undefined
  };
}
