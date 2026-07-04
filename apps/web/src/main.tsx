import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Link,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useNavigate,
  useRouterState
} from "@tanstack/react-router";
import {
  Activity,
  Bot,
  BookOpen,
  FileText,
  LineChart,
  MessageSquare,
  Puzzle,
  Send,
  Settings,
  ShieldCheck,
  Star
} from "lucide-react";
import { KnowledgeSearch, SourceDetail, type SourceDocument, type SourceDocumentDetail } from "./components/knowledge";
import { MarketView, type MarketSnapshot } from "./components/market";
import { readinessEnvTemplate, type ReadinessItem, type RetentionPreview } from "./components/readiness";
import { QueueStatusPanel, TaskList, TaskProgress, type QueueStatus, type Task, type TaskEvent } from "./components/research";
import { ReportPanel, type Report, type ReportAnnotation, type ReportSource } from "./components/report";
import { ReportsView } from "./components/reports";
import { SettingsView, type ProviderStatus } from "./components/settings";
import { WatchlistView, type WatchlistEdit, type WatchlistItem } from "./components/watchlist";
import "./styles.css";

type ViewKey = "chat" | "research" | "market" | "knowledge" | "watchlist" | "reports" | "settings";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type ExtensionCapability = {
  id: string;
  label: string;
  description: string;
  permissions: string[];
  inputSchema?: string;
  outputSchema?: string;
};

type ExtensionManifest = {
  id: string;
  name: string;
  description: string;
  kind: "core" | "skill" | "connector" | "workflow";
  phase: string;
  status: "active" | "disabled" | "planned" | "degraded";
  entrypoint?: string;
  capabilities: ExtensionCapability[];
  degradedReason?: string;
};

type AgentShellStatus = {
  mode: "local_personal_agent";
  piRuntime: {
    provider?: string;
    configured?: boolean;
    reachable?: boolean;
    sdkLoaded?: boolean;
    selectedModelAvailable?: boolean;
    degradedReason?: string;
  };
  safetyModel: {
    defaultToolPolicy: "read_only";
    disabledToolClasses: string[];
    highRiskActions: string[];
  };
  extensions: ExtensionManifest[];
};

type ExtensionInvokeResponse<T> = {
  extensionId: string;
  capabilityId: string;
  status: "accepted" | "queued" | "completed" | "degraded";
  result?: T;
  degradedReason?: string;
};

const apiBase = import.meta.env.VITE_API_BASE ?? "http://localhost:4317/api";

const navItems: Array<{ key: ViewKey; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { key: "chat", label: "Chat", icon: MessageSquare },
  { key: "research", label: "Research", icon: Activity },
  { key: "market", label: "Market", icon: LineChart },
  { key: "knowledge", label: "Knowledge", icon: BookOpen },
  { key: "watchlist", label: "Watchlist", icon: Star },
  { key: "reports", label: "Reports", icon: FileText },
  { key: "settings", label: "Settings", icon: Settings }
];

const viewRoutes = {
  chat: "/chat",
  research: "/research",
  market: "/market",
  knowledge: "/knowledge",
  watchlist: "/watchlist",
  reports: "/reports",
  settings: "/settings"
} as const satisfies Record<ViewKey, string>;

const viewTitle: Record<ViewKey, { title: string; subtitle: string }> = {
  chat: { title: "Agent", subtitle: "Local personal agent shell, Pi runtime, and extension registry" },
  research: { title: "Research Skill", subtitle: "Legacy task graph progress, retry, cancellation, and generated report" },
  market: { title: "Market", subtitle: "Major-asset regime snapshot with persisted analysis history" },
  knowledge: { title: "Knowledge", subtitle: "Report search, source audit trail, and degraded evidence filters" },
  watchlist: { title: "Watchlist", subtitle: "Tokens to revisit with notes, risk labels, and monitor rules" },
  reports: { title: "Reports", subtitle: "Generated Markdown reports and linked source evidence" },
  settings: { title: "Settings", subtitle: "Provider readiness, manual setup, and degraded runtime reasons" }
};

function viewFromPathname(pathname: string): ViewKey {
  const segment = pathname.split("/").filter(Boolean)[0];
  return navItems.some((item) => item.key === segment) ? (segment as ViewKey) : "chat";
}

