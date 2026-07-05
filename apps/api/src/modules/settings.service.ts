import { Injectable } from "@nestjs/common";
import { getAgentRuntimeStatus } from "@sp-agent/agent-runtime";
import { getSpeechStatus } from "@sp-agent/speech";
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
    const speech = await getSpeechStatus(process.env);
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
          id: "speech-stt",
          label: "Speech STT provider",
          status: readinessStatus(speech.stt.configured, speech.stt.reachable),
          capability: "Transcribe recorded audio before it enters the normal agent message path",
          envVars: ["SPEECH_STT_PROVIDER", "OPENAI_COMPATIBLE_STT_URL", "OPENAI_COMPATIBLE_STT_API_KEY", "OPENAI_COMPATIBLE_STT_MODEL"],
          envTemplate: [
            "SPEECH_STT_PROVIDER=openai-compatible-stt",
            "OPENAI_COMPATIBLE_STT_URL=",
            "OPENAI_COMPATIBLE_STT_API_KEY=",
            "OPENAI_COMPATIBLE_STT_MODEL="
          ].join("\n"),
          action: speech.stt.reachable
            ? "Run pnpm smoke:api:speech after STT provider or voice API changes."
            : "Configure SPEECH_STT_PROVIDER and the selected STT provider environment variables, then restart the API.",
          docsHint: speech.stt.degradedReason ?? "Raw audio is not persisted by default."
        },
        {
          id: "speech-tts",
          label: "Speech TTS provider",
          status: readinessStatus(speech.tts.configured, speech.tts.reachable),
          capability: "Synthesize assistant text into audio after the normal agent response",
          envVars: [
            "SPEECH_TTS_PROVIDER",
            "GPT_SOVITS_TTS_URL",
            "GPT_SOVITS_REF_AUDIO_PATH",
            "GPT_SOVITS_PROMPT_TEXT",
            "GPT_SOVITS_TEXT_LANG",
            "GPT_SOVITS_PROMPT_LANG",
            "GPT_SOVITS_TEXT_SPLIT_METHOD"
          ],
          envTemplate: [
            "SPEECH_TTS_PROVIDER=gpt-sovits-api",
            "GPT_SOVITS_TTS_URL=http://127.0.0.1:9880/tts",
            "GPT_SOVITS_REF_AUDIO_PATH=",
            "GPT_SOVITS_PROMPT_TEXT=",
            "GPT_SOVITS_TEXT_LANG=zh",
            "GPT_SOVITS_PROMPT_LANG=zh",
            "GPT_SOVITS_TEXT_SPLIT_METHOD=cut0"
          ].join("\n"),
          action: speech.tts.reachable
            ? "Run pnpm smoke:api:speech after TTS provider or voice API changes."
            : "Configure SPEECH_TTS_PROVIDER and the selected TTS provider environment variables, then restart the API.",
          docsHint: speech.tts.degradedReason ?? "TTS is optional; typed chat must remain usable when TTS is missing."
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

function readinessStatus(configured: boolean, reachable: boolean): ProviderReadinessItem["status"] {
  if (reachable) return "ready";
  return configured ? "degraded" : "missing";
}
