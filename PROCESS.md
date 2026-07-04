# PROCESS.md

## Current Project State

The product direction has been corrected. The first stage is now a local-first personal agent prototype, not a Web3 research workbench as the only product surface. The intended core loop is:

```text
Electron shell
-> Local API Gateway
-> Pi runtime base
-> permissioned app tools
-> extensions / skills
```

The existing Web3 research loop now works as an extension-owned capability:

```text
Token address / symbol / project input
-> persisted research task
-> queue or worker execution
-> observable task-node events
-> Markdown research report
-> persisted report/source/task history
-> Knowledge search and optional LanceDB vector indexing
-> Web/Electron workbench display
```

The current gap is not a missing UI automation layer or another provider adapter. The main remaining work is to finish the personal agent shell pivot, then migrate existing research/market/report/knowledge paths behind explicit extensions/skills.

## Definition Of Complete

Phase 1 should be considered complete when these conditions are true:

- Electron can launch the local API/renderer loop for normal desktop use.
- `GET /api/agent/status` exposes the local personal-agent mode, Pi runtime readiness, safety policy, and extension registry.
- `POST /api/agent/messages` can run a local personal-agent turn through Pi when configured and deterministic degraded output when not configured.
- Built-in Pi shell/file/edit/write tools remain disabled for the product path.
- Web3 research, market, reports, and knowledge are visible as extensions/skills, not the root product identity.
- Existing code is not deleted until the new extension path is verified.

The broader v0.x research capability should be considered complete when these conditions are true:

- A user can provide a token contract address or symbol and receive an evidence-backed Markdown report without manual intervention.
- The report is persisted and automatically becomes available to the local knowledge base / RAG search.
- Missing provider data is always shown as a degraded reason; the app never invents market, chain, social, holder, or source data.
- With real credentials configured, market data, EVM reads, embeddings, Pi runtime synthesis, holder concentration, and Arkham-compatible address intelligence can be verified through smoke scripts.
- The app can run in the default local API mode, and the API-only plus worker mode remains available when PostgreSQL is reachable.
- Electron can launch the local API/renderer loop for normal desktop use.

## Implemented

