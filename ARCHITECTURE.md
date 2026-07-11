# ARCHITECTURE.md

## Product Boundary

SP Agent is a local-first, chat-first personal agent platform. Its first flagship capability is a Research and Decision Agent that turns explicitly allowed local and remote sources into evidence-backed, cited conclusions. It is not a trading bot, wallet automation tool, social posting bot, Web3 workbench, or unrestricted coding/browser agent.

The desktop chat shell is the primary surface. Memory, approvals, skills, workflows, connectors, and voice are support systems behind the conversation, not separate dashboards. `personal.research` is the product wedge that proves the otherwise general extension platform.

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
- Header/composer entries may expose memory review, approvals, skill catalog, workflow review, provider/runtime status, and voice. They are review, audit, configuration, or discoverability surfaces; they are not the primary way to launch an individual Skill.
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
- research capability invocation and research workflow records through the extension/workflow APIs

The active API must not expose old Web3, market, watchlist, report, queue, worker, or removed research routes. New research behavior belongs under `personal.research` extension invocation and the generic workflow APIs; it must not recreate a parallel privileged research service.

## Runtime Contract

`packages/agent-runtime` exposes a `RuntimeAdapter` registry. Current adapters:

- `pi`: default live adapter using SiliconFlow configuration.
- `local-deterministic`: non-default fallback and registry verification adapter.

Runtime adapters must:

- degrade clearly on missing keys, unavailable providers, invalid output, or skipped tools;
- receive memory/session/tool context selected by the API;
- keep Pi shell/file/edit/write/browser tools disabled for this product path;
- avoid direct persistence, memory mutation, filesystem writes, browser control, or unrestricted provider calls.

## Autonomous Skill Routing Contract

The normal chat composer is the only primary capability invocation surface. The runtime receives a catalog derived from active extension manifests only after the API gateway has filtered it to read-only capabilities, plus narrowly defined proposal-only capabilities that can create an approval but cannot perform a provider action. It decides whether a capability is useful for the current message and invokes a stable per-capability tool; the tool fixes the extension id and capability id and calls back into the API gateway.

For example, a request to research, compare, verify, or provide evidence is eligible for `personal.research.research.run`. Its result is persisted as a typed chat artifact alongside the assistant message, then rendered inline with an evidence summary and uncertainty. Workflow, Skill, memory, and approval panels remain secondary places to inspect history and audit data.

The runtime must not expose write, provider, or destructive capabilities for autonomous execution. A proposal-only capability may create a `pending_approval` record for a specifically scoped provider action, but it must not access the provider itself. The action executes only after a matching approval id. The deterministic offline router may select the same read-only capability for covered intents, but it must use the API invoker and never bypass the extension boundary.

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

`personal.research` is the first flagship skill to add. Its initial capabilities should be limited to scoped, evidence-preserving research over allowlisted local documents, local bookmarks, and user-provided sources. It may produce a workflow-backed report, but it may not silently retain research conclusions as durable memory. Remote retrieval and credentialed connectors require source-specific permission policy, a visible audit trail, and explicit degraded states.

## Research Evidence Contract

A research result is not a free-form answer alone. It must preserve enough evidence for the user to inspect why a conclusion was made:

- a research request with the question, permitted source scope, and selected strategy;
- source records with identity, type, locator, retrieval time, and source-level degraded reason when applicable;
- evidence records with source references, excerpts or locators, relevance/confidence, and extraction metadata;
- claims with supporting and conflicting evidence references, plus an explicit insufficient-evidence state;
- a cited report containing conclusions, uncertainty, open questions, and the workflow run that produced it.

The API owns collection, normalization, evidence persistence, workflow state, and audit. The runtime may plan or request an allowed capability but never directly fetches sources or writes a report. Durable promotion of an accepted research conclusion into memory is a separate approval-gated action.

## Research Planning Contract

`personal.research` is a generic research orchestration skill, not a claim that one generic web search can answer every decision question. Its useful expansion has three separate layers:

1. A model-backed research planner interprets the question and proposes a bounded, structured evidence plan: decision type, required dimensions, freshness window, missing evidence, acceptable source classes, and candidate registered capabilities.
2. Typed connectors retrieve domain data under source-specific permissions. Connectors return evidence-ready records with source identity, timestamp, units, limitations, and locators; they never return an untraceable recommendation.
3. Evidence-constrained model synthesis compares the collected evidence and writes a scenario-based conclusion. Every material conclusion must cite supporting or conflicting evidence; unsupported statements are removed or marked uncertain.

A planner model is useful for flexible intent interpretation and plan generation, but it is not the policy engine. It returns a schema-valid proposed plan; the API validates every connector against the extension registry, input schema, source policy, budget, and approval state before execution. The model cannot name arbitrary tools, URLs, providers, or source scopes, and a failed validation becomes an explicit evidence gap.

A domain profile is optional declarative planning guidance, not a privileged per-question tool or a product boundary. For example, `crypto_investment` can require price/volume, volatility, sentiment, flows, and event-risk evidence. `market_entry` can require demand, customer behavior, channels, competition, regulation, unit economics, and execution risks. Profiles improve consistency for recurring decision types; an unrecognized question still receives a generic model-generated plan over the registered connector catalog. Profiles may select registered connectors, but they cannot fetch data or call providers themselves.

Provider-backed planning and synthesis are scoped provider actions. The API records which question, plan context, and evidence excerpts are sent, requires the applicable approval/policy, validates the plan and returned claim-to-evidence links, and retains the resulting report. It must produce decision support and scenarios, not personalized investment instructions, transactions, or automated actions.

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

`local.project` is the current minimal workflow-backed skill. `personal.research` currently scopes sources, collects, normalizes, retrieves relevant memory, compares evidence, synthesizes a cited report, and validates citations. The next expansion adds planning, approval pauses for remote sources or model synthesis, and profile-specific evidence plans while preserving the same durable records, retry, cancellation, and stale-run recovery.

LangGraph is not required for the first planner and two reference profiles. The existing workflow service remains the source of truth while branches are bounded and synchronous. Introduce LangGraph inside an API-owned research workflow adapter only when at least one of these is true:

- a plan fans out to several independent connectors with retry and partial-result policy;
- an approval pauses a multi-step run that must resume from a durable checkpoint;
- model synthesis needs a bounded revise/validate loop over claim-to-evidence links;
- connector latency or background execution makes in-process orchestration unreliable.

LangGraph may select the next workflow node, but it must call the extension registry for every capability, use API-owned approvals and persistence, emit the same workflow node events, and never grant the runtime direct provider, memory-write, browser, or filesystem authority.

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
