# ARCHITECTURE.md

## Product Boundary

The application is being refocused into a local-first personal agent prototype. The first-stage product is the Electron shell plus a local API Gateway plus Pi as the Agent runtime base. Web3 research, token lookup, Markdown reports, and knowledge-base behavior remain valuable, but they move behind extensions/skills instead of defining the entire product shell.

The app does not trade, hold private keys, perform wallet actions, post to social platforms, or expose unrestricted shell/file/edit/browser tools. Existing research workbench code is mounted behind extension-owned capabilities. See `AGENT_SHELL_REFACTOR.md` for the completed migration contract.

## Process Model

Development target:

```text
pnpm dev
-> NestJS local API on PORT 4317
-> Vite React renderer on PORT 5173
-> Electron desktop shell loading the renderer
```

Runtime direction:

```text
Electron main
-> launches compiled Local API when health check is not reachable
-> React renderer calls Local API
-> API acts as local Gateway for agent turns, extension registry, provider status, queue visibility, and extension-owned app capabilities
-> Pi runtime handles personal-agent turns through app-specific read-only tools
```

Optional worker direction:

```text
API with RESEARCH_TASK_EXECUTOR_MODE=api_only
-> persists pending research tasks and exposes status/report APIs
Research worker with RESEARCH_TASK_EXECUTOR_MODE=worker
-> polls PostgreSQL for pending tasks
-> atomically claims one task before execution
-> runs the same task graph/provider/report pipeline outside the HTTP API process
```

Default development still uses `RESEARCH_TASK_EXECUTOR_MODE=local`, which keeps the previous single-process API behavior for fast local iteration.

The API and research worker load the repo-root `.env` through `apps/api/src/env.ts` before Nest modules are initialized. This keeps `pnpm --filter @sp-agent/api start`, `pnpm dev:api`, Electron-launched API, and `pnpm worker:research` aligned even when the process cwd is `apps/api` instead of the repository root. Explicit shell-provided environment variables still win over `.env` values.

## Workspace Layout

```text
apps/
  api/             NestJS local API
  web/             React renderer workbench
  desktop/         Electron main process
packages/
  shared/          Zod schemas and shared TypeScript types
  extensions/      extension/skill registry for the personal agent shell
  research-core/   task graph, risk scoring, report writer
  database/        Drizzle PostgreSQL schema
  agent-runtime/   Pi/provider boundary plus current SiliconFlow report drafting adapter
  data-connectors/ external data adapter boundary, initially stubs
workers/
  collector/       reserved for Playwright collection jobs
```

## Personal Agent Shell

The new first-stage control surface is:

- `GET /api/agent/status`: returns `mode=local_personal_agent`, Pi runtime status, safety policy, and registered extensions.
- `POST /api/agent/messages`: runs one local personal-agent turn. It uses Pi when configured and returns deterministic degraded output when Pi credentials or SDK calls are unavailable.
- `POST /api/agent/research-sessions`: starts an explicit Pi-coordinated research session, creates the underlying research task, records `agent_research_session_started`, returns the planned app-tool sequence, and keeps the deterministic task graph as fallback/audit backbone.
- `GET /api/extensions`: returns the extension registry and safety policy.
- `GET /api/extensions/:id`: returns one extension manifest.
- `POST /api/extensions/:id/invoke`: invokes a registered extension through a typed app adapter. Phase 2 currently supports `web3.research` task/report reads, `web3.market` snapshots, `local.knowledge` search/index/source search, and `local.reports` report/source reads. Every invocation response includes `permissionAudit` with `extensionId`, `capabilityId`, declared `permissions`, `allowed`, `mode=read_only|write_or_provider`, and a human-readable reason.
- `GET /api/extensions/web3.research/research/tasks/:taskId/events/stream`: extension-owned SSE route for research task event replay/live streaming. It stays as GET because browser `EventSource` cannot use POST `/invoke`.

The first extension registry lives in `packages/extensions`. It declares:

