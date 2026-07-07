# AGENTS.md

## Project Mission

This repository is now a local-first chat-first personal agent base. Treat it as a new product: one desktop chat surface, a local NestJS gateway, replaceable agent runtimes, permissioned skills, long-term memory, and voice chat as a first-class interaction layer once the typed chat/memory/skill loop is stable.

Old Web3/research code has been removed from the active project. Do not restore those routes, packages, scripts, registry entries, or UI surfaces unless the user explicitly reintroduces that domain as a new personal-agent skill.

## Current Product Direction

- Use TypeScript as the primary implementation language.
- Active workspace packages are `apps/api`, `apps/web`, `apps/desktop`, `packages/shared`, `packages/extensions`, `packages/agent-runtime`, and `packages/speech`.
- Keep Electron as the desktop shell and NestJS as the local API gateway/control plane.
- Use React and `assistant-ui` for the first-screen chat experience. The target is the assistant-ui Base example: simple thread sidebar, central new-chat composer, optional runtime selector, and a mic slot that becomes active through the API-owned speech layer.
- Treat Pi as the default initial runtime adapter, not the whole architecture. `packages/agent-runtime` should remain ready for additional adapters later.
- Keep `packages/extensions` as the registry for local skills, connectors, and app capabilities. Current registry: active `core.agent-shell`, active `local.memory`, active `local.context`, active `local.project`, active `local.bookmarks`, and readiness-gated `local.speech`.
- Keep write/provider/destructive capability execution behind the API-owned approval queue. Extension calls can request approval, but approved API/user action must execute the privileged step.
- LangGraph may be introduced later as a workflow engine inside complex skills, but it must not bypass the local API gateway, permission model, memory layer, or extension registry.
- Add first-class long-term memory as an app-owned layer. Memory should be persisted, searchable, auditable, and exposed to runtimes only through typed tools.
- Chat sessions persist to PostgreSQL when `DATABASE_URL` is configured, with local JSON fallback under `SP_AGENT_DATA_DIR` or `.sp-agent-data` only when the database is unavailable. Memory entries currently persist to local JSON under `SP_AGENT_DATA_DIR` or `.sp-agent-data`.
- Speech is now a core chat interaction path, not a separate agent runtime. Implement it through API-owned STT/TTS provider boundaries after preserving typed chat, durable sessions, memory retrieval, and basic skill/workflow behavior. Keep two supported provider tracks: self-hosted FunASR STT plus GPT-SoVITS TTS, or cloud MiniMax TTS paired with an OpenAI-compatible transcription endpoint.

## Architecture Principles

- The local API gateway owns permissions, persistence, audit events, provider readiness, and tool execution.
- Agent runtimes propose or request tool calls; they do not own privileged app behavior.
- Tools, skills, memory writes, provider calls, and workflow nodes must be implemented outside prompts and typed through shared schemas where practical.
- Runtimes must degrade gracefully. Missing keys, missing providers, invalid model output, or skipped tool calls should produce visible degraded reasons instead of crashes or invented results.
- Pi built-in shell/file/edit/write/browser tools must stay disabled for the v0.x personal-agent path.
- Voice input/output is a chat interaction layer: microphone capture -> STT -> normal agent turn with memory/tools -> TTS -> playback. Do not embed speech provider logic inside agent runtime adapters.

## Safety Rules

- Do not store or request private keys.
- Do not add wallet transaction, swap, transfer, or posting automation in v0.x.
- Do not expose unrestricted shell, filesystem write, browser-control, or code-edit tools to the personal agent.
- Do not invent provider, personal-memory, or external data. Missing data must be surfaced as a degraded reason.
- All high-risk, paid-provider, external-posting, destructive, or local-file-write access must remain explicit and configurable.
- Memory entries must preserve source/provenance fields whenever available.
- Memory writes that create durable user preferences, identity facts, or important project facts should be auditable and reversible.
- Memory candidates, promotion, update, merge, forget, conflict detection, and conflict resolution operations must write audit events.
- Voice must clearly separate local capture, STT provider use, transcript storage, and TTS provider use. Do not silently persist raw audio unless the product explicitly adds that policy.

## Development Conventions

- Prefer small, typed modules with Zod schemas in `packages/shared`.
- Update `PROCESS.md` after completing meaningful implementation steps.
- Keep `ARCHITECTURE.md` aligned whenever package boundaries, runtime processes, speech/memory contracts, or skill boundaries change.
- For renderer UI, prefer existing shadcn/base UI components and Tailwind utility classes first. Keep `styles.css` limited to Tailwind/shadcn setup, theme tokens, global resets, and genuinely shared or hard-to-express surfaces; do not grow it with one-off component styling when component-level Tailwind classes or shadcn primitives fit.
- Be selective with smoke tests. Run smoke tests for critical/high-risk behavior, API contracts, persistence, runtime/provider boundaries, workflow/memory/speech logic, Electron startup, or changes that could silently break core paths. For routine UI tweaks, low-risk component styling, copy changes, and documentation-only edits, avoid smoke tests unless there is a concrete regression risk; use lighter checks only when they add clear value.
- When adding a capability, register it in `packages/extensions` before making it a first-class agent skill.
- Extension invocations must return `permissionAudit`.
- Pi-triggered extension calls may only execute read-only/search capabilities until a broader permission model is designed. `memory.write_candidate` is API-callable, but its audit mode is `write_or_provider`, so the agent must not auto-call it.
- Write/provider extension handlers must require an approved `approvalId` or return `pending_approval`.
- Keep the renderer approval review UI wired to the API-owned approval queue; do not execute write/provider actions directly from the renderer.
- Keep task/workflow nodes observable when workflows are introduced: status, timestamps, error, payload, and degraded reason.
- Keep `local.project` read-only and restricted to explicitly allowlisted project documents unless a broader file permission model is designed.
- When changing workflows, run `pnpm smoke:api:workflows` and keep retry/cancel/node-event plus async start/recovery behavior covered.
- When changing runtime selection or adapter behavior, keep `packages/agent-runtime` behind the `RuntimeAdapter` registry and expose registered adapters through `GET /api/agent/status`. Current adapters are default `pi` and non-default `local-deterministic` for offline fallback and registry verification.
- When changing `packages/agent-runtime`, run the runtime smoke for the touched provider and keep deterministic fallbacks intact.
- When changing Pi runtime behavior, run `pnpm smoke:agent-runtime:pi`; if `.env` has a valid SiliconFlow key, also run `PI_LIVE_SMOKE=1 pnpm smoke:agent-runtime:pi` and `pnpm smoke:api:pi-live`.
- When adding LangGraph or connector-backed skills, add tests around the graph/connector contract and keep the implementation behind an extension adapter with permission audit.
- When changing memory, run `pnpm smoke:api:memory` and verify create/search/forget behavior before wiring more model access.
- Memory search changes must preserve matched terms and ranking signals; memory write changes must preserve conflict metadata and audit provenance.
- When changing speech, keep it behind API-owned provider readiness, transcript provenance, memory policy, and audit. Keep provider documentation in `ARCHITECTURE.md` and `PROCESS.md`, not separate speech handoff docs. Run `pnpm smoke:api:speech`, `pnpm smoke:speech:providers`, and the relevant chat/memory/runtime smokes.
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
7. Add speech provider boundaries and first support half-duplex memory-aware voice chat: record -> STT -> agent turn -> TTS -> playback.
