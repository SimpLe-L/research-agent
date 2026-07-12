# ARCHITECTURE.md

## Product Boundary

SP Agent is a local-first, chat-first trusted development agent. Users chat normally, install complete third-party Skill packages, and let the local API execute ordinary development work without a per-action approval queue. `personal.research` is one reusable Skill, not the product boundary.

Importing a third-party package never executes its code. In trusted local mode, ordinary package reads, local writes, and provider calls run directly and remain auditable. Credentials, private keys, external account actions, payments, and irreversible destructive operations stay explicitly approval-gated.

## Runtime Shape

```text
Electron desktop shell
-> React renderer using assistant-ui
-> NestJS local API gateway
-> runtime adapter registry, Pi first
-> local Skill catalog and API-owned tool execution
-> approvals, persistence, audit, and speech
```

The API gateway is the control plane. It owns Skill import, validation, enablement, tool execution, approvals, persistence, provider readiness, and audit. Runtime adapters produce assistant turns and request typed tools; they do not execute privileged app behavior directly.

## Workspace

- `apps/api`: NestJS gateway and control plane.
- `apps/web`: assistant-ui chat shell and small review/configuration surfaces.
- `apps/desktop`: Electron shell and local API process orchestration.
- `packages/shared`: Zod schemas and shared TypeScript contracts.
- `packages/extensions`: built-in capability registry, tool metadata, and Skill-package validation.
- `packages/agent-runtime`: replaceable runtime adapters; Pi is the default.
- `packages/speech`: STT/TTS provider contracts and adapters.

## Chat-Native Skill Contract

The normal composer is the only primary invocation surface. A model receives a compact catalog of enabled Skills: id, description, typed input schema, and whether the Skill can use any API-owned tools. It selects a Skill as part of its normal tool-use turn. This selection is implicit planning; there is no required `planner service -> Skill -> Connector` pipeline and no separate planner model call.

```text
User message
-> runtime selects an enabled Skill or answers directly
-> API validates the Skill id, input, policy, and enabled state
-> API loads that Skill's instructions and bounded tool context
-> runtime may request only those API-owned tools
-> API executes/audits each request and returns typed results
-> runtime produces the chat reply and any inspectable artifact
```

The API may use deterministic routing only as an offline fallback and test aid. It must select from the same enabled catalog and invoke the same API path as the live runtime. A Skill is never selected by an arbitrary URL, provider name, filesystem path, or raw function name supplied by the model.

For phase one, `personal.research` may be an instruction-led local research Skill over explicitly supplied content. It must say when it lacks evidence. Source collection, citations, remote retrieval, and long-running workflows are optional capabilities added only when they have a concrete typed tool and test coverage.

## Local Skill Packages

A third-party Skill is a complete local package. Importing a package makes a staged copy under the app data directory; the original directory is never executed in place. The importer validates the package, records its content hash and origin path in the audit log, then lets the user enable or disable the imported version.

Phase-one package layout:

```text
my-skill/
  SKILL.md
  assets/                 # optional static prompt/reference assets
  skill.json              # optional app-specific metadata
```

`SKILL.md` is required. Its front matter supplies `name`, `description`, and optional `version`; this makes ordinary Codex-style Skills directly importable. `skill.json` is optional app-specific metadata for structured input, requested API tools, and output artifacts. The registry validates package size, asset paths, and any requested tool allowlist before import. Users may paste a public GitHub repository URL with an optional revision and Skill subdirectory; the API resolves the revision to an immutable commit, reads only `SKILL.md` and optional `skill.json`, and records that source in the audit log. Local-folder import remains a fallback.

Imported packages are complete local packages:

- package scripts, references, templates, and static assets are retained; installation never executes them;
- symlinks and paths escaping the package root are rejected;
- a Skill may read its own package references on demand and use the local capabilities exposed to it;
- importing, enabling, disabling, and removing a package are auditable local actions.

This mirrors coding-agent Skills: instructions and references are loaded only when relevant, while importing never treats a package as automatically executable code.

## Tools, Extensions, And Approval

`packages/extensions` remains the app-owned registry for executable capabilities. Each tool has a typed input/output contract, permission metadata, an API handler, and a `permissionAudit` result. A Skill may request a registered tool; it may not call a provider or connector implementation itself.

Installed Skill files, user-selected local folders, and a user-submitted public GitHub repository import execute without a second approval prompt. Trusted local capabilities, including local writes and provider calls, execute directly and are audited. `pending_approval` is reserved for credentials/secrets, private keys, external account actions, payments, and irreversible destructive operations. Approval execution stays in the API and matches the same tool identity and input.

"Connector" is an implementation term, not a required product layer. Keep a connector as a separate typed tool only when an external source has independent authentication, rate/size limits, provenance, or reuse across Skills. Local parsing helpers and single-Skill adapters should stay private to that Skill handler.

## First-Phase Scope

Required:

- built-in Skill catalog, chat selection, and typed invocation;
- complete-package import, validation, enable/disable, removal, reference loading, and audit;
- lazy Skill-instruction loading and manifest-derived bounded tool context;
- clear degraded states for unavailable Skills/tools;
- deterministic routing and import/validation smoke coverage.

Explicitly deferred:

- memory retrieval, memory injection, promotion, and memory UI in the chat path;
- a dedicated planner service or provider planner;
- remote search, arbitrary URL retrieval, credentialed connectors, and provider-backed research synthesis;
- a marketplace and automatic package installation hooks;
- multi-agent delegation, LangGraph, and background workflow orchestration.

## Memory, Research, And Workflows Later

Memory remains app-owned and auditable, but it is not supplied to the runtime or available as a Skill tool in phase one. Reintroduce it only with an explicit user-facing policy, typed read tool, provenance, and focused tests.

When evidence-backed research becomes necessary, implement it as a capability of `personal.research`, not a new mandatory routing architecture:

```text
personal.research instruction
-> request approved source tools through the API
-> normalize evidence and retain provenance
-> synthesize from collected evidence
-> validate citations and persist an inspectable artifact
```

Remote data, source-specific connectors, and durable workflows require a concrete product need, source scope, approval policy, provenance contract, degraded behavior, and deterministic fixtures. Add LangGraph only when durable pause/resume, fan-out, or revise/validate loops demonstrably exceed a bounded API handler.

## Renderer Contract

- `apps/web/src/main.tsx` stays bootstrap-only.
- App/runtime/layout code lives under `apps/web/src/app` and `apps/web/src/components/app`.
- `/` and `/chat` render the chat-first shell.
- Skill catalog and import review are secondary configuration surfaces, not a required launcher for each Skill.
- Preserve stable `data-testid` anchors for route/shell smoke coverage.

## Safety Contract

- Do not store or request private keys.
- Do not store or request private keys. Wallet transactions, transfers, posting automation, payments, credential use, and irreversible destructive actions remain approval-gated.
- Do not invent tool, provider, memory, or external-data results. Missing capability is a visible degraded state.
- Raw audio is not persisted unless a later setting and retention policy explicitly allow it.

## Verification Strategy

Default checks:

```bash
pnpm typecheck
pnpm build
```

Run the relevant boundary smoke after a change:

```bash
pnpm smoke:api
pnpm smoke:web
pnpm smoke:desktop
pnpm smoke:runtime
pnpm smoke:extensions
pnpm smoke:workflows
pnpm smoke:speech
```
