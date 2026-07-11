# AGENTS.md

## Product Boundary

This repository is a local-first, chat-first personal agent platform. Its first flagship product capability is a Research and Decision Agent: it gathers explicitly allowed evidence, identifies gaps or conflicts, produces cited conclusions, and asks before creating durable memory or taking any external action.

The extension/runtime architecture remains general-purpose, but new work must strengthen the `personal.research` path before adding unrelated skills. Old Web3 and removed research surfaces remain out of scope. Do not restore their routes, packages, scripts, registry entries, or UI; rebuild research only through the current extension, approval, memory, and workflow boundaries.

## Active Workspace

- `apps/api`: NestJS local API gateway and control plane.
- `apps/web`: React/assistant-ui renderer.
- `apps/desktop`: Electron shell and API child process orchestration.
- `packages/shared`: shared Zod schemas and TypeScript contracts.
- `packages/extensions`: local skill/connector registry and permission metadata.
- `packages/agent-runtime`: runtime adapter registry; Pi is the default adapter.
- `packages/speech`: STT/TTS provider contracts and adapters.

## Architecture Rules

- The local API gateway owns permissions, persistence, audit events, provider readiness, approval execution, memory, workflows, and tool execution.
- Agent runtimes may propose or request tool calls; they must not own privileged app behavior.
- Pi built-in shell/file/edit/write/browser tools stay disabled for the v0.x personal-agent path.
- All capabilities enter through `packages/extensions`, declare typed input/output, return `permissionAudit`, and degrade explicitly when unavailable.
- Read-only extension calls may execute directly. Write/provider/destructive calls must return `pending_approval` unless invoked with a matching approved `approvalId`.
- Memory is app-owned, searchable, auditable, reversible, and exposed to runtimes only through typed read paths unless the user approves a write.
- Research claims must be evidence-backed. Preserve source identity, source type, excerpt or locator, retrieval time, and confidence; surface insufficient or conflicting evidence instead of inventing a conclusion.
- Research workflows execute in the API control plane. A runtime may request a scoped research capability, but it must not fetch sources, persist reports, or promote research findings by itself.
- Remote retrieval, credentialed connectors, and any provider call that sends user data require an explicit scoped policy and an audit record. Do not introduce unrestricted browser automation.
- Voice is a chat interaction layer: microphone capture -> STT -> normal agent turn with memory/tools -> TTS -> playback. Do not place speech provider logic inside runtime adapters.
- LangGraph may be introduced later inside a skill/workflow adapter, but it must not bypass the API gateway, permission model, memory layer, or extension registry.

## Renderer Rules

- Keep `apps/web/src/main.tsx` bootstrap-only: router creation, root render, and global style import.
- Put shell/runtime/panel code under `apps/web/src/app` and `apps/web/src/components/app`.
- Use assistant-ui primitives for chat state where possible.
- Use shadcn/base UI and Tailwind utility classes before adding custom CSS.
- Keep the first screen compact and chat-first; Agent-selected read-only Skills run from normal conversation. Memory, approvals, skills, workflows, and voice remain small review/configuration surfaces, not per-Skill launch flows or a separate dashboard.
- Preserve stable `data-testid` anchors when changing shell navigation or core review panels.

## Safety Rules

- Do not store or request private keys.
- Do not add wallet transaction, swap, transfer, posting automation, unrestricted shell, unrestricted filesystem write, or browser-control tools in v0.x.
- Do not invent provider results, personal memory, or external data. Missing data must be surfaced as a degraded reason.
- Memory entries must preserve provenance when available. Durable preferences, identity facts, project facts, promotion/update/merge/forget, and conflict resolution must be auditable.
- Raw audio is not persisted unless the product explicitly adds a setting and retention policy.

## Development Rules

- Prefer small typed modules and shared schemas in `packages/shared`.
- Update `PROCESS.md` only for current state, next work, or verification policy changes. Do not use it as a chronological log.
- Keep `ARCHITECTURE.md` focused on boundaries and contracts, not implementation history.
- When adding a capability, register it in `packages/extensions` before making it a first-class agent skill.
- Keep `local.project` read-only and restricted to explicitly allowlisted project documents until a broader file permission model exists.
- Keep the first `personal.research` release local-first: allowlisted documents, local bookmarks, and user-provided sources. Add remote source connectors one at a time, read-only, with source-specific permission and degraded states.
- Be selective with smoke tests. Run `pnpm typecheck` and `pnpm build` for broad confidence; run the relevant smoke only for the boundary you touched:
  - API/control plane: `pnpm smoke:api`
  - renderer routes/shell anchors: `pnpm smoke:web`
  - Electron startup invariants: `pnpm smoke:desktop`
  - runtime adapter registry/fallbacks: `pnpm smoke:runtime`
  - memory contracts: `pnpm smoke:memory`
  - extension/approval contracts: `pnpm smoke:extensions`
  - workflows: `pnpm smoke:workflows`
  - speech API path: `pnpm smoke:speech`

## Priority Order

1. Deliver an evidence-backed, inspectable Research and Decision Agent workflow.
2. Keep memory, source provenance, approvals, and research conclusions auditable and reversible.
3. Expand skills/workflows only through the extension boundary and prove extensibility with small reference skills.
4. Optimize voice and add unrelated personal-agent capabilities only after research reliability and evaluation are stable.
