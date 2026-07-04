# AGENT_SHELL_REFACTOR.md

## 重构目标

当前仓库已经实现了较完整的 Web3 research workbench，但第一阶段应该先收敛为一个本地个人 agent 原型：

```text
Electron shell
-> Local API / Gateway
-> Pi runtime base
-> permissioned app tools
-> extensions / skills
```

调研、代币查询、报告输出、知识库、市场快照等能力不再作为第一阶段的产品主线，而是迁移为可开关、可审计的 extensions / skills。旧代码是资产，不能为了改结构随意删除。

OpenClaw 的参考点只取架构思想：本地 Gateway、单用户个人 assistant、skills/extensions 注册、安全默认值、可观测工具调用。不要照搬它的远程多渠道自动化，也不要在 v0.x 开启 shell、文件写入、交易、发帖、钱包或浏览器深权限工具。

## 不删除旧代码的规则

1. 已存在代码默认保留。
2. 需要重构旧文件时，先在旧文件顶部或相关导出处加 `LEGACY_REFACTOR_CANDIDATE: <reason>` 注释。
3. 新能力先写到新文件或新包中，并通过清晰边界接入。
4. 新路径通过验证后，再删除旧文件。
5. 删除旧文件前必须确认没有 API、UI、脚本、测试、文档仍依赖它。

## 目标边界

第一阶段只验收核心架子：

- Electron 是用户入口。
- Local API 是本地 Gateway / control plane。
- Pi 是默认 agent runtime base。
- app tools 由本应用实现，必须 typed、read-only by default、permissioned、observable。
- extensions / skills 只注册能力、权限、状态和入口，不把所有业务硬塞进 prompt。
- 现有 research / market / knowledge / report 能力作为 extension 挂载。

第一阶段不做：

- 钱包私钥、转账、交易、swap、授权。
- 发帖、自动私信、自动社交平台操作。
- unrestricted shell/file/edit/browser tools。
- 远程多渠道常驻 bot。
- 为了重构而删除已工作的 research/RAG 代码。

## 新架构分层

```text
apps/desktop
  Electron shell, later loads the local personal agent UI.

apps/web
  Renderer. First screen should become compact personal agent workspace.
  Existing Research/Market/Knowledge/Reports views remain reachable as extension surfaces.

apps/api
  Local Gateway. Owns /api/agent, /api/extensions, provider status, task queue visibility, and extension-owned task events.

packages/agent-runtime
  Pi base. Owns Pi session/model wiring and disables built-in dangerous tools for this product path.

packages/extensions
  Extension registry. Declares core shell plus Web3 research, market, report, and knowledge skills.

packages/research-core, packages/database, packages/data-connectors
  Legacy implementation assets, gradually mounted behind extension boundaries.
```

## 推进步骤

### Phase 0: 立新合同

Status: done in this document.

Deliverables:

- 根目录增加本文件。
- `PROCESS.md` 和 `ARCHITECTURE.md` 改成以 local personal agent shell 为主线。
- 明确 legacy code 不直接删除。

Acceptance:

- 新老目标不再混在同一个“research workbench”叙述里。
- 下一位 agent 只读根文档也能知道该先做 shell，而不是继续堆 research 功能。

### Phase 1: Core Agent Shell

Status: done.

Deliverables:

- `packages/extensions` 提供扩展/skill 注册表。
- `apps/api` 暴露 `/api/agent/status`，返回 Pi runtime 状态、extension 状态、安全策略。
- `apps/api` 暴露 `/api/agent/messages`，作为第一版本地个人 agent turn 入口。
- `packages/agent-runtime` 支持通用 personal agent turn，并保持 Pi built-in tools disabled。

Acceptance:

- 无 LLM key 时接口仍可用，并明确 degraded reason。
- 有 Pi/SiliconFlow key 时，agent turn 可以通过 Pi 生成回复。
- 回复路径只暴露 app-specific read-only tools，不暴露 shell/file/edit/write。
- Verified: `pnpm typecheck`, `pnpm build`, `pnpm smoke:agent-runtime:pi`, and manual HTTP checks against `/api/agent/status` and `/api/agent/messages`.

### Phase 2: Extensionize Existing Research

Status: first pass done; permission audit metadata and task event audit done.

Deliverables:

- 把现有 research task 创建、报告生成、RAG indexing 声明为 `web3.research` skill。
- 把 market snapshot 声明为 `web3.market` skill。
- 把 reports/knowledge 声明为 `local.knowledge` skill。
- 给每个 skill 增加权限声明、输入 schema 名称、输出 schema 名称、降级原因。

Acceptance:

- research 能力通过 extension invoke 可跑。
- 新 agent shell 能看到这些 skills，但默认不自动执行高成本 provider 调用。
- skill 调用事件能落到现有 task/event 可观测链路。
- Current verified scope: `web3.research`, `web3.market`, `local.knowledge`, and `local.reports` are invokable through `/api/extensions/:id/invoke`.
- Extension invocation responses include `permissionAudit` with `mode=read_only|write_or_provider`; the Pi personal-agent shell only receives the read-only invocation path.
- Extension invocations that create or read task/report state append `extension_invoked` events to the relevant research task event stream.
- Verified: `pnpm smoke:api:extensions`.

