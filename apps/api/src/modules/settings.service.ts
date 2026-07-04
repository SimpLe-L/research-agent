import { Inject, Injectable } from "@nestjs/common";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { getAgentRuntimeStatus } from "@sp-agent/agent-runtime";
import type { AppSettings, ProviderReadinessItem, PruneRetentionInput } from "@sp-agent/shared";
import { DatabaseService } from "./database.service.js";

@Injectable()
export class SettingsService {
  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  private settings: AppSettings = {
    llmProvider: "siliconflow",
    model: process.env.SILICONFLOW_MODEL,
    embeddingModel: undefined,
    rpcUrlsConfigured: {
      ethereum: Boolean(process.env.ETHEREUM_RPC_URL),
      base: Boolean(process.env.BASE_RPC_URL),
      arbitrum: Boolean(process.env.ARBITRUM_RPC_URL),
      bsc: Boolean(process.env.BSC_RPC_URL),
      polygon: Boolean(process.env.POLYGON_RPC_URL)
    },
    dataRetentionDays: 365
  };

  get() {
    return this.settings;
  }

  async readiness(): Promise<{ items: ProviderReadinessItem[] }> {
    const piRuntime = await getAgentRuntimeStatus({
      ...process.env,
      AGENT_RUNTIME_PROVIDER: "pi"
    });
    const piSelected = process.env.AGENT_RUNTIME_PROVIDER === "pi";
    return {
      items: [
        {
          id: "siliconflow",
          label: "SiliconFlow LLM and embeddings",
          status: process.env.SILICONFLOW_API_KEY ? "ready" : "missing",
          capability: "LLM report drafting and LanceDB vector search",
          envVars: ["SILICONFLOW_API_KEY", "SILICONFLOW_BASE_URL", "SILICONFLOW_MODEL", "SILICONFLOW_EMBEDDING_MODEL"],
          envTemplate: [
            "SILICONFLOW_API_KEY=",
            "SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1",
            "SILICONFLOW_MODEL=Qwen/Qwen2.5-72B-Instruct",
            "SILICONFLOW_EMBEDDING_MODEL=BAAI/bge-m3"
          ].join("\n"),
          action: "Fill SILICONFLOW_API_KEY in .env, then restart the API and run provider verification.",
          docsHint: "Use an OpenAI-compatible SiliconFlow key. The app keeps deterministic reports as fallback."
        },
        {
          id: "pi-runtime",
          label: "Pi SDK Agent runtime",
          status: piSelected ? (piRuntime.reachable ? "ready" : piRuntime.configured ? "degraded" : "missing") : "manual",
          capability: "Default Agent runtime for sessions, model calls, and controlled research-tool orchestration",
          envVars: [
            "AGENT_RUNTIME_PROVIDER",
            "PI_MODEL_PROVIDER",
            "PI_MODEL_ID",
            "PI_API_KEY",
            "PI_SILICONFLOW_MODEL",
            "SILICONFLOW_API_KEY",
            "SILICONFLOW_BASE_URL",
            "PI_AGENT_RUNTIME_TIMEOUT_MS",
            "PI_THINKING_LEVEL",
            "PI_WORKING_DIR"
          ],
          envTemplate: [
            "# Pi is the default Agent runtime. SiliconFlow is used as the default Pi model provider.",
            "# If PI_MODEL_PROVIDER/PI_MODEL_ID are empty, Pi defaults to SiliconFlow DeepSeek V4 Flash.",
            "AGENT_RUNTIME_PROVIDER=pi",
            "PI_MODEL_PROVIDER=siliconflow",
            "PI_MODEL_ID=deepseek-ai/DeepSeek-V4-Flash",
            "PI_SILICONFLOW_MODEL=deepseek-ai/DeepSeek-V4-Flash",
            "SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1",
            "# Pi SiliconFlow mode reuses SILICONFLOW_API_KEY. PI_API_KEY can override it.",
            "SILICONFLOW_API_KEY=",
            "PI_API_KEY=",
            "PI_AGENT_RUNTIME_TIMEOUT_MS=120000",
            "PI_THINKING_LEVEL=off",
            "PI_WORKING_DIR="
          ].join("\n"),
          action:
            piSelected && !piRuntime.configured
              ? "Fill SILICONFLOW_API_KEY for the default SiliconFlow Pi provider, or set PI_MODEL_PROVIDER/PI_MODEL_ID plus PI_API_KEY for another provider, then restart the API."
              : piSelected && !piRuntime.reachable
                ? "Fix the Pi model provider/model id so it exists in the Pi model registry, then run pnpm smoke:agent-runtime:pi."
                : piSelected
                  ? "Run pnpm smoke:agent-runtime:pi for local readiness, and use PI_LIVE_SMOKE=1 with real credentials for live drafting verification."
                  : "Set AGENT_RUNTIME_PROVIDER=pi to use the intended Agent runtime path.",
          docsHint:
            piRuntime.degradedReason ??
            "The app creates an in-memory Pi session/auth store. Research tools must remain permissioned and auditable."
        },
        {
          id: "coingecko",
          label: "CoinGecko public market data",
          status: "ready",
          capability: "Keyless token price, market cap, FDV, and 24h volume through the public API",
          envVars: ["COINGECKO_BASE_URL", "COINGECKO_API_KEY", "COINGECKO_API_KEY_HEADER"],
          envTemplate: [
            "# First version uses the free keyless public API.",
            "COINGECKO_BASE_URL=https://api.coingecko.com/api/v3",
            "",
            "# Optional future upgrade for demo/pro keys.",
            "COINGECKO_API_KEY=",
            "# COINGECKO_API_KEY_HEADER=x-cg-demo-api-key"
          ].join("\n"),
          action: "No key is required for the first version. Restart the API if COINGECKO_BASE_URL changes.",
          docsHint: "Public CoinGecko API is rate-limited; optional keys can be added later without changing the task graph."
        },
        {
          id: "evm-rpc",
          label: "EVM RPC",
          status: this.hasAnyRpcUrl() ? "ready" : "missing",
          capability: "ERC20 metadata, bytecode, owner, pause, proxy, and selector risk checks",
          envVars: ["ETHEREUM_RPC_URL", "BASE_RPC_URL", "ARBITRUM_RPC_URL", "BSC_RPC_URL", "POLYGON_RPC_URL"],
          envTemplate: ["ETHEREUM_RPC_URL=", "BASE_RPC_URL=", "ARBITRUM_RPC_URL=", "BSC_RPC_URL=", "POLYGON_RPC_URL="].join("\n"),
          action: "Fill at least one EVM RPC URL in .env for the chains you want to inspect, then restart the API.",
          docsHint: "Read-only RPC is enough. Do not add private keys."
        },
        {
          id: "arkham",
          label: "Arkham-compatible address intelligence",
          status: this.hasArkhamTemplates() ? "ready" : process.env.ARKHAM_API_KEY ? "degraded" : "missing",
          capability: "Entity labels, transfer samples, holdings, and address intelligence report sections",
          envVars: [
            "ARKHAM_API_KEY",
            "ARKHAM_VERIFY_URL_TEMPLATE",
            "ARKHAM_ADDRESS_LABEL_URL_TEMPLATE",
            "ARKHAM_ADDRESS_TRANSFERS_URL_TEMPLATE",
            "ARKHAM_ADDRESS_HOLDINGS_URL_TEMPLATE"
          ],
          envTemplate: [
            "# Replace URL templates with the exact endpoints from your Arkham account/API docs.",
            "# Supported tokens: {baseUrl}, {address}, {chain}, {apiKey}.",
            "ARKHAM_API_KEY=",
            "ARKHAM_BASE_URL=https://api.arkhamintelligence.com",
            "ARKHAM_AUTH_HEADER_NAME=API-Key",
            "ARKHAM_AUTH_SCHEME=",
            "ARKHAM_VERIFY_URL_TEMPLATE=",
            "ARKHAM_ADDRESS_LABEL_URL_TEMPLATE=",
            "ARKHAM_ADDRESS_TRANSFERS_URL_TEMPLATE=",
            "ARKHAM_ADDRESS_HOLDINGS_URL_TEMPLATE=",
            "ARKHAM_WEB_ADDRESS_URL_TEMPLATE=https://platform.arkhamintelligence.com/explorer/address/{address}"
          ].join("\n"),
          action: "Fill ARKHAM_API_KEY and the URL templates from your Arkham account/API docs, then restart the API.",
          docsHint: "Public Arkham endpoint shapes are account/plan dependent, so templates stay explicit."
        },
        {
          id: "holder-concentration",
          label: "Holder concentration",
          status: this.hasHolderProvider() ? "ready" : "missing",
          capability: "Top holder rows and concentration risk scoring",
          envVars: [
            "HOLDER_CONCENTRATION_PROVIDER",
            "HOLDER_CONCENTRATION_URL_TEMPLATE",
            "HOLDER_CONCENTRATION_API_KEY",
            "ETHERSCAN_API_KEY"
          ],
          envTemplate: [
            "# Option A: Etherscan v2 token/topholders preset.",
            "HOLDER_CONCENTRATION_PROVIDER=etherscan",
            "ETHERSCAN_API_KEY=",
            "ETHERSCAN_BASE_URL=https://api.etherscan.io/v2/api",
            "ETHERSCAN_HOLDER_ACTION=topholders",
            "ETHERSCAN_HOLDER_OFFSET=100",
            "",
            "# Option B: generic holder API template.",
            "# Supported tokens: {address}, {chain}, {chainId}, {apiKey}.",
            "HOLDER_CONCENTRATION_URL_TEMPLATE=",
            "HOLDER_CONCENTRATION_API_KEY=",
            "HOLDER_CONCENTRATION_AUTH_HEADER_NAME=Authorization",
            "HOLDER_CONCENTRATION_AUTH_SCHEME=Bearer"
          ].join("\n"),
          action:
            "Configure HOLDER_CONCENTRATION_URL_TEMPLATE, or set HOLDER_CONCENTRATION_PROVIDER=etherscan with an eligible ETHERSCAN_API_KEY.",
          docsHint: "Etherscan top holder endpoints require eligible Standard/PRO access."
        },
        {
          id: "electron-runtime",
          label: "Electron runtime binary",
          status: this.hasElectronRuntimeBinary() ? "ready" : "manual",
          capability: "Desktop window smoke test through pnpm dev:desktop",
          envVars: [],
          action: this.hasElectronRuntimeBinary()
            ? "Electron binary artifact is installed locally. Run pnpm dev:desktop for the desktop smoke path."
            : "Run pnpm electron:install to install the Electron binary artifact through the configured mirror.",
          docsHint: this.hasElectronRuntimeBinary()
            ? "Desktop startup can use the installed Electron binary and falls back to the built renderer when Vite is not running."
            : "The project uses the npmmirror Electron mirror and a local .electron-cache directory."
        },
        {
          id: "research-worker",
          label: "Research task executor",
          status: process.env.RESEARCH_TASK_EXECUTOR_MODE === "api_only" ? "manual" : "ready",
          capability: "Execute persisted pending research tasks in the API process or a separate worker process",
          envVars: ["RESEARCH_TASK_EXECUTOR_MODE", "RESEARCH_TASK_QUEUE_CONCURRENCY", "RESEARCH_WORKER_POLL_INTERVAL_MS"],
          envTemplate: [
            "# Default: API persists and executes tasks locally.",
            "RESEARCH_TASK_EXECUTOR_MODE=local",
            "RESEARCH_TASK_QUEUE_CONCURRENCY=2",
            "",
            "# External worker path: run the API with api_only, then start pnpm worker:research.",
            "# RESEARCH_TASK_EXECUTOR_MODE=api_only",
            "RESEARCH_WORKER_POLL_INTERVAL_MS=2000"
          ].join("\n"),
          action:
            process.env.RESEARCH_TASK_EXECUTOR_MODE === "api_only"
              ? "Start pnpm worker:research, or switch RESEARCH_TASK_EXECUTOR_MODE back to local for single-process execution."
              : "Current executor mode can run research tasks. Use api_only plus pnpm worker:research when you want a separate worker process.",
          docsHint: "The worker uses PostgreSQL pending-task polling and atomic claim; it is a durable process boundary, not yet BullMQ or pg-boss."
        }
      ]
    };
  }

