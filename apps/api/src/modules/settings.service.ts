import { Injectable } from "@nestjs/common";
import { getAgentRuntimeStatus } from "@sp-agent/agent-runtime";
import type { AppSettings, ProviderReadinessItem } from "@sp-agent/shared";

@Injectable()
export class SettingsService {
  private settings: AppSettings = {
    llmProvider: "pi",
    model: process.env.PI_MODEL_ID || process.env.PI_SILICONFLOW_MODEL || "deepseek-ai/DeepSeek-V4-Flash",
    dataRetentionDays: 365
  };

  get() {
    return this.settings;
  }

  async readiness(): Promise<{ items: ProviderReadinessItem[] }> {
    const piRuntime = await getAgentRuntimeStatus(process.env);
    return {
      items: [
        {
          id: "pi-runtime",
          label: "Pi SDK Agent runtime",
          status: piRuntime.reachable ? "ready" : piRuntime.configured ? "degraded" : "missing",
          capability: "Default runtime adapter for local personal-agent turns",
          envVars: [
            "AGENT_RUNTIME_PROVIDER",
            "PI_MODEL_PROVIDER",
            "PI_MODEL_ID",
            "PI_API_KEY",
            "SILICONFLOW_API_KEY",
            "SILICONFLOW_BASE_URL",
            "PI_AGENT_RUNTIME_TIMEOUT_MS",
            "PI_THINKING_LEVEL",
            "PI_WORKING_DIR"
          ],
          envTemplate: [
            "AGENT_RUNTIME_PROVIDER=pi",
            "PI_MODEL_PROVIDER=siliconflow",
            "PI_MODEL_ID=deepseek-ai/DeepSeek-V4-Flash",
            "SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1",
            "SILICONFLOW_API_KEY=",
            "PI_API_KEY=",
            "PI_AGENT_RUNTIME_TIMEOUT_MS=120000",
            "PI_THINKING_LEVEL=off",
            "PI_WORKING_DIR="
          ].join("\n"),
          action: piRuntime.reachable
            ? "Run pnpm smoke:agent-runtime:pi after runtime changes; use PI_LIVE_SMOKE=1 with real credentials for a live model call."
            : "Fill SILICONFLOW_API_KEY or PI_API_KEY, then restart the API.",
          docsHint: piRuntime.degradedReason
        },
        {
          id: "memory-layer",
          label: "Local long-term memory",
          status: "ready",
          capability: "App-owned memory search, write candidates, update, and forget",
          envVars: ["SP_AGENT_DATA_DIR"],
          action: "Run pnpm smoke:api:memory after memory contract or storage changes.",
          docsHint: "Memory is persisted as local JSON in SP_AGENT_DATA_DIR or .sp-agent-data by default."
        },
        {
          id: "speech-layer",
          label: "Speech I/O",
          status: "manual",
          capability: "Half-duplex record -> STT -> agent -> TTS -> playback",
          envVars: [],
          action: "Implement STT/TTS provider adapters after the memory boundary is stable.",
          docsHint: "Raw audio persistence should stay disabled by default."
        }
      ]
    };
  }

  update(next: Partial<AppSettings>) {
    this.settings = {
      ...this.settings,
      ...next
    };
    return this.settings;
  }
}
