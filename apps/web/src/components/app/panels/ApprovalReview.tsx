import React, { useEffect, useState } from "react";
import { Check, RefreshCw, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiBase, fetchJson } from "@/app/api";
import type { ApprovalRequest, ExtensionInvocationResponse } from "@/app/types";

export function ApprovalReview() {
  const [open, setOpen] = useState(false);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const pending = approvals.filter((approval) => approval.status === "pending");

  async function refreshApprovals() {
    setLoading(true);
    try {
      const data = await fetchJson<{ approvals: ApprovalRequest[] }>(`${apiBase}/approvals?status=pending`);
      setApprovals(data.approvals);
      setStatus(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Approvals unavailable");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshApprovals();
  }, []);

  useEffect(() => {
    if (open) void refreshApprovals();
  }, [open]);

  useEffect(() => {
    function handleApprovalRequested() {
      void refreshApprovals();
    }
    window.addEventListener("sp-agent:approval-requested", handleApprovalRequested);
    return () => window.removeEventListener("sp-agent:approval-requested", handleApprovalRequested);
  }, []);

  async function decide(id: string, decision: "approved" | "denied") {
    setStatus(decision === "approved" ? "Approving" : "Denying");
    try {
      const data = await fetchJson<{ approval: ApprovalRequest }>(`${apiBase}/approvals/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, reason: "Reviewed in renderer approval queue." })
      });
      if (decision === "approved") {
        await executeApprovedAction(data.approval);
      }
      await refreshApprovals();
      setStatus(decision === "approved" ? "Approved and executed" : "Denied");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Approval update failed");
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
                  <Button variant="outline" className="approvalDeny" onClick={() => void decide(approval.id, "denied")}>
                    <X size={15} />
                    Deny
                  </Button>
                  <Button className="approvalApprove" onClick={() => void decide(approval.id, "approved")}>
                    <Check size={15} />
                    Approve
                  </Button>
                </div>
              </article>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
