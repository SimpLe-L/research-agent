import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ActionBarPrimitive,
  AssistantRuntimeProvider,
  BranchPickerPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  RuntimeAdapterProvider,
  ThreadListItemPrimitive,
  ThreadListPrimitive,
  ThreadPrimitive,
  fromThreadMessageLike,
  useAui,
  useAuiState,
  useLocalRuntime,
  useRemoteThreadListRuntime,
  type AssistantState,
  type ChatModelAdapter,
  type RemoteThreadListAdapter,
  type ThreadHistoryAdapter,
  type ThreadMessage
} from "@assistant-ui/react";
import { RouterProvider, createRootRoute, createRoute, createRouter, useRouterState } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Bot,
  Check,
  ChevronDown,
  Code2,
  Copy,
  Lightbulb,
  Menu,
  Mic,
  MoreHorizontal,
  PanelLeft,
  Plus,
  RefreshCw,
  Share,
  ShieldCheck,
  Square,
  X,
  Upload,
  Archive,
  CloudSun,
  GitMerge,
  Info,
  Pencil,
  Database,
  Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import "./styles.css";

const apiBase = import.meta.env.VITE_API_BASE ?? "http://localhost:4317/api";

type ProviderStatus = {
  configured?: boolean;
  reachable?: boolean;
  degradedReason?: string;
};

type AgentStatus = {
  mode: "local_personal_agent";
  piRuntime?: ProviderStatus & {
    provider?: string;
    model?: string;
    selectedModel?: string;
  };
  extensions?: Array<{ id: string; name: string; status: string }>;
};

type AgentMessageResponse = {
  sessionId: string;
  role: "assistant";
  content: string;
  provider: string;
  model?: string;
  degradedReason?: string;
  activeTools?: string[];
  toolCalls?: Array<Record<string, unknown>>;
};

type AgentStreamEvent =
  | { type: "metadata"; sessionId: string; memoryContextCount: number }
  | { type: "text_delta"; text: string }
  | { type: "done"; sessionId: string; result: AgentMessageResponse }
  | { type: "error"; message: string };

type VoiceStatus = {
  ready: boolean;
  degradedReason?: string;
  stt: ProviderStatus & { name: string };
  tts: ProviderStatus & { name: string };
};

type VoiceChatResponse = {
  sessionId: string;
  transcript?: string;
  assistantText: string;
  audioBase64?: string;
  mimeType?: string;
  degradedReason?: string;
  timing?: {
    sttMs: number;
    agentMs: number;
    ttsMs: number;
    totalMs: number;
  };
};

const pendingVoiceResponses = new Map<string, VoiceChatResponse>();

type ThreadRecord = {
  id: string;
  title: string;
  createdAt?: string;
  updatedAt: string;
  messages?: Array<{ id?: string; role: string; content: string; createdAt: string }>;
};

type ApprovalRequest = {
  id: string;
  extensionId?: string;
  capabilityId?: string;
  action: string;
  reason: string;
  permissions: string[];
  input: Record<string, unknown>;
  status: "pending" | "approved" | "denied" | "expired";
  createdAt: string;
  updatedAt: string;
  decidedAt?: string;
};

type MemoryKind = "core" | "journal" | "summary" | "procedural" | "project";
type MemoryStatus = "candidate" | "active" | "tombstoned";

type MemoryEntry = {
  id: string;
  kind: MemoryKind;
  scope: "global" | "session";
  sessionId?: string;
  content: string;
  source: { type: string; id?: string; label?: string };
  provenance: Record<string, unknown>;
  confidence: number;
  sensitivity: "normal" | "sensitive";
  tags: string[];
  status: MemoryStatus;
  conflictsWith: string[];
  conflictReason?: string;
  occurredAt?: string;
  createdAt: string;
  updatedAt: string;
  promotedAt?: string;
  tombstonedAt?: string;
};

type MemorySearchResult = {
  entry: MemoryEntry;
  score: number;
  matchedTerms: string[];
  rankingSignals: string[];
  sourceSnippet?: string;
  citation?: {
    memoryId: string;
    sourceType: string;
    sourceId?: string;
    sourceLabel?: string;
    sessionId?: string;
    messageId?: string;
    occurredAt?: string;
    createdAt: string;
    snippet: string;
  };
  debug?: {
    strategy?: "core_semantic" | "journal_temporal" | "hybrid";
    score: number;
    matchedTermCount: number;
    rankingSignals: string[];
    vectorScore?: number;
    temporalWindow?: boolean;
  };
};

type MemoryConsolidationSuggestion = {
  sourceIds: string[];
  content: string;
  kind: MemoryKind;
  reason: string;
  confidence: number;
  sensitivity: "normal" | "sensitive";
  occurredAt?: string;
  tags: string[];
  conflictReason?: string;
};

type MemoryAuditEvent = {
  id: string;
  memoryId: string;
  action: string;
  reason?: string;
  sourceMemoryIds: string[];
  createdAt: string;
};

type MemoryUpdatePayload = {
  content: string;
  kind: MemoryKind;
  sensitivity: "normal" | "sensitive";
  tags: string[];
  occurredAt?: string;
};

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


function latestUserText(messages: readonly ThreadMessage[]): string {
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  const textParts = lastUser?.content.filter((part) => part.type === "text").map((part) => part.text) ?? [];
  return textParts.join("\n").trim();
}

