# ARCHITECTURE.md

## Product Boundary

The target product is a local-first chat-first personal agent. The first version is a desktop chat agent that can remember the user, speak with the user, call permissioned local skills, run observable workflows, and degrade clearly when providers are missing.

The product is not a trading bot, wallet automation tool, social posting bot, Web3 workbench, or unrestricted coding/browser agent. Old Web3/research files have been removed from the active project.

## Chat-First Agent Boundary

The product experience should feel closer to a personal chat agent than to an infrastructure dashboard. Chat and voice are the primary surfaces; skills, connectors, workflows, approvals, and memory are the capability system behind that conversation.

Target behavior:

- The user can talk naturally by text or voice.
- The agent can use long-term memory for continuity without silently writing sensitive facts.
- The agent can propose or run skills such as token research, project search, bookmark search, and future email drafting/sending.
- Read-only skills can run directly; write/provider/destructive skills must request approval.
- Workflow progress and final artifacts should return into the conversation instead of forcing a separate workbench.

## OpenClaw-Style Expansion Boundary

The current codebase is a viable v0 agent shell, not yet a full autonomous personal-assistant platform. It should grow toward an OpenClaw-style local assistant through controlled app-owned primitives instead of broad model-owned system access.

The expansion target is:

```text
desktop chat shell
-> local gateway and approval queue
-> runtime adapter registry
-> installed extension manifests and handlers
-> app-owned memory and audit log
-> workflow runner for multi-step skills
-> connectors for personal services
-> optional companion surfaces such as mobile or messaging
```

The product should avoid copying the riskiest shape of autonomous assistants: unrestricted filesystem, shell, browser, posting, wallet, or account access. Every new capability should enter through the extension registry, declare permissions, expose typed input/output, and return an invocation audit.

OpenClaw-style parity should mean:

- Agents can inspect available skills and request allowed capabilities.
- Write, paid-provider, external-posting, destructive, or sensitive-account actions require explicit approval.
- Long-running tasks are observable, resumable, cancellable, and auditable.
- Personal memory can be searched, promoted, updated, merged, forgotten, and traced back to source.
- Runtimes are replaceable; Pi remains the default adapter, not the architecture itself.
- Skills can host internal workflows such as LangGraph without becoming a second control plane.

## Active Runtime

```text
Electron desktop shell
-> React renderer using assistant-ui runtime/primitives
-> NestJS Local API Gateway
-> session, permissions, provider readiness, extension registry
-> agent-runtime adapter layer, Pi first
-> app-owned tools, memory, skills, workflows
-> speech as an API-owned chat interaction layer
```

The local API gateway is the control plane. It owns permissions, provider readiness, extension invocation, and future persistence/audit. Agent runtimes can request tool calls, but they do not directly own privileged app behavior.

Electron development behavior:

- The desktop shell loads the built renderer by default.
- `RENDERER_URL` is the only way to opt into a dev server; this prevents stale local dev servers from replacing the built assistant-ui screen.
- The desktop shell starts the API with a real Node executable (`NODE_BINARY`, `npm_node_execpath`, or `node`) so Pi SDK dependencies run under normal Node rather than Electron's Node compatibility mode.
- The desktop shell stops its API child process when all windows are closed, including on macOS, so local reopen cycles do not keep reusing an old in-memory API bundle.
- `pnpm smoke:desktop:api-child` verifies the API child strategy without opening a GUI window.
- The current GUI smoke has been verified with `pnpm --filter @sp-agent/desktop start`: Electron loads `apps/web/dist/index.html`, shows `Base ready`, surfaces `pi` and the extension count, and renders a Pi/SiliconFlow chat response.

## Active Workspace

```text
apps/
  api/             NestJS local gateway
  web/             assistant-ui runtime-backed first-screen renderer with Tailwind/shadcn UI primitives
  desktop/         Electron main process and local API orchestration
packages/
  shared/          Zod schemas and shared TypeScript contracts
  agent-runtime/   Pi first, later additional runtime adapters
  extensions/      skill registry and permission metadata
  speech/          STT/TTS provider adapter contracts, deterministic smoke adapters, and optional real provider adapters
```

Target future packages:

```text
packages/
  memory/          app-owned long-term memory layer
  workflows/       optional workflow engines such as LangGraph
  persistence/     durable storage boundary when needed
  speech/          future VAD/streaming audio provider boundary expansions
```

Old `research-core`, `data-connectors`, database/repository, workbench components, and Web3 scripts are not active workspace packages and should not be restored unless a new product requirement needs them.

