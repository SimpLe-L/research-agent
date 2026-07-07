# PROCESS.md

## Current Project State

The active product is now a local-first personal Agent OS base. Old Web3/research workbench code has been removed from the active project.

The active core loop is:

```text
Electron shell
-> assistant-ui runtime/primitives chat
-> Local API Gateway
-> runtime adapter, initially Pi
-> permissioned extension registry
-> memory, skills, workflows
-> speech last
```

Active workspace packages:

- `apps/api`
- `apps/web`
- `apps/desktop`
- `packages/shared`
- `packages/extensions`
- `packages/agent-runtime`
- `packages/speech`

Detached reference code should not be restored into the active workspace unless it supports a new explicit personal-agent skill.

## Definition Of Complete

### v0.1 Personal Agent Base

Complete when:

- Electron launches the local API and renderer reliably for normal local use.
- The first screen is a simple assistant-ui runtime-backed chat surface.
- Chat sessions work locally and persist across API restarts.
- `GET /api/agent/status` exposes mode, runtime readiness, safety policy, extension registry, and degraded reasons.
- `POST /api/agent/messages` can run a personal-agent turn through the selected runtime when configured and a deterministic degraded response when not configured.
- Pi is the default runtime adapter, but `packages/agent-runtime` does not hard-code the whole architecture to Pi.
- Built-in Pi shell/file/edit/write/browser tools remain disabled.
- Extension/skill invocations are typed, permissioned, observable, and return `permissionAudit`.
- Old Web3/research routes, packages, registry entries, and smokes are detached from active development.

### v0.2 Memory Base

Complete when:

- A memory service exists for durable app-owned memory.
- Memory supports text search, source/provenance metadata, write candidates, and forget/tombstone behavior.
- The agent can retrieve relevant memory through a read-only memory tool.
- Durable memory writes are auditable and classified separately from read-only agent tools.

### v0.3 Skill And Workflow Base

Complete when:

- At least one non-voice personal-agent skill exists behind the extension boundary.
- The skill can be invoked through the API with permission audit.
- If LangGraph is introduced, it is wrapped inside the skill and does not bypass API-owned permissions, memory, or provider readiness.
- Skill execution has focused API smoke coverage.

### v0.4 Voice Base

Complete when:

- A speech package/service exists with STT and TTS provider adapters.
- The renderer can do half-duplex voice chat: record -> transcript -> agent message -> TTS audio -> playback.
- Raw audio is not persisted by default.
- Transcript/TTS/provider failures produce visible degraded reasons.
- Voice uses the same agent/session/memory/skill path as typed chat.

## Implemented