- `core.agent-shell`: active Phase 1 shell capability.
- `web3.research`: permissioned research task graph.
- `web3.market`: permissioned market snapshot path.
- `local.knowledge`: local report/source/vector knowledge base.
- `local.reports`: Markdown report library.

The registry is the app-owned capability map for the agent shell. Direct research, market, and knowledge HTTP controllers have been retired; extension invoke is the app-facing contract.

`core.agent-shell` also declares `agent.research_session`, which bridges from the generic personal-agent shell into a Pi-coordinated research workflow. This entry starts and audits the session. The `resolve_asset` node is exposed as the Pi-callable `resolve_research_asset` app tool, `collect_sources` is exposed as `collect_research_sources`, `fetch_market_data` is exposed as `fetch_research_market_data`, `fetch_onchain_data` is exposed as `fetch_research_onchain_data`, `analyze_risk` is exposed as `analyze_research_risk`, `match_cases` / local knowledge search is exposed as `search_research_knowledge`, `write_report` is exposed as `write_research_report`, and `index_knowledge` is exposed as `index_research_knowledge`; if Pi is unavailable, the model does not call a tool, or a tool fails, the deterministic/provider/local runner remains the fallback.

Current extension adapter coverage:

- `web3.research`: `research.create_task`, `research.list_tasks`, `research.queue_status`, `research.list_events`, `research.get_task`, `research.get_report`, `research.cancel_task`, `research.retry_task`.
- `web3.market`: `market.snapshot`, `market.list_snapshots`.
- `local.knowledge`: `knowledge.search`, `knowledge.index_report`, `knowledge.delete_report_vector`, `knowledge.search_sources`, `knowledge.get_source`.
- `local.reports`: `reports.read`, `reports.read_one`, `reports.read_sources`, `reports.read_annotations`, `reports.upsert_annotation`, `reports.delete_annotation`.

The duplicate legacy research, market, and knowledge HTTP controllers have been removed. The extension invoke layer and extension-owned stream route are now the app-facing contracts for agent/skill orchestration. The renderer and smoke scripts use extension-owned API surfaces for research task lifecycle, research event reads/SSE, task report reads, report reads/search, source search/detail, report-source reads, report annotations, market latest/analyze/list snapshots, knowledge indexing, and report vector delete.

When an extension invocation creates or reads research task/report state, the API appends an `extension_invoked` event to the relevant research task event stream. The event payload records the extension id, capability id, declared permissions, permission mode, allowed flag, invocation status, and small metadata such as `reportId`, `inputKeys`, or result count. It does not persist full result bodies in the task event log.

The personal-agent Pi shell can inspect the extension registry and may invoke extension capabilities only through the API-owned `invoke_extension_capability` tool. The API denies non-read-only capabilities for this shell path, returning the permission audit and a degraded reason instead of executing provider/write/task actions. Direct HTTP clients can still call write/provider extension capabilities such as `research.create_task` through `/api/extensions/:id/invoke`; those calls carry `permissionAudit.mode=write_or_provider` and remain explicit API actions.

## Desktop Startup

The Electron main process is now responsible for local API orchestration:

- Check `API_BASE_URL` or `http://localhost:${PORT}/api`.
- If `GET /health` is reachable, reuse the existing API process.
- If not reachable, spawn the compiled Nest API entrypoint with `ELECTRON_RUN_AS_NODE=1`.
- In development, load `RENDERER_URL` or `http://127.0.0.1:5173`.
- In production/no renderer URL mode, load `apps/web/dist/index.html`.

The renderer build uses relative Vite assets so `BrowserWindow.loadFile` can load the static bundle. In development, Electron first tries the configured renderer URL; if that URL is not reachable, it falls back to `apps/web/dist/index.html`. This makes `pnpm dev:desktop` usable after a build even when Vite is not running.

Electron binary installation is reproducible through the root `pnpm electron:install` script, which uses the Electron mirror configured in `.npmrc` and writes the download cache to `.electron-cache`.

## Renderer Workbench

