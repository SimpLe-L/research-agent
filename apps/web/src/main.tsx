import React, { useEffect, useMemo, useState } from "react";
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
  PenLine,
  Plus,
  RefreshCw,
  Share,
  Square,
  Upload,
  CloudSun
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

type ThreadRecord = {
  id: string;
  title: string;
  createdAt?: string;
  updatedAt: string;
  messages?: Array<{ id?: string; role: string; content: string; createdAt: string }>;
};

const suggestionGroups = [
  {
    label: "Weather",
    icon: CloudSun,
    options: [
      { label: "in Shanghai", prompt: "What's the weather in Shanghai today?" },
      { label: "in San Francisco", prompt: "What's the weather in San Francisco today?" },
      { label: "weekend forecast", prompt: "Check the weekend forecast and summarize what matters." }
    ]
  },
  {
    label: "Code",
    icon: Code2,
    options: [
      { label: "explain this error", prompt: "Help me explain and debug this error." },
      { label: "review a component", prompt: "Review this React component and point out practical improvements." },
      { label: "write TypeScript", prompt: "Write a concise TypeScript implementation for this task." }
    ]
  },
  {
    label: "Write",
    icon: PenLine,
    options: [
      { label: "a PR description", prompt: "Write a clear pull request description for this change." },
      { label: "release notes", prompt: "Draft release notes for a small product update." },
      { label: "polish wording", prompt: "Polish this text while preserving the original meaning." }
    ]
  },
  {
    label: "Analyze",
    icon: BarChart3,
    options: [
      { label: "tradeoffs", prompt: "Analyze the tradeoffs and give a recommended path." },
      { label: "compare options", prompt: "Compare these options in a compact table." },
      { label: "risk review", prompt: "Review the risks and missing information." }
    ]
  },
  {
    label: "Brainstorm",
    icon: Lightbulb,
    options: [
      { label: "project ideas", prompt: "Brainstorm practical agent project ideas I could build." },
      { label: "feature names", prompt: "Brainstorm concise names for this feature." },
      { label: "next steps", prompt: "Brainstorm the next implementation steps." }
    ]
  }
];