  update(next: Partial<AppSettings>) {
    this.settings = {
      ...this.settings,
      ...next,
      rpcUrlsConfigured: {
        ...this.settings.rpcUrlsConfigured,
        ...next.rpcUrlsConfigured
      }
    };
    return this.settings;
  }

  async retentionPreview(days = this.settings.dataRetentionDays) {
    const safeDays = normalizeRetentionDays(days);
    const cutoff = retentionCutoff(safeDays);
    const repository = this.databaseService.getResearchRepository();
    if (!repository) {
      return {
        days: safeDays,
        cutoff,
        databaseReachable: false,
        counts: emptyRetentionCounts(),
        degradedReason: this.databaseService.getStatus().degradedReason ?? "PostgreSQL is not reachable; retention pruning is unavailable."
      };
    }
    return {
      days: safeDays,
      cutoff,
      databaseReachable: true,
      counts: await repository.previewRetention(cutoff)
    };
  }

  async pruneRetention(input: PruneRetentionInput) {
    const safeDays = normalizeRetentionDays(input.days ?? this.settings.dataRetentionDays);
    const cutoff = retentionCutoff(safeDays);
    const repository = this.databaseService.getResearchRepository();
    if (!repository) {
      return {
        days: safeDays,
        cutoff,
        dryRun: input.dryRun ?? true,
        databaseReachable: false,
        counts: emptyRetentionCounts(),
        degradedReason: this.databaseService.getStatus().degradedReason ?? "PostgreSQL is not reachable; retention pruning is unavailable."
      };
    }
    const dryRun = input.dryRun ?? true;
    return {
      days: safeDays,
      cutoff,
      dryRun,
      databaseReachable: true,
      counts: dryRun ? await repository.previewRetention(cutoff) : await repository.pruneRetention(cutoff)
    };
  }

