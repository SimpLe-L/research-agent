# SP Agent

SP Agent is a local-first desktop Research and Decision Agent built on a reusable, permissioned agent platform. It helps a user collect explicitly allowed evidence, inspect conflicting or insufficient information, and produce cited conclusions without silently retaining personal facts or taking external action.

The first flagship skill is `personal.research`. A user stays in the normal chat composer: the Agent decides when an active read-only Skill is useful, invokes it through the typed extension boundary, and returns an inspectable artifact in the reply. The platform underneath remains general: every capability enters through a typed extension boundary, while the local API owns memory, approval, workflows, persistence, provider readiness, and audit.

## Architecture

```text
Electron desktop shell
-> React chat-first renderer
-> NestJS local API control plane
-> replaceable agent runtime
-> permissioned extensions and connectors
-> app-owned memory, approvals, workflows, and speech
```

Agent runtimes can propose typed capabilities but cannot directly use shell, filesystem-write, browser-control, wallet, or posting tools. Write, provider, and destructive actions require an exact matching approval; durable memory is reversible and auditable.

## Research And Decision Workflow

```text
Chat request such as "帮我调研 xx，并给出证据和不确定项"
-> Agent selects `personal.research` when appropriate
-> API validates and runs the read-only capability
-> collect and normalize evidence
-> retrieve approved non-sensitive memory
-> compare supporting and conflicting evidence
-> produce a cited report with uncertainty
-> optionally request approval to promote a conclusion to memory
```

The initial release is local-first: allowlisted project documents, local bookmarks, and user-provided sources. Remote retrieval is added only through scoped, read-only connectors with provenance, explicit policy, and degraded states. Skill catalog, workflow, memory, and approval panels are for discovery and review; future Skills do not add new required launch buttons.

## Workspace

- `apps/api`: NestJS gateway and control plane.
- `apps/web`: React and assistant-ui chat shell.
- `apps/desktop`: Electron shell and API process orchestration.
- `packages/shared`: Zod schemas and shared contracts.
- `packages/extensions`: extension and connector registry.
- `packages/agent-runtime`: replaceable runtime adapters; Pi is the default.
- `packages/speech`: STT/TTS contracts and adapters.

## Quick Start

```bash
pnpm install
pnpm build
pnpm dev
```

For the desktop shell, run:

```bash
pnpm dev:desktop
```

Pi uses SiliconFlow configuration when a key is available. Without credentials, the application stays usable in deterministic degraded mode for boundary and UI verification.

## Verification

```bash
pnpm typecheck
pnpm build
pnpm smoke:api
pnpm smoke:extensions
pnpm smoke:memory
pnpm smoke:workflows
pnpm smoke:web
```

The deterministic suite does not require a live provider. Refer to [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) for the milestone sequence, evaluation requirements, and the portfolio definition of done.

## Safety Boundaries

- No private-key handling, transactions, posting automation, unrestricted shell, filesystem-write, or browser-control tools.
- Source evidence retains provenance, excerpt/locator, retrieval time, confidence, and visible degraded state.
- Durable memory promotion requires approval and maintains audit history, conflict metadata, and tombstone-based forgetting.
- Raw audio is not persisted by default.
