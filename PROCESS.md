# PROCESS.md

## Current State

SP Agent is a local-first, chat-first personal agent platform. The active product direction is a Research and Decision Agent built as the first flagship skill on top of its reusable runtime, extension, memory, approval, and workflow boundaries:

```text
Electron shell
-> assistant-ui renderer
-> NestJS local API gateway
-> runtime adapter registry, Pi first
-> permissioned extensions
-> app-owned memory, approvals, workflows, speech
```

Active packages are `apps/api`, `apps/web`, `apps/desktop`, `packages/shared`, `packages/extensions`, `packages/agent-runtime`, and `packages/speech`.

Old Web3 and removed research code are not part of the active product and must stay detached. The new research capability will be implemented as `personal.research` through the current extension and workflow contracts, not by restoring old routes or packages.

## Product Baseline

- The first screen is the assistant-ui chat shell on `/` and `/chat`.
- Chat sessions persist through the API, with PostgreSQL when `DATABASE_URL` is configured and local JSON fallback otherwise.
- Pi is the default runtime adapter; `local-deterministic` remains the offline fallback/registry verification adapter.
- The API gateway owns provider readiness, persistence, permission audit, approvals, extension execution, workflows, memory, and speech.
- Extension registry currently includes `core.agent-shell`, `local.memory`, `local.context`, `local.project`, `local.bookmarks`, and readiness-gated `local.speech`.
- Memory supports typed entries, search, candidate creation, promotion, update, merge, tombstone forgetting, provenance, conflict metadata, audit events, retrieval gating, and review UI.
- Write/provider extension actions require an approved matching `approvalId`; read-only actions execute directly with `permissionAudit`.
- Workflow records expose status, timestamps, node events, result/error/degraded reason, retry, cancel, async start, and stale-run recovery.
- Speech is implemented as a half-duplex API-owned chat path. Interruptible/streaming voice remains future work.
- `personal.research` is active: it collects scoped local documents, bookmarks, imported sources, approved web fetches, and approval-gated Tavily search results; produces persisted cited reports; marks conflict/insufficient evidence; and can request approval to retain a selected claim as memory.
- The chat shell is the primary invocation surface: the Agent autonomously selects active read-only Skills when they materially improve an answer. Research, comparison, verification, and evidence requests route to `personal.research`; when local evidence is insufficient it may propose, but not execute, a scoped remote continuation that enters the approval queue.
- Skill catalog, workflow, memory, and approval panels are secondary discoverability, history, and audit surfaces. They do not provide a required per-Skill run flow.
- `research-eval.v1` contains 30 deterministic offline cases and reports source, evidence, citation, conflict, memory, and latency metrics.

## Active Priorities

1. Add a model-backed generic research planner and evidence-constrained provider synthesis to turn collected sources into inspectable decision support.
2. Use `crypto_investment` and `market_entry` only as fixture-backed validation examples; keep the planner and connector catalog domain-generic.
3. Add external connectors only with explicit source scope, approval behavior, fixtures, provenance, freshness, and unit/limit metadata.
4. Keep source scope, approvals, durable memory promotion, and research reports inspectable and reversible; optimize voice only after research reliability is evaluated.

## Current Gaps

- Research extraction is deterministic and heuristic-driven. Provider-assisted synthesis is intentionally degraded until a provider-backed, evaluated implementation is added.
- Research does not yet use a model to turn an open-ended question into a validated structured evidence plan. It therefore cannot reliably choose the market, on-chain, commerce, regulation, or competitive data required for a decision question.
- LangGraph is not needed for the immediate planner/profile implementation. Reassess it when connector fan-out, approval-resume checkpoints, or model revise/validate loops exceed the current workflow service's bounded synchronous model.
- Local JSON persistence is atomic but still single-process. Add durable checkpoints or a database only when concurrent/long-running research requires it.
- Remote web fetch is restricted to explicit `RESEARCH_WEB_ALLOWLIST` hosts and approval. Tavily web search is a separate approval-gated connector that requires `TAVILY_API_KEY`; add further providers only with the same source-specific policy, provenance, and fixture coverage.
- The web bundle remains above the Vite chunk-size warning threshold; code-split review panels when product usage justifies it.

## Verification Policy

Use `pnpm typecheck` and `pnpm build` for broad checks. Run smoke tests only for touched critical boundaries:

- `pnpm smoke:api`: gateway health, readiness, sessions, extensions, and degraded agent behavior.
- `pnpm smoke:web`: built renderer routes and stable shell anchors.
- `pnpm smoke:desktop`: Electron startup invariants that do not require GUI interaction.
- `pnpm smoke:runtime`: runtime adapter registry, capability catalog exposure, and deterministic Skill routing behavior.
- `pnpm smoke:memory`: memory lifecycle, retrieval, audit, conflict, and forget behavior.
- `pnpm smoke:extensions`: extension registry, read-only skills, approval-gated execution, and permission audit.
- `pnpm smoke:workflows`: workflow run/list/retry/cancel/node-event behavior.
- `pnpm smoke:speech`: API-owned STT/TTS/voice chat path with deterministic providers.

Avoid adding new smoke scripts for one-time milestones. Prefer focused unit/contract tests or extend an existing boundary smoke when the behavior is a lasting regression risk.

## Working Rules

- Keep this file short. It is not a changelog.
- Keep `ARCHITECTURE.md` for boundaries and module contracts.
- Keep `AGENTS.md` for future-agent operating instructions.
- Do not auto-write durable user facts, project facts, files, posts, or external-account changes without an auditable policy and user approval.
- Treat missing credentials and unavailable local/cloud services as normal degraded product states.
