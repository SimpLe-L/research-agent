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
- Extension registry exposes `core.agent-shell`, active `local.memory`, active `local.context`, and planned `local.speech`.
- `web3.research`, `web3.market`, report, knowledge, watchlist, queue, and worker routes are no longer active.
- Web3/research source packages, API modules, web components, and smoke scripts were deleted from the active checkout.
- Chat sessions persist to local JSON.
- Frontend thread list is backed by API chat sessions through assistant-ui `RemoteThreadListRuntime` and `ThreadListPrimitive`.
- Frontend agent turns use assistant-ui `LocalRuntime` with a `ChatModelAdapter` that calls `/api/agent/messages`.
- Frontend thread history uses a thread-scoped assistant-ui `ThreadHistoryAdapter` that loads persisted API session messages.
- Frontend styling now has Tailwind CSS v4 and shadcn/base UI initialized in `apps/web`, with shadcn `button`, `sheet`, `tooltip`, and `dropdown-menu` components available.
- The assistant-ui shell now includes real desktop sidebar collapse, mobile sheet navigation, dynamic thread title, model dropdown shell, scroll-to-bottom control, basic message actions, and two-level welcome suggestions that can send prompts through the assistant-ui runtime.
- `PATCH /api/chat/sessions/:id` updates session titles for assistant-ui thread rename/title generation.
- `POST /api/agent/messages` persists both user and assistant messages to the chat session.
- `local.memory` is active with local JSON-backed write candidates, search, source/provenance metadata, and tombstone deletion.
- `packages/shared` now contains only generic agent/chat/settings/extension contracts.
- `packages/agent-runtime` now contains only generic Pi personal-agent turn behavior and runtime readiness.
- `pnpm smoke:api` validates the active gateway and asserts `web3.research` is not registered.
- `.env` contains a SiliconFlow key and live Pi runtime verification passes.
- `pnpm smoke:api:pi-live` verifies the Nest API can call Pi/SiliconFlow and persist the live conversation.
- Browser-level built web verification passes against the live API: the page shows `Base ready`, sends a message, and renders a Pi response.
- Electron desktop issues found during GUI smoke were fixed: the shell no longer auto-loads a stale `127.0.0.1:5173` dev server, and the API child process now uses a real Node executable instead of Electron's Node mode so Pi SDK can load.
- Electron GUI smoke now passes: `pnpm --filter @sp-agent/desktop start` opens the built assistant-ui Base screen, shows `Base ready`, exposes `pi` plus the extension count, sends a chat message, and renders a Pi/SiliconFlow response.
- `local.context` is the first non-voice read-only skill behind the extension boundary; `pnpm smoke:api:extensions` verifies registry, invocation, and permission audit.
- `pnpm smoke:desktop:preflight` protects Electron startup invariants without needing GUI approval.
- `pnpm smoke:desktop:api-child` verifies the same Node child-process strategy Electron uses can load the Pi SDK and read the extension registry.
- The renderer header shows the active extension count so the shell exposes extension capacity without adding a complex workbench UI.

## Current Gaps

1. Memory update/merge/promotion policy is not implemented beyond write candidates and tombstones.
2. Runtime adapter contract is Pi-first; additional adapters are not implemented yet.
3. Skill/workflow layer only has the minimal read-only `local.context` skill; no graph-backed workflow exists yet.
4. Speech is intentionally last; current UI keeps only a disabled mic slot.

## Roadmap

### Phase 1: Chat-First Shell

Status: verified and extended with API-backed thread sessions.

Delivered:

- `/` and `/chat` render the assistant-ui runtime-backed shell.
- First-screen chat calls `/api/agent/messages`.
- Old workbench routes are removed from the active router.
- Route smoke verifies only `/` and `/chat`.
- Frontend thread list loads from `GET /api/chat/sessions`.
- New Thread creates sessions through `POST /api/chat/sessions`.
- Agent turns persist user and assistant messages into the selected session.

Latest verification:

- `pnpm typecheck`
- `pnpm build`
- `pnpm smoke:web:routes`
- Browser visual check at desktop `1280x720` and mobile `390x844`: no missing core anchors and no horizontal overflow.
- `pnpm --filter @sp-agent/web build`
- `pnpm smoke:web:routes`

### Phase 2: Minimal Agent Gateway

Status: verified.

Delivered:

- Active API no longer imports research/database/market/knowledge/watchlist services.
- Active extension registry contains `core.agent-shell`, active `local.memory`, active `local.context`, and planned `local.speech`.
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

Status: partially implemented.

Deliverables:

- Add app-owned memory schemas and service. Done.
- Define memory entry, source/provenance, scope, confidence, and deletion/tombstone contracts. Done.
- Add memory search and memory write-candidate APIs. Done.
- Register implemented memory capabilities in `packages/extensions`. Done.
- Expose memory search to the agent as a read-only tool first. Done through both extension invocation and deterministic retrieval context before the agent turn.

Acceptance:

- `pnpm smoke:api:memory`
- Agent turn can retrieve memory without directly mutating it. Done for deterministic pre-prompt retrieval; mutation remains outside auto tool access.

### Phase 4: Skill And Workflow Layer

Status: started with a minimal read-only skill.

Deliverables:

- Add one small non-voice personal-agent skill behind `packages/extensions`. Done with `local.context`.
- Keep skill invocation typed, permissioned, and observable. Done for `context.snapshot`.
- Add API smoke coverage for the skill. Done with `pnpm smoke:api:extensions`.
- Add `packages/workflows` only if the skill genuinely needs graph orchestration.
- If LangGraph is introduced, wrap it inside the skill capability and keep node events observable.

Acceptance:

- API smoke for the implemented skill.
- Existing chat, memory, and runtime smokes still pass.

### Phase 5: Speech Layer

Last target.

Deliverables:

- Add `packages/speech` for STT/TTS provider contracts.
- Add API voice session flow for half-duplex chat.
- Add renderer record/transcribe/send/playback flow.
- Add provider readiness for STT/TTS.
- Keep raw audio persistence disabled by default.

Acceptance:

- `pnpm smoke:api:speech`
- Text chat still works.
- Renderer can complete record -> transcript -> agent -> playback with one provider or explicit degraded reason.

## Verification Commands

Run before handing off meaningful code changes:

```bash
pnpm typecheck
pnpm build
pnpm smoke:api
pnpm smoke:api:extensions
pnpm smoke:api:memory
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

Future speech checks:

```bash
pnpm smoke:api:speech
```

## Working Rules

- Keep `PROCESS.md` focused on current state, gaps, roadmap, and verification. Do not turn it into a chronological log.
- Keep `ARCHITECTURE.md` focused on product boundaries and package/runtime contracts.
- Keep `AGENTS.md` as the instruction contract for future agents working in this repo.
- Keep old Web3/research code detached from active imports, workspace builds, routes, smokes, and extension registry unless explicitly reintroduced.
- Do not add unrestricted local computer-control powers to the personal agent.
- Treat missing provider credentials and unavailable services as normal degraded product states.