- Active workspace narrowed to API, web, desktop, shared contracts, extensions, and agent-runtime.
- Renderer first screen is assistant-ui runtime-backed chat on `/` and `/chat`.
- Default frontend chat calls `/api/agent/messages`; it no longer creates research tasks.
- API gateway exposes health, provider status, settings readiness, chat sessions, agent status/messages, and extension registry/invoke.
- API gateway exposes a local approval queue for write/provider/destructive-capability requests.
- API gateway exposes a local workflow runner for observable skill execution, including synchronous project-doc search, async queued start, retry, cancellation, and stale-run recovery.
- Extension registry exposes `core.agent-shell`, active `local.memory`, active `local.context`, active `local.project`, active `local.bookmarks`, and readiness-gated `local.speech`.
- `web3.research`, `web3.market`, report, knowledge, watchlist, queue, and worker routes are no longer active.
- Web3/research source packages, API modules, web components, and smoke scripts were deleted from the active checkout.
- Stale API-local runtime data directories `apps/api/.data` and `apps/api/.sp-agent-data` were deleted. Active local JSON fallback state belongs under `SP_AGENT_DATA_DIR` or root `.sp-agent-data`, and old LanceDB/Web3 `.data` files should not be recreated.
- Chat sessions persist to PostgreSQL when `DATABASE_URL` is configured, with local JSON fallback only when the database is unavailable.
- Frontend thread list is backed by API chat sessions through assistant-ui `RemoteThreadListRuntime` and `ThreadListPrimitive`.
- Frontend agent turns use assistant-ui `LocalRuntime` with a `ChatModelAdapter` that calls `/api/agent/messages/stream` and renders SSE deltas incrementally.
- Frontend thread history uses a thread-scoped assistant-ui `ThreadHistoryAdapter` that loads persisted API session messages.
- Frontend remote-thread creation now preserves the assistant-ui local thread id to API chat session id mapping, so agent turns and voice turns send the real remote session id instead of creating duplicate backend sessions with the same generated title.
- New assistant-ui threads render `New Chat` as the header and sidebar placeholder while the first response/title generation is pending, then replace it with the generated summary title.
- Frontend styling now has Tailwind CSS v4 and shadcn/base UI initialized in `apps/web`, with shadcn `button`, `sheet`, `tooltip`, and `dropdown-menu` components available.
- Tailwind CSS v4 now maps shadcn theme tokens through `@theme inline`, so shadcn/base UI popovers, dropdowns, sheets, and tooltips generate the expected background, foreground, border, ring, and radius utilities.
- The renderer chat shell now follows the official assistant-ui/shadcn style boundary more closely: `ThreadPrimitive`, `ComposerPrimitive`, thread list, sidebar, and header styling live mostly in component Tailwind classes, while `styles.css` is limited to Tailwind/shadcn setup, theme tokens, global resets, and project-specific approval/voice overlay styles.
- The assistant-ui shell now includes real desktop sidebar collapse, mobile sheet navigation, dynamic thread title, model dropdown shell, scroll-to-bottom control, basic message actions, and two-level welcome suggestions that can send prompts through the assistant-ui runtime.
- `PATCH /api/chat/sessions/:id` updates session titles for assistant-ui thread rename/title generation.
- `DELETE /api/chat/sessions/:id` deletes PostgreSQL-backed chat sessions and their messages.
- `POST /api/agent/messages` persists both user and assistant messages to the chat session.
- `POST /api/agent/messages/stream` returns real `text/event-stream` events for model deltas and persists the final assistant message when the runtime completes.
- Pi runtime configuration is intentionally scoped to SiliconFlow for now: `SILICONFLOW_API_KEY` is the only model-provider key path, and the misleading `PI_API_KEY` fallback was removed from runtime code, env templates, readiness copy, and smokes.
- `local.memory` is active with local JSON-backed write candidates, search, source/provenance metadata, promotion, update, merge, conflict detection/resolution audit events, stronger ranking signals, and tombstone deletion.
- Write/provider extension invocations return `pending_approval` and require an approved `approvalId` before execution.
- `packages/shared` now contains only generic agent/chat/settings/extension contracts.
- `packages/agent-runtime` now exposes a `RuntimeAdapter` registry; Pi is the default registered adapter and `local-deterministic` is available as a non-default offline fallback/registry verification adapter.
- Extension invocation in the API is handler-registry driven instead of hard-coded controller branches.
- `local.project` is the first practical read-only personal skill; it searches allowlisted project docs through the workflow runner.
- `local.bookmarks` is the first connector-backed read-only personal skill; it searches user-supplied local bookmark records from `connectors/bookmarks.json` under the app data directory and returns explicit degraded reasons when data is absent or unmatched.
- Workflows persist to local JSON with status, timestamps, node events, retry, cancellation, result, error, and degraded reason fields.
- Workflows can be started asynchronously through the API and stale pending/running records are marked failed with a truthful recovery degraded reason.
- `pnpm smoke:api` validates the active gateway and asserts `web3.research` is not registered.
- `.env` contains a SiliconFlow key and live Pi runtime verification passes.
- `pnpm smoke:api:pi-live` verifies the Nest API can call Pi/SiliconFlow and persist the live conversation.
- Browser-level built web verification passes against the live API: the page shows `Base ready`, sends a message, and renders a Pi response.
- Electron desktop issues found during GUI smoke were fixed: the shell no longer auto-loads a stale `127.0.0.1:5173` dev server, and the API child process now uses a real Node executable instead of Electron's Node mode so Pi SDK can load.
- Electron now stops its API child process when all windows are closed, including on macOS, so closing and reopening the desktop shell does not keep reusing an old in-memory API bundle during local development.
- Electron desktop registers DevTools shortcuts on the renderer window: `F12` and `Cmd/Ctrl+Option/Alt+I` toggle DevTools for local debugging.
- Electron GUI smoke now passes: `pnpm --filter @sp-agent/desktop start` opens the built assistant-ui Base screen, shows `Base ready`, exposes `pi` plus the extension count, sends a chat message, and renders a Pi/SiliconFlow response.
- `local.context` is the first non-voice read-only skill behind the extension boundary; `pnpm smoke:api:extensions` verifies registry, invocation, and permission audit.
- `pnpm smoke:desktop:preflight` protects Electron startup invariants without needing GUI approval.
- `pnpm smoke:desktop:api-child` verifies the same Node child-process strategy Electron uses can load the Pi SDK and read the extension registry.
- The renderer header shows the active extension count so the shell exposes extension capacity without adding a complex workbench UI.
- The renderer header includes an approval review entry with pending count, a right-side review panel, and approve/deny actions backed by `/api/approvals`.
- `packages/speech` defines STT/TTS provider adapter contracts with deterministic smoke adapters, explicit degraded states, `openai-audio-transcriptions-stt`, legacy `openai-compatible-stt`, self-hosted `gpt-sovits-api`, cloud `minimax-t2a-v2`, and cloud `mimo-v2.5-tts`.
- API voice endpoints exist for Phase 1 half-duplex chat: `GET /api/voice/status`, `POST /api/voice/transcribe`, `POST /api/voice/synthesize`, and `POST /api/voice/chat`.
- Voice chat reuses the existing agent message path after STT, so transcripts get normal session persistence, memory retrieval, runtime behavior, and skill boundaries.
- Voice transcript messages are persisted with provenance metadata (`source: voice`, `sttProvider`, `audioPersisted: false`), and raw audio is not persisted.
- `GET /api/settings/readiness` exposes dynamic `speech-stt` and `speech-tts` provider readiness.
- `GET /api/voice/audit` exposes local voice audit events for transcribe/synthesize requested, completed, and degraded states.
- Renderer composer mic opens a dedicated voice call overlay wired to the API-owned voice chat path with recording, sending, playing, transcript, assistant response, provider readiness, latest voice audit event, and degraded UI states. Missing speech providers keep typed chat usable and show a degraded voice state.
- `pnpm smoke:api:speech` verifies deterministic STT/TTS, dynamic `local.speech` readiness, settings readiness, voice audit events, voice chat session persistence, and audio non-persistence metadata.
- `pnpm smoke:speech:providers` verifies OpenAI audio transcriptions STT, legacy `openai-compatible-stt`, `gpt-sovits-api`, `minimax-t2a-v2`, and `mimo-v2.5-tts` against local mock HTTP providers, including request payloads, response parsing, binary audio handling, and degraded HTTP/provider-error/empty-response paths.
- `pnpm smoke:speech:live` is available for explicit live provider checks. It skips by default and only calls configured real STT/TTS providers when `SPEECH_PROVIDER_LIVE_SMOKE=1` is set.
- Speech provider setup is documented in `ARCHITECTURE.md`: either self-host FunASR STT plus GPT-SoVITS TTS, or use MiniMax/MiMo cloud TTS with an OpenAI-compatible transcription endpoint.
- Memory v2 is now the next active memory direction. It keeps memory API-owned and auditable while adding typed memory kinds inspired by voice-chat systems such as MoeChat: `core` for durable preferences/facts, `journal` for time-addressable conversation events, `summary` for compressed session/time-window context, `procedural` for reusable working habits, and `project` for project facts.
- Memory v2 should add temporal search, retrieval gating, and an explicit retrieval strategy layer before expanding into embeddings or external memory frameworks. `mem0`-style engines may be introduced later only as memory extraction/retrieval adapters behind the app-owned schema, approval, provenance, and audit model.
- LanceDB is the first optional Memory v2 vector backend. Keep it local-first under `MEMORY_LANCEDB_URI` or `SP_AGENT_DATA_DIR/lancedb`; SiliconFlow `BAAI/bge-m3` is the first real embedding provider, with deterministic embeddings retained for smoke/offline development when no `SILICONFLOW_API_KEY` is configured or `MEMORY_EMBEDDING_PROVIDER=deterministic` is set.

