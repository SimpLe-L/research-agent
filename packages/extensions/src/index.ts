import type { ExtensionManifest } from "@sp-agent/shared";

export type ExtensionRuntimeStatus = {
  mode: "local_personal_agent";
  safetyModel: {
    defaultToolPolicy: "read_only";
    disabledToolClasses: string[];
    highRiskActions: string[];
  };
  extensions: ExtensionManifest[];
};

const coreAgentShell: ExtensionManifest = {
  id: "core.agent-shell",
  name: "Local Personal Agent Shell",
  description: "Electron + Local API + Pi base for the single-user personal agent prototype.",
  kind: "core",
  phase: "phase-1",
  status: "active",
  entrypoint: "/api/agent/messages",
  capabilities: [
    {
      id: "agent.turn",
      label: "Personal agent turn",
      description: "Run one local personal-agent turn through Pi when configured, or deterministic degraded output otherwise.",
      permissions: ["runtime:pi", "tools:read_only"],
      inputSchema: "createAgentMessageSchema",
      outputSchema: "agentMessageResponseSchema"
    },
    {
      id: "agent.research_session",
      label: "Start research session",
      description:
        "Start a Pi-coordinated research session through the local API while preserving the deterministic task graph as fallback and audit backbone.",
      permissions: ["runtime:pi", "tasks:write", "providers:read", "database:write_reports"],
      inputSchema: "createAgentResearchSessionSchema",
      outputSchema: "{ mode: 'pi_research_session', task: researchTaskSchema, plannedTools: string[] }"
    },
    {
      id: "extensions.inspect",
      label: "Inspect extension registry",
      description: "Read the local extension registry and safety policy.",
      permissions: ["extensions:read"],
      outputSchema: "extensionManifestSchema[]"
    }
  ],
  degradedReason: "LLM-backed replies require AGENT_RUNTIME_PROVIDER=pi plus a configured Pi model key."
};

const web3ResearchSkill: ExtensionManifest = {
  id: "web3.research",
  name: "Web3 Research",
  description: "Token research task graph, evidence collection, risk analysis, and Markdown report generation as a permissioned extension.",
  kind: "skill",
  phase: "phase-2",
  status: "active",
  entrypoint: "/api/extensions/web3.research/invoke",
  capabilities: [
    {
      id: "research.create_task",
      label: "Create research task",
      description: "Create an observable token/project research task with deterministic fallback outputs.",
      permissions: ["providers:read", "database:write_reports", "tasks:write"],
      inputSchema: "createResearchTaskSchema",
      outputSchema: "researchTaskSchema"
    },
    {
      id: "research.list_tasks",
      label: "List research tasks",
      description: "Read persisted research tasks and derived node runs.",
      permissions: ["tasks:read"],
      outputSchema: "{ tasks: researchTaskSchema[] }"
    },
    {
      id: "research.queue_status",
      label: "Read research queue status",
      description: "Read local queue and persisted pending/running task visibility.",
      permissions: ["tasks:read"],
      outputSchema: "researchTaskQueueStatusSchema"
    },
    {
      id: "research.stream_events",
      label: "Stream task events",
      description: "Replay and stream append-only task events for auditability.",
      permissions: ["tasks:read"],
      outputSchema: "taskEventSchema[]"
    },
    {
      id: "research.list_events",
      label: "List task events",
      description: "Read append-only task events through the extension invocation boundary.",
      permissions: ["tasks:read"],
      inputSchema: "{ taskId: string }",
      outputSchema: "{ events: taskEventSchema[] }"
    },
    {
      id: "research.get_task",
      label: "Get research task",
      description: "Read one research task and its derived node runs.",
      permissions: ["tasks:read"],
      inputSchema: "{ taskId: string }",
      outputSchema: "researchTaskSchema"
    },
    {
      id: "research.get_report",
      label: "Get task report",
      description: "Read the generated report for a completed research task.",
      permissions: ["database:read"],
      inputSchema: "{ taskId: string }",
      outputSchema: "researchReportSchema"
    },
    {
      id: "research.cancel_task",
      label: "Cancel research task",
      description: "Cancel a pending or running research task.",
      permissions: ["tasks:write"],
      inputSchema: "{ taskId: string }",
      outputSchema: "{ task: researchTaskSchema, cancelled: boolean }"
    },
    {
      id: "research.retry_task",
      label: "Retry research task",
      description: "Create a retry task, optionally resuming from a completed node checkpoint.",
      permissions: ["tasks:write"],
      inputSchema: "{ taskId: string, resumeFromNode?: string }",
      outputSchema: "{ task: researchTaskSchema, queued: boolean }"
    }
  ]
};

const marketSkill: ExtensionManifest = {
  id: "web3.market",
  name: "Market Snapshot",
  description: "CoinGecko/DefiLlama market snapshot and degraded-provider analysis path.",
  kind: "skill",
  phase: "phase-2",
  status: "active",
  entrypoint: "/api/extensions/web3.market/invoke",
  capabilities: [
    {
      id: "market.snapshot",
      label: "Read market snapshot",
      description: "Read latest persisted market snapshot or create a provider-backed snapshot when requested.",
      permissions: ["providers:read", "database:write_snapshots"],
      outputSchema: "marketSnapshotSchema"
    },
    {
      id: "market.list_snapshots",
      label: "List market snapshots",
      description: "Read persisted market snapshot history without calling external providers.",
      permissions: ["database:read"],
      outputSchema: "marketSnapshotSchema[]"
    }
  ]
};

