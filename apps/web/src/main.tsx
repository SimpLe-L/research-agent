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
  Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
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