function AgentStatusPanel({
  status,
  providerStatus,
  messageStatus,
  onRefresh
}: {
  status: AgentShellStatus | null;
  providerStatus: string;
  messageStatus: string;
  onRefresh: () => void;
}) {
  const pi = status?.piRuntime;
  return (
    <section className="panel agentStatusPanel" data-testid="agent-shell-panel">
      <div className="panelHeader">
        <h2>Local Agent Shell</h2>
        <button className="smallAction" onClick={onRefresh}>Refresh</button>
      </div>
      <div className="agentIdentity">
        <Bot size={22} />
        <div>
          <strong>{status?.mode ?? "local_personal_agent"}</strong>
          <span>{pi?.provider ?? "pi"} runtime · {providerStatus}</span>
        </div>
      </div>
      <dl className="agentFacts">
        <div>
          <dt>Pi configured</dt>
          <dd>{pi?.configured ? "yes" : "no"}</dd>
        </div>
        <div>
          <dt>SDK loaded</dt>
          <dd>{pi?.sdkLoaded ? "yes" : "unknown"}</dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>{pi?.selectedModelAvailable ? "available" : "degraded"}</dd>
        </div>
        <div>
          <dt>Last turn</dt>
          <dd>{messageStatus || "idle"}</dd>
        </div>
      </dl>
      {pi?.degradedReason && <p className="notice">{pi.degradedReason}</p>}
      <div className="safetyBlock">
        <div>
          <ShieldCheck size={17} />
          <strong>Safety policy</strong>
        </div>
        <p>Default tools are read-only. Shell, write, edit, wallet, transaction, posting, and unrestricted browser classes stay disabled.</p>
      </div>
    </section>
  );
}

function ExtensionRegistryPanel({ extensions }: { extensions: ExtensionManifest[] }) {
  return (
    <section className="panel extensionPanel" data-testid="agent-extension-panel">
      <div className="panelHeader">
        <h2>Extensions</h2>
        <span className="statusPill manual">{extensions.length || 0}</span>
      </div>
      <div className="extensionList">
        {extensions.map((extension) => (
          <article key={extension.id} className={`extensionItem ${extension.status}`}>
            <div>
              <Puzzle size={16} />
              <strong>{extension.name}</strong>
              <span className={`statusPill ${extension.status === "active" ? "ready" : "degraded"}`}>
                {extension.status}
              </span>
            </div>
            <p>{extension.description}</p>
            <small>{extension.phase}{extension.entrypoint ? ` · ${extension.entrypoint}` : ""}</small>
          </article>
        ))}
        {!extensions.length && <p className="empty">Extension registry unavailable.</p>}
      </div>
    </section>
  );
}

