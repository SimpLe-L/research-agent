import type { ExtensionCapability, ExtensionManifest } from "@sp-agent/shared";

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
  description: "Electron + Local API + runtime adapters for the single-user personal agent base.",
  kind: "core",
  phase: "phase-1",
  status: "active",
  entrypoint: "/api/agent/messages",
  capabilities: [
    {
      id: "agent.turn",
      label: "Personal agent turn",
      description: "Run one local personal-agent turn through the selected runtime adapter.",
      permissions: ["runtime:agent", "tools:read_only"],
      inputSchema: "createAgentMessageSchema",
      outputSchema: "agentMessageResponseSchema"
    },
    {
      id: "extensions.inspect",
      label: "Inspect extension registry",
      description: "Read the local extension registry and safety policy.",
      permissions: ["extensions:read"],
      outputSchema: "extensionManifestSchema[]"
    }
  ]
};

const memorySkill: ExtensionManifest = {
  id: "local.memory",
  name: "Local Memory",
  description: "App-owned Memory v2 layer for core facts, journal events, summaries, provenance, search, audit, and tombstone-based forgetting.",
  kind: "skill",
  phase: "phase-3",
  status: "active",
  entrypoint: "/api/extensions/local.memory/invoke",
  capabilities: [
    {
      id: "memory.search",
      label: "Search memory",
      description: "Search durable app-owned memory with kind, scope, session, time range, sensitivity, status, and limit filters.",
      permissions: ["memory:read"],
      inputSchema: "searchMemorySchema",
      outputSchema: "{ memories: memorySearchResult[] }"
    },
    {
      id: "memory.write_candidate",
      label: "Write memory candidate",
      description: "Create an auditable Memory v2 candidate with kind, source, provenance, sensitivity, and optional occurredAt metadata.",
      permissions: ["memory:write_candidate"],
      inputSchema: "createMemoryCandidateSchema",
      outputSchema: "{ accepted: boolean, memoryId: string, memory: memoryEntry }"
    },
    {
      id: "memory.promote_fact",
      label: "Promote memory fact",
      description: "Promote a memory candidate into an accepted durable fact.",
      permissions: ["memory:write"],
      inputSchema: "{ id: string, reason: string }",
      outputSchema: "{ memory: memoryEntry, auditEvents: memoryAuditEvent[] }"
    },
    {
      id: "memory.update",
      label: "Update memory",
      description: "Update an existing memory entry while preserving audit history.",
      permissions: ["memory:write"],
      inputSchema: "{ id: string, content?: string, tags?: string[], confidence?: number, provenance?: object }",
      outputSchema: "{ memory: memoryEntry, auditEvents: memoryAuditEvent[] }"
    },
    {
      id: "memory.merge",
      label: "Merge memories",
      description: "Create a promoted memory from related source memories and tombstone the superseded entries.",
      permissions: ["memory:write"],
      inputSchema: "mergeMemorySchema",
      outputSchema: "{ memory: memoryEntry, mergedFrom: string[], auditEvents: memoryAuditEvent[] }"
    },
    {
      id: "memory.consolidate",
      label: "Suggest memory consolidation",
      description: "Inspect active/candidate memories and suggest safe merge candidates without mutating durable memory.",
      permissions: ["memory:read"],
      inputSchema: "consolidateMemorySchema",
      outputSchema: "{ suggestions: memoryConsolidationSuggestion[], degradedReason?: string }"
    }
  ]
};

const localContextSkill: ExtensionManifest = {
  id: "local.context",
  name: "Local Context",
  description: "Read-only local context utility for basic time, runtime, and shell metadata that proves the extension path is usable.",
  kind: "skill",
  phase: "phase-4",
  status: "active",
  entrypoint: "/api/extensions/local.context/invoke",
  capabilities: [
    {
      id: "context.snapshot",
      label: "Read local context snapshot",
      description: "Return a compact read-only snapshot with server time, timezone, active runtime, and extension ids.",
      permissions: ["context:read"],
      inputSchema: "{}",
      outputSchema: "{ now: string, timezone: string, runtimeProvider: string, extensionIds: string[] }"
    },
    {
      id: "context.briefing",
      label: "Read local context briefing",
      description: "Return a read-only operational briefing with runtime, extension readiness, safety policy, and recent workflow status.",
      permissions: ["context:read", "extensions:read", "workflow:read"],
      inputSchema: "contextBriefingSchema",
      outputSchema: "{ now: string, runtimeProvider: string, extensionSummary: object, workflowSummary?: object }"
    }
  ]
};