async function* streamAssistantText(text: string, abortSignal?: AbortSignal) {
  const chars = Array.from(text);
  const chunkSize = chars.length > 240 ? 4 : chars.length > 120 ? 3 : 2;
  let visible = "";
  for (let index = 0; index < chars.length; index += chunkSize) {
    if (abortSignal?.aborted) return;
    visible += chars.slice(index, index + chunkSize).join("");
    yield { content: [{ type: "text" as const, text: visible }] };
    await new Promise((resolve) => setTimeout(resolve, 12));
  }
  if (visible !== text && !abortSignal?.aborted) {
    yield { content: [{ type: "text" as const, text }] };
  }
}

async function* readSseEvents(response: Response, abortSignal?: AbortSignal): AsyncGenerator<AgentStreamEvent> {
  if (!response.body) throw new Error("Agent stream response did not include a readable body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      if (abortSignal?.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = parseSseEvent(rawEvent);
        if (event) yield event;
        boundary = buffer.indexOf("\n\n");
      }
    }
    buffer += decoder.decode();
    const event = parseSseEvent(buffer);
    if (event) yield event;
  } finally {
    reader.releaseLock();
  }
}

function parseSseEvent(rawEvent: string): AgentStreamEvent | null {
  const data = rawEvent
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!data) return null;
  return JSON.parse(data) as AgentStreamEvent;
}

function makeThreadTitle(content: string) {
  const clean = content.replace(/\s+/g, " ").trim();
  if (!clean) return "New Chat";
  return clean.length > 24 ? `${clean.slice(0, 24)}...` : clean;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`);
  return data;
}

function toThreadMetadata(thread: ThreadRecord) {
  apiSessionIdsByThreadId.set(thread.id, thread.id);
  return {
    status: "regular" as const,
    remoteId: thread.id,
    externalId: thread.id,
    title: normalizeThreadTitle(thread.title),
    lastMessageAt: new Date(thread.updatedAt)
  };
}

function toAssistantThreadMessage(message: NonNullable<ThreadRecord["messages"]>[number], index: number) {
  if (message.role !== "user" && message.role !== "assistant" && message.role !== "system") return null;
  return fromThreadMessageLike(
    {
      id: message.id ?? `api_msg_${index}`,
      role: message.role,
      content: message.content,
      createdAt: new Date(message.createdAt),
      status: message.role === "assistant" ? { type: "complete", reason: "stop" } : undefined,
      metadata: { custom: { source: "api.chat.sessions" } }
    },
    message.id ?? `api_msg_${index}`,
    { type: "complete", reason: "stop" }
  );
}

async function updateSessionTitle(sessionId: string, title: string) {
  await fetchJson<ThreadRecord>(`${apiBase}/chat/sessions/${sessionId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title })
  }).catch(() => undefined);
}

function createTitleStream(title: string): Awaited<ReturnType<RemoteThreadListAdapter["generateTitle"]>> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({ type: "part-start", path: [0], part: { type: "text" } });
      controller.enqueue({ type: "text-delta", path: [0], textDelta: title });
      controller.enqueue({ type: "part-finish", path: [0] });
      controller.enqueue({
        type: "message-finish",
        path: [],
        finishReason: "stop",
        usage: { inputTokens: 0, outputTokens: 0 }
      });
      controller.close();
    }
  }) as Awaited<ReturnType<RemoteThreadListAdapter["generateTitle"]>>;
}

function firstUserTitle(messages: readonly ThreadMessage[]) {
  const firstUser = messages.find((message) => message.role === "user");
  const text = firstUser?.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join(" ");
  return makeThreadTitle(text ?? "");
}

function normalizeThreadTitle(title: string | undefined) {
  return title?.trim() || "New Chat";
}

const apiSessionIdsByThreadId = new Map<string, string>();

function ThreadHistoryProvider({ children }: { children?: React.ReactNode }) {
  const aui = useAui();
  const history = useMemo<ThreadHistoryAdapter>(
    () => ({
      async load() {
        const { remoteId } = aui.threadListItem().getState();
        if (!remoteId) return { messages: [] };
        const session = await fetchJson<ThreadRecord>(`${apiBase}/chat/sessions/${remoteId}`).catch(() => undefined);
        if (!session) return { messages: [] };
        const messages = (session.messages ?? [])
          .map(toAssistantThreadMessage)
          .filter((message): message is ThreadMessage => Boolean(message));
        return {
          headId: messages.at(-1)?.id ?? null,
          messages: messages.map((message, index) => ({
            message,
            parentId: index === 0 ? null : messages[index - 1]?.id ?? null
          }))
        };
      },
      async append() {
        return;
      },
      async delete() {
        return;
      }
    }),
    [aui]
  );
  return <RuntimeAdapterProvider adapters={{ history }}>{children}</RuntimeAdapterProvider>;
}

