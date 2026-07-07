import React, { useEffect, useState } from "react";
import { Check, Database, GitMerge, Info, Lightbulb, Pencil, RefreshCw, Trash2, X } from "lucide-react";
import { useAuiState } from "@assistant-ui/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiBase, fetchJson } from "@/app/api";
import type { ExtensionInvocationResponse, MemoryAuditEvent, MemoryConsolidationSuggestion, MemoryEntry, MemoryKind, MemorySearchResult, MemoryStatus, MemoryUpdatePayload } from "@/app/types";
import { cn } from "@/lib/utils";

const memoryKindLabels: Record<MemoryKind, string> = {
  core: "Core",
  journal: "Journal",
  summary: "Summary",
  procedural: "Procedural",
  project: "Project"
};

const memoryKindOrder: MemoryKind[] = ["core", "journal", "summary", "procedural", "project"];

const memoryPillClass = "inline-flex items-center rounded-full border border-border px-2 py-1 text-[11px] leading-none capitalize";
const memoryMetaLabelClass = "text-[11px] font-bold uppercase text-muted-foreground";
const memoryMetaValueClass = "m-0 [overflow-wrap:anywhere] text-[13px] text-foreground";
const memoryKindOptions = [
  { value: "core", label: "Core" },
  { value: "journal", label: "Journal" },
  { value: "summary", label: "Summary" },
  { value: "procedural", label: "Procedural" },
  { value: "project", label: "Project" }
] satisfies Array<{ value: MemoryKind; label: string }>;
const memoryKindFilterOptions = [
  { value: "all", label: "All kinds" },
  ...memoryKindOptions
] satisfies Array<{ value: "all" | MemoryKind; label: string }>;
const memoryStatusOptions = [
  { value: "candidate", label: "Candidates" },
  { value: "active", label: "Active" },
  { value: "tombstoned", label: "Forgotten" },
  { value: "all", label: "All statuses" }
] satisfies Array<{ value: MemoryStatus | "all"; label: string }>;
const memorySensitivityOptions = [
  { value: "normal", label: "Normal" },
  { value: "sensitive", label: "Sensitive" }
] satisfies Array<{ value: "normal" | "sensitive"; label: string }>;