The React renderer is now organized as a true operational workbench instead of one static dashboard. The left navigation owns these first-level views:

- Chat: message thread plus the active research task handoff.
- Research: task list, node-event timeline, cancel/retry controls, and selected report.
- Market: latest persisted market snapshot, analysis trigger, degraded reasons, and snapshot history.
- Knowledge: report/source search, degraded-source filter, source detail, cross-report usage history, vector maintenance, and manual report annotations.
- Watchlist: manual token watch items with note/risk labels and a shortcut to run research.
- Reports: generated report library, linked source evidence, Markdown copy, and `.md` download.
- Settings: provider status, readiness checklist, env setup reference, data-retention preview/dry-run, and readiness action shortcuts.

Readiness actions are UI-only shortcuts over existing API surfaces: CoinGecko opens Market analysis, EVM/Arkham setup opens Research with an EVM address example, holder concentration opens Knowledge with degraded-source filtering enabled, and SiliconFlow opens Knowledge search. The env setup reference only shows variable names and empty `KEY=` placeholders; it does not read, store, or transmit secret values.

The renderer uses TanStack Router for first-level URL state:

- `/chat`
- `/research`
- `/market`
- `/knowledge`
- `/watchlist`
- `/reports`
- `/settings`

The route currently selects the active workbench view while the view data remains in local component state. Stable view and panel modules now own Research task panels, Market snapshots, Knowledge source/report search, Watchlist editing, Reports library/rendering, Settings readiness/retention, and shared report/readiness panels. This keeps refreshable/deep-linkable first-level navigation while avoiding a monolithic renderer shell.

The renderer exposes stable test anchors for the shell, nav items, first-level views, queue/task panels, readiness/env panels, and report actions. `pnpm smoke:web:routes` starts a production Vite preview and verifies all first-level routes return the React shell, built JS/CSS assets are reachable, and key test markers exist in the production bundle. Full browser click-through automation is intentionally low priority for now because the primary acceptance path is API/worker/database/RAG correctness: token input -> report generation -> persistence -> knowledge search/vector indexing.

Startup data fetches degrade locally when the API is unavailable or an endpoint fails. The top status button falls back to `API unavailable`, list-style panels remain empty instead of throwing, and the user can still navigate the shell.

## Core Flow

```text
User input
-> Local API persists a pending research task and returns it immediately
-> In-process research queue starts execution when capacity is available
-> Task graph executes typed nodes in the API process
-> Each node emits events that are persisted and pushed over SSE
-> Risk and deterministic report modules produce structured output
-> Historical-case matcher compares the current asset against persisted reports
-> agent-runtime optionally drafts a clearer report from the deterministic report
-> Report is stored and exposed to UI
-> Report and sources are indexed into LanceDB when embedding credentials are available
```

## Research Task Graph

Initial v0.1 graph:

```text
resolve_asset
-> collect_sources
-> fetch_market_data
-> fetch_onchain_data
-> analyze_project
-> analyze_risk
-> match_cases
-> write_report
-> validate_report
-> index_knowledge
```

Some nodes intentionally degrade until real providers are configured. The task must still finish with a visible `missing_data` risk component and a report that states what was not fetched.

The `match_cases` node now uses persisted report history as a local case library. It scores prior reports against the current asset input, symbol/name/address/chain, and source hints, emits matched cases in the node payload, feeds `hasSimilarCases` into risk scoring, and renders the top cases in the report. If no reports exist or no explainable text match is found, the node degrades explicitly instead of inventing a case.

The `collect_sources` node now produces auditable source candidates rather than bare URLs. A source candidate can include `fetchedAt`, `statusCode`, `snippet`, and `degradedReason`. DefiLlama protocol API matches are preferred for a stable `status=200` protocol evidence item; webpage candidates are still attempted through Node `fetch` with a constrained `curl` fallback and can degrade explicitly when Cloudflare/login/network blocks the page.

Task observability has two layers:

- `research_task_events` remains the append-only audit log and SSE replay source.
- `nodeRuns` is derived from events on API reads and includes every task node with `status`, `startedAt`, `completedAt`, `durationMs`, `error`, and latest `payload`.

This keeps historical tasks observable without a migration while giving the renderer a stable node summary for the Research page.

Task scheduling is now behind `ResearchTaskQueueService`. The current implementation is an in-process memory queue with configurable concurrency through `RESEARCH_TASK_QUEUE_CONCURRENCY` and observable status through `GET /api/research/queue`. The `web3.research/research.create_task` extension capability persists a `pending` task snapshot before enqueueing. The local queue de-duplicates task ids within the API process. Before a queued job enters the task graph, PostgreSQL-backed execution atomically claims the task with `status='pending' -> 'running'`; if another process already claimed or cancelled the task, the local job exits without running the graph. Memory fallback still marks the task running locally. When PostgreSQL is reachable, queue status also includes persisted pending/running task counts and task ids so API-only mode can show work waiting for a separate worker even though the API process has no local queued jobs.

This boundary now supports three executor modes:

- `local`: default. The API persists pending tasks and executes them through its in-process queue.
- `api_only`: the API persists pending tasks and returns `queued=false`; it emits `task_waiting_for_worker` and does not execute the task.
- `worker`: `apps/api/src/worker.ts` creates a Nest application context without HTTP, recovers interrupted work, polls PostgreSQL for pending tasks, emits a worker/startup queue event, and executes tasks after atomic claim.

When PostgreSQL is reachable, startup recovery keeps persisted `pending` tasks on their original task id, emits `task_requeued_after_restart`, and re-enqueues them for atomic claim. Persisted `running` tasks from an interrupted process are still marked failed and automatically retried into a fresh resumed task from the latest completed checkpoint. The worker is a real separate process boundary, but scheduling is still PostgreSQL polling rather than BullMQ, pg-boss, or a dedicated queue backend.

Agent research sessions are process-boundary safe: the API records `agent_research_session_started` before returning from `/api/agent/research-sessions`, and the worker treats that persisted event as the durable marker that the task should use Pi-callable app-tool adapters. This avoids relying on the API process's in-memory session id set after a task crosses into `RESEARCH_TASK_EXECUTOR_MODE=worker`.

## Pi Agent Runtime

`packages/agent-runtime` is the boundary for Pi-backed Agent behavior. Pi is the intended Agent harness for sessions, model calls, controlled tool invocation, and final report synthesis. The app layer owns the typed tools, permissions, persistence, task observability, and degraded-provider behavior.

The default runtime is:

- `AGENT_RUNTIME_PROVIDER=pi`
- `PI_MODEL_PROVIDER=siliconflow`
- `PI_MODEL_ID=deepseek-ai/DeepSeek-V4-Flash`
- `SILICONFLOW_API_KEY` as the default Pi model key source

SiliconFlow direct drafting still exists as a legacy fallback selected explicitly with `AGENT_RUNTIME_PROVIDER=siliconflow`. It is not the target architecture.

The current correction restores Pi as the default runtime and starts the tool migration at the report-synthesis boundary. The deterministic task graph still collects evidence and remains the execution fallback/audit backbone. When Pi drafts the final report, `agent-runtime` registers only two app-specific read-only custom tools:

- `inspect_research_context`: returns the structured research snapshot collected by the API task graph.
- `inspect_deterministic_report`: returns the deterministic Markdown report that remains the audit source of truth.

Built-in Pi file, shell, edit, write, grep, find, and ls tools are disabled for this product path. The report-synthesis event records the active tool allowlist and any Pi tool calls in the task event payload. Current SiliconFlow/Pi live smoke shows the tools are exposed; model tool calls are optional, so `toolCalls` can be empty for a successful run.

Pi report drafting deliberately returns a concise Markdown body rather than strict JSON. Earlier strict-JSON drafting was fragile because long Markdown strings could be malformed by model output. The deterministic task graph remains responsible for the authoritative summary, recommendation, confidence, full source appendix, and degraded-provider audit. Pi is used to improve the human-readable report body, then `research-core` appends the deterministic appendix.