## Renderer Direction

The first screen is a simple assistant-ui chat surface backed by assistant-ui runtime primitives:

```text
assistant-ui RemoteThreadListRuntime
-> assistant-ui ThreadListPrimitive sidebar
-> assistant-ui LocalRuntime with ChatModelAdapter
-> assistant-ui ThreadPrimitive main chat area
-> assistant-ui ComposerPrimitive message composer
-> optional model/runtime selector
-> mic slot backed by the API-owned speech layer
```

The renderer should stay compact and predictable:

- Preserve stable `data-testid` anchors.
- Keep `apps/web/src/main.tsx` as bootstrap only: router creation, root render, and global style import. Product shell components should live under `apps/web/src/app` and `apps/web/src/components/app` so new capabilities do not bloat the entrypoint again.
- Keep thread/session behavior visible.
- Keep voice controls wired only to the API-owned speech layer; when providers are missing, show a degraded state without breaking typed chat.
- Keep the composer mic as a compact entry point. Rich voice state belongs in a dedicated voice call overlay so recording, transcript, playback, provider status, and future VAD/interruption controls do not crowd the main composer.
- Keep the skill catalog as a compact header entry backed by `/api/extensions`. It should expose active/degraded/planned readiness, permission lists, and read-only vs approval/provider audit mode without turning the first screen into a capability workbench.
- Keep memory review as a compact header entry beside extension and approval status. The review sheet can search, filter, promote, update, merge, forget, and inspect provenance/audit without turning the first screen into a separate dashboard.
- Do not add marketing hero pages, decorative dashboards, or complex workbench navigation to the first screen.
- Use `assistant-ui` runtime/primitives as the chat state and interaction boundary instead of custom chat state where possible.
- Use Tailwind CSS v4 plus shadcn/base UI primitives for the assistant-ui example-style shell controls: buttons, tooltips, sheet navigation, dropdowns, and future menus.
- Keep assistant-ui shell styling in component Tailwind classes following the official shadcn registry example shape. `apps/web/src/styles.css` should remain limited to Tailwind/shadcn imports, theme tokens, global reset, and app-specific surfaces such as approval review, memory review, and voice call overlays.
- Current web runtime uses `useRemoteThreadListRuntime` plus a local `RemoteThreadListAdapter` for API-backed chat sessions.
- Current message runtime uses `useLocalRuntime` plus a `ChatModelAdapter` that calls `POST /api/agent/messages/stream` and reads `text/event-stream` model deltas; assistant-ui owns composer/run lifecycle while the API gateway owns provider, permission, memory, and persistence behavior.
- Current history loading uses a thread-scoped `ThreadHistoryAdapter` that reads `GET /api/chat/sessions/:id`.

Active route contract is intentionally small: `/` and `/chat` both render the chat-first shell.

## API Gateway

Active surfaces:

- `GET /api/health`
- `GET /api/providers/status`
- `POST /api/providers/verify`
- `GET /api/settings`
- `PUT /api/settings`
- `GET /api/settings/readiness`
- `POST /api/chat/sessions`
- `GET /api/chat/sessions`
- `GET /api/chat/sessions/:id`
- `PATCH /api/chat/sessions/:id`
- `POST /api/chat/sessions/:id/messages`
- `GET /api/memory`
- `GET /api/memory/search`
- `GET /api/memory/audit`
- `POST /api/memory/candidates`
- `POST /api/memory/merge`
- `POST /api/memory/:id/promote`
- `PATCH /api/memory/:id`
- `DELETE /api/memory/:id`
- `GET /api/agent/status`
- `POST /api/agent/messages`
- `POST /api/agent/messages/stream`
- `GET /api/extensions`
- `GET /api/extensions/:id`
- `POST /api/extensions/:id/invoke`
- `GET /api/approvals`
- `POST /api/approvals`
- `PATCH /api/approvals/:id`
- `GET /api/workflows`
- `GET /api/workflows/:id`
- `POST /api/workflows/local-project/search-docs`
- `POST /api/workflows/local-project/search-docs/async`
- `POST /api/workflows/:id/cancel`
- `POST /api/workflows/:id/retry`
- `GET /api/voice/status`
- `POST /api/voice/transcribe`
- `POST /api/voice/synthesize`
- `POST /api/voice/chat`
- `GET /api/voice/audit`

The current API intentionally does not expose Web3 research, market, watchlist, report, queue, or worker routes.

## Agent Runtime Layer