## Active Priority Order

The next development work should be sequenced in this order. Do not let lower-priority tracks expand before the higher-priority track has a usable product surface.

1. Memory system completion.
2. Memory review UI in the desktop shell.
3. Skills and workflow capability expansion.
4. Voice optimization and interruptible conversation.

### Priority 1: Memory System Completion

Goal:

- Make memory the first complete product capability, not just backend infrastructure.
- Preserve the two-layer memory model inspired by voice-chat memory systems such as MoeChat: Core Memory for stable user facts/preferences and Journal/long-term memory for time-addressable events and conversation history.
- Keep memory API-owned, searchable, auditable, reversible, and safe to expose to runtimes only through typed tools.

Current status:

- Backend Memory v2 already supports typed kinds: `core`, `journal`, `summary`, `procedural`, and `project`.
- Temporal fields and query filters exist through `occurredAt`, `from`, `to`, and retrieval strategies.
- SiliconFlow `BAAI/bge-m3` embeddings and optional LanceDB vector indexing exist, with deterministic fallback.
- Memory promotion, update, merge, conflict metadata, forget/tombstone, matched terms, ranking signals, and audit foundations exist.
- Core/Journal behavior is now explicit in backend retrieval: core/project/procedural memories use semantic-confidence ranking, journal/summary memories support temporal windows, and hybrid retrieval combines both layers.
- Journal search can infer basic relative time windows from query text such as `昨天`, `今天`, `上周`, `yesterday`, and `last week`.
- API endpoints exist to extract memory candidates from chat/voice sessions and to create inspectable session summary candidates.
- Voice-derived memory candidates preserve `source: voice`, `sttProvider`, `audioPersisted: false`, `sessionId`, and source message provenance.
- Memory search and agent retrieval now expose source snippets, citations, and lightweight retrieval debug metadata for user review and future agent-turn diagnostics.
- Memory extraction and session summarization now run through an API-owned memory intelligence boundary. The default provider is deterministic/rule-based; `MEMORY_INTELLIGENCE_PROVIDER=siliconflow` can enable optional LLM-backed extraction/summarization when explicitly configured.
- Memory consolidation suggestions now inspect candidate/active memories and propose merge inputs without mutating durable memory. The user still has to review and execute merge.