const assistantThreadListAdapter: RemoteThreadListAdapter = {
  async list() {
    const data = await fetchJson<{ sessions: ThreadRecord[] }>(`${apiBase}/chat/sessions`);
    return {
      threads: data.sessions.map(toThreadMetadata)
    };
  },
  async initialize(threadId) {
    apiSessionIdsByThreadId.set(threadId, threadId);
    return { remoteId: threadId, externalId: threadId };
  },
  async rename(remoteId, newTitle) {
    await updateSessionTitle(remoteId, newTitle);
  },
  async archive() {
    return;
  },
  async unarchive() {
    return;
  },
  async delete(remoteId) {
    await fetchJson<{ deleted: boolean; sessionId: string }>(`${apiBase}/chat/sessions/${remoteId}`, {
      method: "DELETE"
    });
  },
  async fetch(threadId) {
    const thread = await fetchJson<ThreadRecord>(`${apiBase}/chat/sessions/${threadId}`);
    return toThreadMetadata(thread);
  },
  async generateTitle(remoteId, messages) {
    const title = firstUserTitle(messages);
    await updateSessionTitle(remoteId, title);
    return createTitleStream(title);
  },
  unstable_Provider: ThreadHistoryProvider
};

function App() {
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [statusText, setStatusText] = useState("Checking runtime");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function refreshStatus() {
      try {
        const res = await fetch(`${apiBase}/agent/status`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const status = (await res.json()) as AgentStatus;
        if (cancelled) return;
        setAgentStatus(status);
        const runtime = status.piRuntime;
        if (!runtime?.configured) {
          setStatusText("Runtime missing key");
        } else if (!runtime.reachable) {
          setStatusText("Runtime degraded");
        } else {
          setStatusText("Base ready");
        }
      } catch {
        if (!cancelled) {
          setAgentStatus(null);
          setStatusText("API unavailable");
        }
      }
    }
    void refreshStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  const runtime = useAgentAssistantRuntime();

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <TooltipProvider>
        <main className="min-h-svh bg-background text-foreground" data-testid="app-shell">
          <section
            className={cn(
              "grid h-svh min-h-0 overflow-hidden bg-background transition-[grid-template-columns] duration-200 md:grid-cols-[260px_minmax(0,1fr)]",
              sidebarCollapsed && "md:grid-cols-[56px_minmax(0,1fr)]"
            )}
            data-testid="view-chat"
          >
            <div className="hidden" data-testid="model-tabs" aria-hidden="true" />
            <AssistantThreadSidebar collapsed={sidebarCollapsed} />
            <section className="flex min-w-0 flex-col overflow-hidden bg-background" data-testid="agent-thread-panel">
              <ChatHeader
                sidebarCollapsed={sidebarCollapsed}
                onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
                status={agentStatus}
                statusText={statusText}
              />
              <AssistantThread />
            </section>
          </section>
        </main>
      </TooltipProvider>
    </AssistantRuntimeProvider>
  );
}

function TooltipIconButton({
  tooltip,
  className,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { tooltip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon" className={className} {...props} />}>
        {children}
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className={cn("flex h-14 min-w-0 items-center gap-2.5 px-5", collapsed && "justify-center px-0")}>
      <Bot className="size-5 shrink-0" />
      <strong className={cn("truncate text-[15px] font-semibold transition-all", collapsed && "w-0 opacity-0")}>
        assistant-ui
      </strong>
    </div>
  );
}

function ThreadListContent({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <ThreadListPrimitive.Root className={cn("flex min-h-0 flex-1 flex-col px-3 py-2", collapsed && "items-center px-2")}>
      <Tooltip>
        <TooltipTrigger
          render={
            <ThreadListPrimitive.New
              className={cn(
                "inline-flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-lg bg-muted px-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent",
                collapsed && "w-10 justify-center px-0"
              )}
              data-testid="new-thread-button"
            />
          }
        >
          <Plus className="size-5 shrink-0" />
          <span className={cn(collapsed && "hidden")}>New Thread</span>
        </TooltipTrigger>
        {collapsed && <TooltipContent side="right">New Thread</TooltipContent>}
      </Tooltip>
      {!collapsed && <div className="mx-2 mt-6 mb-2 text-xs font-semibold text-muted-foreground">Today</div>}
      <div className={cn("grid min-h-0 content-start gap-1 overflow-auto", collapsed && "hidden")} data-testid="thread-list">
        <ThreadListPrimitive.Items>
          {() => (
            <ThreadListItemPrimitive.Root className="min-w-0">
              <div className="group/thread-item grid min-w-0 grid-cols-[minmax(0,1fr)_30px] items-center rounded-lg hover:bg-accent focus-within:bg-accent has-[[data-active]]:bg-accent has-[[aria-current=true]]:bg-accent">
                <ThreadListItemPrimitive.Trigger className="block min-h-8 w-full cursor-pointer overflow-hidden truncate rounded-lg bg-transparent px-2.5 py-2 text-left text-sm text-foreground">
                  <ThreadListItemPrimitive.Title fallback="New Chat" />
                </ThreadListItemPrimitive.Trigger>
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground group-hover/thread-item:opacity-100 data-popup-open:opacity-100" title="Thread actions" aria-label="Thread actions" data-testid="thread-actions-button">
                    <MoreHorizontal className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-36">
                    <ThreadListItemPrimitive.Archive
                      render={
                        <DropdownMenuItem data-testid="thread-archive-action">
                          <Archive className="size-3.5" />
                          <span>Archive</span>
                        </DropdownMenuItem>
                      }
                    />
                    <ThreadListItemPrimitive.Delete
                      render={
                        <DropdownMenuItem variant="destructive" data-testid="thread-delete-action">
                          <Trash2 className="size-3.5" />
                          <span>Delete</span>
                        </DropdownMenuItem>
                      }
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </ThreadListItemPrimitive.Root>
          )}
        </ThreadListPrimitive.Items>
      </div>
    </ThreadListPrimitive.Root>
  );
}

function AssistantThreadSidebar({ collapsed }: { collapsed: boolean }) {
  return (
    <aside className="hidden min-w-0 flex-col overflow-hidden bg-muted/30 md:flex" data-testid="thread-sidebar">
      <Logo collapsed={collapsed} />
      <ThreadListContent collapsed={collapsed} />
    </aside>
  );
}

function MobileSidebar() {
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="ghost" size="icon" className="inline-flex md:hidden" />}>
        <Menu className="size-4.5" />
        <span className="sr-only">Toggle menu</span>
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(320px,86vw)] gap-0 p-0" showCloseButton={false}>
        <Logo />
        <ThreadListContent />
      </SheetContent>
    </Sheet>
  );
}