function latestUserText(messages: readonly ThreadMessage[]): string {
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  const textParts = lastUser?.content.filter((part) => part.type === "text").map((part) => part.text) ?? [];
  return textParts.join("\n").trim();
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
  return {
    status: "regular" as const,
    remoteId: thread.id,
    externalId: thread.id,
    title: thread.title,
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

function ThreadHistoryProvider({ children }: { children?: React.ReactNode }) {
  const aui = useAui();
  const history = useMemo<ThreadHistoryAdapter>(
    () => ({
      async load() {
        const { remoteId } = aui.threadListItem().getState();
        if (!remoteId) return { messages: [] };
        const session = await fetchJson<ThreadRecord>(`${apiBase}/chat/sessions/${remoteId}`);
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
  async initialize() {
    const thread = await fetchJson<ThreadRecord>(`${apiBase}/chat/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "New Chat" })
    });
    return { remoteId: thread.id, externalId: thread.id };
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
  async delete() {
    return;
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
        <main className="baseShell" data-testid="app-shell">
          <section
            className={cn("baseFrame", sidebarCollapsed && "sidebarCollapsed")}
            data-testid="view-chat"
          >
            <div className="runtimeAnchors" data-testid="model-tabs" aria-hidden="true" />
            <AssistantThreadSidebar collapsed={sidebarCollapsed} />
            <section className="chatSurface" data-testid="agent-thread-panel">
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
    <div className={cn("sidebarBrand", collapsed && "collapsed")}>
      <Bot size={22} />
      <strong>assistant-ui</strong>
    </div>
  );
}

function ThreadListContent({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <ThreadListPrimitive.Root className={cn("threadListRoot", collapsed && "collapsed")}>
      <Tooltip>
        <TooltipTrigger
          render={
            <ThreadListPrimitive.New
              className={cn("newThreadButton", collapsed && "collapsed")}
              data-testid="new-thread-button"
            />
          }
        >
          <Plus size={20} />
          <span>New Thread</span>
        </TooltipTrigger>
        {collapsed && <TooltipContent side="right">New Thread</TooltipContent>}
      </Tooltip>
      {!collapsed && <div className="threadGroupLabel">Today</div>}
      <div className={cn("threadList", collapsed && "collapsed")} data-testid="thread-list">
        <ThreadListPrimitive.Items>
          {() => (
            <ThreadListItemPrimitive.Root className="threadItemRoot">
              <ThreadListItemPrimitive.Trigger className="threadItem">
                <ThreadListItemPrimitive.Title />
              </ThreadListItemPrimitive.Trigger>
            </ThreadListItemPrimitive.Root>
          )}
        </ThreadListPrimitive.Items>
      </div>
    </ThreadListPrimitive.Root>
  );
}

function AssistantThreadSidebar({ collapsed }: { collapsed: boolean }) {
  return (
    <aside className={cn("threadSidebar", collapsed && "collapsed")} data-testid="thread-sidebar">
      <Logo collapsed={collapsed} />
      <ThreadListContent collapsed={collapsed} />
    </aside>
  );
}

function MobileSidebar() {
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="ghost" size="icon" className="mobileMenuButton" />}>
        <Menu size={18} />
        <span className="srOnly">Toggle menu</span>
      </SheetTrigger>
      <SheetContent side="left" className="mobileSheet" showCloseButton={false}>
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
  return <strong className="threadTitleText">{title ?? "New Chat"}</strong>;
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
    <header className="chatHeader">
      <div className="chatTitle">
        <MobileSidebar />
        <TooltipIconButton
          tooltip={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
          className="sidebarToggle"
          onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
        >
          <PanelLeft size={18} />
        </TooltipIconButton>
        <ThreadTitle />
      </div>
      <div className="headerActions">
        <span className="smallRuntime" data-testid="runtime-label">
          {runtimeLabel}
        </span>
        <span className="smallRuntime" data-testid="provider-status-button">
          {statusText}
        </span>
        <span className="extensionCount" data-testid="extension-count">
          {status?.extensions?.length ?? 0} ext
        </span>
        <TooltipIconButton tooltip="Share" className="iconButton" disabled>
          <Share size={18} />
        </TooltipIconButton>
      </div>
    </header>
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

        const res = await fetch(`${apiBase}/agent/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content, sessionId: unstable_threadId }),
          signal: abortSignal
        });
        const data = (await res.json()) as AgentMessageResponse & { message?: string };
        if (!res.ok) throw new Error(data.message ?? `Agent API returned HTTP ${res.status}`);
        await updateSessionTitle(data.sessionId, makeThreadTitle(content));

        const degraded = data.degradedReason ? `\n\n降级原因：${data.degradedReason}` : "";
        const tools = data.toolCalls?.length ? `\n\n工具调用：${data.toolCalls.length}` : "";
        yield { content: [{ type: "text", text: `${data.content}${degraded}${tools}` }] };
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
    <ThreadPrimitive.Root className="assistantUiRoot">
      <ThreadPrimitive.Viewport className={cn("assistantViewport", isEmpty && "empty")} turnAnchor="top">
        <div className="assistantMessageStack">
          <AssistantEmptyState />
          <ThreadPrimitive.Messages>{() => <AssistantThreadMessage />}</ThreadPrimitive.Messages>
        </div>
        <ThreadPrimitive.ViewportFooter className={cn("threadViewportFooter", !isEmpty && "sticky")}>
          <ThreadPrimitive.ScrollToBottom className="scrollToBottomButton" title="Scroll to bottom">
            <ArrowDown size={16} />
          </ThreadPrimitive.ScrollToBottom>
          <AssistantComposer />
          <PromptChips />
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}

function AssistantEmptyState() {
  const isEmpty = useAuiState(isNewChatView);
  if (!isEmpty) return null;
  return (
    <div className="assistantWelcome" data-testid="assistant-empty-state">
      <h1>How can I help you today?</h1>
    </div>
  );
}

function AssistantThreadMessage() {
  const role = useAuiState((state) => state.message.role);
  const isRunning = useAuiState((state) => state.message.status?.type === "running");
  return (
    <MessagePrimitive.Root className={role === "user" ? "messageBubble user" : "messageBubble assistant"}>
      <AssistantMessageParts />
      {role === "assistant" && isRunning && <span className="assistantThinking">Connecting</span>}
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
  if (role !== "user" && role !== "assistant") return null;
  return (
    <div className="messageActions">
      <BranchPickerPrimitive.Root hideWhenSingleBranch className="branchPicker">
        <BranchPickerPrimitive.Previous className="actionIcon">‹</BranchPickerPrimitive.Previous>
        <span>
          <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
        </span>
        <BranchPickerPrimitive.Next className="actionIcon">›</BranchPickerPrimitive.Next>
      </BranchPickerPrimitive.Root>
      <ActionBarPrimitive.Root hideWhenRunning autohide="not-last" className="actionBar">
        {role === "assistant" ? (
          <>
            <ActionBarPrimitive.Copy className="actionIcon" title="Copy">
              <Copy size={14} />
            </ActionBarPrimitive.Copy>
            <ActionBarPrimitive.Reload className="actionIcon" title="Refresh">
              <RefreshCw size={14} />
            </ActionBarPrimitive.Reload>
            <DropdownMenu>
              <DropdownMenuTrigger className="actionIcon" title="More">
                <MoreHorizontal size={14} />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-40">
                <ActionBarPrimitive.ExportMarkdown asChild>
                  <DropdownMenuItem>Export Markdown</DropdownMenuItem>
                </ActionBarPrimitive.ExportMarkdown>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          <ActionBarPrimitive.Edit className="actionIcon" title="Edit">
            <PenLine size={14} />
          </ActionBarPrimitive.Edit>
        )}
      </ActionBarPrimitive.Root>
    </div>
  );
}

function PromptChips() {
  const aui = useAui();
  const [expandedLabel, setExpandedLabel] = useState<string | null>(null);
  const isEmpty = useAuiState(isNewChatView);
  const isRunning = useAuiState((state) => state.thread.isRunning);
  if (!isEmpty) return <div className="promptChips hidden" data-testid="prompt-chips" />;
  const expandedGroup = suggestionGroups.find((group) => group.label === expandedLabel);
  const sendPrompt = (prompt: string) => {
    if (isRunning) return;
    aui.thread().append({
      content: [{ type: "text", text: prompt }],
      runConfig: aui.composer().getState().runConfig
    });
  };
  return (
    <div className="promptChips" data-testid="prompt-chips">
      <div className="promptChipRow">
        {suggestionGroups.map((group) => {
          const Icon = group.icon;
          return (
            <Button
              key={group.label}
              variant="outline"
              className={cn("promptChip", expandedLabel === group.label && "active")}
              onClick={() => setExpandedLabel((current) => (current === group.label ? null : group.label))}
            >
              <Icon size={18} />
              {group.label}
            </Button>
          );
        })}
      </div>
      {expandedGroup && (
        <div className="promptOptionRow">
          {expandedGroup.options.map((option) => (
            <Button
              key={option.label}
              variant="ghost"
              className="promptOption"
              onClick={() => sendPrompt(option.prompt)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

function AssistantComposer() {
  const isRunning = useAuiState((state) => state.thread.isRunning);
  return (
    <ComposerPrimitive.Root className="assistantComposer" data-testid="assistant-composer">
      <div className="composerInputShell">
        <ComposerPrimitive.Input placeholder="Send a message... (@ to mention, / for commands)" rows={2} />
        <div className="composerToolbar">
          <Button variant="ghost" size="icon" className="composerIcon" title="Add attachment" disabled>
            <Plus size={21} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger className="modelSelector">
              Base Agent
              <ChevronDown size={16} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={8} className="modelMenuContent">
              <DropdownMenuItem className="modelMenuItem selected">
                <span>Base Agent</span>
                <Check size={15} />
              </DropdownMenuItem>
              <DropdownMenuItem className="modelMenuItem disabled" data-disabled>
                <span>Pi Runtime</span>
                <span className="modelMenuMeta">planned</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="composerSpacer" />
          <Button variant="ghost" size="icon" className="composerIcon" title="Voice input will be added in the speech phase" disabled data-testid="voice-slot">
            <Mic size={21} />
          </Button>
          {isRunning ? (
            <ComposerPrimitive.Cancel className="sendButton" title="Stop generating">
              <Square size={18} />
            </ComposerPrimitive.Cancel>
          ) : (
            <ComposerPrimitive.Send className="sendButton" title="Send message">
              <ArrowUp size={19} />
            </ComposerPrimitive.Send>
          )}
        </div>
      </div>
    </ComposerPrimitive.Root>
  );
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
