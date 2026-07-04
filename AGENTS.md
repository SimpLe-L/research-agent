# AGENTS.md

## Project Mission

This repository implements a local-first personal agent prototype. The first-stage product is Electron as the shell, the local NestJS API as the Gateway/control plane, Pi as the Agent runtime base, and extensions/skills as the way to add domain capabilities over time.

The existing Web3 research workbench is valuable but is no longer the root product identity. Token research, risk inspection, evidence-backed Markdown reports, and local knowledge-base behavior should be migrated behind extensions/skills without deleting working code prematurely. The product does not execute trades.

## Current Architecture Direction

- Use TypeScript as the primary implementation language.
- Keep a pnpm monorepo with `apps/*`, `packages/*`, and later `workers/*`.
- Use NestJS as the local API process.
- Use React + TanStack Router + Tailwind for the renderer UI.
- Use Electron as the desktop shell when the renderer/API loop is stable.
- Use Drizzle schemas for PostgreSQL persistence.
- Keep Pi as the default Agent runtime behind an `agent-runtime` package boundary.
- Keep `packages/extensions` as the registry for core agent shell capabilities and app-specific skills.
- Keep Web3, market, report, and knowledge tools small and auditable; expose them as app-specific extensions/skills.
- Research execution defaults to the local API process, but can run as `RESEARCH_TASK_EXECUTOR_MODE=api_only` plus the separate `pnpm worker:research` process when PostgreSQL is available.
- Agent runtime defaults to Pi with `AGENT_RUNTIME_PROVIDER=pi`. The built-in Pi provider defaults to SiliconFlow `deepseek-ai/DeepSeek-V4-Flash` using `SILICONFLOW_API_KEY`. SiliconFlow direct mode is a legacy fallback, not the target architecture.
- Pi should become the personal agent coordinator: Agent session, model calls, controlled tool selection, and extension orchestration. App tools stay typed, permissioned, observable, and implemented outside prompts.
- Use `AGENT_SHELL_REFACTOR.md` as the active migration contract until Phase 1-5 are complete.

## Safety Rules

- Do not store or request private keys.
- Do not add wallet transaction, swap, transfer, or posting automation in v0.1.
- Do not invent market, chain, or social data. Missing data must be surfaced as a degraded reason.
- All high-risk or paid-provider access must remain explicit and configurable.
- Reports must preserve source/citation fields even when the source list is incomplete.
- Do not enable Pi built-in shell/file/edit/write/browser tools for the v0.x personal agent path.
- Existing code must not be deleted during refactor until the replacement path is verified. Mark old files with `LEGACY_REFACTOR_CANDIDATE: <reason>` before removal.

## Development Conventions

- Prefer small, typed modules with Zod schemas in `packages/shared`.
- Keep task graph nodes observable: status, started/completed timestamps, error, and payload.
- Treat degraded provider states as normal product behavior, not crashes.
- Update `PROCESS.md` after completing meaningful implementation steps.
- Keep `ARCHITECTURE.md` aligned whenever package boundaries or runtime processes change.
- Keep `AGENT_SHELL_REFACTOR.md` aligned when the refactor phase plan changes.
- When adding or migrating a capability, register it in `packages/extensions` before making it a first-class agent skill.
- Extension invocations must return `permissionAudit`; Pi shell tool calls may only execute read-only/search extension capabilities until a broader permission model is designed.
- Extension invocations that create or read task/report state must append compact `extension_invoked` events to the related research task event stream.
- Agent research sessions must enter through `/api/agent/research-sessions`, record `agent_research_session_started`, and keep the deterministic task graph as fallback until individual nodes are safely migrated into Pi-callable tools. Migrated nodes so far: `resolve_asset` through `resolve_research_asset`, `collect_sources` through `collect_research_sources`, `fetch_market_data` through `fetch_research_market_data`, `fetch_onchain_data` through `fetch_research_onchain_data`, `analyze_risk` through `analyze_research_risk`, `match_cases` / local knowledge search through `search_research_knowledge`, `write_report` through `write_research_report`, and `index_knowledge` through `index_research_knowledge`.
- When changing task execution behavior, verify both the default local queue path and the API-only + worker path when PostgreSQL is reachable. For agent session changes, include `pnpm smoke:api:agent-worker` so persisted `/api/agent/research-sessions` still use Pi-callable tools after crossing into the worker process.
- Preserve `GET /api/research/queue` visibility for both local in-process queue state and persisted PostgreSQL pending/running tasks; API-only mode must show work waiting for a worker.
- When changing renderer navigation or shell layout, preserve stable `data-testid` anchors and run `pnpm smoke:web:routes` after `pnpm build`; do not prioritize browser-level click automation unless UI regressions become a real blocker.
- Prioritize API/worker/database/RAG acceptance over UI automation. The next missing high-value smoke should prove token input -> report generation -> persistence -> knowledge/RAG search.
- When changing `packages/agent-runtime`, run `pnpm smoke:agent-runtime` and keep deterministic reports/task graph results as the fallback for missing keys, failed SDK calls, or invalid JSON output.
- When changing Pi runtime behavior, also run `pnpm smoke:agent-runtime:pi`; if `.env` has a valid SiliconFlow key, run `PI_LIVE_SMOKE=1 pnpm smoke:agent-runtime:pi`, `SMOKE_API_BASE=<pi-mode-api>/api pnpm smoke:api:pi-runtime`, and `SMOKE_API_BASE=<pi-mode-api>/api pnpm smoke:api:pi-research-rag`.
- Pi runtime tools must be app-specific, read-only by default, permissioned, and observable until a broader tool permission model is explicitly designed. Do not enable Pi built-in shell/file/edit/write tools for the v0.x agent path.

## Initial Development Order

1. Root refactor contract and handoff docs.
2. Core agent shell: Electron -> Local API Gateway -> Pi -> extension registry.
3. Extensionize existing research, market, reports, and knowledge capabilities.
4. Pivot renderer first screen to the local personal agent workspace.
5. Move Pi from report-stage drafting to permissioned extension/tool orchestration.
6. Clean up legacy files only after replacement paths are verified.
