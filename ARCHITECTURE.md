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

The normal chat composer is the only primary capability invocation surface. A planner first classifies each message into ordinary chat, a locally grounded answer, or evidence-backed research. Ordinary chat may use the selected model directly and must not be presented as current or cited research. A locally grounded answer retrieves only relevant app-owned documents, bookmarks, or approved user sources before synthesis. Evidence-backed research selects a registered Skill and runs its inspectable workflow.

The planner selects a Skill, never an arbitrary URL, provider, or low-level Connector. The selected Skill owns a typed evidence blueprint: the questions to answer, freshness needs, evidence dimensions, and eligible Connector classes. The API validates that blueprint against the extension registry, source scope, budget, and active access policy, then invokes the Connector implementations. Connectors return source records and evidence; they do not make recommendations or own the final response. A request with no suitable Skill uses the generic local-first research Skill, or returns an explicit evidence gap rather than silently treating model knowledge as research.

For example, a request to research, compare, verify, or provide evidence is eligible for `personal.research`. Its result is persisted as a typed chat artifact alongside the assistant message, then rendered inline with an evidence summary and uncertainty. Workflow, Skill, memory, and approval panels remain secondary places to inspect history and audit data.

The runtime must not expose write, provider, or destructive capabilities for autonomous execution. The API may require a scoped approval or a user-enabled, revocable policy before it sends user data to a remote provider. Sensitive writes, imports, credential changes, external actions, and expanded data scopes remain per-action approvals. The deterministic offline router may select the same read-only capability for covered intents, but it must use the API invoker and never bypass the extension boundary.

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

The only reusable low-risk exception is remote research access: the first approved `personal.research.research.search_web` or `personal.research.research.run_provider_assisted` request creates a local, revocable `research/access` policy. It allows later calls to those two bounded, read-only remote capabilities without per-run confirmation while retaining a policy audit and workflow audit. It does not authorize arbitrary URL fetches, imports, memory writes, credential changes, or external writes.

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

`personal.research` is a generic local-first research orchestration Skill, not a claim that one generic web search can answer every decision question. The product separates four layers:

1. A model-backed planner interprets the message, chooses the response mode, and selects a registered Skill with typed input. It may use deterministic routing for simple covered intents.
2. The Skill turns its domain knowledge into a bounded evidence blueprint: decision type, required dimensions, freshness window, source classes, and eligible Connector capabilities. For ordinary chat it may instead select no retrieval; for local questions it selects app-owned sources only.
3. Typed Connectors retrieve domain data under API-owned, source-specific permissions. They return evidence-ready records with source identity, timestamp, units, limitations, and locators; they never return an untraceable recommendation.
4. Evidence-constrained model synthesis compares the collected evidence and writes a scenario-based conclusion. Every material conclusion must cite supporting or conflicting evidence; unsupported statements are removed or marked uncertain.

A planner model is useful for flexible intent interpretation and Skill selection, but it is not the policy engine. The API validates the selected Skill, its blueprint, every Connector, input schema, source policy, budget, and approval state before execution. The model cannot name arbitrary tools, URLs, providers, or source scopes, and a failed validation becomes an explicit evidence gap.

A domain Skill is optional reusable planning guidance, not a privileged per-question tool or a product boundary. For example, `crypto_investment` can require price/volume, volatility, sentiment, flows, and event-risk evidence. `market_entry` can require demand, customer behavior, channels, competition, regulation, unit economics, and execution risks. An unrecognized question uses a generic local-first Skill; it may request remote evidence only when the blueprint identifies a material external or freshness gap. Skills may select only registered Connectors, and neither Skills nor profiles may fetch data or call providers outside the API control plane.

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

`local.project` is the current minimal workflow-backed skill. `personal.research` scopes sources, collects, normalizes, retrieves relevant memory, compares evidence, and validates citations. Its provider-assisted path also creates a structured model plan over registered connectors, validates scope/budgets, pauses for approval before provider access, and synthesizes claims whose evidence ids are revalidated before persistence. Future profile-specific evidence plans preserve the same durable records, retry, cancellation, and stale-run recovery.

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