### Phase 3: Renderer Pivot

Status: first pass done.

Deliverables:

- Electron/Web 首屏变成 compact personal agent workspace。
- 左侧保留 extension navigation，而不是把 research 当成唯一主产品。
- 旧 Research/Market/Knowledge/Reports UI 保留为 extension panels。

Acceptance:

- `pnpm smoke:web:routes` 通过。
- stable `data-testid` anchors 保留。
- 无 API 时 shell 仍能显示本地 degraded 状态。
- Chat route now opens the local personal agent shell instead of automatically starting research. Research remains available as `Research Skill`.

### Phase 4: Pi Tool Orchestration

Status: orchestrator entry first pass done.

Deliverables:

- Pi session 可以选择 permissioned app tools。
- research skill 的工具链从 report-stage Pi drafting 迁移为 Pi-coordinated session。
- deterministic task graph 保留为 fallback/audit backbone。

Acceptance:

- `pnpm smoke:agent-runtime:pi` 通过。
- `/api/agent/research-sessions` 可以显式启动 Pi-coordinated research session，并写入 `agent_research_session_started` 事件。
- `resolve_asset` 节点可以通过 Pi-callable `resolve_research_asset` app tool 运行；无 key、模型未调用工具或工具失败时继续使用 deterministic fallback。
- `collect_sources` 节点可以通过 Pi-callable `collect_research_sources` app tool 运行；无 key、模型未调用工具或工具失败时继续使用 deterministic/provider fallback。
- `fetch_market_data` 节点可以通过 Pi-callable `fetch_research_market_data` app tool 运行；无 key、模型未调用工具或工具失败时继续使用 deterministic/provider fallback。
- `fetch_onchain_data` 节点可以通过 Pi-callable `fetch_research_onchain_data` app tool 运行；无 key、模型未调用工具或工具失败时继续使用 deterministic/provider fallback。
- `analyze_risk` 节点可以通过 Pi-callable `analyze_research_risk` app tool 运行；无 key、模型未调用工具或工具失败时继续使用 deterministic fallback。最终报告前仍会基于完整上下文复算一次风险，确保 `match_cases` 输入不会丢失。
- `match_cases` / local knowledge search 节点可以通过 Pi-callable `search_research_knowledge` app tool 运行；无 key、模型未调用工具或工具失败时继续使用 deterministic/local fallback。
- `write_report` 节点可以通过 Pi-callable `write_research_report` app tool 运行；确定性报告和 appendix 仍是最终审计源，Pi 只负责可读正文改写。
- `index_knowledge` 节点可以通过 Pi-callable `index_research_knowledge` app tool 运行；实际索引仍由 app knowledge service 执行，并返回 indexed/degraded 状态。
- `pnpm smoke:api:pi-runtime` 需要验证 research session 入口、permission audit、planned tools、`resolve_research_asset`、`collect_research_sources`、`fetch_research_market_data`、`fetch_research_onchain_data`、`analyze_research_risk`、`search_research_knowledge`、`write_research_report`、`index_research_knowledge` 和任务完成。
- `pnpm smoke:api:pi-research-rag` 验证 research session、已迁移节点 app-tool audit、报告持久化、知识库 SQL/vector 检索和 per-report reindex。
- 无 key、SDK 失败、模型超时、工具失败都保存明确 degraded reason。

### Phase 5: Cleanup After New Path Is Proven

Status: done for duplicate legacy HTTP routes.

Deliverables:

- 给确认废弃的旧文件先打 `LEGACY_REFACTOR_CANDIDATE` 标签。
- 新路径连续通过 typecheck/build/smoke 后，再移除旧文件。
- 更新 `PROCESS.md` 的完成记录和剩余差距。

Completed cleanup:

- Removed `apps/api/src/modules/research.controller.ts`; research create/list/read/report/cancel/retry/event-list now go through `web3.research` extension invoke, with SSE through the extension-owned stream route.
- Removed `apps/api/src/modules/market.controller.ts`; market snapshot reads and provider-backed analysis now go through `web3.market` extension invoke.
- Removed `apps/api/src/modules/knowledge.controller.ts`; knowledge search/source/report/vector/annotation operations now go through `local.knowledge` and `local.reports` extension invoke.
- Retained `GET /api/research/queue` as an operational queue visibility endpoint because API-only and worker mode need a stable non-skill status surface.
- Kept Research, Market, Knowledge, and Reports renderer modules as extension workspace panels; they are not duplicate product roots and their data calls use extension-owned API surfaces.
- Kept explicit `AGENT_RUNTIME_PROVIDER=siliconflow` direct drafting fallback as a degraded compatibility path only; Pi remains the default and only first-class agent shell runtime.

Acceptance:

- 没有悬空 import。
- 没有重复产品入口。
- 根文档、架构文档、过程文档说的是同一个系统。

## 当前下一步

Phase 5 已完成 direct-route 清理。下一步只做 provider/live-data hardening：

```bash
validate provider-specific parsing when real Arkham/holder-provider responses are available
```

如果修改 renderer navigation：

```bash
pnpm smoke:web:routes
```

如果修改 Pi runtime：

```bash
pnpm smoke:agent-runtime:pi
```