const localProjectSkill: ExtensionManifest = {
  id: "local.project",
  name: "Local Project Knowledge",
  description: "Read-only project-document skill backed by the workflow runner and restricted to allowlisted repository docs.",
  kind: "skill",
  phase: "phase-4",
  status: "active",
  entrypoint: "/api/extensions/local.project/invoke",
  capabilities: [
    {
      id: "project.search_docs",
      label: "Search project docs",
      description: "Run a workflow that searches allowlisted local project documents for relevant context.",
      permissions: ["project_docs:read", "workflow:run"],
      inputSchema: "projectDocSearchSchema",
      outputSchema: "{ workflow: workflowRun }"
    },
    {
      id: "project.plan",
      label: "Create project plan",
      description: "Create a read-only project plan from allowlisted project docs and return the supporting workflow record.",
      permissions: ["project_docs:read", "workflow:run"],
      inputSchema: "projectPlanSchema",
      outputSchema: "{ plan: object, workflow: workflowRun }"
    }
  ]
};

const localBookmarksConnector: ExtensionManifest = {
  id: "local.bookmarks",
  name: "Local Bookmarks Connector",
  description: "Read-only connector for user-supplied local bookmark data stored under the app data directory.",
  kind: "connector",
  phase: "phase-4",
  status: "active",
  entrypoint: "/api/extensions/local.bookmarks/invoke",
  capabilities: [
    {
      id: "bookmarks.search",
      label: "Search local bookmarks",
      description: "Search configured local bookmark records without calling external services or mutating state.",
      permissions: ["bookmarks:read", "connector:read"],
      inputSchema: "localBookmarkSearchSchema",
      outputSchema: "{ bookmarks: localBookmark[], degradedReason?: string }"
    },
    {
      id: "bookmarks.digest",
      label: "Digest local bookmarks",
      description: "Create a read-only digest of configured local bookmarks grouped by tags and filtered by optional query or tag.",
      permissions: ["bookmarks:read", "connector:read"],
      inputSchema: "localBookmarkDigestSchema",
      outputSchema: "{ digest: object, bookmarks: localBookmark[], degradedReason?: string }"
    }
  ]
};

const speechSkill: ExtensionManifest = {
  id: "local.speech",
  name: "Speech I/O",
  description: "Planned STT/TTS provider boundary for voice chat.",
  kind: "skill",
  phase: "phase-4",
  status: "planned",
  entrypoint: "/api/voice",
  capabilities: [
    {
      id: "speech.transcribe",
      label: "Transcribe audio",
      description: "Convert recorded audio to text through a configured STT provider.",
      permissions: ["audio:transcribe"],
      inputSchema: "audio/*",
      outputSchema: "{ transcript: string, degradedReason?: string }"
    },
    {
      id: "speech.synthesize",
      label: "Synthesize speech",
      description: "Convert assistant text to playable audio through a configured TTS provider.",
      permissions: ["audio:synthesize"],
      inputSchema: "{ text: string }",
      outputSchema: "audio/*"
    }
  ],
  degradedReason: "Speech provider adapters are planned but not implemented yet."
};

const manifests: ExtensionManifest[] = [coreAgentShell, memorySkill, localContextSkill, localProjectSkill, localBookmarksConnector, speechSkill];

export function getExtensionRuntimeStatus(): ExtensionRuntimeStatus {
  return {
    mode: "local_personal_agent",
    safetyModel: {
      defaultToolPolicy: "read_only",
      disabledToolClasses: ["shell", "filesystem_write", "browser_control", "wallet", "posting", "code_edit"],
      highRiskActions: ["payments", "transactions", "external_posting", "destructive_file_write", "credential_access"]
    },
    extensions: manifests
  };
}

export function listExtensionManifests(): ExtensionManifest[] {
  return manifests;
}

export function getExtensionManifest(id: string): ExtensionManifest | undefined {
  return manifests.find((extension) => extension.id === id);
}

export function findCapability(capabilities: ExtensionCapability[], capabilityId: string): ExtensionCapability | undefined {
  return capabilities.find((capability) => capability.id === capabilityId);
}