`packages/agent-runtime` is the runtime adapter layer. Pi is the first/default adapter, and `local-deterministic` is a non-default offline adapter used for deterministic fallback and registry verification. Additional adapters can be added without reshaping the API gateway.

Runtime responsibilities:

- Maintain a model-facing agent turn.
- Receive session context selected by the API.
- Request typed tool calls through the API-owned tool boundary.
- Produce assistant text, structured tool-call audit, and degraded reasons.
- Register runtime metadata through `listRuntimeAdapters()` so `GET /api/agent/status` can expose the selected runtime shape.

Runtime non-responsibilities:

- No direct database writes except through API-owned services.
- No direct memory mutation except through future memory tools.
- No unrestricted shell/file/browser/write tools.
- No hidden provider calls that bypass provider readiness and audit.
- No direct ownership of skill implementation.

Current Pi defaults:

- `AGENT_RUNTIME_PROVIDER=pi`
- `PI_MODEL_PROVIDER=siliconflow`
- `PI_MODEL_ID=deepseek-ai/DeepSeek-V4-Flash`
- `SILICONFLOW_API_KEY` as the default key source

Runtime verification:

- Missing-key smoke must keep the app usable with a deterministic degraded reply.
- Live smoke with `.env` credentials must prove Pi can call SiliconFlow and return assistant text.
- API live smoke must prove `POST /api/agent/messages` can reach the live Pi runtime and persist the conversation.
- Desktop GUI smoke must prove the same live path works from Electron, not only from browser/API scripts.

## Extension Layer

`packages/extensions` is the app-owned capability registry.

Active manifests:

- `core.agent-shell`: active agent turn and extension inspection.
- `local.memory`: active local JSON-backed memory search and write-candidate contract.
- `local.context`: active read-only utility skill that proves the extension path can expose small local capabilities.
- `local.project`: active read-only project-document skill backed by the workflow runner and restricted to allowlisted repo docs.
- `local.bookmarks`: active read-only connector for user-supplied local bookmark data in `connectors/bookmarks.json` under the app data directory.
- `local.speech`: readiness-gated STT/TTS contract backed by `packages/speech`; active when STT and TTS providers are ready, degraded otherwise.

A skill manifest should describe id, status, capabilities, schemas, permissions, provider requirements, and degraded behavior. A planned skill can exist in the registry, but invocation must return an explicit degraded reason until implementation exists.

The API-side extension executor is handler-registry based. Each invokable capability has an API handler tied to its manifest id/capability id, input schema, permission audit, and degraded behavior. Read-only handlers can execute directly. Write/provider/destructive handlers must produce or consume an approval request before execution.

## Approval Boundary

Approvals are API-owned and persist to `approvals.json` under `SP_AGENT_DATA_DIR` or `.sp-agent-data`.

Current approval flow:

```text
extension invoke request
-> permissionAudit classifies capability as read_only or write_or_provider
-> read_only executes immediately
-> write_or_provider without approved approvalId returns pending_approval
-> user/API approves or denies through /api/approvals/:id
-> extension invoke with approved approvalId executes the handler
```

This is the first approval primitive. The renderer exposes a compact approval review entry in the chat header. It loads pending approvals from `/api/approvals?status=pending`, shows the pending count, and can approve or deny requests through `/api/approvals/:id`.

## Workflow Runner

The current workflow runner lives in the API gateway and persists to `workflows.json` under `SP_AGENT_DATA_DIR` or `.sp-agent-data`.

Current workflow shape:

- `status`: `pending`, `running`, `completed`, `failed`, or `cancelled`.
- Timestamps: `createdAt`, `updatedAt`, `startedAt`, and `completedAt`.
- `nodeEvents`: per-node status, payload, timestamps, error, and degraded reason.
- `result`, `error`, and `degradedReason` are first-class workflow fields.
- `retry` creates a new workflow run from the original input.
- `cancel` marks pending/running work as cancelled; completed workflows return a truthful no-op degraded reason.
- Async start is available through `POST /api/workflows/local-project/search-docs/async`; it creates a pending run and executes it through the same local runner.
- Stale pending/running workflows are recovered on list/get by marking them failed with a degraded reason after the local recovery window.

The first workflow-backed skill is `local.project` with `project.search_docs`. It reads only the allowlisted project docs `AGENTS.md`, `ARCHITECTURE.md`, `PROCESS.md`, and `package.json`, ranks simple text matches, and returns the persisted workflow record through the extension boundary.