Remaining work:

1. Add a user-facing memory review UI so extracted candidates and summaries can be inspected before promotion.
2. Improve candidate extraction quality later with an optional LLM-backed extractor, while keeping rule-based extraction as the deterministic fallback. Done behind `MEMORY_INTELLIGENCE_PROVIDER=siliconflow`.
3. Improve session summarization later with an optional LLM-backed summarizer, while keeping rule-based summaries inspectable. Done behind `MEMORY_INTELLIGENCE_PROVIDER=siliconflow`.
4. Add richer memory source snippets/citations for user-facing search results and optional debug metadata for agent turns. Done.
5. Add memory consolidation suggestions for duplicate/conflicting candidates while preserving user-reviewed merge. Done.

Acceptance:

- User can ask time-aware questions against journal memory, such as yesterday/last week/project-period style queries.
- Agent turns can retrieve relevant active memory without auto-writing durable memory.
- Memory candidates from voice/chat preserve source, provenance, sensitivity, and audit metadata.
- Core Memory and Journal/Long-Term Memory have distinct retrieval behavior.

### Priority 2: Memory Review UI

Goal:

- Add the missing desktop surface for memory inspection and control.
- This is required for this project even if a reference project does not expose the same UI, because SP Agent treats durable memory as auditable and reversible user-owned data.

Reference note:

- MoeChat's README describes a Journal System for long-term memory with fuzzy time queries and a Core Memory system for key facts/preferences/personal memories.
- The README does not clearly document a dedicated memory review UI. For SP Agent, build the review UI because the local-first permission model requires users to inspect, promote, edit, merge, and forget memories.

Entry point:

- Place the memory review entry in the renderer header beside the current extension/plugin count. Done.
- Keep the entry compact: a memory icon/button plus a count or degraded indicator. Done for candidate count.
- The panel can reuse the existing right-side sheet pattern used by approvals, but it should not be nested inside another card. Done for the first review panel.

Required UI capabilities:

1. Search memories by text, kind, status, time range, and sensitivity inclusion. Done for the first review panel.
2. Show grouped memory kinds:
   - Core
   - Journal
   - Summary
   - Procedural
   - Project
   Done.
3. Review memory candidates and promote them to active memory. Done.
4. Edit memory content, kind, sensitivity, tags, and occurredAt. Done.
5. Merge duplicate/conflicting memories and show conflict metadata. Done for selected memories in the first review panel.
6. Forget/tombstone memories with visible audit state. Done with per-memory details and audit events.
7. Show provenance: source type, session id, provider, created/updated/promoted/tombstoned timestamps. Done with an expandable details view.
8. Extract memory candidates and create session summary candidates from the current chat session. Done.

Acceptance:

- Header exposes a memory review entry next to the extension/plugin count.
- User can search, inspect, promote, update, merge, and forget memory without leaving the chat shell.
- Candidate and active memory states are visually distinct.
- Sensitive memories are excluded by default and require an explicit UI toggle.

### Priority 3: Skills And Workflow Expansion

Goal:

- Expand skills only after memory is usable, so workflows can rely on stable context and memory behavior.
- Keep skills behind `packages/extensions`, API-owned permissions, and observable workflow records.

Remaining work:

1. Add a skill catalog UI:
   - active skills
   - degraded skills
   - readiness-gated skills
   - permission level and audit mode
2. Add one practical approval-gated write workflow:
   - Recommended first candidate: `local.memory.suggest` -> review candidates -> approve promotion.
   - Alternative: `local.tasks.create_candidate` behind approval.
3. Add workflow detail UI:
   - node events
   - status
   - retry
   - cancel
   - degraded reason
4. Add higher-value read-only skills after memory UI exists:
   - `local.project.plan`
   - `local.bookmarks.digest`
   - `local.context.briefing`
5. Add LangGraph only when a skill truly needs graph orchestration.
6. Harden workflow execution later with durable worker/cross-process recovery if local JSON + in-process execution becomes limiting.

Acceptance:

- User can see skill readiness and permission level in the desktop shell.
- Agent can call read-only skills and request approval for write/provider actions.
- Approved actions execute through API-owned handlers and produce permission audit records.
- Long-running workflows expose truthful status, retry/cancel behavior, and degraded reasons.

### Priority 4: Voice Optimization

Goal:

- Keep voice as a first-class interaction path, but optimize it after memory and skills are stronger.
- Focus on latency, interruptibility, and deployable provider configuration.

Remaining work:

1. Add clearer voice states:
   - listening
   - transcribing
   - thinking
   - synthesizing
   - speaking
   - degraded