  private hasAnyRpcUrl() {
    return Boolean(process.env.ETHEREUM_RPC_URL || process.env.BASE_RPC_URL || process.env.ARBITRUM_RPC_URL || process.env.BSC_RPC_URL || process.env.POLYGON_RPC_URL);
  }

  private hasArkhamTemplates() {
    return Boolean(
      process.env.ARKHAM_API_KEY &&
        (process.env.ARKHAM_VERIFY_URL_TEMPLATE ||
          process.env.ARKHAM_ADDRESS_LABEL_URL_TEMPLATE ||
          process.env.ARKHAM_ADDRESS_TRANSFERS_URL_TEMPLATE ||
          process.env.ARKHAM_ADDRESS_HOLDINGS_URL_TEMPLATE)
    );
  }

  private hasHolderProvider() {
    return Boolean(
      process.env.HOLDER_CONCENTRATION_URL_TEMPLATE ||
        (process.env.HOLDER_CONCENTRATION_PROVIDER?.toLowerCase() === "etherscan" && process.env.ETHERSCAN_API_KEY)
    );
  }

  private hasElectronRuntimeBinary() {
    const candidates = [
      resolve(process.cwd(), "apps/desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"),
      resolve(process.cwd(), "../desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron")
    ];
    return candidates.some((candidate) => existsSync(candidate));
  }
}

function normalizeRetentionDays(days: number): number {
  const value = Math.floor(Number(days));
  return Number.isFinite(value) && value > 0 ? Math.min(value, 3650) : 365;
}

function retentionCutoff(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function emptyRetentionCounts() {
  return {
    researchTasks: 0,
    reports: 0,
    chatSessions: 0,
    marketSnapshots: 0,
    sourceDocuments: 0
  };
}