function App() {
  const navigate = useNavigate();
  const activeView = useRouterState({
    select: (state) => viewFromPathname(state.location.pathname)
  });
  const [agentInput, setAgentInput] = useState("现在这个本地 agent 架子有哪些 extensions？");
  const [agentStatus, setAgentStatus] = useState<AgentShellStatus | null>(null);
  const [agentMessageStatus, setAgentMessageStatus] = useState("");
  const [input, setInput] = useState("0x0000000000000000000000000000000000000000");
  const [watchNote, setWatchNote] = useState("");
  const [watchRisk, setWatchRisk] = useState("Medium");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeReport, setActiveReport] = useState<Report | null>(null);
  const [activeReportSources, setActiveReportSources] = useState<ReportSource[]>([]);
  const [activeReportAnnotations, setActiveReportAnnotations] = useState<ReportAnnotation[]>([]);
  const [annotationDraft, setAnnotationDraft] = useState({ tags: "", note: "", confidence: "" });
  const [reports, setReports] = useState<Report[]>([]);
  const [sourceDocuments, setSourceDocuments] = useState<SourceDocument[]>([]);
  const [activeSourceDetail, setActiveSourceDetail] = useState<SourceDocumentDetail | null>(null);
  const [knowledgeQuery, setKnowledgeQuery] = useState("UNI");
  const [degradedOnly, setDegradedOnly] = useState(false);
  const [knowledgeReindexStatus, setKnowledgeReindexStatus] = useState("");
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>([]);
  const [providerStatus, setProviderStatus] = useState<string>("loading");
  const [readinessItems, setReadinessItems] = useState<ReadinessItem[]>([]);
  const [selectedReadinessId, setSelectedReadinessId] = useState<string | null>(null);
  const [retentionDays, setRetentionDays] = useState("365");
  const [retentionPreview, setRetentionPreview] = useState<RetentionPreview | null>(null);
  const [retentionStatus, setRetentionStatus] = useState("");
  const [marketSnapshots, setMarketSnapshots] = useState<MarketSnapshot[]>([]);
  const [latestMarketSnapshot, setLatestMarketSnapshot] = useState<MarketSnapshot | null>(null);
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);
  const [watchEdits, setWatchEdits] = useState<Record<string, WatchlistEdit>>({});
  const activeTask = useMemo(() => tasks.find((task) => task.id === activeTaskId), [tasks, activeTaskId]);
  const selectedReadinessItem = useMemo(
    () =>
      readinessItems.find((item) => item.id === selectedReadinessId) ??
      readinessItems.find((item) => item.status !== "ready") ??
      readinessItems[0] ??
      null,
    [readinessItems, selectedReadinessId]
  );
  const canCancelActiveTask = activeTask ? ["pending", "running"].includes(activeTask.status) : false;
  const canRetryActiveTask = activeTask ? ["failed", "cancelled"].includes(activeTask.status) : false;

  function navigateToView(view: ViewKey) {
    void navigate({ to: viewRoutes[view] });
  }

  async function invokeExtension<T>(extensionId: string, capabilityId: string, input: Record<string, unknown> = {}) {
    const res = await fetch(`${apiBase}/extensions/${encodeURIComponent(extensionId)}/invoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ capabilityId, input })
    });
    const data = (await res.json()) as ExtensionInvokeResponse<T> & { message?: string };
    if (!res.ok) throw new Error(data.message ?? `Extension ${extensionId}.${capabilityId} returned HTTP ${res.status}`);
    return data;
  }

  async function refreshTasks() {
    try {
      const [tasksData, queueData] = await Promise.all([
        invokeExtension<{ tasks: Task[] }>("web3.research", "research.list_tasks"),
        invokeExtension<QueueStatus>("web3.research", "research.queue_status")
      ]);
      setTasks(tasksData.result?.tasks ?? []);
      setQueueStatus(queueData.result ?? null);
    } catch {
      setQueueStatus(null);
    }
  }

  async function refreshProviders() {
    try {
      const res = await fetch(`${apiBase}/providers/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const providers = (data.providers ?? []) as ProviderStatus[];
      const degraded = providers.filter((provider) => !provider.reachable).length;
      setProviderStatuses(providers);
      setProviderStatus(`${providers.length - degraded}/${providers.length} reachable`);
    } catch {
      setProviderStatuses([]);
      setProviderStatus("API unavailable");
    }
  }

  async function refreshAgentStatus() {
    try {
      const res = await fetch(`${apiBase}/agent/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAgentStatus(await res.json());
    } catch {
      setAgentStatus(null);
    }
  }

  async function refreshReadiness() {
    try {
      const res = await fetch(`${apiBase}/settings/readiness`);
      if (!res.ok) return;
      const data = await res.json();
      setReadinessItems(data.items ?? []);
    } catch {
      setReadinessItems([]);
    }
  }

  async function refreshReports() {
    try {
      const data = await invokeExtension<{ reports: Report[] }>("local.reports", "reports.read");
      setReports(data.result?.reports ?? []);
    } catch {
      setReports([]);
    }
  }

  async function searchReports(query = knowledgeQuery) {
    try {
      const data = await invokeExtension<{ reports: Report[] }>("local.knowledge", "knowledge.search", { query });
      setReports(data.result?.reports ?? []);
    } catch {
      setReports([]);
    }
  }

  async function searchSources(query = knowledgeQuery, onlyDegraded = degradedOnly) {
    try {
      const data = await invokeExtension<{ sources: SourceDocument[] }>("local.knowledge", "knowledge.search_sources", {
        query,
        degradedOnly: onlyDegraded
      });
      setSourceDocuments(data.result?.sources ?? []);
    } catch {
      setSourceDocuments([]);
    }
  }

  async function reindexKnowledge() {
    setKnowledgeReindexStatus("Reindexing reports...");
    try {
      const data = await invokeExtension<{ indexed?: number; total?: number; degradedReason?: string }>(
        "local.knowledge",
        "knowledge.index_report"
      );
      const result = data.result ?? {};
      const summary = `Indexed ${result.indexed ?? 0}/${result.total ?? 0} reports`;
      setKnowledgeReindexStatus(result.degradedReason ?? data.degradedReason ? `${summary}. ${result.degradedReason ?? data.degradedReason}` : summary);
    } catch (error) {
      setKnowledgeReindexStatus(error instanceof Error ? error.message : "Knowledge reindex failed.");
    }
  }

  async function reindexReportVector(reportId: string) {
    try {
      const data = await invokeExtension<{ indexed?: boolean; title?: string; degradedReason?: string }>(
        "local.knowledge",
        "knowledge.index_report",
        { reportId }
      );
      const result = data.result ?? {};
      const message = result.indexed
        ? `Vector rebuilt for ${result.title ?? reportId}.`
        : `Vector was not rebuilt. ${result.degradedReason ?? data.degradedReason ?? "Embedding provider is unavailable."}`;
      setKnowledgeReindexStatus(message);
      return message;
    } catch (error) {
      return error instanceof Error ? error.message : "Report vector reindex failed.";
    }
  }

  async function deleteReportVector(reportId: string) {
    try {
      const data = await invokeExtension<{ deleted?: boolean; title?: string; degradedReason?: string }>(
        "local.knowledge",
        "knowledge.delete_report_vector",
        { reportId }
      );
      const result = data.result ?? {};
      const message = result.deleted
        ? `Vector cleared for ${result.title ?? reportId}.`
        : `No vector row existed for ${result.title ?? reportId}.`;
      setKnowledgeReindexStatus(result.degradedReason ? `${message} ${result.degradedReason}` : message);
      return message;
    } catch (error) {
      return error instanceof Error ? error.message : "Report vector delete failed.";
    }
  }

  async function saveReportAnnotation(reportId: string) {
    const confidence = Number(annotationDraft.confidence);
    const body = {
      tags: annotationDraft.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      note: annotationDraft.note,
      confidence: Number.isFinite(confidence) ? Math.min(Math.max(confidence, 0), 100) : undefined
    };
    try {
      await invokeExtension<ReportAnnotation>("local.reports", "reports.upsert_annotation", { reportId, ...body });
      await loadReportAnnotations(reportId);
      return "Manual annotation saved.";
    } catch (error) {
      return error instanceof Error ? error.message : "Report annotation save failed.";
    }
  }

  async function deleteReportAnnotation(reportId: string, annotationId: string) {
    try {
      const data = await invokeExtension<{ deleted?: boolean }>("local.reports", "reports.delete_annotation", { reportId, annotationId });
      await loadReportAnnotations(reportId);
      return data.result?.deleted ? "Manual annotation deleted." : "Manual annotation was already absent.";
    } catch (error) {
      return error instanceof Error ? error.message : "Report annotation delete failed.";
    }
  }

  async function previewRetention(days = retentionDays) {
    const res = await fetch(`${apiBase}/settings/retention/preview?days=${encodeURIComponent(days)}`);
    const data = await res.json();
    if (!res.ok) {
      setRetentionStatus(data.message ?? "Retention preview failed.");
      return;
    }
    setRetentionPreview(data);
    setRetentionStatus(data.degradedReason ? data.degradedReason : "Retention preview loaded.");
  }

  async function dryRunRetention() {
    const days = Number(retentionDays);
    const res = await fetch(`${apiBase}/settings/retention/prune`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ days: Number.isFinite(days) ? days : undefined, dryRun: true })
    });
    const data = await res.json();
    if (!res.ok) {
      setRetentionStatus(data.message ?? "Retention dry-run failed.");
      return;
    }
    setRetentionPreview(data);
    setRetentionStatus(data.degradedReason ? data.degradedReason : "Dry-run complete. No records were deleted.");
  }

  async function refreshMarket() {
    try {
      const [latest, list] = await Promise.all([
        invokeExtension<MarketSnapshot | null>("web3.market", "market.snapshot", { analyze: false }),
        invokeExtension<{ snapshots: MarketSnapshot[] }>("web3.market", "market.list_snapshots")
      ]);
      setLatestMarketSnapshot(latest.result ?? null);
      setMarketSnapshots(list.result?.snapshots ?? []);
    } catch {
      setLatestMarketSnapshot(null);
      setMarketSnapshots([]);
    }
  }

  async function analyzeMarket() {
    const data = await invokeExtension<MarketSnapshot>("web3.market", "market.snapshot", { analyze: true });
    const snapshot = data.result;
    if (!snapshot) return;
    setLatestMarketSnapshot(snapshot);
    setMarketSnapshots((current) => [snapshot, ...current.filter((item) => item.id !== snapshot.id)]);
  }

  async function refreshWatchlist() {
    try {
      const res = await fetch(`${apiBase}/watchlist/items`);
      if (!res.ok) return;
      const data = await res.json();
      setWatchlistItems(data.items ?? []);
    } catch {
      setWatchlistItems([]);
    }
  }

  async function createWatchlistItem() {
    const res = await fetch(`${apiBase}/watchlist/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input,
        note: watchNote || undefined,
        riskLevel: watchRisk,
        monitorRules: {
          source: "manual",
          createdFrom: "workbench"
        }
      })
    });
    if (!res.ok) return;
    const item = (await res.json()) as WatchlistItem;
    setWatchlistItems((current) => [item, ...current.filter((existing) => existing.id !== item.id)]);
    setWatchNote("");
  }

  async function updateWatchlistItem(item: WatchlistItem) {
    const edit = watchEdits[item.id] ?? { note: item.note ?? "", riskLevel: item.riskLevel ?? "Medium" };
    const res = await fetch(`${apiBase}/watchlist/items/${encodeURIComponent(item.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        note: edit.note,
        riskLevel: edit.riskLevel
      })
    });
    if (!res.ok) return;
    const updated = (await res.json()) as WatchlistItem;
    setWatchlistItems((current) => current.map((existing) => (existing.id === updated.id ? updated : existing)));
    setWatchEdits((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
  }

  async function deleteWatchlistItem(itemId: string) {
    const res = await fetch(`${apiBase}/watchlist/items/${encodeURIComponent(itemId)}`, { method: "DELETE" });
    if (!res.ok) return;
    setWatchlistItems((current) => current.filter((item) => item.id !== itemId));
    setWatchEdits((current) => {
      const next = { ...current };
      delete next[itemId];
      return next;
    });
  }

  function updateWatchlistEdit(itemId: string, edit: WatchlistEdit) {
    setWatchEdits((current) => ({
      ...current,
      [itemId]: edit
    }));
  }

  async function handleReadinessAction(item: ReadinessItem) {
    setSelectedReadinessId(item.id);
    if (item.id === "coingecko") {
      navigateToView("market");
      await analyzeMarket();
      return;
    }
    if (item.id === "evm-rpc" || item.id === "arkham") {
      setInput("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
      navigateToView("research");
      return;
    }
    if (item.id === "holder-concentration") {
      setKnowledgeQuery("");
      setDegradedOnly(true);
      navigateToView("knowledge");
      await searchSources("", true);
      return;
    }
    if (item.id === "siliconflow") {
      setKnowledgeQuery("");
      setDegradedOnly(false);
      navigateToView("knowledge");
      await Promise.all([searchReports(""), searchSources("", false)]);
      return;
    }
    navigateToView("settings");
  }

  async function copyReadinessEnv(item: ReadinessItem) {
    if (!item.envVars.length) return;
    await navigator.clipboard?.writeText(readinessEnvTemplate(item));
  }

  async function ensureChatSession() {
    if (chatSessionId) return chatSessionId;
    const res = await fetch(`${apiBase}/chat/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Altcoin research" })
    });
    const data = await res.json();
    setChatSessionId(data.id);
    setChatMessages(data.messages ?? []);
    return data.id as string;
  }

  async function createTask(nextInput = input) {
    const data = await invokeExtension<{ task: Task; queued: boolean }>("web3.research", "research.create_task", {
      input: nextInput,
      inputType: "auto",
      question: "现在适合买入吗？"
    });
    if (!data.result?.task) return;
    const task = data.result.task;
    setActiveTaskId(task.id);
    setActiveReport(null);
    setActiveReportSources([]);
    setActiveSourceDetail(null);
    setTasks((current) => [task, ...current.filter((existing) => existing.id !== task.id)]);
    streamTask(task.id, task.input);
    setKnowledgeQuery(task.input);
    navigateToView("research");
    await refreshTasks();
    await searchSources(task.input);
  }

  async function cancelTask(taskId: string) {
    const data = await invokeExtension<{ task: Task; cancelled: boolean }>("web3.research", "research.cancel_task", { taskId });
    if (!data.result?.task) return;
    setTasks((current) => current.map((task) => (task.id === taskId ? data.result!.task : task)));
    if (taskId === activeTaskId) {
      setActiveReport(null);
      setActiveReportSources([]);
      setActiveSourceDetail(null);
    }
    await refreshTasks();
  }

  async function retryTask(taskId: string, resumeFromNode?: string) {
    const data = await invokeExtension<{ task: Task; queued: boolean }>(
      "web3.research",
      "research.retry_task",
      resumeFromNode ? { taskId, resumeFromNode } : { taskId }
    );
    if (!data.result?.task) return;
    const task = data.result.task;
    setActiveTaskId(task.id);
    setActiveReport(null);
    setActiveReportSources([]);
    setActiveSourceDetail(null);
    setTasks((current) => [task, ...current]);
    streamTask(task.id, task.input);
    navigateToView("research");
    await refreshTasks();
  }

  async function sendChat() {
    const sessionId = await ensureChatSession();
    const res = await fetch(`${apiBase}/chat/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: input, triggerResearch: true })
    });
    const data = await res.json();
    setChatMessages((current) => [...current, data.message, data.assistantMessage].filter(Boolean));
    if (data.task?.id) setActiveTaskId(data.task.id);
    if (data.task) {
      setActiveReport(null);
      setActiveReportSources([]);
      setActiveSourceDetail(null);
      setTasks((current) => [data.task, ...current.filter((task) => task.id !== data.task.id)]);
      streamTask(data.task.id, data.task.input, { chatSessionId: sessionId });
    }
    navigateToView("chat");
    await refreshTasks();
  }

  async function sendAgentMessage() {
    const content = agentInput.trim();
    if (!content) return;
    const userMessage: ChatMessage = {
      id: `local_user_${Date.now()}`,
      role: "user",
      content,
      metadata: {},
      createdAt: new Date().toISOString()
    };
    setChatMessages((current) => [...current, userMessage]);
    setAgentInput("");
    setAgentMessageStatus("Running Pi turn...");
    try {
      const res = await fetch(`${apiBase}/agent/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`);
      setChatMessages((current) => [
        ...current,
        {
          id: `agent_${Date.now()}`,
          role: "assistant",
          content: data.degradedReason ? `${data.content}\n\nDegraded: ${data.degradedReason}` : data.content,
          metadata: {
            provider: data.provider,
            model: data.model,
            activeTools: data.activeTools
          },
          createdAt: new Date().toISOString()
        }
      ]);
      setAgentMessageStatus(data.model ? `${data.provider} / ${data.model}` : data.provider);
      await refreshAgentStatus();
    } catch (error) {
      setChatMessages((current) => [
        ...current,
        {
          id: `agent_error_${Date.now()}`,
          role: "assistant",
          content: error instanceof Error ? `Agent turn failed: ${error.message}` : "Agent turn failed.",
          metadata: {},
          createdAt: new Date().toISOString()
        }
      ]);
      setAgentMessageStatus("Agent API unavailable");
    }
  }

  function mergeTaskEvent(taskId: string, event: TaskEvent) {
    setTasks((current) =>
      current.map((task) => {
        if (task.id !== taskId) return task;
        if (task.events.some((existing) => existing.id === event.id)) return task;
        return {
          ...task,
          status:
            event.eventType === "task_failed"
              ? "failed"
              : event.eventType === "task_cancelled"
                ? "cancelled"
                : event.eventType === "task_completed"
                  ? "completed"
                  : task.status,
          currentNode: event.node ?? task.currentNode,
          events: [...task.events, event]
        };
      })
    );
  }

  function streamTask(taskId: string, query: string, options: { chatSessionId?: string } = {}) {
    const source = new EventSource(`${apiBase}/extensions/web3.research/research/tasks/${encodeURIComponent(taskId)}/events/stream`);
    const eventNames = [
      "task_started",
      "node_started",
      "node_completed",
      "agent_report_started",
      "agent_report_completed",
      "agent_report_degraded",
      "task_completed",
      "knowledge_indexed",
      "task_failed",
      "task_cancelled"
    ];
    for (const eventName of eventNames) {
      source.addEventListener(eventName, (message) => {
        const event = JSON.parse((message as MessageEvent).data) as TaskEvent;
        mergeTaskEvent(taskId, event);
      });
    }
    source.addEventListener("done", async () => {
      source.close();
      await refreshTasks();
      try {
        const reportRead = await invokeExtension<Report>("web3.research", "research.get_report", { taskId });
        const report = reportRead.result;
        if (!report) return;
        setActiveReport(report);
        await loadReportSources(report.id);
        if (options.chatSessionId) await appendChatReportMessage(options.chatSessionId, taskId, report);
      } catch {
        setActiveReport(null);
      }
      await searchReports(query);
      await searchSources(query);
    });
    source.onerror = () => {
      source.close();
      void refreshTasks();
    };
  }

  async function appendChatReportMessage(sessionId: string, taskId: string, report: Report) {
    const marker = `Report: ${report.id}`;
    if (chatMessages.some((message) => message.role === "assistant" && message.content.includes(marker))) return;
    const content = [
      "Research report completed.",
      "",
      `Task: ${taskId}`,
      marker,
      `Recommendation: ${report.recommendation}`,
      `Confidence: ${report.confidence}`,
      "",
      report.summary
    ].join("\n");
    const res = await fetch(`${apiBase}/chat/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        role: "assistant",
        content,
        triggerResearch: false
      })
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.message) {
      setChatMessages((current) => (current.some((message) => message.content.includes(marker)) ? current : [...current, data.message]));
    }
  }

  async function openTask(taskId: string) {
    setActiveTaskId(taskId);
    setActiveSourceDetail(null);
    try {
      const data = await invokeExtension<Report>("web3.research", "research.get_report", { taskId });
      if (!data.result) throw new Error("Task report is not available.");
      const report = data.result;
      setActiveReport(report);
      await loadReportSources(report.id);
      await loadReportAnnotations(report.id);
    } catch {
      setActiveReport(null);
      setActiveReportSources([]);
      setActiveReportAnnotations([]);
    }
  }

  async function openReport(reportId: string) {
    const data = await invokeExtension<Report>("local.reports", "reports.read_one", { reportId });
    const report = data.result;
    if (!report) return;
    setActiveReport(report);
    setActiveTaskId(report.taskId);
    setActiveSourceDetail(null);
    await loadReportSources(report.id);
    await loadReportAnnotations(report.id);
  }

  async function openSource(sourceId: string) {
    try {
      const data = await invokeExtension<SourceDocumentDetail>("local.knowledge", "knowledge.get_source", { sourceId });
      if (data.result) setActiveSourceDetail(data.result);
    } catch {
      setActiveSourceDetail(null);
    }
  }

  async function loadReportSources(reportId: string) {
    try {
      const data = await invokeExtension<{ sources: ReportSource[] }>("local.reports", "reports.read_sources", { reportId });
      setActiveReportSources(data.result?.sources ?? []);
    } catch {
      setActiveReportSources([]);
    }
  }

  async function loadReportAnnotations(reportId: string) {
    try {
      const data = await invokeExtension<{ annotations: ReportAnnotation[] }>("local.reports", "reports.read_annotations", { reportId });
      const annotations = data.result?.annotations ?? [];
      setActiveReportAnnotations(annotations);
      const first = annotations[0];
      setAnnotationDraft({
        tags: first?.tags.join(", ") ?? "",
        note: first?.note ?? "",
        confidence: first?.confidence === undefined ? "" : String(first.confidence)
      });
    } catch {
      setActiveReportAnnotations([]);
      setAnnotationDraft({ tags: "", note: "", confidence: "" });
    }
  }

  useEffect(() => {
    void refreshAgentStatus();
    void refreshTasks();
    void refreshProviders();
    void refreshReadiness();
    void refreshReports();
    void searchSources();
    void refreshMarket();
    void refreshWatchlist();
  }, []);

  return (
    <main className="shell" data-testid="app-shell">
      <aside className="nav" data-testid="main-nav">
        <div className="brand">SP Agent</div>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              to={viewRoutes[item.key]}
              className={item.key === activeView ? "navItem active" : "navItem"}
              data-testid={`nav-${item.key}`}
            >
              <Icon size={17} />
              {item.label}
            </Link>
          );
        })}
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>{viewTitle[activeView].title}</h1>
            <p>{viewTitle[activeView].subtitle}</p>
          </div>
          <button
            className="status"
            data-testid="provider-status-button"
            onClick={() => {
              navigateToView("settings");
              void refreshProviders();
              void refreshReadiness();
            }}
          >
            {providerStatus}
          </button>
        </header>

        {activeView === "chat" && (
          <section className="agentCommandRow" data-testid="agent-input-row">
            <input
              value={agentInput}
              onChange={(event) => setAgentInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void sendAgentMessage();
              }}
              placeholder="Ask the local personal agent"
            />
            <button onClick={sendAgentMessage}>
              <Send size={16} />
              Send
            </button>
          </section>
        )}

        {["research", "watchlist"].includes(activeView) && (
          <section className="inputRow" data-testid="research-input-row">
            <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Token address, symbol, project name, or URL" />
            <button onClick={sendChat}>Research Chat</button>
            <button onClick={() => createTask()}>Run Research</button>
          </section>
        )}

        {activeView === "chat" && (
          <section className="viewGrid agentGrid" data-testid="view-chat">
            <AgentStatusPanel status={agentStatus} providerStatus={providerStatus} messageStatus={agentMessageStatus} onRefresh={refreshAgentStatus} />
            <section className="panel wide agentConversation" data-testid="agent-thread-panel">
              <div className="panelHeader">
                <h2>Agent Thread</h2>
                <button className="smallAction" onClick={() => setChatMessages([])}>Clear</button>
              </div>
              <div className="chatThread tall">
                {chatMessages.map((message) => (
                  <div key={message.id} className={message.role === "user" ? "chatBubble user" : "chatBubble assistant"}>
                    <strong>{message.role}</strong>
                    <p>{message.content}</p>
                  </div>
                ))}
                {!chatMessages.length && <p className="empty">Ask the local agent about its runtime, extensions, or next research skill to invoke.</p>}
              </div>
            </section>
            <ExtensionRegistryPanel extensions={agentStatus?.extensions ?? []} />
          </section>
        )}

        {activeView === "research" && (
          <section className="viewGrid researchGrid" data-testid="view-research">
            <div className="stackedPanels">
              <QueueStatusPanel status={queueStatus} onRefresh={refreshTasks} />
              <TaskList tasks={tasks} activeTaskId={activeTaskId} onRefresh={refreshTasks} onOpen={openTask} />
            </div>
            <TaskProgress
              task={activeTask}
              canCancel={canCancelActiveTask}
              canRetry={canRetryActiveTask}
              onCancel={cancelTask}
              onRetry={retryTask}
              onRetryFromNode={retryTask}
            />
            <ReportPanel
              report={activeReport}
              sources={activeReportSources}
              annotations={activeReportAnnotations}
              annotationDraft={annotationDraft}
              onAnnotationDraftChange={setAnnotationDraft}
              onSaveAnnotation={saveReportAnnotation}
              onDeleteAnnotation={deleteReportAnnotation}
              onReindexVector={reindexReportVector}
              onDeleteVector={deleteReportVector}
            />
          </section>
        )}

        {activeView === "market" && (
          <MarketView
            snapshots={marketSnapshots}
            latestSnapshot={latestMarketSnapshot}
            onRefresh={refreshMarket}
            onAnalyze={analyzeMarket}
            onSelectSnapshot={setLatestMarketSnapshot}
          />
        )}

        {activeView === "knowledge" && (
          <section className="viewGrid knowledgeGrid" data-testid="view-knowledge">
            <KnowledgeSearch
              knowledgeQuery={knowledgeQuery}
              degradedOnly={degradedOnly}
              sources={sourceDocuments}
              reports={reports}
              activeReportId={activeReport?.id}
              onQueryChange={setKnowledgeQuery}
              onDegradedOnlyChange={(checked) => {
                setDegradedOnly(checked);
                void searchSources(knowledgeQuery, checked);
              }}
              onSearch={() => {
                void searchReports();
                void searchSources();
              }}
              onReindex={() => {
                void reindexKnowledge();
              }}
              reindexStatus={knowledgeReindexStatus}
              onOpenReport={openReport}
              onOpenSource={openSource}
            />
            <SourceDetail detail={activeSourceDetail} onOpenReport={openReport} />
            <ReportPanel
              report={activeReport}
              sources={activeReportSources}
              annotations={activeReportAnnotations}
              annotationDraft={annotationDraft}
              onAnnotationDraftChange={setAnnotationDraft}
              onSaveAnnotation={saveReportAnnotation}
              onDeleteAnnotation={deleteReportAnnotation}
              onReindexVector={reindexReportVector}
              onDeleteVector={deleteReportVector}
            />
          </section>
        )}

        {activeView === "watchlist" && (
          <WatchlistView
            input={input}
            note={watchNote}
            risk={watchRisk}
            items={watchlistItems}
            edits={watchEdits}
            onInputChange={setInput}
            onNoteChange={setWatchNote}
            onRiskChange={setWatchRisk}
            onCreate={createWatchlistItem}
            onRefresh={refreshWatchlist}
            onEditChange={updateWatchlistEdit}
            onSave={(item) => { void updateWatchlistItem(item); }}
            onRemove={(itemId) => { void deleteWatchlistItem(itemId); }}
            onResearch={(itemInput) => {
              setInput(itemInput);
              void createTask(itemInput);
            }}
          />
        )}

        {activeView === "reports" && (
          <ReportsView
            reports={reports}
            activeReport={activeReport}
            activeReportSources={activeReportSources}
            activeReportAnnotations={activeReportAnnotations}
            annotationDraft={annotationDraft}
            onRefreshReports={refreshReports}
            onOpenReport={openReport}
            onAnnotationDraftChange={setAnnotationDraft}
            onSaveAnnotation={saveReportAnnotation}
            onDeleteAnnotation={deleteReportAnnotation}
            onReindexVector={reindexReportVector}
            onDeleteVector={deleteReportVector}
          />
        )}

        {activeView === "settings" && (
          <SettingsView
            providerStatuses={providerStatuses}
            readinessItems={readinessItems}
            selectedReadinessItem={selectedReadinessItem}
            retentionDays={retentionDays}
            retentionPreview={retentionPreview}
            retentionStatus={retentionStatus}
            onRefreshProviders={refreshProviders}
            onRefreshReadiness={refreshReadiness}
            onSelectReadiness={setSelectedReadinessId}
            onReadinessAction={handleReadinessAction}
            onCopyReadinessEnv={copyReadinessEnv}
            onRetentionDaysChange={setRetentionDays}
            onPreviewRetention={previewRetention}
            onDryRunRetention={dryRunRetention}
          />
        )}
      </section>
    </main>
  );
}

const rootRoute = createRootRoute({
  component: App
});

const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute: () => rootRoute, path: "/" }),
  createRoute({ getParentRoute: () => rootRoute, path: "chat" }),
  createRoute({ getParentRoute: () => rootRoute, path: "research" }),
  createRoute({ getParentRoute: () => rootRoute, path: "market" }),
  createRoute({ getParentRoute: () => rootRoute, path: "knowledge" }),
  createRoute({ getParentRoute: () => rootRoute, path: "watchlist" }),
  createRoute({ getParentRoute: () => rootRoute, path: "reports" }),
  createRoute({ getParentRoute: () => rootRoute, path: "settings" })
]);

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