function ThreadTitle() {
  const title = useAuiState((state) => {
    const item = state.threads.threadItems.find((thread) => thread.id === state.threads.mainThreadId);
    return item?.title;
  });
  return <strong className="block max-w-[44vw] truncate text-[15px] font-semibold md:max-w-[280px]">{normalizeThreadTitle(title)}</strong>;
}

function ChatHeader({
  sidebarCollapsed,
  onToggleSidebar,
  status,
  statusText
}: {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  status: AgentStatus | null;
  statusText: string;
}) {
  const runtimeLabel = status?.piRuntime?.selectedModel ?? status?.piRuntime?.model ?? status?.piRuntime?.provider ?? "Base";
  return (
    <header className="flex h-13 items-center justify-between gap-2 px-2.5 md:px-4">
      <div className="flex min-w-0 items-center gap-2">
        <MobileSidebar />
        <TooltipIconButton
          tooltip={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
          className="hidden md:inline-flex"
          onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
        >
          <PanelLeft className="size-4.5" />
        </TooltipIconButton>
        <ThreadTitle />
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <span className="hidden whitespace-nowrap text-xs text-muted-foreground md:inline" data-testid="runtime-label">
          {runtimeLabel}
        </span>
        <span className="hidden whitespace-nowrap text-xs text-muted-foreground md:inline" data-testid="provider-status-button">
          {statusText}
        </span>
        <span className="hidden rounded-full border px-2.5 py-1 text-xs leading-none text-muted-foreground md:inline" data-testid="extension-count">
          {status?.extensions?.length ?? 0} ext
        </span>
        <MemoryReview />
        <ApprovalReview />
        <TooltipIconButton tooltip="Share" className="text-muted-foreground" disabled>
          <Share className="size-4.5" />
        </TooltipIconButton>
      </div>
    </header>
  );
}

function ApprovalReview() {
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

  async function decide(id: string, decision: "approved" | "denied") {
    setStatus(decision === "approved" ? "Approving" : "Denying");
    try {
      await fetchJson<{ approval: ApprovalRequest }>(`${apiBase}/approvals/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, reason: "Reviewed in renderer approval queue." })
      });
      await refreshApprovals();
      setStatus(decision === "approved" ? "Approved" : "Denied");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Approval update failed");
    }
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

function MemoryReview() {
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

  async function promote(memory: MemoryEntry) {
    setStatus("Promoting memory");
    try {
      await fetchJson<{ memory: MemoryEntry }>(`${apiBase}/memory/${memory.id}/promote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "Promoted from memory review UI." })
      });
      await refreshMemories();
      setStatus("Promoted");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Promote failed");
    }
  }

  async function updateMemory(memory: MemoryEntry, payload: MemoryUpdatePayload) {
    setStatus("Updating memory");
    try {
      await fetchJson<{ memory: MemoryEntry }>(`${apiBase}/memory/${memory.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      await refreshMemories();
      setStatus("Updated");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Update failed");
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
    setStatus("Merging memories");
    try {
      await fetchJson<{ memory: MemoryEntry }>(`${apiBase}/memory/merge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceIds: selectedMemories.map((memory) => memory.id),
          content: mergeDraft.content,
          kind: mergeDraft.kind,
          reason: "Merged from memory review UI.",
          confidence: 0.8,
          sensitivity: mergeDraft.sensitivity,
          occurredAt: mergeDraft.occurredAt,
          tags: mergeDraft.tags
        })
      });
      setSelectedIds(new Set());
      setMergeDraft(null);
      await refreshMemories();
      setStatus("Merged");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Merge failed");
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