The first connector-backed skill is `local.bookmarks` with `bookmarks.search`. It reads only user-supplied local JSON bookmark records, performs local text ranking, and returns an explicit degraded reason when no connector data is configured or no records match. It does not call external services or mutate connector state.

## LangGraph Boundary

LangGraph can be introduced without conflicting with Pi if it is scoped correctly:

```text
Pi or another runtime
-> decides that a skill/workflow is needed
-> invokes an API-owned extension capability
-> the extension runs a LangGraph workflow internally when appropriate
-> workflow nodes call typed app services/tools
-> final result returns through the extension boundary
```

Do not let LangGraph become a second unrestricted control plane. It should not bypass extension permissions, provider readiness, memory audit, or task observability.

## Memory Architecture

Long-term memory must be app-owned, not runtime-owned. Runtime sessions are short-term context; durable memory belongs in the API/data layer.

Memory v2 kinds:

- `core`: stable facts, user preferences, identity facts, and durable relationship/project context.
- `journal`: time-addressable conversation events, including voice transcript-derived events when policy allows candidate creation.
- `summary`: compressed session or time-window context.
- `procedural`: reusable workflows, skill preferences, and operating habits.
- `project`: project facts and architecture decisions.
- `audit`: provenance, timestamps, source links, and why a memory was written or changed.

Target memory tools:

- `memory.search`
- `memory.write_candidate`
- `memory.promote_fact`
- `memory.update`
- `memory.merge`
- `memory.forget`

The API should decide which memory operations are automatic and which require user confirmation.

Current implementation:

- Chat sessions persist to PostgreSQL tables `chat_sessions` and `chat_messages` when `DATABASE_URL` is configured. The API keeps a local `chat.json` fallback under `SP_AGENT_DATA_DIR` or `.sp-agent-data` only when PostgreSQL is unavailable.
- Memory entries persist to `memory.json` under `SP_AGENT_DATA_DIR` or `.sp-agent-data`.
- Memory entries include `kind`, `sensitivity`, and optional `occurredAt` fields. `occurredAt` enables journal-style temporal retrieval such as "yesterday" or explicit date-window queries without relying only on vector similarity.
- `memory.search` is read-only and can be exposed to agent tool calls.
- `memory.write_candidate` creates candidate entries and audit events but is classified as `write_or_provider`, so agent auto-tool calls cannot invoke it without approval.
- `memory.promote_fact`, `memory.update`, and `memory.merge` are implemented through the API service and registered on `local.memory`; extension invocation requires approval.
- Memory candidate creation detects potential source/content conflicts against existing non-tombstoned memories. Conflicting candidates record `conflictsWith`, `conflictGroupId`, `conflictReason`, and a `conflict_detected` audit event.
- `memory.merge` tombstones superseded memories and records `conflict_resolved` when it resolves a conflict set.
- Memory search returns matched terms, ranking signals, source snippets, citations, and lightweight debug metadata through an explicit retrieval strategy layer. `core_semantic` searches stable `core`, `project`, and `procedural` memories; `journal_temporal` first narrows `journal` and `summary` memories by `occurredAt`/time range, then ranks relevance; `hybrid` combines both paths with kind quotas for agent context.
- `MEMORY_VECTOR_PROVIDER=lancedb` enables an optional local LanceDB index under `MEMORY_LANCEDB_URI` or `SP_AGENT_DATA_DIR/lancedb`. LanceDB is used as a retrieval accelerator/reranker behind the Memory v2 contract; `memory.json` remains the source of truth for lifecycle, audit, provenance, approval, and tombstones. Memory embeddings default to SiliconFlow `BAAI/bge-m3` when `SILICONFLOW_API_KEY` is configured, or deterministic local embeddings when no key is present; `MEMORY_EMBEDDING_PROVIDER=deterministic|siliconflow` can force either path. Vector tables are partitioned by embedding provider, model, and dimension so local smoke indexes do not collide with BGE-M3 indexes.
- Memory audit events record candidate creation, promotion, update, merge, forgetting, conflict detection, and conflict resolution.
- Forgetting is tombstone-based through `DELETE /api/memory/:id`; tombstoned memories do not appear in search.
- Memory extraction and summarization use an API-owned memory intelligence boundary. The default `MEMORY_INTELLIGENCE_PROVIDER=deterministic` path is rule-based and offline; `MEMORY_INTELLIGENCE_PROVIDER=siliconflow` may call a configured SiliconFlow chat-completions model for JSON-only candidate extraction and summaries, with deterministic fallback on missing keys, HTTP errors, invalid JSON, or empty model output.
- Memory consolidation is suggestion-first. `POST /api/memory/consolidate` and `local.memory/memory.consolidate` inspect candidate/active memories and return merge-shaped suggestions without mutating durable memory; actual merges still go through the API merge path and audit.
- The renderer exposes a first memory review surface in the chat header. It calls the API-owned memory endpoints for text/kind/status/date/sensitivity search, candidate promotion, editing, selected-memory merge, tombstone forgetting, and per-memory provenance/audit inspection.
- The renderer exposes a first skill catalog surface in the chat header. It calls `/api/extensions`, groups active, readiness-gated/degraded, and planned capabilities, and shows capability permissions plus the same read-only vs write/provider audit mode enforced by the API.
- `POST /api/agent/messages` performs deterministic read-only memory retrieval before calling the runtime and returns the selected `memoryContext` with citations and retrieval debug. The agent retrieval gate only injects active, non-sensitive memory by default; candidates remain reviewable/searchable without becoming hidden prompt state. Assistant-message metadata persists a compact `memoryContextDebug` record for later diagnostics without granting the runtime memory write access.

