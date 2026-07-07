# ARCHITECTURE.md

## Product Boundary

SP Agent is a local-first, chat-first personal agent. It is not a trading bot, wallet automation tool, social posting bot, Web3 workbench, or unrestricted coding/browser agent.

The desktop chat shell is the primary surface. Memory, approvals, skills, workflows, connectors, and voice are support systems behind the conversation, not separate dashboards.

## Runtime Shape

```text
Electron desktop shell
-> React renderer using assistant-ui
-> NestJS local API gateway
-> runtime adapter registry, Pi first
-> extension registry and handlers
-> app-owned memory, approvals, workflows, speech
```

The API gateway is the control plane. It owns persistence, provider readiness, approvals, extension invocation, workflow execution, memory, speech, and audit. Runtime adapters produce assistant turns and may request typed capabilities, but they do not execute privileged app behavior directly.

## Workspace

- `apps/api`: NestJS gateway and control plane.
- `apps/web`: assistant-ui renderer, chat shell, and compact review panels.
- `apps/desktop`: Electron shell and local API process orchestration.
- `packages/shared`: Zod schemas and shared TypeScript contracts.
- `packages/agent-runtime`: replaceable runtime adapters; Pi is the default.
- `packages/extensions`: skill/connector manifests and permission metadata.
- `packages/speech`: STT/TTS provider contracts and adapters.

## Renderer Contract

- `apps/web/src/main.tsx` stays bootstrap-only.
- App/runtime/layout code lives under `apps/web/src/app` and `apps/web/src/components/app`.
- `/` and `/chat` render the chat-first shell.
- assistant-ui primitives own chat thread/composer state where practical.
- Header/composer entries may expose memory review, approvals, skill catalog, workflow review, provider/runtime status, and voice.
- Use shadcn/base UI and Tailwind utilities first. Keep global CSS limited to theme/reset and genuinely shared surfaces.
- Preserve stable `data-testid` anchors for route/shell smoke coverage.

## API Gateway Contract

Core API surfaces:

- health/providers/settings readiness
- chat sessions and messages
- agent status/messages/stream
- memory search/lifecycle/audit
- extension list/get/invoke
- approval list/create/decide
- workflow list/get/retry/cancel/project-doc search
- voice status/transcribe/synthesize/chat/audit

The active API must not expose old Web3/research, market, watchlist, report, queue, or worker routes.

## Runtime Contract

`packages/agent-runtime` exposes a `RuntimeAdapter` registry. Current adapters:

- `pi`: default live adapter using SiliconFlow configuration.
- `local-deterministic`: non-default fallback and registry verification adapter.

Runtime adapters must:

- degrade clearly on missing keys, unavailable providers, invalid output, or skipped tools;
- receive memory/session/tool context selected by the API;
- keep Pi shell/file/edit/write/browser tools disabled for this product path;
- avoid direct persistence, memory mutation, filesystem writes, browser control, or unrestricted provider calls.

## Extension And Approval Contract

`packages/extensions` is the app-owned capability registry. Active manifests:

- `core.agent-shell`
- `local.memory`
- `local.context`
- `local.project`
- `local.bookmarks`
- `local.speech`

Each capability declares permissions and schemas. Invocation returns `permissionAudit`.

Read-only capabilities execute immediately. Write/provider/destructive capabilities must return `pending_approval` unless called with an approved `approvalId` that matches the same extension id, capability id, and input. The renderer approval panel may approve/deny requests, but privileged execution still happens in the API by reinvoking the extension with the approved id.

## Memory Contract

Memory is app-owned, not runtime-owned. Entries persist locally under `SP_AGENT_DATA_DIR` or `.sp-agent-data` unless a configured database/provider boundary says otherwise.

Supported memory kinds:

- `core`: stable facts and durable preferences.
- `journal`: time-addressable conversation events.
- `summary`: compressed session/time-window context.
- `procedural`: reusable working habits.
- `project`: project facts and decisions.

Memory search is read-only. Durable writes, promotion, update, merge, and forget/tombstone operations must preserve provenance and audit events. Agent turns may receive active, relevant, non-sensitive memory context; they must not silently promote durable memories.

Optional vector or intelligence providers are accelerators behind this contract, not the source of truth.

## Workflow Contract

Workflow records persist locally and expose:

- `status`: pending, running, completed, failed, or cancelled;
- timestamps;
- node events with payload/error/degraded reason;
- final result/error/degraded reason;
- retry and cancel behavior.

`local.project` is the first workflow-backed skill. LangGraph or durable workers should be introduced only when a real skill needs graph orchestration or stronger recovery.

## Speech Contract

Speech is a chat interaction layer:

```text
record audio
-> STT provider
-> normal agent message path with memory and tools
-> TTS provider
-> renderer playback
```

Speech provider logic belongs in `packages/speech` and API services, not in runtime adapters. Raw audio is not persisted by default. STT/TTS failures should produce visible degraded states while typed chat remains usable.

Supported provider tracks remain:

- self-hosted FunASR-compatible STT plus GPT-SoVITS TTS;
- cloud TTS through MiniMax or MiMo plus an OpenAI-compatible transcription endpoint.

Interruptible and streaming voice are future optimizations.

## Verification Strategy

Default checks:

```bash
pnpm typecheck
pnpm build
```

Boundary smokes:

```bash
pnpm smoke:api
pnpm smoke:web
pnpm smoke:desktop
pnpm smoke:runtime
pnpm smoke:memory
pnpm smoke:extensions
pnpm smoke:workflows
pnpm smoke:speech
```

Run only the smokes relevant to the files and behavior touched. Do not keep one-off milestone or live-provider smoke scripts in the default project surface.