2. Add provider settings UI:
   - STT provider
   - TTS provider
   - endpoint
   - model
   - voice
   - readiness check
3. Keep self-hosted FunASR/GPT-SoVITS as optional advanced/private deployment tracks, not required Electron dependencies.
4. Add interruptible voice:
   - user can speak while assistant is playing
   - playback stops
   - current agent/TTS request is cancelled or ignored
   - new STT turn starts cleanly
5. Add streaming or chunked voice response:
   - stream LLM output
   - segment by sentence
   - send chunks to TTS
   - start playback before the full assistant response finishes
6. Use timing instrumentation to compare provider latency and decide whether MiMo, MiniMax, GPT-SoVITS, or another provider should be the default.

Acceptance:

- Voice cannot open unless STT and TTS are configured and reachable.
- User can interrupt assistant playback and start a new turn.
- Time-to-first-audio improves compared with the current full-response-then-TTS path.
- Voice provider setup is usable in packaged Electron without requiring end users to install local ML services.

## Current Gaps

1. Memory remains the highest-priority product area, but the backend foundations, first review UI, optional LLM-backed extraction/summarization boundary, and consolidation suggestions are now usable. Remaining memory work should focus on evaluating extraction quality with real conversations and refining consolidation policy.
2. Memory review UI exists beside the extension/plugin count with search, date filters, grouped kinds, candidate promotion, update, merge, forget, provenance, and audit details.
3. Skills/workflows should wait until memory is usable, then expand through a skill catalog UI, approval-gated write workflow, workflow detail UI, and selected high-value read-only skills.
4. Voice optimization is intentionally last. Phase 1 half-duplex voice works, but interruptible voice, streaming/chunked TTS, provider settings UI, and packaged deployment defaults remain future work.
5. Graph-backed workflows are not implemented yet. Add LangGraph only when a skill truly needs graph orchestration, and keep it behind the extension boundary.
6. Workflow runner remains local-JSON backed and in-process for execution; it now has async start and stale recovery, but durable cross-process workers are still future hardening.
7. Connector boundary is implemented with `local.bookmarks`; additional real personal-service connectors still need per-connector permission and audit design.
8. `local-deterministic` proves a second adapter path, but additional live provider adapters should wait for a real provider/use case.

## OpenClaw-Style Optimization Direction

The current repository should be treated as a working v0 shell, not a complete OpenClaw-class personal assistant. The next development goal is to keep the safer local-first boundary while adding the primitives needed for a more autonomous, extensible assistant.

### Current Strengths To Preserve

- Keep the local API gateway as the only control plane for runtime calls, persistence, permissions, extension invocation, and audit.
- Keep Pi as the default runtime adapter, but keep all privileged behavior behind app-owned tools and extension capabilities.
- Keep Pi built-in shell, file, edit, write, browser, wallet, and posting tools disabled.
- Keep chat sessions and memory owned by the app, not by prompt-only runtime state.
- Keep degraded states visible when providers, keys, tools, or workflows are unavailable.

### Highest Priority Gaps

1. Graph/workflow hardening: add LangGraph or a durable worker only when a real long-running skill needs it.
2. Connector expansion: add additional read-only personal-service connectors behind extension permissions and audit.
3. Additional live runtime adapter: register a second provider-backed adapter only after a real provider/use case exists.
4. GUI click verification: browser bundle smoke covers the approval UI anchors, but a Playwright/Chrome click smoke should be added once the local browser executable can launch reliably in automation.

### Non-Goals For The Next Phase

- Do not add unrestricted local computer control as a shortcut to capability breadth.
- Do not let LangGraph, Pi, or any future runtime bypass the local API gateway.
- Do not auto-write durable identity facts, preferences, project facts, files, posts, or external-account changes without an auditable policy.
- Do not start speech implementation before runtime adapters, memory v2, approval, and at least one real non-voice skill are stable.

### OpenClaw-Class Acceptance Bar

The product can be considered on a credible OpenClaw-style path when:

- The user can install or enable multiple typed skills without editing the agent runtime.
- The agent can discover skills, call read-only skills, and request approval for higher-risk actions.
- A long-running task can survive API restart or expose a truthful degraded reason if persistence is not ready.
- Memory search, promotion, update, merge, and deletion are visible and reversible enough for daily personal use.
- At least one connector-backed skill works end to end through the extension boundary with permission audit. Done with `local.bookmarks`.
- The desktop shell remains the primary surface, while future mobile or messaging companion surfaces call the same local gateway instead of duplicating agent logic.

## Roadmap

### Phase 1: Chat-First Shell

Status: verified and extended with API-backed thread sessions.

Delivered:

- `/` and `/chat` render the assistant-ui runtime-backed shell.
- First-screen chat calls `/api/agent/messages`.
- Old workbench routes are removed from the active router.
- Route smoke verifies only `/` and `/chat`.
- Frontend thread list loads from `GET /api/chat/sessions`.
- New Thread creates an assistant-ui local thread first; the backend chat session is created on the first agent turn with the same remote id so empty duplicate sessions are not persisted.
- Agent turns persist user and assistant messages into the selected session.

Latest verification:

- `pnpm typecheck`
- `pnpm build`
- `pnpm smoke:web:routes`
- Route smoke now validates the Tailwind/shadcn theme tokens plus retained approval/voice CSS markers instead of requiring the removed legacy `.baseShell` stylesheet marker.
- Approval UI anchors are included in `pnpm smoke:web:routes`.
- Browser visual check at desktop `1280x720` and mobile `390x844`: no missing core anchors and no horizontal overflow.
- `pnpm --filter @sp-agent/web build`
- `pnpm smoke:web:routes`

### Phase 2: Minimal Agent Gateway

Status: verified.

Delivered:

- Active API no longer imports research/database/market/knowledge/watchlist services.
- Active extension registry contains `core.agent-shell`, active `local.memory`, active `local.context`, active `local.project`, active `local.bookmarks`, and readiness-gated `local.speech`.
- `pnpm smoke:api` starts the built API and verifies health, provider status, readiness, extensions, agent status, and degraded agent message behavior.
- `pnpm smoke:api:pi-live` starts the built API with `.env` credentials and verifies a live Pi/SiliconFlow agent response.
- Browser-level built web verification against the live API confirms the chat UI renders a Pi response.
- Electron GUI smoke confirms the final desktop window state: built renderer loaded from `apps/web/dist`, status is `Base ready`, runtime is `pi`, extension count is visible, and a chat message renders a live Pi/SiliconFlow response.

Latest verification:

- `pnpm typecheck`
- `pnpm build`
- `pnpm smoke:api`
- `pnpm smoke:api:extensions`
- `pnpm smoke:api:pi-live`
- `pnpm smoke:desktop:preflight`
- `pnpm smoke:desktop:api-child`
- `pnpm smoke:agent-runtime`
- `pnpm smoke:agent-runtime:pi`
- `PI_LIVE_SMOKE=1 pnpm smoke:agent-runtime:pi`

### Phase 3: Memory Layer

Status: Memory v2 backend, first review UI, source snippets/citations, retrieval debug metadata, optional LLM-backed extraction/summarization boundary, and consolidation suggestions are implemented; external memory-engine adapters remain future work.

Deliverables:

- Add app-owned memory schemas and service. Done.
- Define memory entry, source/provenance, scope, confidence, and deletion/tombstone contracts. Done.
- Add memory search and memory write-candidate APIs. Done.
- Register implemented memory capabilities in `packages/extensions`. Done.
- Expose memory search to the agent as a read-only tool first. Done through both extension invocation and deterministic retrieval context before the agent turn.
- Add promote, update, merge, and audit events. Done.
- Route write/provider memory extension calls through approval queue. Done.
- Add source-conflict detection and merge-based conflict resolution audit. Done.
- Add stronger ranking with exact phrase, term frequency, tag/source/status/confidence/recency signals. Done.
- Add Memory v2 typed kinds (`core`, `journal`, `summary`, `procedural`, `project`) while preserving existing `candidate`, `active`, and `tombstoned` lifecycle. Done.
- Add `occurredAt` for time-addressable journal/event memory and query filters for `kind`, `from`, `to`, and `includeSensitive`. Done.
- Add `sensitivity` metadata and retrieval gating so agent turns receive only active, relevant, non-sensitive memory by default. Done.
- Add retrieval strategies (`auto`, `core_semantic`, `journal_temporal`, `hybrid`) so journal search first narrows by time before relevance ranking, while agent retrieval uses hybrid kind quotas. Done.
- Add optional LanceDB vector indexing and provider-backed reranking behind the retrieval strategy layer. Done with deterministic offline embeddings and SiliconFlow `BAAI/bge-m3` embeddings.
- Add inferred relative-time journal search for `昨天`, `今天`, `上周`, `yesterday`, and `last week`. Done.
- Add API extraction of memory candidates from chat/voice sessions with source-message provenance. Done with rule-based deterministic extraction.
- Preserve voice provenance (`source: voice`, `sttProvider`, `audioPersisted: false`) for memory candidates created from speech transcripts. Done.
- Add API session summary candidate creation using the `summary` memory kind. Done with rule-based deterministic summarization.
- Add a desktop memory review panel for search, grouped kinds, promotion, editing, selected-memory merge, forget/tombstone, provenance, and audit inspection. Done.
- Add source snippets, citations, and lightweight retrieval debug metadata to memory search results and agent memory context. Done.
- Add API-owned memory intelligence boundary with deterministic fallback and optional SiliconFlow JSON extraction/summarization. Done.
- Add read-only memory consolidation suggestions and wire the review UI to prefill a merge draft from the first suggestion. Done.
- Keep external memory engines such as mem0 out of the control plane. They may later implement candidate extraction, consolidation, or semantic retrieval behind the Memory v2 service contract. Planned.