Full Pi tool orchestration is still being migrated. The next runtime milestone is to expose the existing typed capabilities as permissioned Pi tools:

- `resolve_asset`
- `collect_sources`
- `fetch_market_data`
- `fetch_onchain_data`
- `analyze_risk`
- `search_knowledge`
- `write_report`
- `index_knowledge`

The migrated node tools are `resolve_research_asset`, `collect_research_sources`, `fetch_research_market_data`, `fetch_research_onchain_data`, `analyze_research_risk`, `search_research_knowledge` for local case matching, `write_research_report`, and `index_research_knowledge`. The `analyze_risk` node records the deterministic current-context score; the final report still recalculates risk after `match_cases` when local cases change the input. The `write_report` node keeps the deterministic report and appendix as the audit source of truth, while Pi may rewrite the concise body. The `index_knowledge` node delegates actual indexing to the app knowledge service and records explicit indexed/degraded state. Pi may choose and call these tools, but tools must remain implemented outside prompts, typed through shared schemas, observable through task events, and subject to the same safety rules. Pi must not receive wallet, transaction, posting, shell, or unrestricted filesystem tools in v0.x.

The legacy SiliconFlow direct fallback uses:

- `SILICONFLOW_API_KEY`
- `SILICONFLOW_BASE_URL`
- `SILICONFLOW_MODEL`
- `AGENT_RUNTIME_TIMEOUT_MS`

With `SILICONFLOW_API_KEY` configured, `local.knowledge/knowledge.index_report` has been verified to index existing reports into LanceDB, and `local.knowledge/knowledge.search` returns live vector hits with the internal seed row filtered out.

The Pi SDK path uses `@earendil-works/pi-coding-agent`:

- `PI_MODEL_PROVIDER`
- `PI_MODEL_ID`
- `PI_SILICONFLOW_MODEL`
- `PI_API_KEY` or the provider's standard API key environment variable
- `PI_AGENT_RUNTIME_TIMEOUT_MS`
- `PI_THINKING_LEVEL`
- `PI_WORKING_DIR`

When Pi is selected without explicit `PI_MODEL_PROVIDER` / `PI_MODEL_ID`, `agent-runtime` dynamically registers a custom Pi provider named `siliconflow` and defaults to `deepseek-ai/DeepSeek-V4-Flash`. This provider uses SiliconFlow's OpenAI-compatible chat completions endpoint, `SILICONFLOW_BASE_URL`, and `SILICONFLOW_API_KEY`; `PI_API_KEY` can still override the runtime key. The registered model disables `developer` role and `reasoning_effort` compatibility because SiliconFlow OpenAI-compatible models may not support those request fields.

The current Pi path creates an in-memory auth store and in-memory session manager, passes a selected model from Pi's model registry, disables built-in Pi tools, and registers the app-specific read-only research tools described above. The built-in SiliconFlow Pi model registration caps output at 2048 tokens, and the prompt asks for a short report body so live calls do not stall on full-report rewrites. The Pi prompt and `waitForIdle` phase are both bounded by the Pi-specific timeout: `PI_AGENT_RUNTIME_TIMEOUT_MS` when set, otherwise at least 120s even if the direct adapter's `AGENT_RUNTIME_TIMEOUT_MS` is lower. If the Pi package, model, key, timeout, or empty output fails, `agent-runtime` returns a degraded result and the deterministic report remains authoritative.

`getAgentRuntimeStatus()` is asynchronous because the Pi path performs local SDK and model-registry inspection. `/api/providers/status` exposes this as `agent-runtime` with the selected provider, configuration state, local SDK load state, selected-model availability, and available-model count. This status does not perform a live model call; live Pi readiness is verified through `PI_LIVE_SMOKE=1 pnpm smoke:agent-runtime:pi`, the current full API Pi report path is verified through `pnpm smoke:api:pi-runtime`, and the current Pi-report-to-RAG path is verified through `pnpm smoke:api:pi-research-rag`.

