# ARCHITECTURE.md

## Product Boundary

The target product is a local-first personal Agent OS. The first version is a desktop chat agent that can call permissioned local skills, persist conversations, use app-owned memory, and degrade clearly when providers are missing. Voice interaction is a final-phase feature.

The product is not a trading bot, wallet automation tool, social posting bot, Web3 workbench, or unrestricted coding/browser agent. Old Web3/research files have been removed from the active project.

## Active Runtime

```text
Electron desktop shell
-> React renderer using assistant-ui runtime/primitives
-> NestJS Local API Gateway
-> session, permissions, provider readiness, extension registry
-> agent-runtime adapter layer, Pi first
-> app-owned tools, memory, skills, workflows
-> speech only after the typed agent loop is stable
```

The local API gateway is the control plane. It owns permissions, provider readiness, extension invocation, and future persistence/audit. Agent runtimes can request tool calls, but they do not directly own privileged app behavior.

Electron development behavior:

- The desktop shell loads the built renderer by default.
- `RENDERER_URL` is the only way to opt into a dev server; this prevents stale local dev servers from replacing the built assistant-ui screen.
- The desktop shell starts the API with a real Node executable (`NODE_BINARY`, `npm_node_execpath`, or `node`) so Pi SDK dependencies run under normal Node rather than Electron's Node compatibility mode.
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
```

Target future packages:

```text
packages/
  memory/          app-owned long-term memory layer
  workflows/       optional workflow engines such as LangGraph
  persistence/     durable storage boundary when needed
  speech/          final-phase STT/TTS/VAD/audio provider boundary
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
-> disabled mic slot until the final speech phase
```

The renderer should stay compact and predictable:

- Preserve stable `data-testid` anchors.
- Keep thread/session behavior visible.
- Keep voice controls disabled until the final speech phase.
- Do not add marketing hero pages, decorative dashboards, or complex workbench navigation to the first screen.
- Use `assistant-ui` runtime/primitives as the chat state and interaction boundary instead of custom chat state where possible.
- Use Tailwind CSS v4 plus shadcn/base UI primitives for the assistant-ui example-style shell controls: buttons, tooltips, sheet navigation, dropdowns, and future menus.
- Current web runtime uses `useRemoteThreadListRuntime` plus a local `RemoteThreadListAdapter` for API-backed chat sessions.
- Current message runtime uses `useLocalRuntime` plus a `ChatModelAdapter` that calls `POST /api/agent/messages`; assistant-ui owns composer/run lifecycle while the API gateway owns provider, permission, memory, and persistence behavior.
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
- `POST /api/memory/candidates`
- `DELETE /api/memory/:id`
- `GET /api/agent/status`
- `POST /api/agent/messages`
- `GET /api/extensions`
- `GET /api/extensions/:id`
- `POST /api/extensions/:id/invoke`

The current API intentionally does not expose Web3 research, market, watchlist, report, queue, or worker routes.

## Agent Runtime Layer

`packages/agent-runtime` is the runtime adapter layer. Pi is the first/default adapter, but the architecture should allow additional adapters later.

Runtime responsibilities:

- Maintain a model-facing agent turn.
- Receive session context selected by the API.
- Request typed tool calls through the API-owned tool boundary.
- Produce assistant text, structured tool-call audit, and degraded reasons.

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
- `local.speech`: planned STT/TTS contract; not implemented yet.

A skill manifest should describe id, status, capabilities, schemas, permissions, provider requirements, and degraded behavior. A planned skill can exist in the registry, but invocation must return an explicit degraded reason until implementation exists.

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

Memory types:

- `session`: current thread messages and short summaries.
- `episodic`: historical conversations, tasks, and important events.
- `semantic`: stable facts, user preferences, project knowledge, and reusable notes.
- `procedural`: reusable workflows, skill preferences, and operating habits.
- `audit`: provenance, timestamps, source links, and why a memory was written or changed.

Target memory tools:

- `memory.search`
- `memory.write_candidate`
- `memory.promote_fact`
- `memory.update`
- `memory.forget`

The API should decide which memory operations are automatic and which require user confirmation.

Current implementation:

- Chat sessions persist to `chat.json` under `SP_AGENT_DATA_DIR` or `.sp-agent-data`.
- Memory entries persist to `memory.json` under `SP_AGENT_DATA_DIR` or `.sp-agent-data`.
- `memory.search` is read-only and can be exposed to agent tool calls.
- `memory.write_candidate` creates auditable entries but is classified as `write_or_provider`, so agent auto-tool calls cannot invoke it yet.
- Forgetting is tombstone-based through `DELETE /api/memory/:id`; tombstoned memories do not appear in search.
- `POST /api/agent/messages` performs deterministic read-only memory retrieval before calling the runtime and returns the selected `memoryContext`.

## Speech Architecture

Speech is intentionally last. It is an interaction layer around the agent, not part of Pi, and should wait until typed chat sessions, memory retrieval, desktop launch, and at least one non-voice skill/workflow path are stable.

First version:

```text
click or hold to record
-> capture one audio clip
-> STT returns final transcript
-> transcript enters the normal agent message path
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

Raw audio persistence should be disabled by default unless the product adds a clear setting and retention policy.

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
- `pnpm smoke:api:pi-live` when `.env` has live credentials
- `pnpm smoke:desktop:preflight`
- `pnpm smoke:desktop:api-child`
- `pnpm smoke:web:routes`
- `pnpm smoke:agent-runtime`
- `pnpm smoke:agent-runtime:pi`
- `PI_LIVE_SMOKE=1 pnpm smoke:agent-runtime:pi` when `.env` has live credentials

Future speech work should add `pnpm smoke:api:speech` when implemented.
