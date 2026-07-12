# Skill And Extension Authoring Guide

## Choose The Right Boundary

Use a Skill for reusable model instructions, references, scripts, and task workflow. Use an API tool/extension for local workspace, provider, credential, or external-account operations. A Skill package is installed as data; package code is never executed at import time.

Do not introduce a planner service for a new Skill. The chat runtime decides whether to select an enabled Skill as part of its normal tool-use turn. Deterministic routing is permitted only as a fallback and test double for the same catalog and invocation path.

## Phase-One Local Skill Package

```text
my-skill/
  SKILL.md
  assets/                 # optional static files referenced by SKILL.md
  skill.json              # optional app-specific metadata
```

`SKILL.md` is required and uses standard front matter:

```yaml
---
name: meeting-summary
description: Turn supplied meeting notes into decisions and action items.
version: 1.0.0
---
```

Optional `skill.json` shape:

```json
{
  "id": "com.example.meeting-summary",
  "version": "1.0.0",
  "name": "Meeting Summary",
  "description": "Turn supplied meeting notes into decisions and action items.",
  "inputSchema": { "type": "object", "properties": { "notes": { "type": "string" } }, "required": ["notes"] },
  "requestedTools": [],
  "outputArtifact": "meeting_summary"
}
```

The front-matter `name` becomes the stable local id when no `skill.json` is present. `description` is the short selection hint shown to the runtime; it must describe when to use the Skill, not promise data it cannot access. `requestedTools`, when present, contains registered API tool ids only.

`SKILL.md` contains concise instructions for the model after the Skill is selected: inputs to inspect, desired output shape, tool-use order, uncertainty behavior, and safety constraints. Keep it task-specific. It must not override product safety rules or ask the model to fabricate a tool result.

## Import And Trust Rules

The API importer must:

1. validate the manifest and all requested tool ids against `packages/extensions`;
2. retain package references, templates, static assets, and scripts while rejecting symlinks, `node_modules`, package hooks, and paths outside the package root;
3. enforce package and asset-size limits;
4. copy the validated package into the managed local Skill store rather than referencing its original path;
5. record the origin path, content hash, package id/version, validation result, and enablement action in the audit log;
6. keep an imported version disabled until the user enables it.

Do not run package hooks or dynamically import a third-party module during installation. Package scripts may be exposed later through an explicit trusted-local execution capability; importing a Skill never executes it.

## First-Party Tools

When a Skill needs app behavior, add a typed API-owned tool in this order:

1. Define shared Zod input/output contracts in `packages/shared`.
2. Register its manifest and permission metadata in `packages/extensions`.
3. Add its API handler in `apps/api`; the handler owns persistence, audit, degradation, and approval execution.
4. Expose the tool only to Skills whose validated manifests request it and whose active policy permits it.
5. Add fixtures and extend the relevant smoke.

Trusted-local tools, including ordinary local writes and provider calls, execute directly and are audited. Credentials/secrets, private keys, external account actions, payments, and irreversible destructive operations require approval.

## Chat Behavior And Tests

There is no primary launch button or required mode for a Skill. Tests must cover:

- an appropriate chat request selects the enabled Skill;
- ordinary chat does not select it unnecessarily;
- disabled, invalid, or unavailable Skills produce a clear degraded result;
- the runtime receives only the selected Skill's requested and allowed tools;
- a tool cannot be invoked by a package that did not request it;
- imports reject unsafe package contents and preserve an audit record.

`personal.research` is one reference Skill. It preserves evidence when producing factual conclusions, but does not constrain the general trusted-local Skill model.
