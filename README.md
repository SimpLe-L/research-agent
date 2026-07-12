# SP Agent

SP Agent is a local-first desktop agent built around chat-native Skills. In the first phase, a user chats normally, the model can select an enabled local Skill when it helps, and the API controls all tool execution and permissions. `personal.research` is the first reference Skill.

The goal is closer to a coding-agent Skill model than a fixed orchestration pipeline: no mandatory planner service, no mandatory connector layer, and no per-Skill launcher UI.

## First-Phase Flow

```text
Chat message
-> runtime answers directly or selects an enabled Skill
-> API validates the Skill and loads its instructions
-> runtime requests only allowed typed API tools
-> API executes and audits tools
-> assistant returns the result in chat
```

Third-party Skills are imported as complete local packages. They may contain workflow instructions, references, templates, static assets, and scripts; importing never executes package code. Trusted-local API capabilities perform normal local writes and provider calls directly, while credentials, external account actions, payments, and irreversible destructive operations remain approval-gated.

## Skill Package

```text
my-skill/
  SKILL.md
  assets/
  skill.json              # optional app-specific metadata
```

`SKILL.md` is enough to import a Codex-style Skill: its front matter declares identity and description. `skill.json` is optional metadata for typed input, requested API tools, and artifacts. Import a local directory by choosing or dropping it in the Skill panel; the importer validates and hashes the package, stages a copy in local app data, and records import/enablement actions in the audit log. See [EXTENSION_AUTHORING.md](EXTENSION_AUTHORING.md).

## Deferred Until The Base Is Solid

- runtime memory retrieval or durable memory promotion;
- automatic package hooks and a marketplace;
- multi-agent orchestration and LangGraph.

## Workspace

- `apps/api`: NestJS gateway and control plane.
- `apps/web`: React and assistant-ui chat shell.
- `apps/desktop`: Electron shell and API process orchestration.
- `packages/shared`: Zod schemas and shared contracts.
- `packages/extensions`: built-in tools, Skill package validation, and permission metadata.
- `packages/agent-runtime`: replaceable runtime adapters; Pi is the default.
- `packages/speech`: STT/TTS contracts and adapters.

## Quick Start

```bash
pnpm install
pnpm build
pnpm dev
```

For the desktop shell:

```bash
pnpm dev:desktop
```

## Verification

```bash
pnpm typecheck
pnpm build
pnpm smoke:api
pnpm smoke:extensions
pnpm smoke:runtime
pnpm smoke:web
```

## Safety Boundaries

- No private-key handling. Transactions, posting automation, payments, credential use, and irreversible destructive operations remain approval-gated.
- Imported Skill packages are instructions and static assets, never executable code in phase one.
- Every executable capability has a typed API contract and permission audit.
- Trusted-local writes and provider calls execute directly. Credentials, external account actions, payments, private keys, and irreversible destructive operations require explicit approval.
- Missing tools or unavailable providers are reported as degraded states; they are never fabricated.