Acceptance:

- `pnpm smoke:api:memory`
- `MEMORY_EMBEDDING_LIVE_SMOKE=1 pnpm smoke:api:memory-embedding-live` when validating real SiliconFlow `BAAI/bge-m3` embeddings with `.env` credentials.
- Agent turn can retrieve memory without directly mutating it. Done for deterministic pre-prompt retrieval; mutation remains outside auto tool access.
- Extension memory writes require approval and can complete after approval. Done.
- Conflict detection, conflict resolution audit, matched terms, and ranking signals are covered by `pnpm smoke:api:memory`.
- Memory v2 search covers semantic/term core retrieval, temporal journal retrieval, and hybrid retrieval with kind quotas.
- Agent retrieval gate excludes candidates and sensitive memories by default while keeping explicit memory search able to include them when requested.

### Phase 4: Skill And Workflow Layer

Status: verified non-speech implementation; graph and durable-worker hardening remain future work.

Deliverables:

- Add one small non-voice personal-agent skill behind `packages/extensions`. Done with `local.context`.
- Keep skill invocation typed, permissioned, and observable. Done for `context.snapshot`.
- Add API smoke coverage for the skill. Done with `pnpm smoke:api:extensions`.
- Add a workflow runner only where a skill genuinely needs observable multi-step execution. Done in the API gateway for `local.project`.
- Add one practical non-voice personal skill. Done with `local.project`, a read-only project-doc search skill restricted to allowlisted repo docs.
- Workflow records include status, timestamps, cancellation, retry, degraded reason, and node events. Done for the local JSON runner.
- Add async workflow start and stale pending/running recovery. Done for the local project-doc workflow path.
- Add a first connector-backed read-only personal skill. Done with `local.bookmarks`.
- If LangGraph is introduced, wrap it inside the skill capability and keep node events observable.

Acceptance:

- API smoke for the implemented skill.
- `pnpm smoke:api:workflows`
- Async workflow start and connector-backed skill execution are covered by `pnpm smoke:api:workflows` and `pnpm smoke:api:extensions`.
- Existing chat, memory, and runtime smokes still pass.

### Phase 5: Speech Layer

Status: Phase 1 half-duplex shell implemented; provider readiness, voice audit foundations, mock provider-contract coverage, self-hosted and cloud TTS adapter support, and gated live-provider smoke are implemented. Real voice use still requires one configured provider track.

Deliverables:

- Add `packages/speech` for STT/TTS provider contracts. Done.
- Add API voice session flow for half-duplex chat. Done for missing, deterministic, and optional provider paths.
- Add renderer record/transcribe/send/playback flow. Done through the dedicated voice call overlay on the API-owned voice path.
- Add provider readiness for STT/TTS. Done for missing, deterministic, `openai-audio-transcriptions-stt`, legacy `openai-compatible-stt`, `gpt-sovits-api`, `minimax-t2a-v2`, and `mimo-v2.5-tts`.
- Add speech audit events. Done for transcribe/synthesize requested, completed, and degraded states.
- Add provider adapter contract smoke. Done for OpenAI audio transcriptions STT, legacy `openai-compatible-stt`, `gpt-sovits-api`, `minimax-t2a-v2`, and `mimo-v2.5-tts` through local mock HTTP providers.
- Add gated live provider smoke. Done with `pnpm smoke:speech:live`; set `SPEECH_PROVIDER_LIVE_SMOKE=1` and provider env to execute real STT/TTS calls.
- Keep raw audio persistence disabled by default. Done in API metadata/policy.

Supported live provider tracks:

- Self-hosted: `SPEECH_STT_PROVIDER=openai-audio-transcriptions-stt` pointed at FunASR's `/v1/audio/transcriptions`, plus `SPEECH_TTS_PROVIDER=gpt-sovits-api` pointed at GPT-SoVITS `/tts`.
- Cloud TTS: `SPEECH_TTS_PROVIDER=minimax-t2a-v2` or `mimo-v2.5-tts` with provider keys, plus an OpenAI-compatible transcription endpoint for STT.

Acceptance:

- `pnpm smoke:api:speech`
- `pnpm smoke:speech:providers`
- `pnpm smoke:speech:live` skips unless `SPEECH_PROVIDER_LIVE_SMOKE=1`
- Text chat still works through the same `/api/agent/messages` path.
- Renderer can complete record -> transcript -> agent -> playback with one provider or explicit degraded reason.

## Resume-Oriented Productization Plan

The current project is a working local-first personal Agent OS base. To make it stronger as a resume project, productization should follow the same priority order as active development: memory first, memory UI second, skills/workflows third, voice optimization last.