const knowledgeSkill: ExtensionManifest = {
  id: "local.knowledge",
  name: "Local Knowledge Base",
  description: "Report/source persistence, SQL search, and optional LanceDB vector indexing.",
  kind: "skill",
  phase: "phase-2",
  status: "active",
  entrypoint: "/api/extensions/local.knowledge/invoke",
  capabilities: [
    {
      id: "knowledge.search",
      label: "Search local knowledge",
      description: "Search persisted reports and source documents; use vectors only when embedding credentials are configured.",
      permissions: ["database:read", "vectors:optional"],
      inputSchema: "{ query: string }",
      outputSchema: "knowledgeSearchResultSchema"
    },
    {
      id: "knowledge.index_report",
      label: "Index report",
      description: "Index existing reports into local knowledge storage and optional vector rows.",
      permissions: ["database:write", "vectors:optional"],
      inputSchema: "{ reportId?: string }",
      outputSchema: "knowledgeIndexResultSchema"
    },
    {
      id: "knowledge.delete_report_vector",
      label: "Delete report vector",
      description: "Delete one report's optional vector index row without deleting the report.",
      permissions: ["database:write", "vectors:optional"],
      inputSchema: "{ reportId: string }",
      outputSchema: "{ reportId: string, title: string, deleted: boolean, degradedReason?: string }"
    },
    {
      id: "knowledge.search_sources",
      label: "Search sources",
      description: "Search persisted source documents and optionally restrict to degraded evidence.",
      permissions: ["database:read"],
      inputSchema: "{ query?: string, degradedOnly?: boolean }",
      outputSchema: "sourceDocumentSchema[]"
    },
    {
      id: "knowledge.get_source",
      label: "Read source detail",
      description: "Read one persisted source document with linked report usage.",
      permissions: ["database:read"],
      inputSchema: "{ sourceId: string }",
      outputSchema: "{ source: sourceDocumentSchema, reports: sourceReportUsageSchema[] }"
    }
  ],
  degradedReason: "Vector indexing degrades until embedding credentials are configured; SQL-backed history remains available."
};

const reportSkill: ExtensionManifest = {
  id: "local.reports",
  name: "Markdown Reports",
  description: "Generated report library, source appendix, copy, and download surface.",
  kind: "skill",
  phase: "phase-2",
  status: "active",
  entrypoint: "/api/extensions/local.reports/invoke",
  capabilities: [
    {
      id: "reports.read",
      label: "Read reports",
      description: "Read persisted Markdown reports and linked source evidence.",
      permissions: ["database:read"],
      outputSchema: "reportSchema[]"
    },
    {
      id: "reports.read_one",
      label: "Read report",
      description: "Read one persisted Markdown report by id.",
      permissions: ["database:read"],
      inputSchema: "{ reportId: string }",
      outputSchema: "researchReportSchema"
    },
    {
      id: "reports.read_sources",
      label: "Read report sources",
      description: "Read linked source evidence for one report.",
      permissions: ["database:read"],
      inputSchema: "{ reportId: string }",
      outputSchema: "persistedReportSourceSchema[]"
    },
    {
      id: "reports.read_annotations",
      label: "Read report annotations",
      description: "Read manual annotations attached to one report.",
      permissions: ["database:read"],
      inputSchema: "{ reportId: string }",
      outputSchema: "reportAnnotationSchema[]"
    },
    {
      id: "reports.upsert_annotation",
      label: "Save report annotation",
      description: "Create or update the manual annotation attached to one report.",
      permissions: ["database:write"],
      inputSchema: "{ reportId: string, tags?: string[], note?: string, confidence?: number }",
      outputSchema: "reportAnnotationSchema"
    },
    {
      id: "reports.delete_annotation",
      label: "Delete report annotation",
      description: "Delete one manual report annotation.",
      permissions: ["database:write"],
      inputSchema: "{ reportId: string, annotationId: string }",
      outputSchema: "{ deleted: boolean }"
    }
  ]
};

const extensionManifests = [coreAgentShell, web3ResearchSkill, marketSkill, knowledgeSkill, reportSkill];

export function listExtensionManifests(): ExtensionManifest[] {
  return extensionManifests;
}

export function getExtensionManifest(id: string): ExtensionManifest | undefined {
  return extensionManifests.find((extension) => extension.id === id);
}

export function getExtensionRuntimeStatus(): ExtensionRuntimeStatus {
  return {
    mode: "local_personal_agent",
    safetyModel: {
      defaultToolPolicy: "read_only",
      disabledToolClasses: ["shell", "file_write", "edit", "wallet", "transaction", "posting", "unrestricted_browser"],
      highRiskActions: ["swap", "transfer", "approve", "post", "send_dm", "store_private_key"]
    },
    extensions: listExtensionManifests()
  };
}