Report generation is deliberately fallback-first:

- `research-core` always creates a deterministic Markdown report from structured task data.
- `agent-runtime` uses Pi by default to synthesize the final report when Pi and model credentials are configured.
- `agent-runtime` may use the legacy SiliconFlow direct adapter only when explicitly selected.
- If the LLM key is missing, the request fails, or the JSON output contract is incomplete, the task records `agent_report_degraded` and saves the deterministic report.
- If the LLM draft succeeds, the final Markdown appends a deterministic data-source/degraded-reason appendix. If the LLM body and appendix conflict, the appendix is authoritative.

## API Surface

Implemented:

- `GET /api/health`
- `GET /api/settings`
- `PUT /api/settings`
- `GET /api/settings/readiness`
- `GET /api/settings/retention/preview`
- `POST /api/settings/retention/prune`
- `GET /api/providers/status`
- `POST /api/providers/verify`
- `GET /api/research/queue`
- `GET /api/extensions`
- `GET /api/extensions/:id`
- `POST /api/extensions/:id/invoke`
- `GET /api/extensions/web3.research/research/tasks/:taskId/events/stream`
- `POST /api/chat/sessions`
- `GET /api/chat/sessions`
- `GET /api/chat/sessions/:id`
- `POST /api/chat/sessions/:id/messages`
- `GET /api/agent/status`
- `POST /api/agent/messages`
- `POST /api/agent/research-sessions`
- `POST /api/watchlist/items`
- `GET /api/watchlist/items`
- `PATCH /api/watchlist/items/:id`
- `DELETE /api/watchlist/items/:id`

Current task execution contract:

- `POST /api/extensions/web3.research/invoke` with `capabilityId=research.create_task` returns `{ task, queued: true }` with an initial `pending` task snapshot without waiting for the report.
- In `RESEARCH_TASK_EXECUTOR_MODE=api_only`, `research.create_task` returns `{ task, queued: false }`, persists the pending task, emits `task_waiting_for_worker`, and expects `pnpm start:worker:research` or `pnpm worker:research` to execute it.
- In `RESEARCH_TASK_EXECUTOR_MODE=api_only`, `POST /api/agent/research-sessions` also persists a pending task plus `agent_research_session_started`; worker execution must preserve the Pi-callable app-tool path and its `agentTool` event audit.
- `GET /api/research/queue` returns the queue mode, executor mode, concurrency, local pending/running counts, local task ids, persisted pending/running counts and task ids when PostgreSQL is reachable, and a mode-specific operational note.
- A queued job must atomically claim a persisted pending task before execution. Duplicate in-process enqueues are ignored, and duplicate cross-process claims return no task because the database row is no longer `pending`.
- `research.cancel_task` aborts active in-process execution cooperatively, marks the task `cancelled`, records a `task_cancelled` event, and closes live SSE subscribers with `done`.
- `research.cancel_task` also removes pending jobs from the in-memory queue before marking the task `cancelled`.
- `research.retry_task` creates a fresh task from the original task input, input type, question, and research options.
- `research.retry_task` can also accept `{ "resumeFromNode": "<node>" }`. The API extracts a checkpoint from the original task events, creates a new task with `options.resumedFromTaskId`, emits `task_resumed_from_checkpoint`, marks earlier nodes as `node_skipped`, and starts execution at the requested node.
- `GET /api/extensions/web3.research/research/tasks/:taskId/events/stream` replays existing events and stays open for live events while the task is running.
- On API startup with PostgreSQL reachable, persisted `pending` tasks from a previous process keep the same task id, receive `task_requeued_after_restart`, and are re-enqueued into the local queue. Persisted `running` tasks are marked `failed`, receive a `task_recovered_failed` event, and are automatically re-queued into a fresh resumed task from the next node after their latest completed node. The original running task receives `task_auto_resume_queued` with the resumed task id. Manual retry through the retry endpoint remains available.
- Reports become available through `research.get_report` after the task emits final report/knowledge events.
- Chat-triggered research follows the same async path and returns an assistant placeholder containing the task id. The renderer listens to the task SSE stream, fetches the completed report, opens it in the workbench, and persists a final assistant summary message back into the chat session with the task id, report id, recommendation, confidence, and report summary. `pnpm smoke:api:chat` verifies this handoff contract without a browser by creating a session, posting a research-triggering user message, waiting for the task report, writing the same final assistant summary shape, and re-reading the session.
- Watchlist items can be created, listed, edited, deleted, and used as research shortcuts. Deleting a watchlist item removes only the watchlist row, not historical reports or task records.