export function MemoryReview() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MemorySearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | MemoryKind>("all");
  const [memoryStatus, setMemoryStatus] = useState<MemoryStatus | "all">("candidate");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [includeSensitive, setIncludeSensitive] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mergeDraft, setMergeDraft] = useState<MemoryUpdatePayload | null>(null);
  const [auditByMemoryId, setAuditByMemoryId] = useState<Record<string, MemoryAuditEvent[]>>({});
  const threadId = useAuiState((state) => state.threadListItem.remoteId ?? state.threads.mainThreadId);

  const candidateCount = items.filter((item) => item.entry.status === "candidate").length;
  const selectedMemories = items.map((item) => item.entry).filter((memory) => selectedIds.has(memory.id));
  const groupedItems = groupMemoryItems(items);

  async function refreshMemories() {
    setLoading(true);
    try {
      const trimmedQuery = query.trim();
      if (trimmedQuery) {
        const params = new URLSearchParams();
        params.set("query", trimmedQuery);
        params.set("limit", "30");
        params.set("statuses", statusQueryParam(memoryStatus));
        if (kind !== "all") params.set("kind", kind);
        if (fromDate) params.set("from", dateInputStartIso(fromDate));
        if (toDate) params.set("to", dateInputEndIso(toDate));
        if (includeSensitive) params.set("includeSensitive", "true");
        const data = await fetchJson<{ memories: MemorySearchResult[] }>(`${apiBase}/memory/search?${params.toString()}`);
        setItems(data.memories);
      } else {
        const data = await fetchJson<{ memories: MemoryEntry[] }>(`${apiBase}/memory`);
        const filtered = data.memories
          .filter((memory) => kind === "all" || memory.kind === kind)
          .filter((memory) => memoryStatus === "all" || memory.status === memoryStatus)
          .filter((memory) => includeSensitive || memory.sensitivity !== "sensitive")
          .filter((memory) => memoryMatchesDateRange(memory, fromDate, toDate))
          .slice(0, 60)
          .map((entry) => ({ entry, score: 0, matchedTerms: [], rankingSignals: [] }));
        setItems(filtered);
      }
      setStatus(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Memory unavailable");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshMemories();
  }, []);

  useEffect(() => {
    if (open) void refreshMemories();
  }, [open]);

  useEffect(() => {
    function handleApprovalExecuted() {
      if (open) void refreshMemories();
    }
    window.addEventListener("sp-agent:approval-executed", handleApprovalExecuted);
    return () => window.removeEventListener("sp-agent:approval-executed", handleApprovalExecuted);
  }, [open]);

  async function promote(memory: MemoryEntry) {
    setStatus("Requesting promotion approval");
    try {
      const response = await invokeMemoryExtension("memory.promote_fact", {
        id: memory.id,
        reason: "Promoted from memory review UI."
      });
      if (response.status === "completed") {
        await refreshMemories();
        setStatus("Promoted");
      } else {
        setStatus("Promotion approval requested");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Promote approval failed");
    }
  }

  async function updateMemory(memory: MemoryEntry, payload: MemoryUpdatePayload) {
    setStatus("Requesting update approval");
    try {
      const response = await invokeMemoryExtension("memory.update", {
        id: memory.id,
        ...payload
      });
      if (response.status === "completed") {
        await refreshMemories();
        setStatus("Updated");
      } else {
        setStatus("Update approval requested");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Update approval failed");
    }
  }

  async function forget(memory: MemoryEntry) {
    setStatus("Forgetting memory");
    try {
      await fetchJson<{ memory: MemoryEntry }>(`${apiBase}/memory/${memory.id}`, { method: "DELETE" });
      await refreshMemories();
      setStatus("Forgotten");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Forget failed");
    }
  }

  async function mergeSelected() {
    if (!mergeDraft || selectedMemories.length < 2) return;
    setStatus("Requesting merge approval");
    try {
      const response = await invokeMemoryExtension("memory.merge", {
        sourceIds: selectedMemories.map((memory) => memory.id),
        content: mergeDraft.content,
        kind: mergeDraft.kind,
        reason: "Merged from memory review UI.",
        confidence: 0.8,
        sensitivity: mergeDraft.sensitivity,
        occurredAt: mergeDraft.occurredAt,
        tags: mergeDraft.tags
      });
      if (response.status === "completed") {
        setSelectedIds(new Set());
        setMergeDraft(null);
        await refreshMemories();
        setStatus("Merged");
      } else {
        setStatus("Merge approval requested");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Merge approval failed");
    }
  }

  async function suggestConsolidation() {
    setStatus("Finding consolidation suggestions");
    try {
      const data = await fetchJson<{ suggestions: MemoryConsolidationSuggestion[]; degradedReason?: string }>(`${apiBase}/memory/consolidate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          statuses: memoryStatus === "candidate" || memoryStatus === "active" ? [memoryStatus] : ["candidate", "active"],
          includeSensitive,
          maxSuggestions: 6
        })
      });
      const suggestion = data.suggestions[0];
      if (!suggestion) {
        setStatus(data.degradedReason ?? "No consolidation suggestions");
        return;
      }
      setSelectedIds(new Set(suggestion.sourceIds));
      setMergeDraft({
        content: suggestion.content,
        kind: suggestion.kind,
        sensitivity: suggestion.sensitivity,
        tags: suggestion.tags,
        occurredAt: suggestion.occurredAt
      });
      setStatus(suggestion.conflictReason ?? suggestion.reason);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Consolidation suggestion failed");
    }
  }

  async function loadAudit(memoryId: string) {
    if (auditByMemoryId[memoryId]) return;
    try {
      const data = await fetchJson<{ auditEvents: MemoryAuditEvent[] }>(`${apiBase}/memory/audit?memoryId=${encodeURIComponent(memoryId)}`);
      setAuditByMemoryId((current) => ({ ...current, [memoryId]: data.auditEvents }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Audit unavailable");
    }
  }

  async function extractSessionMemory() {
    if (!threadId) return;
    setStatus("Extracting candidates");
    try {
      const data = await fetchJson<{ accepted: number }>(`${apiBase}/memory/extract/session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: threadId, maxCandidates: 8 })
      });
      await refreshMemories();
      setStatus(`Extracted ${data.accepted} candidate${data.accepted === 1 ? "" : "s"}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Extract failed");
    }
  }

  async function summarizeSession() {
    if (!threadId) return;
    setStatus("Creating summary");
    try {
      await fetchJson<{ accepted: boolean }>(`${apiBase}/memory/summaries/session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: threadId, maxMessages: 30 })
      });
      await refreshMemories();
      setStatus("Summary candidate created");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Summary failed");
    }
  }

  function toggleSelected(memoryId: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(memoryId);
      else next.delete(memoryId);
      return next;
    });
  }

  function beginMerge() {
    if (selectedMemories.length < 2) return;
    const [first] = selectedMemories;
    setMergeDraft({
      content: selectedMemories.map((memory) => memory.content).join("\n"),
      kind: first.kind,
      sensitivity: selectedMemories.some((memory) => memory.sensitivity === "sensitive") ? "sensitive" : "normal",
      tags: [...new Set(selectedMemories.flatMap((memory) => memory.tags))],
      occurredAt: first.occurredAt
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <SheetTrigger
              render={<Button variant="ghost" size="icon" className="relative text-muted-foreground" data-testid="memory-review-button" />}
            />
          }
        >
          <Database size={18} />
          {candidateCount > 0 && (
            <span
              className="absolute top-0.5 right-0.5 inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full border-2 border-background bg-foreground px-1 text-[10px] leading-none font-bold text-background"
              data-testid="memory-candidate-count"
            >
              {candidateCount}
            </span>
          )}
          <span className="sr-only">Review memory</span>
        </TooltipTrigger>
        <TooltipContent>Review memory</TooltipContent>
      </Tooltip>
      <SheetContent side="right" className="w-[min(500px,94vw)] max-w-[min(500px,94vw)] gap-0 p-0 max-[900px]:w-[min(380px,94vw)]" data-testid="memory-review-panel">
        <div className="flex min-h-18 items-center justify-between border-b px-5 py-4.5">
          <div>
            <h2 className="m-0 text-lg leading-tight font-bold">Memory</h2>
            <p className="text-[13px] text-muted-foreground">{items.length} item{items.length === 1 ? "" : "s"} in current view</p>
          </div>
          <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={() => void refreshMemories()} disabled={loading}>
            <RefreshCw size={16} />
          </Button>
        </div>
        <div className="grid gap-2.5 border-b px-4 py-3.5">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void refreshMemories();
            }}
            placeholder="Search memory"
            aria-label="Search memory"
          />
          <div className="flex flex-wrap gap-2">
            <MemorySelect value={kind} onValueChange={setKind} options={memoryKindFilterOptions} ariaLabel="Memory kind" />
            <MemorySelect value={memoryStatus} onValueChange={setMemoryStatus} options={memoryStatusOptions} ariaLabel="Memory status" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Input className="flex-1" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="Memory from date" />
            <Input className="flex-1" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="Memory to date" />
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <input className="size-3.5" type="checkbox" checked={includeSensitive} onChange={(event) => setIncludeSensitive(event.target.checked)} />
            Include sensitive
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void refreshMemories()} disabled={loading}>
              Search
            </Button>
            <Button variant="outline" size="sm" onClick={() => void extractSessionMemory()} disabled={!threadId || loading}>
              Extract
            </Button>
            <Button variant="outline" size="sm" onClick={() => void summarizeSession()} disabled={!threadId || loading}>
              Summary
            </Button>
            <Button variant="outline" size="sm" onClick={beginMerge} disabled={selectedMemories.length < 2 || loading} data-testid="memory-merge-start">
              <GitMerge size={14} />
              Merge
            </Button>
            <Button variant="outline" size="sm" onClick={() => void suggestConsolidation()} disabled={loading}>
              <Lightbulb size={14} />
              Suggest
            </Button>
          </div>
        </div>
        {mergeDraft && (
          <div className="grid gap-2.5 border-b px-4 py-3.5" data-testid="memory-merge-panel">
            <div className="flex items-center justify-between">
              <strong className="text-[13px] text-foreground">Merge {selectedMemories.length} memories</strong>
              <Button variant="ghost" size="icon-sm" onClick={() => setMergeDraft(null)} aria-label="Cancel merge">
                <X size={14} />
              </Button>
            </div>
            <Textarea
              value={mergeDraft.content}
              onChange={(event) => setMergeDraft({ ...mergeDraft, content: event.target.value })}
              aria-label="Merged memory content"
            />
            <div className="flex flex-wrap gap-2">
              <MemorySelect value={mergeDraft.kind} onValueChange={(nextKind) => setMergeDraft({ ...mergeDraft, kind: nextKind })} options={memoryKindOptions} ariaLabel="Merged memory kind" />
              <MemorySelect value={mergeDraft.sensitivity} onValueChange={(sensitivity) => setMergeDraft({ ...mergeDraft, sensitivity })} options={memorySensitivityOptions} ariaLabel="Merged memory sensitivity" />
            </div>
            <Input
              value={mergeDraft.tags.join(", ")}
              onChange={(event) => setMergeDraft({ ...mergeDraft, tags: parseTags(event.target.value) })}
              placeholder="Tags"
              aria-label="Merged memory tags"
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void mergeSelected()} disabled={!mergeDraft.content.trim()}>
                <GitMerge size={14} />
                Save merge
              </Button>
            </div>
          </div>
        )}
        {status && <p className="border-b px-5 py-2.5 text-[13px] text-muted-foreground" data-testid="memory-review-status">{status}</p>}
        <div className="grid min-h-0 gap-2.5 overflow-auto p-3.5" data-testid="memory-list">
          {items.length === 0 ? (
            <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">No memories in this view</div>
          ) : (
            groupedItems.map((group) => (
              <section className="grid gap-2" key={group.kind} data-testid={`memory-kind-${group.kind}`}>
                <h3 className="mt-0.5 text-[11px] font-bold tracking-normal text-muted-foreground uppercase">{memoryKindLabels[group.kind]}</h3>
                {group.items.map((item) => (
                  <MemoryReviewItem
                    key={item.entry.id}
                    item={item}
                    selected={selectedIds.has(item.entry.id)}
                    auditEvents={auditByMemoryId[item.entry.id]}
                    onSelectionChange={(checked) => toggleSelected(item.entry.id, checked)}
                    onPromote={() => void promote(item.entry)}
                    onForget={() => void forget(item.entry)}
                    onUpdate={(payload) => void updateMemory(item.entry, payload)}
                    onLoadAudit={() => void loadAudit(item.entry.id)}
                  />
                ))}
              </section>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MemoryReviewItem({
  item,
  selected,
  auditEvents,
  onSelectionChange,
  onPromote,
  onForget,
  onUpdate,
  onLoadAudit
}: {
  item: MemorySearchResult;
  selected: boolean;
  auditEvents?: MemoryAuditEvent[];
  onSelectionChange: (checked: boolean) => void;
  onPromote: () => void;
  onForget: () => void;
  onUpdate: (payload: MemoryUpdatePayload) => void;
  onLoadAudit: () => void;
}) {
  const memory = item.entry;
  const [editing, setEditing] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [draft, setDraft] = useState<MemoryUpdatePayload>(() => ({
    content: memory.content,
    kind: memory.kind,
    sensitivity: memory.sensitivity,
    tags: memory.tags,
    occurredAt: memory.occurredAt
  }));

  useEffect(() => {
    setDraft({
      content: memory.content,
      kind: memory.kind,
      sensitivity: memory.sensitivity,
      tags: memory.tags,
      occurredAt: memory.occurredAt
    });
  }, [memory.id, memory.content, memory.kind, memory.sensitivity, memory.tags, memory.occurredAt]);

  function toggleDetails() {
    const nextOpen = !detailsOpen;
    setDetailsOpen(nextOpen);
    if (nextOpen) onLoadAudit();
  }

  return (
    <article className={cn("grid gap-2.5 rounded-lg border border-l-3 p-3", memoryKindBorderClass(memory.kind), memory.status === "active" && "bg-muted/30")}>
      <div className="flex items-start justify-between gap-2">
        <label className="inline-flex pt-0.5">
          <input className="size-3.5" type="checkbox" checked={selected} onChange={(event) => onSelectionChange(event.target.checked)} aria-label={`Select ${memory.kind} memory`} />
        </label>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <span className={cn(memoryPillClass, "text-foreground")}>{memoryKindLabels[memory.kind]}</span>
          <strong className={cn(memoryPillClass, "font-semibold text-muted-foreground")}>{memory.status}</strong>
          {memory.sensitivity === "sensitive" && <strong className={cn(memoryPillClass, "font-semibold text-muted-foreground")}>Sensitive</strong>}
        </div>
        <time className="shrink-0 text-[11px] whitespace-nowrap text-muted-foreground">{new Date(memory.occurredAt ?? memory.updatedAt).toLocaleDateString()}</time>
      </div>
      {editing ? (
        <div className="grid gap-2" data-testid="memory-edit-panel">
          <Textarea value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} aria-label="Memory content" />
          <div className="flex flex-wrap gap-2">
            <MemorySelect value={draft.kind} onValueChange={(nextKind) => setDraft({ ...draft, kind: nextKind })} options={memoryKindOptions} ariaLabel="Edit memory kind" />
            <MemorySelect value={draft.sensitivity} onValueChange={(sensitivity) => setDraft({ ...draft, sensitivity })} options={memorySensitivityOptions} ariaLabel="Edit memory sensitivity" />
          </div>
          <Input
            type="datetime-local"
            value={dateTimeLocalValue(draft.occurredAt)}
            onChange={(event) => setDraft({ ...draft, occurredAt: dateTimeLocalIso(event.target.value) })}
            aria-label="Memory occurred at"
          />
          <Input value={draft.tags.join(", ")} onChange={(event) => setDraft({ ...draft, tags: parseTags(event.target.value) })} aria-label="Memory tags" />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => {
              onUpdate(draft);
              setEditing(false);
            }} disabled={!draft.content.trim()}>
              <Check size={14} />
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-1.5">
          <p className="m-0 text-[13px] leading-relaxed text-foreground [overflow-wrap:anywhere]">{memory.content}</p>
          {item.sourceSnippet && item.sourceSnippet !== memory.content && (
            <p className="m-0 rounded-md bg-muted/45 px-2 py-1.5 text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{item.sourceSnippet}</p>
          )}
        </div>
      )}
      <dl className="m-0 grid gap-1.5">
        <div className="grid gap-0.5">
          <dt className={memoryMetaLabelClass}>Source</dt>
          <dd className={memoryMetaValueClass}>{memory.source.label ?? memory.source.type}</dd>
        </div>
        <div className="grid gap-0.5">
          <dt className={memoryMetaLabelClass}>Signals</dt>
          <dd className={memoryMetaValueClass}>{item.rankingSignals.slice(0, 4).join(", ") || "none"}</dd>
        </div>
        <div className="grid gap-0.5">
          <dt className={memoryMetaLabelClass}>Confidence</dt>
          <dd className={memoryMetaValueClass}>{Math.round(memory.confidence * 100)}%</dd>
        </div>
        {memory.tags.length > 0 && (
          <div className="grid gap-0.5">
            <dt className={memoryMetaLabelClass}>Tags</dt>
            <dd className={memoryMetaValueClass}>{memory.tags.join(", ")}</dd>
          </div>
        )}
        {memory.conflictReason && (
          <div className="grid gap-0.5">
            <dt className={memoryMetaLabelClass}>Conflict</dt>
            <dd className={memoryMetaValueClass}>{memory.conflictReason}</dd>
          </div>
        )}
      </dl>
      {detailsOpen && (
        <div className="grid gap-2.5 rounded-lg border bg-muted/40 p-2.5" data-testid="memory-provenance">
          <dl className="m-0 grid gap-1.5">
            <div className="grid gap-0.5">
              <dt className={memoryMetaLabelClass}>Session</dt>
              <dd className={memoryMetaValueClass}>{memory.sessionId ?? "global"}</dd>
            </div>
            <div className="grid gap-0.5">
              <dt className={memoryMetaLabelClass}>Created</dt>
              <dd className={memoryMetaValueClass}>{new Date(memory.createdAt).toLocaleString()}</dd>
            </div>
            <div className="grid gap-0.5">
              <dt className={memoryMetaLabelClass}>Updated</dt>
              <dd className={memoryMetaValueClass}>{new Date(memory.updatedAt).toLocaleString()}</dd>
            </div>
            {memory.promotedAt && (
              <div className="grid gap-0.5">
                <dt className={memoryMetaLabelClass}>Promoted</dt>
                <dd className={memoryMetaValueClass}>{new Date(memory.promotedAt).toLocaleString()}</dd>
              </div>
            )}
            {memory.tombstonedAt && (
              <div className="grid gap-0.5">
                <dt className={memoryMetaLabelClass}>Forgotten</dt>
                <dd className={memoryMetaValueClass}>{new Date(memory.tombstonedAt).toLocaleString()}</dd>
              </div>
            )}
          </dl>
          <pre className="m-0 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border bg-background p-2.5 text-xs leading-relaxed text-foreground">{JSON.stringify({ source: memory.source, provenance: memory.provenance }, null, 2)}</pre>
          {item.citation && (
            <dl className="m-0 grid gap-1.5 rounded-lg border bg-background p-2.5">
              <div className="grid gap-0.5">
                <dt className={memoryMetaLabelClass}>Citation</dt>
                <dd className={memoryMetaValueClass}>{item.citation.sourceLabel ?? item.citation.sourceType}</dd>
              </div>
              {item.citation.messageId && (
                <div className="grid gap-0.5">
                  <dt className={memoryMetaLabelClass}>Message</dt>
                  <dd className={memoryMetaValueClass}>{item.citation.messageId}</dd>
                </div>
              )}
              <div className="grid gap-0.5">
                <dt className={memoryMetaLabelClass}>Snippet</dt>
                <dd className={memoryMetaValueClass}>{item.citation.snippet}</dd>
              </div>
            </dl>
          )}
          <div className="grid gap-1.5">
            <strong className="text-xs text-foreground">Audit</strong>
            {auditEvents ? (
              auditEvents.length === 0 ? (
                <span className="text-xs text-muted-foreground">No audit events</span>
              ) : (
                auditEvents.map((event) => (
                  <p className="m-0 text-xs leading-snug text-muted-foreground [overflow-wrap:anywhere]" key={event.id}>{event.action} · {new Date(event.createdAt).toLocaleString()}{event.reason ? ` · ${event.reason}` : ""}</p>
                ))
              )
            ) : (
              <span className="text-xs text-muted-foreground">Loading audit</span>
            )}
          </div>
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={toggleDetails}>
          <Info size={14} />
          Details
        </Button>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil size={14} />
          Edit
        </Button>
        {memory.status === "candidate" && (
          <Button size="sm" onClick={onPromote}>
            <Check size={14} />
            Promote
          </Button>
        )}
        {memory.status !== "tombstoned" && (
          <Button variant="outline" size="sm" onClick={onForget}>
            <Trash2 size={14} />
            Forget
          </Button>
        )}
      </div>
    </article>
  );
}

function MemorySelect<T extends string>({
  value,
  onValueChange,
  options,
  ariaLabel
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: Array<{ value: T; label: React.ReactNode }>;
  ariaLabel: string;
}) {
  return (
    <Select value={value} onValueChange={(nextValue) => onValueChange(nextValue as T)}>
      <SelectTrigger className="flex-1 border-foreground/20 bg-background hover:border-foreground/30 data-popup-open:border-foreground/30" aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false} className="border border-foreground/15">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function groupMemoryItems(items: MemorySearchResult[]) {
  return memoryKindOrder
    .map((memoryKind) => ({
      kind: memoryKind,
      items: items.filter((item) => item.entry.kind === memoryKind)
    }))
    .filter((group) => group.items.length > 0);
}

function memoryKindBorderClass(kind: MemoryKind) {
  if (kind === "core") return "border-l-blue-500";
  if (kind === "journal") return "border-l-emerald-500";
  if (kind === "summary") return "border-l-amber-500";
  if (kind === "procedural") return "border-l-violet-500";
  return "border-l-slate-500";
}

function statusQueryParam(status: MemoryStatus | "all") {
  return status === "all" ? "candidate,active,tombstoned" : status;
}

function memoryMatchesDateRange(memory: MemoryEntry, fromDate: string, toDate: string) {
  const value = Date.parse(memory.occurredAt ?? memory.updatedAt);
  if (Number.isNaN(value)) return true;
  if (fromDate && value < Date.parse(dateInputStartIso(fromDate))) return false;
  if (toDate && value > Date.parse(dateInputEndIso(toDate))) return false;
  return true;
}

function dateInputStartIso(value: string) {
  return new Date(`${value}T00:00:00`).toISOString();
}

function dateInputEndIso(value: string) {
  return new Date(`${value}T23:59:59.999`).toISOString();
}

function dateTimeLocalValue(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function dateTimeLocalIso(value: string) {
  if (!value) return undefined;
  return new Date(value).toISOString();
}

function parseTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

async function invokeMemoryExtension(capabilityId: string, input: Record<string, unknown>) {
  const response = await fetchJson<ExtensionInvocationResponse>(`${apiBase}/extensions/local.memory/invoke`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ capabilityId, input })
  });
  if (response.status === "degraded") {
    throw new Error(response.degradedReason ?? `${capabilityId} is degraded`);
  }
  if (response.status === "pending_approval") {
    window.dispatchEvent(new CustomEvent("sp-agent:approval-requested", { detail: response.approval }));
  }
  return response;
}