function useAgentAssistantRuntime() {
  const adapter = useMemo<ChatModelAdapter>(
    () => ({
      async *run({ messages, abortSignal, unstable_threadId }) {
        const content = latestUserText(messages);
        if (!content) {
          yield { content: [{ type: "text", text: "请输入你的问题。" }] };
          return;
        }

        const apiSessionId = unstable_threadId ? apiSessionIdsByThreadId.get(unstable_threadId) ?? unstable_threadId : undefined;
        const voiceCacheKey = `${apiSessionId ?? "new"}:${content}`;
        const voiceResponse = pendingVoiceResponses.get(voiceCacheKey);
        if (voiceResponse) {
          pendingVoiceResponses.delete(voiceCacheKey);
          const degraded = voiceResponse.degradedReason ? `\n\n降级原因：${voiceResponse.degradedReason}` : "";
          yield* streamAssistantText(`${voiceResponse.assistantText}${degraded}`, abortSignal);
          return;
        }

        const res = await fetch(`${apiBase}/agent/messages/stream`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content, sessionId: apiSessionId }),
          signal: abortSignal
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `Agent API returned HTTP ${res.status}`);
        }

        let visibleText = "";
        let sessionId: string | undefined;
        for await (const event of readSseEvents(res, abortSignal)) {
          if (event.type === "metadata") {
            sessionId = event.sessionId;
            await updateSessionTitle(event.sessionId, makeThreadTitle(content));
            continue;
          }
          if (event.type === "text_delta") {
            visibleText += event.text;
            yield { content: [{ type: "text", text: visibleText }] };
            continue;
          }
          if (event.type === "error") {
            throw new Error(event.message);
          }
          const degraded = event.result.degradedReason ? `\n\n降级原因：${event.result.degradedReason}` : "";
          const finalText = `${event.result.content}${degraded}`;
          if (finalText !== visibleText) yield { content: [{ type: "text", text: finalText }] };
          if (!sessionId) await updateSessionTitle(event.sessionId, makeThreadTitle(content));
        }
      }
    }),
    []
  );
  return useRemoteThreadListRuntime({
    adapter: assistantThreadListAdapter,
    runtimeHook: () => useLocalRuntime(adapter)
  });
}

function isNewChatView(state: AssistantState) {
  return state.thread.messages.length === 0 && (!state.thread.isLoading || state.threads.isLoading);
}