## Skill Task Model

General agent abilities should enter the chat through skills and workflows, not through unrestricted runtime tools.

Examples:

- Token research: read-only/provider workflow with visible progress, degraded market/provider reasons, and a final chat answer or report artifact.
- Email: draft is safe to generate in chat; sending requires an approved connector invocation.
- Project context: `local.project` remains read-only and allowlisted.
- Memory: voice or typed turns may create memory candidates only through the memory policy; they must not auto-promote important identity facts or preferences without an auditable rule.

## Speech Architecture

Speech is a first-class chat interaction layer around the agent, not part of Pi or any future runtime. It must use the same session, memory, runtime, extension, approval, and audit path as typed chat after STT produces a transcript.

Current Phase 1 API surfaces:

- `GET /api/voice/status`
- `GET /api/voice/audit`
- `POST /api/voice/transcribe`
- `POST /api/voice/synthesize`
- `POST /api/voice/chat`

`packages/speech` currently includes missing-provider degraded adapters, deterministic STT/TTS adapters for local smoke coverage, OpenAI-compatible transcription adapters, local `gpt-sovits-api`, cloud `minimax-t2a-v2`, and cloud `mimo-v2.5-tts`. These real provider adapters are optional and environment-configured; missing keys, unavailable local services, or paid cloud-provider failures must keep speech in a degraded state without changing the agent runtime.

Supported provider tracks:

1. Self-hosted voice stack:
   - STT runs as a FunASR sidecar service. The preferred integration is FunASR's OpenAI-compatible `/v1/audio/transcriptions` endpoint.
   - TTS runs as a GPT-SoVITS sidecar service exposing a `/tts` endpoint.
   - NestJS stays the control plane. Do not embed Python, torch, model downloads, or GPU lifecycle inside Electron/NestJS.
2. Cloud TTS stack:
   - TTS uses MiniMax T2A v2 through `minimax-t2a-v2`.
   - STT still uses an OpenAI-compatible transcription endpoint, either local FunASR or another configured service.
   - Use this path when the local machine cannot run GPT-SoVITS reliably.
3. MiMo cloud TTS stack:
   - TTS uses Xiaomi MiMo V2.5 through `mimo-v2.5-tts`.
   - The non-streaming API voice path sends synthesis text as an `assistant` message and optional style guidance as a `user` message, matching MiMo's chat-completions-compatible TTS contract.
   - STT still uses an OpenAI-compatible transcription endpoint, currently local FunASR/SenseVoice for the Mac M1 Pro development setup.

Self-hosted FunASR + GPT-SoVITS environment:

```bash
SPEECH_STT_PROVIDER=openai-audio-transcriptions-stt
OPENAI_TRANSCRIPTIONS_STT_URL=http://127.0.0.1:8000/v1/audio/transcriptions
OPENAI_TRANSCRIPTIONS_STT_MODEL=sensevoice
OPENAI_TRANSCRIPTIONS_STT_API_KEY=
OPENAI_TRANSCRIPTIONS_STT_RESPONSE_FORMAT=verbose_json
OPENAI_TRANSCRIPTIONS_STT_LANGUAGE=zh

SPEECH_TTS_PROVIDER=gpt-sovits-api
GPT_SOVITS_TTS_URL=http://127.0.0.1:9880/tts
GPT_SOVITS_REF_AUDIO_PATH=/absolute/path/to/reference.wav
GPT_SOVITS_PROMPT_TEXT=reference audio transcript
GPT_SOVITS_TEXT_LANG=zh
GPT_SOVITS_PROMPT_LANG=zh
GPT_SOVITS_TEXT_SPLIT_METHOD=cut0
```