## Data Boundary

PostgreSQL is the primary structured store. `packages/database` owns Drizzle table definitions for tasks, events, tokens, reports, report annotations, source documents, risk assessments, market snapshots, and watchlist items.

When a report is saved, hydrated source candidates from `collect_sources` are also upserted into `source_documents` using a stable URL hash id, then linked through `report_sources` with `usage_type='candidate'`. The stored document keeps title, URL, source type, snippet text, content hash, fetched timestamp, provider, status code, and degraded reason metadata.

The workbench report panel reads report sources through `local.reports/reports.read_sources` and displays persisted report sources above the Markdown body, so source audit state is visible even before reading the full generated report.

The Knowledge panel also reads `local.knowledge/knowledge.search_sources` to show a reusable source-document index with text search, report reuse counts, and a degraded-only filter. Clicking a source reads `local.knowledge/knowledge.get_source`, shows source detail, and lists all linked reports so cross-report source reuse is auditable.

Manual report annotations are stored in `report_annotations` and exposed through `local.reports` capabilities. The current UI keeps one editable annotation per report with comma-separated tags, an optional note, and optional manual confidence. These annotations are local case-library metadata; deleting an annotation does not delete the report, task, sources, or vector row.

The first runnable skeleton can operate in memory. Persistence is now available for task/report/source history. Queue execution can now run either inside the API process or inside a separate worker process backed by PostgreSQL polling, atomic claim, and persisted queue status. The remaining production-grade queue decision is whether to keep this local-first polling model or introduce BullMQ/pg-boss for multi-worker scheduling, delayed jobs, or stronger operational controls.

Data retention is exposed through Settings. `GET /api/settings/retention/preview?days=N` counts old research tasks, reports, chat sessions, market snapshots, and unlinked source documents without modifying data. `POST /api/settings/retention/prune` defaults to `dryRun=true`; `dryRun=false` is required for actual pruning. The renderer currently exposes preview and dry-run only, keeping destructive deletion out of the normal UI path.

## Knowledge And Vector Search

Knowledge search has two layers:

- PostgreSQL text search over persisted reports.
- LanceDB local vector search over report embeddings.

The API keeps this behind `KnowledgeService` and `LanceDbVectorStore`, so the vector backend can later be replaced by Milvus without changing report generation, chat, or research APIs.

Embedding generation is provider-gated:

- If `SILICONFLOW_API_KEY` is configured, reports are embedded through the OpenAI-compatible `/embeddings` endpoint and indexed into LanceDB.
- If the key is missing or embedding fails, the API still saves reports and returns SQL search results with an explicit degraded reason.
- `local.knowledge/knowledge.index_report` rebuilds LanceDB entries for existing reports after embedding credentials are added later. Reindexing deletes the previous row for each report vector id before writing the refreshed embedding so repeated runs do not intentionally duplicate report vectors.
- `knowledge.index_report` with `reportId` rebuilds one report vector and returns either `indexed=true` or a degraded reason, which lets the UI retry a single report after a provider/key fix.
- `local.knowledge/knowledge.delete_report_vector` removes one report vector from LanceDB without deleting the persisted report, task history, or source links. It is safe to call even when no vector row exists.

## Provider Boundary

Provider adapters must return typed results with explicit degraded states:

```ts
{
  configured: boolean;
  reachable: boolean;
  degradedReason?: string;
}
```

Missing API keys, network failures, or unsupported chains should be rendered in UI and report output rather than hidden.

CoinGecko uses the free keyless public API by default:

- `COINGECKO_BASE_URL=https://api.coingecko.com/api/v3`
- `COINGECKO_API_KEY` is optional for future demo/pro upgrades.
- If an optional key is supplied, the connector sends `COINGECKO_API_KEY_HEADER` when set, otherwise `x-cg-demo-api-key` for the public base URL and `x-cg-pro-api-key` for the Pro base URL.

This keeps the v0.x market-data path runnable without blocking on a paid/provider key. Public API rate limits and network failures still degrade explicitly.

Source ingestion follows the same rule: a blocked webpage remains in the report with its URL, fetch timestamp, HTTP status when known, snippet when available, and degraded reason.

Settings exposes a provider readiness checklist through `GET /api/settings/readiness`. This checklist maps capabilities to required environment variables, copyable `.env` template blocks, current readiness state, and the next manual action. The renderer uses it in Settings so missing keys, manual Electron setup, and degraded provider templates are visible before running research tasks.

Settings also includes the research executor readiness item. It documents `RESEARCH_TASK_EXECUTOR_MODE=local` for the default single-process path and `RESEARCH_TASK_EXECUTOR_MODE=api_only` plus `pnpm worker:research` for the separate worker path.

Settings includes a Pi runtime readiness item. It is the expected default runtime path. It is `missing` when `AGENT_RUNTIME_PROVIDER=pi` is selected without a usable API key source, `degraded` when Pi is selected and configured but the SDK/model registry check fails, and `ready` when the selected Pi model exists locally with an API key source. With the default Pi provider, the key source is `SILICONFLOW_API_KEY` and the model is `siliconflow/deepseek-ai/DeepSeek-V4-Flash`. Provider readiness still does not imply a live model response; use `PI_LIVE_SMOKE=1 pnpm smoke:agent-runtime:pi` after filling real credentials.

Arkham and holder concentration remain template-driven because account/API plans can expose different endpoint shapes. Readiness returns safe placeholders and supported template tokens instead of hard-coding unverified private endpoint paths. Arkham templates support `{baseUrl}`, `{address}`, `{chain}`, and `{apiKey}`. Generic holder templates support `{address}`, `{chain}`, `{chainId}`, and `{apiKey}`; the Etherscan holder preset uses the connector's `token/topholders` request builder.

## Contract Risk Boundary

The current Viem contract-risk adapter performs read-only ERC20 metadata reads, bytecode existence checks, proxy/upgrade pattern detection, `owner()` / `paused()` reads when available, and static selector scans for mint, pause, owner/admin, upgrade, blacklist/freeze, tax/fee, trading gates, DEX pair/LP routing, and MaxTx/MaxWallet controls.

The EVM RPC path has been verified against a Base USDC contract smoke: ERC20 metadata returns `USDC`, the resolved execution chain is `base`, and contract bytecode is present. This verifies the provider path beyond a simple RPC ping while keeping all reads non-mutating.

Selector matches are triage signals, not source-code audit results. The report must keep them framed as capability hints until live parameters, verified source, LP lock/liquidity, and top-holder concentration data are also available.

DEX liquidity is collected through DEX Screener token-pair data. The connector first uses Node HTTP fetch and falls back to a constrained `curl` JSON GET when this local Node runtime cannot complete the request. Holder concentration is provider-template driven through `HOLDER_CONCENTRATION_*` settings so account-specific APIs can be configured without changing task graph code.

The first holder preset is Etherscan v2 `token/topholders`. It is gated by `HOLDER_CONCENTRATION_PROVIDER=etherscan` and `ETHERSCAN_API_KEY`, and remains explicitly degraded until an eligible Standard/PRO key is available. Etherscan holder quantities are reported as balances; concentration percentages are only used when a provider returns percentage fields.