function AssistantThread() {
  const isEmpty = useAuiState(isNewChatView);
  return (
    <ThreadPrimitive.Root
      className="aui-root flex min-h-0 flex-1 flex-col bg-background"
      style={
        {
          "--thread-max-width": "44rem",
          "--composer-bg": "color-mix(in oklab, var(--color-muted) 34%, var(--color-background))",
          "--composer-radius": "1.5rem",
          "--composer-padding": "8px"
        } as React.CSSProperties
      }
    >
      <ThreadPrimitive.Viewport className="relative flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto scroll-smooth px-3 pt-3 md:px-4" turnAnchor="top">
        <div className={cn("mx-auto flex w-full max-w-(--thread-max-width) flex-1 flex-col gap-6 pt-3 pb-6", isEmpty && "justify-center")}>
          <AssistantEmptyState />
          <ThreadPrimitive.Messages>{() => <AssistantThreadMessage />}</ThreadPrimitive.Messages>
        </div>
        <ThreadPrimitive.ViewportFooter
          className={cn(
            "mx-auto flex w-full max-w-(--thread-max-width) flex-col gap-3 bg-background pb-5",
            !isEmpty && "sticky bottom-0 mt-auto rounded-t-(--composer-radius)"
          )}
        >
          <ThreadPrimitive.ScrollToBottom className="absolute -top-11 self-center rounded-full border bg-background p-2 text-foreground shadow-sm disabled:invisible" title="Scroll to bottom">
            <ArrowDown className="size-4" />
          </ThreadPrimitive.ScrollToBottom>
          <AssistantComposer />
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}

function AssistantEmptyState() {
  const isEmpty = useAuiState(isNewChatView);
  if (!isEmpty) return null;
  return (
    <div className="mb-2 text-center" data-testid="assistant-empty-state">
      <h1 className="animate-in fade-in slide-in-from-bottom-1 text-2xl font-semibold duration-200 md:text-[30px]">
        How can I help you today?
      </h1>
    </div>
  );
}

function AssistantThreadMessage() {
  const role = useAuiState((state) => state.message.role);
  const isRunning = useAuiState((state) => state.message.status?.type === "running");
  return (
    <MessagePrimitive.Root
      data-role={role}
      className={cn(
        "animate-in fade-in slide-in-from-bottom-1 duration-150",
        role === "user"
          ? "grid grid-cols-[minmax(72px,1fr)_auto] px-2 [&>*]:col-start-2"
          : "px-2"
      )}
    >
      <div
        className={cn(
          "max-w-[min(100%,740px)] [overflow-wrap:anywhere] text-[15px] leading-relaxed",
          role === "user"
            ? "rounded-xl bg-muted px-4 py-2 text-foreground"
            : "text-foreground"
        )}
      >
        <AssistantMessageParts />
      </div>
      {role === "assistant" && isRunning && (
        <span className="mt-2 inline-flex items-center gap-2.5 text-xs text-muted-foreground">
          <span className="thinkingGlyph grid size-4 grid-cols-4 gap-0.5" aria-hidden="true">
            {Array.from({ length: 16 }).map((_, index) => (
              <span key={index} className="size-0.5 rounded-full bg-current opacity-40" />
            ))}
          </span>
          <span>Connecting</span>
        </span>
      )}
      <MessageActions role={role} />
    </MessagePrimitive.Root>
  );
}

function AssistantMessageParts() {
  return (
    <MessagePrimitive.Parts>
      {({ part }) => {
        if (part.type === "text" || part.type === "reasoning") return <p>{part.text}</p>;
        if (part.type === "tool-call") return <p>{`Tool: ${part.toolName}`}</p>;
        if (part.type === "source") return <p>{part.title ?? part.url ?? "Source"}</p>;
        return null;
      }}
    </MessagePrimitive.Parts>
  );
}

function MessageActions({ role }: { role: "user" | "assistant" | "system" | "tool" }) {
  if (role !== "assistant") return null;
  return (
    <div className="mt-1.5 flex min-h-7 items-center gap-1 text-muted-foreground" data-testid="assistant-message-actions">
      <BranchPickerPrimitive.Root hideWhenSingleBranch className="inline-flex items-center gap-1 text-xs">
        <BranchPickerPrimitive.Previous className="inline-flex size-6 items-center justify-center rounded-md hover:bg-muted hover:text-foreground">‹</BranchPickerPrimitive.Previous>
        <span>
          <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
        </span>
        <BranchPickerPrimitive.Next className="inline-flex size-6 items-center justify-center rounded-md hover:bg-muted hover:text-foreground">›</BranchPickerPrimitive.Next>
      </BranchPickerPrimitive.Root>
      <ActionBarPrimitive.Root hideWhenRunning className="inline-flex items-center gap-1">
        <ActionBarPrimitive.Copy className="group/copy inline-flex size-6 items-center justify-center rounded-md hover:bg-muted hover:text-foreground data-[copied=true]:text-emerald-700" title="Copy" copiedDuration={1600} data-testid="assistant-copy-action">
          <Copy className="copyDefault size-3.5 group-data-[copied=true]/copy:hidden" />
          <Check className="copyDone hidden size-3.5 group-data-[copied=true]/copy:inline-flex" />
        </ActionBarPrimitive.Copy>
        <ActionBarPrimitive.Reload className="inline-flex size-6 items-center justify-center rounded-md hover:bg-muted hover:text-foreground" title="Refresh">
          <RefreshCw className="size-3.5" />
        </ActionBarPrimitive.Reload>
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex size-6 items-center justify-center rounded-md hover:bg-muted hover:text-foreground" title="More">
            <MoreHorizontal className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-40">
            <ActionBarPrimitive.ExportMarkdown asChild>
              <DropdownMenuItem>Export Markdown</DropdownMenuItem>
            </ActionBarPrimitive.ExportMarkdown>
          </DropdownMenuContent>
        </DropdownMenu>
      </ActionBarPrimitive.Root>
    </div>
  );
}

function AssistantComposer() {
  const isRunning = useAuiState((state) => state.thread.isRunning);
  return (
    <ComposerPrimitive.Root className="relative flex w-full flex-col" data-testid="assistant-composer">
      <div className="flex w-full flex-col gap-2 rounded-(--composer-radius) border border-border/70 bg-(--composer-bg) p-(--composer-padding) shadow-[0_4px_16px_-8px_rgb(0_0_0/0.1),0_1px_2px_rgb(0_0_0/0.04)] transition-[border-color,box-shadow] focus-within:border-border focus-within:shadow-[0_6px_24px_-8px_rgb(0_0_0/0.14),0_1px_2px_rgb(0_0_0/0.05)]">
        <ComposerPrimitive.Input
          placeholder="Ask anything"
          rows={2}
          className="max-h-36 min-h-10 w-full resize-none bg-transparent px-2.5 py-1 text-base leading-relaxed outline-none placeholder:text-muted-foreground"
        />
        <div className="flex min-h-8 items-center gap-1.5">
          <Button variant="ghost" size="icon" className="size-8 rounded-full text-foreground" title="Add attachment" disabled>
            <Plus className="size-5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-8 min-w-0 items-center justify-center gap-2 rounded-full px-2.5 text-sm font-semibold text-foreground hover:bg-muted data-popup-open:bg-muted">
              Base Agent
              <ChevronDown className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={8} className="min-w-48 p-1.5">
              <DropdownMenuItem className="justify-between rounded-lg px-2.5 py-2 font-medium">
                <span>Base Agent</span>
                <Check className="size-4" />
              </DropdownMenuItem>
              <DropdownMenuItem className="justify-between rounded-lg px-2.5 py-2 text-muted-foreground" data-disabled>
                <span>Pi Runtime</span>
                <span className="text-xs">planned</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="flex-1" />
          <VoiceRecorderButton />
          {isRunning ? (
            <ComposerPrimitive.Cancel className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50" title="Stop generating">
              <Square className="size-4 fill-current" />
            </ComposerPrimitive.Cancel>
          ) : (
            <ComposerPrimitive.Send className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-50" title="Send message">
              <ArrowUp className="size-4.5" />
            </ComposerPrimitive.Send>
          )}
        </div>
      </div>
    </ComposerPrimitive.Root>
  );
}

function VoiceRecorderButton() {
  const aui = useAui();
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const threadId = useAuiState((state) => state.threadListItem.remoteId ?? state.threads.mainThreadId);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "recording" | "sending" | "playing" | "degraded">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [continuousCall, setContinuousCall] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const continuousCallRef = useRef(false);
  const silenceFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const lastVoiceAtRef = useRef(0);
  const recordingStartedAtRef = useRef(0);
  const heardVoiceRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function loadVoiceStatus() {
      try {
        const status = await fetchJson<VoiceStatus>(`${apiBase}/voice/status`);
        if (cancelled) return;
        setVoiceStatus(status);
        if (!status.ready) {
          setState("degraded");
          setMessage(status.degradedReason ?? "Voice providers unavailable");
        }
      } catch (error) {
        if (cancelled) return;
        setState("degraded");
        setMessage(error instanceof Error ? error.message : "Voice status unavailable");
      }
    }
    void loadVoiceStatus();
    return () => {
      cancelled = true;
      stopSilenceMonitor();
      stopStream(streamRef.current);
      audioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    if (open) void refreshVoiceDiagnostics();
  }, [open, threadId]);

  const voiceUnavailableReason = voiceStatus ? voiceNotReadyReason(voiceStatus) : "正在检查语音服务";
  const disabled = isRunning || state === "sending" || state === "playing" || !voiceStatus?.ready;
  const tooltip = state === "recording"
    ? "Stop recording"
    : isRunning
      ? "助手正在回复，稍后再试"
      : voiceStatus?.ready
      ? "Open voice call"
      : voiceUnavailableReason;
  const callStatus = voiceCallStatusLabel(state, voiceStatus, message);

  function openVoiceCall() {
    if (isRunning) {
      setMessage("助手正在回复，稍后再试");
      return;
    }
    if (!voiceStatus?.ready) {
      setMessage(voiceUnavailableReason);
      void refreshVoiceDiagnostics();
      return;
    }
    setOpen(true);
  }

  async function refreshVoiceDiagnostics() {
    try {
      const status = await fetchJson<VoiceStatus>(`${apiBase}/voice/status`);
      setVoiceStatus(status);
      if (!status.ready) {
        setState("degraded");
        setMessage(status.degradedReason ?? "Voice providers unavailable");
      }
    } catch (error) {
      setState("degraded");
      setMessage(error instanceof Error ? error.message : "Voice diagnostics unavailable");
    }
  }

  async function startContinuousCall() {
    if (disabled) return;
    continuousCallRef.current = true;
    setContinuousCall(true);
    setMessage(null);
    await startRecording({ autoStopOnSilence: true });
  }

  function stopContinuousCall() {
    continuousCallRef.current = false;
    setContinuousCall(false);
    stopSilenceMonitor();
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    stopStream(streamRef.current);
    streamRef.current = null;
    chunksRef.current = [];
    audioRef.current?.pause();
    if (state !== "degraded") setState("idle");
  }

  async function startRecording(options: { autoStopOnSilence?: boolean } = {}) {
    if (disabled && state !== "recording") return;
    setMessage(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone capture is not available in this browser.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = pickAudioMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stopSilenceMonitor();
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        stopStream(streamRef.current);
        streamRef.current = null;
        void sendVoiceBlob(blob);
      };
      recorder.start(250);
      if (options.autoStopOnSilence) startSilenceMonitor(stream, recorder);
      setState("recording");
    } catch (error) {
      setState("degraded");
      setMessage(error instanceof Error ? error.message : "Microphone capture failed");
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    setState("sending");
    stopSilenceMonitor();
    recorder.stop();
  }

  async function sendVoiceBlob(blob: Blob) {
    setState("sending");
    try {
      if (blob.size < 900) {
        if (continuousCallRef.current) {
          setMessage("Listening");
          await startRecording({ autoStopOnSilence: true });
          return;
        }
        throw new Error("Voice recording was too short.");
      }
      const audioBase64 = await blobToBase64(blob);
      const response = await fetchJson<VoiceChatResponse>(`${apiBase}/voice/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          audioBase64,
          mimeType: blob.type || "audio/webm",
          sessionId: threadId
        })
      });
      if (!response.transcript) throw new Error(response.degradedReason ?? "Voice transcript was empty.");
      logVoiceTiming(response.timing);
      pendingVoiceResponses.set(`${threadId ?? "new"}:${response.transcript}`, response);
      aui.thread().append({
        content: [{ type: "text", text: response.transcript }],
        runConfig: aui.composer().getState().runConfig
      });
      if (response.audioBase64 && response.mimeType) await playAudio(response.audioBase64, response.mimeType);
      setMessage(response.degradedReason ?? null);
      if (response.degradedReason) {
        setState("degraded");
        continuousCallRef.current = false;
        setContinuousCall(false);
      } else if (continuousCallRef.current && open) {
        await startRecording({ autoStopOnSilence: true });
      } else {
        setState("idle");
      }
      void refreshVoiceDiagnostics();
    } catch (error) {
      setState("degraded");
      continuousCallRef.current = false;
      setContinuousCall(false);
      setMessage(error instanceof Error ? error.message : "Voice chat failed");
      void refreshVoiceDiagnostics();
    }
  }

  function closeCall() {
    continuousCallRef.current = false;
    setContinuousCall(false);
    stopSilenceMonitor();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    stopStream(streamRef.current);
    streamRef.current = null;
    chunksRef.current = [];
    audioRef.current?.pause();
    setOpen(false);
    if (state !== "degraded") setState("idle");
  }

  async function playAudio(audioBase64: string, mimeType: string) {
    if (!mimeType.startsWith("audio/")) return;
    setState("playing");
    const audio = new Audio(`data:${mimeType};base64,${audioBase64}`);
    audioRef.current = audio;
    await new Promise<void>((resolve) => {
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.onpause = () => resolve();
      void audio.play().catch(() => resolve());
    });
  }

  function startSilenceMonitor(stream: MediaStream, recorder: MediaRecorder) {
    stopSilenceMonitor();
    const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const audioContext = new AudioContextCtor();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    audioContextRef.current = audioContext;
    audioSourceRef.current = source;
    const samples = new Uint8Array(analyser.fftSize);
    recordingStartedAtRef.current = Date.now();
    lastVoiceAtRef.current = Date.now();
    heardVoiceRef.current = false;

    const tick = () => {
      if (recorder.state !== "recording") return;
      analyser.getByteTimeDomainData(samples);
      const level = rootMeanSquare(samples);
      const now = Date.now();
      if (level > 0.018) {
        heardVoiceRef.current = true;
        lastVoiceAtRef.current = now;
      }
      const elapsed = now - recordingStartedAtRef.current;
      const silenceMs = now - lastVoiceAtRef.current;
      if ((heardVoiceRef.current && elapsed > 900 && silenceMs > 1250) || elapsed > 20_000) {
        stopRecording();
        return;
      }
      silenceFrameRef.current = window.requestAnimationFrame(tick);
    };
    silenceFrameRef.current = window.requestAnimationFrame(tick);
  }

  function stopSilenceMonitor() {
    if (silenceFrameRef.current !== null) window.cancelAnimationFrame(silenceFrameRef.current);
    silenceFrameRef.current = null;
    audioSourceRef.current?.disconnect();
    audioSourceRef.current = null;
    void audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className={cn("size-8 rounded-full text-foreground voiceButton", state)}
              title={tooltip}
              aria-disabled={isRunning || !voiceStatus?.ready}
              data-testid="voice-slot"
              data-voice-state={state}
              onClick={openVoiceCall}
            />
          }
        >
          {state === "sending" ? <Upload size={20} /> : <Mic size={21} />}
        </TooltipTrigger>
        <TooltipContent>{message ?? tooltip}</TooltipContent>
      </Tooltip>
      {open && (
        <div className="voiceCallBackdrop" data-testid="voice-call-overlay" role="presentation">
          <section className="voiceCallPanel" role="dialog" aria-modal="true" aria-label="Voice call" data-voice-state={state}>
            <header className="voiceCallHeader">
              <Button variant="ghost" size="icon" className="voiceCallClose" onClick={closeCall} aria-label="Close voice call">
                <X size={18} />
              </Button>
            </header>
            <div className="voiceCallBody">
              <button
                type="button"
                className={cn("voiceAvatar", state === "recording" && "listening", state === "playing" && "speaking")}
                disabled={disabled && state !== "recording" && !continuousCall}
                onClick={continuousCall || state === "recording" ? stopContinuousCall : () => void startContinuousCall()}
                aria-label={continuousCall || state === "recording" ? "Stop Call" : "Start Call"}
              >
                <Bot size={42} />
                <span aria-hidden="true" />
              </button>
              <p className="voiceCallStatus">{callStatus}</p>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function voiceCallStatusLabel(state: "idle" | "recording" | "sending" | "playing" | "degraded", status: VoiceStatus | null, message: string | null) {
  if (!status?.ready) return message ?? status?.degradedReason ?? "语音不可用";
  if (state === "recording") return "正在聆听";
  if (state === "sending") return "正在思考";
  if (state === "playing") return "正在回答";
  if (state === "degraded") return message ?? "语音异常";
  return "准备就绪";
}

function voiceNotReadyReason(status: VoiceStatus) {
  const reasons = [
    providerNotReadyReason("STT", status.stt),
    providerNotReadyReason("TTS", status.tts)
  ].filter(Boolean);
  return reasons.length > 0 ? reasons.join("；") : status.degradedReason ?? "语音服务未就绪";
}

function providerNotReadyReason(label: "STT" | "TTS", provider: ProviderStatus & { name: string }) {
  if (!provider.configured) return `${label} 未配置：${provider.degradedReason ?? provider.name}`;
  if (!provider.reachable) return `${label} 未就绪：${provider.degradedReason ?? provider.name}`;
  return undefined;
}

function logVoiceTiming(timing: VoiceChatResponse["timing"]) {
  if (!timing) return;
  console.info("[voice.chat timing]", {
    stt: formatMs(timing.sttMs),
    agent: formatMs(timing.agentMs),
    tts: formatMs(timing.ttsMs),
    total: formatMs(timing.totalMs)
  });
}

function formatMs(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
}

function pickAudioMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function rootMeanSquare(samples: Uint8Array) {
  let sum = 0;
  for (const sample of samples) {
    const centered = (sample - 128) / 128;
    sum += centered * centered;
  }
  return Math.sqrt(sum / samples.length);
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",")[1] ?? "" : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read audio blob."));
    reader.readAsDataURL(blob);
  });
}

const rootRoute = createRootRoute({
  component: App
});

const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute: () => rootRoute, path: "/" }),
  createRoute({ getParentRoute: () => rootRoute, path: "chat" })
]);

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
