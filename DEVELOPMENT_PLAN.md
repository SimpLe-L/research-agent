# Development Plan: Chat-Native Local Skills

## Goal

Deliver a safe, local Skill lifecycle inspired by coding agents: the user stays in chat, the runtime chooses an enabled Skill when useful, and API-owned tools perform any real operation. `personal.research` is the first built-in reference Skill, not a reason to introduce a mandatory planner/connector architecture.

## Non-Goals For This Plan

- runtime memory retrieval, memory writes, or memory promotion;
- provider planners, remote research, web search, URL fetch, and credentialed connectors;
- arbitrary third-party code, npm dependencies, package hooks, or a marketplace;
- browser control, shell access, unrestricted filesystem writes, multi-agent delegation, and LangGraph.

## Target Experience

```text
User chats normally
-> runtime sees a compact enabled-Skill catalog
-> runtime answers or selects one Skill with typed input
-> API validates the selection and loads SKILL.md lazily
-> runtime uses only that Skill's allowed API tools
-> API returns audited typed results
-> assistant responds in the same chat thread
```

The model's normal tool selection is the planner. The API validates it but does not make a second provider call to classify response modes or select a Skill.

## Milestones

### 1. Define The Skill Package Contract

- Add shared schemas for local Skill manifests, tool requests, package validation results, installed versions, and audit events.
- Require `SKILL.md` with front matter; support optional `skill.json` and static assets.
- Validate stable id/version, description, input schema, requested registered tools, asset paths, and size limits.
- Reject scripts, binaries, symlinks, `node_modules`, package hooks, and root escapes.

Exit criteria: valid and invalid fixture packages have deterministic schema and safety-test coverage.

### 2. Implement The Local Skill Store

- Add API-owned folder-path and drag/drop upload import, list, get, enable, disable, and remove operations. Do not add URL installation in this phase.
- Copy validated packages to a managed local store; never execute from an arbitrary source directory.
- Hash every version and record origin, validation, import, enablement, disablement, and removal audits.
- Keep newly imported packages disabled until explicitly enabled.

Exit criteria: repeated import/version behavior is deterministic; unsafe imports are rejected without leaving a runnable package.

### 3. Make Skills Chat-Native

- Build the runtime catalog from enabled manifests only.
- Let the model select a Skill directly; retain a deterministic router only for no-key behavior and tests.
- Resolve selected package instructions lazily and attach only its manifest-authorized tool context.
- Persist a compact Skill-selection/tool audit with the assistant message.
- Add no per-Skill launch route or composer mode.

Exit criteria: an enabled built-in or imported Skill can be selected in a normal chat turn, while ordinary chat remains direct.

### 4. Add The First Reference Skill

- Implement `personal.research` as a small instruction-led Skill over explicit user-provided text and any registered local read-only tools.
- Return uncertainty when the supplied material is insufficient.
- Do not inject memory, call a provider, retrieve remote sources, or create a dedicated planning workflow.

Exit criteria: fixture-based chat cases prove selection, non-selection, input validation, and visible insufficient-context behavior.

### 5. Harden Tool And Approval Boundaries

- Ensure an imported Skill can request only manifest-declared, policy-allowed registered tools.
- Verify read-only tool execution and exact-match approval for write/provider/destructive operations.
- Surface missing, disabled, and denied tools as structured degraded results.

Exit criteria: extension/runtime smokes prove that a model or package cannot escalate its tool set.

### 6. Reassess Expansion

Only after the base lifecycle is stable, choose one concrete next capability: memory read, source-grounded research, or a sandboxed code-plugin model. Each requires a separate proposal with user value, schema, permission policy, audit model, fixtures, and migration path.

## Verification

Every milestone runs:

```bash
pnpm typecheck
pnpm build
```

Use `pnpm smoke:api`, `pnpm smoke:extensions`, and `pnpm smoke:runtime` for package/catalog/tool changes. Run `pnpm smoke:web` when changing chat catalog or import configuration UI. The default suite must not depend on credentials or network access.
