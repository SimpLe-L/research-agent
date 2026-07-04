# AGENTS.md

## Project Mission

This repository is now a local-first personal Agent OS base. Treat it as a new product: one desktop chat surface, a local NestJS gateway, replaceable agent runtimes, permissioned skills, long-term memory, and voice I/O only after the typed chat/memory/skill loop is stable.

Old Web3/research code has been removed from the active project. Do not restore those routes, packages, scripts, registry entries, or UI surfaces unless the user explicitly reintroduces that domain as a new personal-agent skill.

## Current Product Direction

- Use TypeScript as the primary implementation language.
- Active workspace packages are `apps/api`, `apps/web`, `apps/desktop`, `packages/shared`, `packages/extensions`, and `packages/agent-runtime`.
- Keep Electron as the desktop shell and NestJS as the local API gateway/control plane.
- Use React and `assistant-ui` for the first-screen chat experience. The target is the assistant-ui Base example: simple thread sidebar, central new-chat composer, optional runtime selector, and disabled mic slot until the last phase.
- Treat Pi as the default initial runtime adapter, not the whole architecture. `packages/agent-runtime` should remain ready for additional adapters later.
- Keep `packages/extensions` as the registry for local skills and app capabilities. Current registry: active `core.agent-shell`, active `local.memory`, active `local.context`, and planned `local.speech`.
- LangGraph may be introduced later as a workflow engine inside complex skills, but it must not bypass the local API gateway, permission model, memory layer, or extension registry.
- Add first-class long-term memory as an app-owned layer. Memory should be persisted, searchable, auditable, and exposed to runtimes only through typed tools.
- Chat sessions and memory entries currently persist to local JSON under `SP_AGENT_DATA_DIR` or `.sp-agent-data`.
- Defer speech until the end. STT/TTS should not be implemented until the typed chat, durable sessions, memory retrieval, and basic skill/workflow path are stable.

## Architecture Principles

- The local API gateway owns permissions, persistence, audit events, provider readiness, and tool execution.
- Agent runtimes propose or request tool calls; they do not own privileged app behavior.
- Tools, skills, memory writes, provider calls, and workflow nodes must be implemented outside prompts and typed through shared schemas where practical.
- Runtimes must degrade gracefully. Missing keys, missing providers, invalid model output, or skipped tool calls should produce visible degraded reasons instead of crashes or invented results.
- Pi built-in shell/file/edit/write/browser tools must stay disabled for the v0.x personal-agent path.
- Voice input/output is a final-phase interaction layer: microphone capture -> STT -> agent turn -> TTS -> playback. Do not embed speech provider logic inside agent runtime adapters.

## Safety Rules

- Do not store or request private keys.
- Do not add wallet transaction, swap, transfer, or posting automation in v0.x.
- Do not expose unrestricted shell, filesystem write, browser-control, or code-edit tools to the personal agent.
- Do not invent provider, personal-memory, or external data. Missing data must be surfaced as a degraded reason.
- All high-risk, paid-provider, external-posting, destructive, or local-file-write access must remain explicit and configurable.
- Memory entries must preserve source/provenance fields whenever available.
- Memory writes that create durable user preferences, identity facts, or important project facts should be auditable and reversible.
- When voice is eventually added, it must clearly separate local capture, STT provider use, transcript storage, and TTS provider use. Do not silently persist raw audio unless the product explicitly adds that policy.

## Development Conventions

- Prefer small, typed modules with Zod schemas in `packages/shared`.
- Update `PROCESS.md` after completing meaningful implementation steps.
- Keep `ARCHITECTURE.md` aligned whenever package boundaries, runtime processes, speech/memory contracts, or skill boundaries change.
- When adding a capability, register it in `packages/extensions` before making it a first-class agent skill.
- Extension invocations must return `permissionAudit`.
- Pi-triggered extension calls may only execute read-only/search capabilities until a broader permission model is designed. `memory.write_candidate` is API-callable, but its audit mode is `write_or_provider`, so the agent must not auto-call it.
- Keep task/workflow nodes observable when workflows are introduced: status, timestamps, error, payload, and degraded reason.
- When changing `packages/agent-runtime`, run the runtime smoke for the touched provider and keep deterministic fallbacks intact.
- When changing Pi runtime behavior, run `pnpm smoke:agent-runtime:pi`; if `.env` has a valid SiliconFlow key, also run `PI_LIVE_SMOKE=1 pnpm smoke:agent-runtime:pi` and `pnpm smoke:api:pi-live`.
- When adding LangGraph, add tests around the graph contract and keep the graph behind an extension/skill adapter.
- When changing memory, run `pnpm smoke:api:memory` and verify create/search/forget behavior before wiring more model access.
- Do not add speech work before chat persistence, memory policy, desktop smoke, and at least one non-voice skill/workflow path are stable.
- When changing renderer navigation or shell layout, preserve stable `data-testid` anchors and run `pnpm smoke:web:routes` after `pnpm build`.
- When changing Electron startup behavior, run `pnpm smoke:desktop:preflight` and `pnpm smoke:desktop:api-child` after `pnpm build`; GUI re-smoke with `pnpm --filter @sp-agent/desktop start` when approval is available and confirm the built renderer, `Base ready`, `pi`, extension count, and a rendered chat response.
- Do not prioritize browser-level click automation unless UI regressions become a real blocker.

## Initial Development Order

1. Keep the active app minimal and detached from old Web3/research code.
2. Keep the Electron/renderer first screen as assistant-ui Base-style chat.
3. Stabilize the local API gateway as the single control plane for agent turns, provider status, permissions, and events.
4. Keep Pi as the first runtime adapter while making `agent-runtime` ready for additional adapters.
5. Add the app-owned long-term memory layer and expose memory through permissioned tools.
6. Add at least one non-voice skill/workflow path; introduce LangGraph only for skills that truly need multi-step graph orchestration.
7. Add speech provider boundaries and first support half-duplex voice chat: record -> STT -> agent turn -> TTS -> playback.
