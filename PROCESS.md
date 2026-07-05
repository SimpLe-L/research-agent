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
- `packages/speech` defines STT/TTS provider adapter contracts with deterministic smoke adapters, explicit degraded states, `openai-audio-transcriptions-stt`, legacy `openai-compatible-stt`, self-hosted `gpt-sovits-api`, and cloud `minimax-t2a-v2`.
- API voice endpoints exist for Phase 1 half-duplex chat: `GET /api/voice/status`, `POST /api/voice/transcribe`, `POST /api/voice/synthesize`, and `POST /api/voice/chat`.
- Voice chat reuses the existing agent message path after STT, so transcripts get normal session persistence, memory retrieval, runtime behavior, and skill boundaries.
- Voice transcript messages are persisted with provenance metadata (`source: voice`, `sttProvider`, `audioPersisted: false`), and raw audio is not persisted.
- `GET /api/settings/readiness` exposes dynamic `speech-stt` and `speech-tts` provider readiness.
- `GET /api/voice/audit` exposes local voice audit events for transcribe/synthesize requested, completed, and degraded states.
- Renderer composer mic opens a dedicated voice call overlay wired to the API-owned voice chat path with recording, sending, playing, transcript, assistant response, provider readiness, latest voice audit event, and degraded UI states. Missing speech providers keep typed chat usable and show a degraded voice state.
- `pnpm smoke:api:speech` verifies deterministic STT/TTS, dynamic `local.speech` readiness, settings readiness, voice audit events, voice chat session persistence, and audio non-persistence metadata.
- `pnpm smoke:speech:providers` verifies OpenAI audio transcriptions STT, legacy `openai-compatible-stt`, `gpt-sovits-api`, and `minimax-t2a-v2` against local mock HTTP providers, including request payloads, response parsing, binary audio handling, and degraded HTTP/provider-error/empty-response paths.
- `pnpm smoke:speech:live` is available for explicit live provider checks. It skips by default and only calls configured real STT/TTS providers when `SPEECH_PROVIDER_LIVE_SMOKE=1` is set.
- Speech provider setup is documented in `ARCHITECTURE.md`: either self-host FunASR STT plus GPT-SoVITS TTS, or use MiniMax cloud TTS with an OpenAI-compatible transcription endpoint.

## Current Gaps

1. Graph-backed workflows are not implemented yet. Add LangGraph only when a skill truly needs graph orchestration, and keep it behind the extension boundary.
2. Workflow runner remains local-JSON backed and in-process for execution; it now has async start and stale recovery, but durable cross-process workers are still future hardening.
3. Connector boundary is implemented with `local.bookmarks`; additional real personal-service connectors still need per-connector permission and audit design.
4. `local-deterministic` proves a second adapter path, but additional live provider adapters should wait for a real provider/use case.
5. Speech Phase 1 half-duplex shell is implemented with deterministic providers, renderer recording/playback UI, FunASR-compatible transcription, local GPT-SoVITS TTS, cloud MiniMax TTS, settings readiness, and voice audit events; live provider validation and settings UI remain.

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

Status: verified hardened implementation; future work is deeper ranking/evaluation only if daily usage shows gaps.

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

Acceptance:

- `pnpm smoke:api:memory`
- Agent turn can retrieve memory without directly mutating it. Done for deterministic pre-prompt retrieval; mutation remains outside auto tool access.
- Extension memory writes require approval and can complete after approval. Done.
- Conflict detection, conflict resolution audit, matched terms, and ranking signals are covered by `pnpm smoke:api:memory`.

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
- Add provider readiness for STT/TTS. Done for missing, deterministic, `openai-audio-transcriptions-stt`, legacy `openai-compatible-stt`, `gpt-sovits-api`, and `minimax-t2a-v2`.
- Add speech audit events. Done for transcribe/synthesize requested, completed, and degraded states.
- Add provider adapter contract smoke. Done for OpenAI audio transcriptions STT, legacy `openai-compatible-stt`, `gpt-sovits-api`, and `minimax-t2a-v2` through local mock HTTP providers.
- Add gated live provider smoke. Done with `pnpm smoke:speech:live`; set `SPEECH_PROVIDER_LIVE_SMOKE=1` and provider env to execute real STT/TTS calls.
- Keep raw audio persistence disabled by default. Done in API metadata/policy.

Supported live provider tracks:

- Self-hosted: `SPEECH_STT_PROVIDER=openai-audio-transcriptions-stt` pointed at FunASR's `/v1/audio/transcriptions`, plus `SPEECH_TTS_PROVIDER=gpt-sovits-api` pointed at GPT-SoVITS `/tts`.
- Cloud TTS: `SPEECH_TTS_PROVIDER=minimax-t2a-v2` with MiniMax keys, plus an OpenAI-compatible transcription endpoint for STT.

Acceptance:

- `pnpm smoke:api:speech`
- `pnpm smoke:speech:providers`
- `pnpm smoke:speech:live` skips unless `SPEECH_PROVIDER_LIVE_SMOKE=1`
- Text chat still works through the same `/api/agent/messages` path.
- Renderer can complete record -> transcript -> agent -> playback with one provider or explicit degraded reason.

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