### Feature 1: Core And Journal Memory Assistant

Resume angle:

- "Built a two-layer long-term memory system for a local-first personal Agent, separating Core Memory for stable user facts/preferences from Journal Memory for time-addressable conversation events, with embedding retrieval, provenance, audit, and reversible lifecycle operations."

Product outcome:

- The agent can remember durable facts and time-based events, retrieve them safely during chat, and expose why a memory was used.

Key work:

- Strengthen Core vs Journal retrieval policy. Done for backend search/retrieval; product UI remains.
- Add chat/voice memory candidate extraction. Done with rule-based API extraction; LLM-backed extraction remains optional future work.
- Add session summarization into `summary` memory. Done with rule-based API summaries; LLM-backed summarization remains optional future work.
- Preserve provenance, sensitivity, conflict metadata, and audit for all memory writes.
- Support time-aware journal queries and hybrid retrieval. Done for explicit ranges and basic relative time phrases.

### Feature 2: Memory Review UI

Resume angle:

- "Designed a desktop memory review surface that lets users inspect, search, promote, edit, merge, and forget AI memories, keeping durable personalization auditable and user-controlled."

Product outcome:

- The desktop shell has a visible memory entry beside the extension/plugin count, making memory a first-class product surface.

Key work:

- Add memory header entry next to the extension count.
- Add search/filter by kind, status, time range, sensitivity, and text.
- Add candidate review, promote, edit, merge, and forget/tombstone actions.
- Show source/provenance and audit metadata.
- Keep sensitive memory excluded unless the user explicitly opts in.

### Feature 3: Permissioned Skills And Workflow Execution

Resume angle:

- "Built a permissioned skill and workflow system for a desktop Agent platform, separating model runtime decisions from privileged execution through an API-owned approval queue, extension registry, and auditable workflow runner."

Product outcome:

- After memory is usable, the agent can safely use local/project/personal skills without bypassing API-owned permissions.

Key work:

- Add a skill catalog UI for active/degraded/readiness-gated extensions.
- Add one approval-gated write workflow, preferably memory candidate promotion or task candidate creation.
- Add workflow detail UI for node events, retry, cancel, status, and degraded reason.
- Add high-value read-only skills such as project planning, bookmark digest, and context briefing.
- Introduce LangGraph only when a real skill needs graph orchestration.

### Feature 4: Voice Optimization And Interruptible Conversation

Resume angle:

- "Implemented and optimized a provider-agnostic voice interaction pipeline with STT/TTS readiness checks, half-duplex call UI, latency instrumentation, self-hosted/cloud provider support, and an upgrade path toward interruptible low-latency conversation."

Product outcome:

- Voice remains a first-class interaction path, but it is optimized after memory and skills become useful.

Key work:

- Add provider settings UI for STT/TTS endpoints, model, voice, and readiness check.
- Split voice states into listening, transcribing, thinking, synthesizing, speaking, and degraded.
- Add interruptible playback and turn cancellation.
- Add streaming or chunked LLM-to-TTS response generation to reduce time-to-first-audio.
- Treat FunASR/GPT-SoVITS as optional self-hosted/private deployment tracks, not required Electron dependencies.

## Verification Commands

Run before handing off meaningful code changes:

```bash
pnpm typecheck
pnpm build
pnpm smoke:api
pnpm smoke:api:extensions
pnpm smoke:api:memory
pnpm smoke:api:workflows
pnpm smoke:api:speech
pnpm smoke:speech:providers
pnpm smoke:speech:live
pnpm smoke:desktop:preflight
pnpm smoke:desktop:api-child
pnpm smoke:web:routes
pnpm smoke:agent-runtime
pnpm smoke:agent-runtime:pi
```

Live Pi check after `.env` has valid credentials:

```bash
PI_LIVE_SMOKE=1 pnpm smoke:agent-runtime:pi
pnpm smoke:api:pi-live
```

Future memory checks:

```bash
pnpm smoke:api:memory
```

Speech checks:

```bash
pnpm smoke:api:speech
pnpm smoke:speech:providers
pnpm smoke:speech:live
```

Live speech provider check after the self-hosted or cloud provider track is configured:

```bash
SPEECH_PROVIDER_LIVE_SMOKE=1 pnpm smoke:speech:live
```

## Working Rules

- Keep `PROCESS.md` focused on current state, gaps, roadmap, and verification. Do not turn it into a chronological log.
- Keep `ARCHITECTURE.md` focused on product boundaries and package/runtime contracts.
- Keep `AGENTS.md` as the instruction contract for future agents working in this repo.
- Keep old Web3/research code detached from active imports, workspace builds, routes, smokes, and extension registry unless explicitly reintroduced.
- Do not add unrestricted local computer-control powers to the personal agent.
- Treat missing provider credentials and unavailable services as normal degraded product states.