MiniMax cloud TTS environment:

```bash
SPEECH_STT_PROVIDER=openai-audio-transcriptions-stt
OPENAI_TRANSCRIPTIONS_STT_URL=http://127.0.0.1:8000/v1/audio/transcriptions
OPENAI_TRANSCRIPTIONS_STT_MODEL=sensevoice

SPEECH_TTS_PROVIDER=minimax-t2a-v2
MINIMAX_TTS_URL=https://api.minimax.chat/v1/t2a_v2
MINIMAX_API_KEY=
MINIMAX_GROUP_ID=
MINIMAX_TTS_MODEL=speech-02-hd
MINIMAX_TTS_VOICE_ID=
MINIMAX_TTS_FORMAT=mp3
MINIMAX_TTS_SAMPLE_RATE=32000
MINIMAX_TTS_BITRATE=128000
MINIMAX_TTS_CHANNEL=1
```

MiMo cloud TTS environment:

```bash
SPEECH_STT_PROVIDER=openai-audio-transcriptions-stt
OPENAI_TRANSCRIPTIONS_STT_URL=http://127.0.0.1:8000/v1/audio/transcriptions
OPENAI_TRANSCRIPTIONS_STT_MODEL=sensevoice

SPEECH_TTS_PROVIDER=mimo-v2.5-tts
MIMO_TTS_URL=https://api.xiaomimimo.com/v1/chat/completions
MIMO_API_KEY=
MIMO_TTS_MODEL=mimo-v2.5-tts
MIMO_TTS_VOICE=mimo_default
MIMO_TTS_FORMAT=mp3
MIMO_TTS_STYLE_PROMPT=温暖自然，语速适中。
```

`openai-compatible-stt` remains available only for providers that expose chat-completions audio input instead of `/v1/audio/transcriptions`; it is not the preferred FunASR path.

First version:

```text
click or hold to record
-> capture one audio clip
-> STT returns final transcript
-> transcript enters the normal agent message path with memory retrieval and skill access
-> agent returns text
-> TTS synthesizes one audio response
-> renderer plays the audio
```

Later streaming version:

```text
microphone stream
-> VAD / partial STT
-> final utterance
-> streaming agent text
-> streaming TTS chunks
-> playback queue
-> interruption / barge-in handling
```

Streaming voice should borrow the queue pattern from voice-agent systems without copying their stack:

```text
agent text stream
-> sentence splitter
-> TTS text queue
-> TTS audio queue
-> renderer playback queue
```

Raw audio persistence should be disabled by default unless the product adds a clear setting and retention policy.

Voice audit events are persisted to `voice-audit.json` under `SP_AGENT_DATA_DIR` or `.sp-agent-data`. They record request/completion/degraded state for STT and TTS provider calls, but they must not persist raw audio or synthesized audio bytes.

Current audit actions:

- `voice.transcribe_requested`
- `voice.transcribe_completed`
- `voice.synthesize_requested`
- `voice.synthesize_completed`
- `voice.degraded`

`GET /api/settings/readiness` exposes speech provider readiness through separate `speech-stt` and `speech-tts` items. These readiness items are dynamic and based on the selected `packages/speech` adapters.

## Provider Boundary

Provider adapters must return typed results with explicit degraded states:

```ts
{
  configured: boolean;
  reachable: boolean;
  degradedReason?: string;
}
```

This applies to model providers, future embeddings, STT, TTS, browser/search providers, and future integrations.

## Verification Strategy

For meaningful code changes, keep these layers verified:

- `pnpm typecheck`
- `pnpm build`
- `pnpm smoke:api`
- `pnpm smoke:api:extensions`
- `pnpm smoke:api:memory`
- `pnpm smoke:api:speech`
- `pnpm smoke:api:pi-live` when `.env` has live credentials
- `pnpm smoke:desktop:preflight`
- `pnpm smoke:desktop:api-child`
- `pnpm smoke:web:routes`
- `pnpm smoke:agent-runtime`
- `pnpm smoke:agent-runtime:pi`
- `PI_LIVE_SMOKE=1 pnpm smoke:agent-runtime:pi` when `.env` has live credentials

Future streaming speech work should extend `pnpm smoke:api:speech` for cancellation, segmented TTS, and degraded streaming events.