- Monorepo: `apps/api`, `apps/web`, `apps/desktop`, `packages/shared`, `packages/research-core`, `packages/database`, `packages/data-connectors`, `packages/agent-runtime`.
- Refactor contract: root `AGENT_SHELL_REFACTOR.md` defines the Electron + Local API Gateway + Pi + extensions target, migration phases, and no-delete-until-verified rule.
- Extension registry: `packages/extensions` now declares `core.agent-shell`, `web3.research`, `web3.market`, `local.knowledge`, and `local.reports` with phase/status/capability/permission metadata.
- Agent shell API: `GET /api/agent/status` returns `mode=local_personal_agent`, Pi runtime status, safety policy, and extension registry. `POST /api/agent/messages` runs one personal-agent turn through Pi when configured, with deterministic degraded output when not configured.
- Agent research session API: `POST /api/agent/research-sessions` starts a Pi-coordinated research session through the local API, records `agent_research_session_started` with the planned app-tool sequence, and keeps the deterministic research task graph as the fallback/audit backbone. Migrated node tools now include `resolve_research_asset`, `collect_research_sources`, `fetch_research_market_data`, `fetch_research_onchain_data`, `analyze_research_risk`, `search_research_knowledge`, `write_research_report`, and `index_research_knowledge`.
- Extension API: `GET /api/extensions`, `GET /api/extensions/:id`, and `POST /api/extensions/:id/invoke` provide the unified extension surface. Adapters support `web3.research` task/event/report operations, `web3.market` snapshots, `local.knowledge` search/index/source/vector operations, and `local.reports` report/source/annotation operations. Invocation results include `permissionAudit` metadata with `mode=read_only|write_or_provider`. Invocations that create or read task/report state append `extension_invoked` events to the relevant research task event stream. `pnpm smoke:api:extensions` verifies extension -> research task -> report -> local reports -> knowledge search plus the audit modes/events.
- Pi personal-agent turn: `packages/agent-runtime` now supports a generic shell turn using `inspect_extension_registry` and `invoke_extension_capability` as app-specific tools while keeping built-in shell/file/edit/write tools disabled. The API agent shell only permits read-only/search extension invocations through this Pi tool path.
- Renderer pivot: `/chat` now renders the local personal agent shell with Pi status, agent conversation, and extension registry. Legacy research execution moved back to the `Research Skill` route and no longer dominates the first screen.
- API: health, provider status/verify, readiness/retention, extension invoke, extension-owned research SSE, queue status, chat sessions, agent research sessions, watchlist CRUD.
- Research task graph: asset resolution, source collection, market data, on-chain data, risk analysis, historical-case matching, report writing, validation, and knowledge indexing.
- Persistence: PostgreSQL-backed tasks, events, reports, report annotations, source documents, market snapshots, and watchlist items, with memory fallback where appropriate.
- Queue/runtime: default in-process queue, PostgreSQL atomic claim before execution, pending requeue on startup, interrupted-running recovery, and separate `RESEARCH_TASK_EXECUTOR_MODE=api_only` plus `pnpm start:worker:research` worker path. PostgreSQL-backed worker verification now includes both normal research tasks and `/api/agent/research-sessions` tasks.
- Provider boundaries: Pi Agent runtime, SiliconFlow model provider, EVM RPC, CoinGecko, DefiLlama, DEX Screener, Arkham-compatible templates, holder-provider templates, and LanceDB embeddings all degrade explicitly when unavailable.
- Pi default runtime has been restored in `.env`, `.env.example`, `agent-runtime`, Settings readiness, and handoff docs. Pi now registers read-only app research tools (`inspect_research_context`, `inspect_deterministic_report`) during report synthesis while keeping built-in Pi file/shell/edit tools disabled. Pi drafting returns a concise Markdown body; deterministic summary/recommendation/confidence plus the complete source/degraded appendix remain authoritative. `pnpm smoke:agent-runtime:pi`, `PI_LIVE_SMOKE=1 pnpm smoke:agent-runtime:pi`, `SMOKE_API_BASE=http://localhost:4393/api pnpm smoke:api:pi-runtime`, and `SMOKE_API_BASE=http://localhost:4395/api pnpm smoke:api:pi-research-rag` passed with `siliconflow/deepseek-ai/DeepSeek-V4-Flash`. The current post-node-migration verification also passed on the default local API port with `pnpm --config.verify-deps-before-run=false typecheck`, `pnpm --config.verify-deps-before-run=false build`, `pnpm --config.verify-deps-before-run=false smoke:api:extensions`, `pnpm --config.verify-deps-before-run=false smoke:api:pi-runtime`, and `pnpm --config.verify-deps-before-run=false smoke:api:pi-research-rag`. With Docker PostgreSQL reachable, `pnpm --config.verify-deps-before-run=false smoke:api:worker`, `pnpm --config.verify-deps-before-run=false smoke:api:agent-worker`, and `pnpm --config.verify-deps-before-run=false smoke:api:pending-requeue` passed.
- CoinGecko v0.x path uses the keyless public API by default and is covered by `pnpm smoke:api:coingecko-public`.
- Knowledge/RAG: reports are stored, source documents are linked, global and per-report vector indexing is available, and search can use SQL plus LanceDB when embeddings are configured. `pnpm smoke:research-rag` verifies token input -> report generation -> persistence -> knowledge search -> source linkage -> vector indexing/degraded reason.
- UI: Chat, Research, Market, Knowledge, Watchlist, Reports, and Settings views are routed with TanStack Router. Research, Market, Knowledge, and Reports panels are extension workspace surfaces backed by extension-owned API calls while preserving stable `data-testid` anchors.
- Desktop: Electron can launch the compiled API and load the renderer, with static-build fallback when Vite is not running.
- Phase 5 cleanup: the duplicate direct research, market, and knowledge HTTP controllers were removed after scripts/UI migrated to extension invoke. `GET /api/research/queue` remains as an operational queue visibility endpoint for local/API-only/worker mode.
- Post-cleanup docs/code hygiene: obsolete root `design.md` was removed; extension manifests now mark `web3.research`, `web3.market`, `local.knowledge`, and `local.reports` as active extension surfaces instead of legacy modules; Electron startup and a plain `/api/agent/messages` conversation were verified without creating a research task.

## Remaining Completion Gaps

### 1. Provider Credentials And Live Data Validation

Status: blocking for full live-data confidence, not blocking for local degraded operation or the agent shell pivot.

Needed:

- CoinGecko first version uses the free keyless public API at `https://api.coingecko.com/api/v3`; `pnpm smoke:api:coingecko-public` has verified provider reachability and BTC/ETH market analysis through this path.
- Fill eligible holder-provider credentials, currently usually `HOLDER_CONCENTRATION_PROVIDER=etherscan` plus `ETHERSCAN_API_KEY`, and verify top-holder concentration for a supported token.
- Fill `ARKHAM_*_URL_TEMPLATE` values that match the user's actual Arkham-compatible account/API shape.
- Keep EVM RPC and SiliconFlow credentials valid, then rerun live-provider smoke after related changes.

Reason not complete:

Holder concentration and Arkham-compatible intelligence require user-owned keys, provider account permissions, and sometimes provider-specific endpoint templates. The project must not fake these values or hard-code unverified private endpoints. CoinGecko is intentionally keyless for v0.x, but the public API is rate-limited and can still degrade on network/rate-limit failures.

### 2. External Worker Product Decision

Status: functional today, product decision still open.

Needed:

- Decide whether the current PostgreSQL-polling worker is enough for v0.x local-first usage.
- Only introduce BullMQ, pg-boss, or another dedicated queue backend if multi-worker scheduling, delayed jobs, retries, or stronger operational visibility become real requirements.

Reason not complete:

The current worker boundary is already useful and verified. A heavier queue backend adds dependency and operational complexity, so it should be justified by actual product needs.

### 3. Provider-Specific Parsing Hardening

Status: ongoing hardening after live keys/templates are available.

Needed:

- Validate CoinGecko asset resolution on ambiguous symbols.
- Validate Arkham-compatible responses against real templates.
- Validate holder-provider response parsing and concentration calculation on supported tokens.
- Add fixture-based tests around provider response parsing once real response shapes are known.

Reason not complete:

Without real provider responses and account permissions, parser hardening would be speculative.

### 4. Electron/Desktop Packaging Readiness

Status: launch loop exists; packaging polish remains optional.

Needed:

- Decide whether v0.x needs a packaged desktop app or only local `pnpm dev:desktop` / compiled launch.
- If packaging is needed, add installer/build steps and a desktop smoke focused on API startup, renderer load, and persistent data location.

Reason not complete:

The current local-first development loop works. Packaging is a distribution concern, not a blocker for research/RAG correctness.

## Optimization Backlog

These are useful improvements but should not outrank the core research-to-RAG and live-provider validation work.

1. Split remaining large renderer orchestration only where a stable feature boundary exists. Avoid splitting state prematurely just to reduce line count.
2. Improve Knowledge UX around report/source reuse, degraded evidence filters, and manual annotations.
3. Improve report quality prompts and deterministic appendix formatting after live provider data is verified.
4. Add provider response fixtures for CoinGecko, holder concentration, and Arkham-compatible templates.
5. Add retention/pruning confirmation UI only if destructive local cleanup becomes a regular workflow.
6. Improve Settings readiness copy after the final provider list stabilizes.
7. Revisit queue backend selection only if the local PostgreSQL worker model proves insufficient.

## Lowest Priority

Browser-level click automation is intentionally lowest priority for this project right now.

Reason:

The product's critical path is API/worker/database/RAG behavior:

```text
input token
-> generate report
-> persist report and sources
-> index/search in knowledge base
```

That path should be verified primarily through API and worker smoke scripts, not through browser clicks. Browser automation is only worth adding later if UI interaction regressions become frequent or if the project needs CI coverage for full workbench click paths. Until then, keep `pnpm smoke:web:routes` as a lightweight route/bundle/test-marker check and use manual UI checks when changing navigation or layout.

## Verification Commands

Run before handing off meaningful code changes:

```bash
pnpm typecheck
pnpm build
```

Core smokes:

```bash
SMOKE_API_BASE=http://localhost:<port>/api pnpm smoke:api
pnpm smoke:api:chat
pnpm smoke:api:worker
pnpm smoke:api:agent-worker
pnpm smoke:api:pending-requeue
pnpm smoke:api:extensions
pnpm smoke:api:pi-research-rag
pnpm smoke:web:routes
pnpm smoke:research-rag
```

Live-provider smokes after `.env` is filled:

```bash
pnpm smoke:api:coingecko-public
pnpm smoke:api:live-providers
pnpm smoke:agent-runtime
pnpm smoke:agent-runtime:pi
PI_LIVE_SMOKE=1 pnpm smoke:agent-runtime:pi
AGENT_RUNTIME_PROVIDER=pi PORT=4380 pnpm --filter @sp-agent/api start
SMOKE_API_BASE=http://localhost:4380/api pnpm smoke:api:pi-runtime
SMOKE_API_BASE=http://localhost:4380/api pnpm smoke:api:pi-research-rag
```

Expected next engineering step:

```bash
validate provider-specific parsing when real Arkham/holder-provider responses are available
```

The invoke contract, permission audit metadata, task event audit records, research-session entry, provider-fetch tools, risk-analysis tool, local knowledge search tool, report-writing tool, knowledge-indexing tool, and PostgreSQL-backed worker verification now exist. Phase 5 direct-route cleanup is complete: research, market, and knowledge direct controllers are removed, scripts/UI use extension-owned API surfaces, and queue visibility remains available through `/api/research/queue`.
