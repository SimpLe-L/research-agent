# PROCESS.md

## Current State

SP Agent is a trusted-local development agent. The immediate goal is a robust Skill lifecycle: import complete third-party Skill packages, let the runtime select enabled Skills in chat, and execute normal local development capabilities without repeated approval prompts.

The active packages are `apps/api`, `apps/web`, `apps/desktop`, `packages/shared`, `packages/extensions`, `packages/agent-runtime`, and `packages/speech`. Old Web3 and removed research code stay detached.

## Product Baseline

- The first screen is the assistant-ui chat shell on `/` and `/chat`.
- Pi is the default runtime adapter; `local-deterministic` is the no-key fallback and routing-test adapter.
- The runtime selects an enabled Skill as ordinary tool use; there is no dedicated planner service in the target design.
- The API owns Skill import, package validation, enablement, tool execution, permissions, approval execution, persistence, audit, and provider readiness.
- An imported Skill is a complete package rooted at `SKILL.md`; references, templates, static assets, and scripts are retained. Import never executes package code.
- Trusted local capabilities and GitHub Skill imports execute immediately. Approval is reserved for credentials/secrets, private keys, external account actions, payments, and irreversible destructive operations.
- Memory remains implemented infrastructure but is excluded from the phase-one runtime context and Skill tool catalog.
- Workflow and research evidence services are not first-phase dependencies. Preserve existing code only where it does not define the new chat/Skill contract.

## Active Priorities

1. Maintain complete GitHub Skill-package import, resolving an optional revision and Skill subdirectory to an auditable immutable commit; retain local folder import as fallback.
2. Maintain API-owned import, catalog, enable/disable, remove, hash/audit, and package-root safety checks.
3. Expose an enabled Skill catalog to the runtime and load selected `SKILL.md` content lazily into a bounded execution context.
4. Add local development capabilities for package scripts, workspace files, and controlled network access as typed API tools.
5. Add deterministic tests for import validation, ordinary-chat non-selection, Skill selection, disabled Skill rejection, and tool permission/approval behavior.

## Deferred Work

- Memory retrieval, promotion, and memory panels in the chat/Skill path.
- Provider planning, provider synthesis, Tavily, arbitrary remote URL fetch, and credentialed connectors.
- Automatic package hooks and a Skill marketplace.
- Domain profiles such as `crypto.investment` until the base Skill lifecycle is proven.
- LangGraph, multi-agent delegation, durable long-running workflows, and background research.

## Verification Policy

Use `pnpm typecheck` and `pnpm build` for broad checks. For the Skill lifecycle, run `pnpm smoke:api`, `pnpm smoke:runtime`, and `pnpm smoke:extensions`; add `pnpm smoke:web` for catalog/import UI work. Do not add a broad live-provider test to the default suite.

## Working Rules

- Keep `ARCHITECTURE.md` for boundaries and contracts, not implementation history.
- Keep `EXTENSION_AUTHORING.md` as the implementation guide for first-party and imported Skills.
- Do not auto-write durable user facts, project facts, files, posts, or external-account changes.
- Treat missing packages, invalid manifests, disabled Skills, and unavailable tools as normal explicit degraded states.
