# PROCESS.md

## Current State

SP Agent is a local-first, chat-first personal agent base:

```text
Electron shell
-> assistant-ui renderer
-> NestJS local API gateway
-> runtime adapter registry, Pi first
-> permissioned extensions
-> app-owned memory, approvals, workflows, speech
```

Active packages are `apps/api`, `apps/web`, `apps/desktop`, `packages/shared`, `packages/extensions`, `packages/agent-runtime`, and `packages/speech`.

Old Web3/research code is not part of the active product and should stay detached unless reintroduced as a new explicit personal-agent skill.

## Product Baseline

- The first screen is the assistant-ui chat shell on `/` and `/chat`.
- Chat sessions persist through the API, with PostgreSQL when `DATABASE_URL` is configured and local JSON fallback otherwise.
- Pi is the default runtime adapter; `local-deterministic` remains the offline fallback/registry verification adapter.
- The API gateway owns provider readiness, persistence, permission audit, approvals, extension execution, workflows, memory, and speech.
- Extension registry currently includes `core.agent-shell`, `local.memory`, `local.context`, `local.project`, `local.bookmarks`, and readiness-gated `local.speech`.
- Memory supports typed entries, search, candidate creation, promotion, update, merge, tombstone forgetting, provenance, conflict metadata, audit events, retrieval gating, and review UI.
- Write/provider extension actions require an approved matching `approvalId`; read-only actions execute directly with `permissionAudit`.
- Workflow records expose status, timestamps, node events, result/error/degraded reason, retry, cancel, async start, and stale-run recovery.
- Speech is implemented as a half-duplex API-owned chat path. Interruptible/streaming voice remains future work.

## Active Priorities

1. Keep memory reliable, inspectable, and reversible.
2. Keep approval and memory review flows clear in the chat shell.
3. Expand skills/workflows only through `packages/extensions` and API-owned execution.
4. Defer voice optimization until memory/skills stay stable.

## Current Gaps

- Memory extraction and consolidation need real-conversation tuning, not more hidden automation.
- Workflow execution is still local-JSON and in-process; introduce LangGraph or durable workers only for a real graph-shaped/long-running skill.
- Connector expansion should add read-only personal-service connectors first, each with explicit permission and audit design.
- Voice needs better states, provider settings, interruption, and streaming/chunked TTS later.
- Additional live runtime adapters should wait for a real provider/use case.

## Verification Policy

Use `pnpm typecheck` and `pnpm build` for broad checks. Run smoke tests only for touched critical boundaries:

- `pnpm smoke:api`: gateway health, readiness, sessions, extensions, and degraded agent behavior.
- `pnpm smoke:web`: built renderer routes and stable shell anchors.
- `pnpm smoke:desktop`: Electron startup invariants that do not require GUI interaction.
- `pnpm smoke:runtime`: runtime adapter registry and deterministic fallback behavior.
- `pnpm smoke:memory`: memory lifecycle, retrieval, audit, conflict, and forget behavior.
- `pnpm smoke:extensions`: extension registry, read-only skills, approval-gated execution, and permission audit.
- `pnpm smoke:workflows`: workflow run/list/retry/cancel/node-event behavior.
- `pnpm smoke:speech`: API-owned STT/TTS/voice chat path with deterministic providers.

Avoid adding new smoke scripts for one-time milestones. Prefer focused unit/contract tests or extend an existing boundary smoke when the behavior is a lasting regression risk.

## Working Rules

- Keep this file short. It is not a changelog.
- Keep `ARCHITECTURE.md` for boundaries and module contracts.
- Keep `AGENTS.md` for future-agent operating instructions.
- Do not auto-write durable user facts, project facts, files, posts, or external-account changes without an auditable policy and user approval.
- Treat missing credentials and unavailable local/cloud services as normal degraded product states.
