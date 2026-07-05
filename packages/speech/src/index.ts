import type {
  SpeechProviderStatus,
  VoiceSynthesizeInput,
  VoiceSynthesizeResponse,
  VoiceTranscribeInput,
  VoiceTranscribeResponse
} from "@sp-agent/shared";

export type SttProviderAdapter = {
  id: string;
  label: string;
  getStatus(env?: NodeJS.ProcessEnv): Promise<SpeechProviderStatus>;
  transcribe(input: VoiceTranscribeInput, env?: NodeJS.ProcessEnv): Promise<VoiceTranscribeResponse>;
};

export type TtsProviderAdapter = {
  id: string;
  label: string;
  getStatus(env?: NodeJS.ProcessEnv): Promise<SpeechProviderStatus>;
  synthesize(input: VoiceSynthesizeInput, env?: NodeJS.ProcessEnv): Promise<VoiceSynthesizeResponse>;
};

const missingSttAdapter: SttProviderAdapter = {
  id: "missing",
  label: "Missing STT",
  getStatus: async () => ({
    name: "missing",
    configured: false,
    reachable: false,
    degradedReason: "No STT provider is configured. Set SPEECH_STT_PROVIDER=deterministic for local smoke tests or configure a real STT adapter."
  }),
  transcribe: async () => ({
    provider: "missing",
    degradedReason: "No STT provider is configured."
  })
};

const deterministicSttAdapter: SttProviderAdapter = {
  id: "deterministic",
  label: "Deterministic STT",
  getStatus: async () => ({
    name: "deterministic",
    configured: true,
    reachable: true
  }),
  transcribe: async (_input, env = process.env) => ({
    transcript: env.SPEECH_DETERMINISTIC_TRANSCRIPT || "语音测试：请用当前记忆和技能回答我。",
    provider: "deterministic"
  })
};

const openAiCompatibleSttAdapter: SttProviderAdapter = {
  id: "openai-compatible-stt",
  label: "OpenAI-Compatible STT",
  getStatus: async (env = process.env) => {
    const missing = missingOpenAiCompatibleSttConfig(env);
    return {
      name: "openai-compatible-stt",
      configured: missing.length === 0,
      reachable: missing.length === 0,
      degradedReason: missing.length > 0 ? `OpenAI-compatible STT is missing ${missing.join(", ")}.` : undefined
    };
  },
  transcribe: async (input, env = process.env) => {
    const missing = missingOpenAiCompatibleSttConfig(env);
    if (missing.length > 0) {
      return {
        provider: "openai-compatible-stt",
        degradedReason: `OpenAI-compatible STT is missing ${missing.join(", ")}.`
      };
    }

    try {
      const response = await fetch(requiredEnv(env.OPENAI_COMPATIBLE_STT_URL), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${requiredEnv(env.OPENAI_COMPATIBLE_STT_API_KEY)}`
        },
        body: JSON.stringify({
          model: requiredEnv(env.OPENAI_COMPATIBLE_STT_MODEL),
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "audio_url",
                  audio_url: {
                    url: `data:${input.mimeType};base64,${input.audioBase64}`
                  }
                }
              ]
            }
          ]
        })
      });
      if (!response.ok) {
        return {
          provider: "openai-compatible-stt",
          degradedReason: `OpenAI-compatible STT returned HTTP ${response.status}: ${await response.text()}`
        };
      }
      const json = await response.json() as Record<string, unknown>;
      const content = extractChatCompletionText(json);
      const transcript = extractAsrText(content);
      return transcript
        ? { transcript, provider: "openai-compatible-stt" }
        : { provider: "openai-compatible-stt", degradedReason: "OpenAI-compatible STT response did not include transcript text." };
    } catch (error) {
      return {
        provider: "openai-compatible-stt",
        degradedReason: error instanceof Error ? error.message : "OpenAI-compatible STT request failed."
      };
    }
  }
};

const openAiAudioTranscriptionsSttAdapter: SttProviderAdapter = {
  id: "openai-audio-transcriptions-stt",
  label: "OpenAI Audio Transcriptions STT",
  getStatus: async (env = process.env) => {
    const missing = missingOpenAiAudioTranscriptionsConfig(env);
    return {
      name: "openai-audio-transcriptions-stt",
      configured: missing.length === 0,
      reachable: missing.length === 0,
      degradedReason: missing.length > 0 ? `OpenAI audio transcriptions STT is missing ${missing.join(", ")}.` : undefined
    };
  },
  transcribe: async (input, env = process.env) => {
    const missing = missingOpenAiAudioTranscriptionsConfig(env);
    if (missing.length > 0) {
      return {
        provider: "openai-audio-transcriptions-stt",
        degradedReason: `OpenAI audio transcriptions STT is missing ${missing.join(", ")}.`
      };
    }

    try {
      const audioBytes = Buffer.from(input.audioBase64, "base64");
      const formData = new FormData();
      formData.append("file", new Blob([audioBytes], { type: input.mimeType }), env.OPENAI_TRANSCRIPTIONS_STT_FILENAME || "audio.webm");
      formData.append("model", requiredEnv(env.OPENAI_TRANSCRIPTIONS_STT_MODEL));
      if (env.OPENAI_TRANSCRIPTIONS_STT_RESPONSE_FORMAT) formData.append("response_format", env.OPENAI_TRANSCRIPTIONS_STT_RESPONSE_FORMAT);
      if (env.OPENAI_TRANSCRIPTIONS_STT_LANGUAGE) formData.append("language", env.OPENAI_TRANSCRIPTIONS_STT_LANGUAGE);

      const headers: Record<string, string> = {};
      if (env.OPENAI_TRANSCRIPTIONS_STT_API_KEY) headers.authorization = `Bearer ${env.OPENAI_TRANSCRIPTIONS_STT_API_KEY}`;
      const response = await fetch(requiredEnv(env.OPENAI_TRANSCRIPTIONS_STT_URL), {
        method: "POST",
        headers,
        body: formData
      });
      if (!response.ok) {
        return {
          provider: "openai-audio-transcriptions-stt",
          degradedReason: `OpenAI audio transcriptions STT returned HTTP ${response.status}: ${await response.text()}`
        };
      }
      const contentType = response.headers.get("content-type") ?? "";
      const transcript = contentType.includes("application/json")
        ? extractTranscriptionText(await response.json() as Record<string, unknown>)
        : (await response.text()).trim();
      return transcript
        ? { transcript, provider: "openai-audio-transcriptions-stt" }
        : { provider: "openai-audio-transcriptions-stt", degradedReason: "OpenAI audio transcriptions STT response did not include transcript text." };
    } catch (error) {
      return {
        provider: "openai-audio-transcriptions-stt",
        degradedReason: error instanceof Error ? error.message : "OpenAI audio transcriptions STT request failed."
      };
    }
  }
};

const missingTtsAdapter: TtsProviderAdapter = {
  id: "missing",
  label: "Missing TTS",
  getStatus: async () => ({
    name: "missing",
    configured: false,
    reachable: false,
    degradedReason: "No TTS provider is configured. Set SPEECH_TTS_PROVIDER=deterministic for local smoke tests or configure a real TTS adapter."
  }),
  synthesize: async () => ({
    provider: "missing",
    degradedReason: "No TTS provider is configured."
  })
};

const deterministicTtsAdapter: TtsProviderAdapter = {
  id: "deterministic",
  label: "Deterministic TTS",
  getStatus: async () => ({
    name: "deterministic",
    configured: true,
    reachable: true
  }),
  synthesize: async (input) => ({
    audioBase64: Buffer.from(`deterministic-audio:${input.text}`, "utf8").toString("base64"),
    mimeType: "text/plain; charset=utf-8",
    provider: "deterministic"
  })
};

const gptSovitsApiTtsAdapter: TtsProviderAdapter = {
  id: "gpt-sovits-api",
  label: "GPT-SoVITS API",
  getStatus: async (env = process.env) => {
    const missing = missingGptSovitsConfig(env);
    return {
      name: "gpt-sovits-api",
      configured: missing.length === 0,
      reachable: missing.length === 0,
      degradedReason: missing.length > 0 ? `GPT-SoVITS API is missing ${missing.join(", ")}.` : undefined
    };
  },
  synthesize: async (input, env = process.env) => {
    const missing = missingGptSovitsConfig(env);
    if (missing.length > 0) {
      return {
        provider: "gpt-sovits-api",
        degradedReason: `GPT-SoVITS API is missing ${missing.join(", ")}.`
      };
    }

    try {
      const response = await fetch(requiredEnv(env.GPT_SOVITS_TTS_URL), {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(buildGptSovitsPayload(input, env))
      });
      if (!response.ok) {
        return {
          provider: "gpt-sovits-api",
          degradedReason: `GPT-SoVITS API returned HTTP ${response.status}: ${await response.text()}`
        };
      }
      const arrayBuffer = await response.arrayBuffer();
      return {
        audioBase64: Buffer.from(arrayBuffer).toString("base64"),
        mimeType: response.headers.get("content-type") || env.GPT_SOVITS_MIME_TYPE || "audio/wav",
        provider: "gpt-sovits-api"
      };
    } catch (error) {
      return {
        provider: "gpt-sovits-api",
        degradedReason: error instanceof Error ? error.message : "GPT-SoVITS API request failed."
      };
    }
  }
};

const minimaxT2aV2TtsAdapter: TtsProviderAdapter = {
  id: "minimax-t2a-v2",
  label: "MiniMax T2A v2",
  getStatus: async (env = process.env) => {
    const missing = missingMinimaxTtsConfig(env);
    return {
      name: "minimax-t2a-v2",
      configured: missing.length === 0,
      reachable: missing.length === 0,
      degradedReason: missing.length > 0 ? `MiniMax T2A v2 is missing ${missing.join(", ")}.` : undefined
    };
  },
  synthesize: async (input, env = process.env) => {
    const missing = missingMinimaxTtsConfig(env);
    if (missing.length > 0) {
      return {
        provider: "minimax-t2a-v2",
        degradedReason: `MiniMax T2A v2 is missing ${missing.join(", ")}.`
      };
    }

    try {
      const response = await fetch(buildMinimaxTtsUrl(env), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${requiredEnv(env.MINIMAX_API_KEY)}`
        },
        body: JSON.stringify(buildMinimaxTtsPayload(input, env))
      });
      const text = await response.text();
      if (!response.ok) {
        return {
          provider: "minimax-t2a-v2",
          degradedReason: `MiniMax T2A v2 returned HTTP ${response.status}: ${text}`
        };
      }
      const json = text ? JSON.parse(text) as Record<string, unknown> : {};
      const error = extractMinimaxError(json);
      if (error) {
        return {
          provider: "minimax-t2a-v2",
          degradedReason: error
        };
      }
      const audioBase64 = extractMinimaxAudioBase64(json);
      return audioBase64
        ? {
            audioBase64,
            mimeType: mimeTypeFromAudioFormat(env.MINIMAX_TTS_FORMAT || "mp3"),
            provider: "minimax-t2a-v2"
          }
        : {
            provider: "minimax-t2a-v2",
            degradedReason: "MiniMax T2A v2 response did not include audio data."
          };
    } catch (error) {
      return {
        provider: "minimax-t2a-v2",
        degradedReason: error instanceof Error ? error.message : "MiniMax T2A v2 request failed."
      };
    }
  }
};

const sttAdapters: SttProviderAdapter[] = [missingSttAdapter, deterministicSttAdapter, openAiCompatibleSttAdapter, openAiAudioTranscriptionsSttAdapter];
const ttsAdapters: TtsProviderAdapter[] = [missingTtsAdapter, deterministicTtsAdapter, gptSovitsApiTtsAdapter, minimaxT2aV2TtsAdapter];

export function listSttProviderAdapters(): SttProviderAdapter[] {
  return sttAdapters;
}

export function listTtsProviderAdapters(): TtsProviderAdapter[] {
  return ttsAdapters;
}

export function getSelectedSttProviderAdapter(env: NodeJS.ProcessEnv = process.env): SttProviderAdapter {
  const selected = env.SPEECH_STT_PROVIDER || "missing";
  return sttAdapters.find((adapter) => adapter.id === selected) ?? missingSttAdapter;
}

export function getSelectedTtsProviderAdapter(env: NodeJS.ProcessEnv = process.env): TtsProviderAdapter {
  const selected = env.SPEECH_TTS_PROVIDER || "missing";
  return ttsAdapters.find((adapter) => adapter.id === selected) ?? missingTtsAdapter;
}

export async function getSpeechStatus(env: NodeJS.ProcessEnv = process.env) {
  const stt = await getSelectedSttProviderAdapter(env).getStatus(env);
  const tts = await getSelectedTtsProviderAdapter(env).getStatus(env);
  const ready = stt.configured && stt.reachable && tts.configured && tts.reachable;
  return {
    stt,
    tts,
    ready,
    degradedReason: ready ? undefined : [stt.degradedReason, tts.degradedReason].filter(Boolean).join(" ")
  };
}

export async function transcribeVoice(input: VoiceTranscribeInput, env: NodeJS.ProcessEnv = process.env): Promise<VoiceTranscribeResponse> {
  return getSelectedSttProviderAdapter(env).transcribe(input, env);
}

export async function synthesizeVoice(input: VoiceSynthesizeInput, env: NodeJS.ProcessEnv = process.env): Promise<VoiceSynthesizeResponse> {
  return getSelectedTtsProviderAdapter(env).synthesize(input, env);
}

function missingOpenAiCompatibleSttConfig(env: NodeJS.ProcessEnv): string[] {
  return ["OPENAI_COMPATIBLE_STT_URL", "OPENAI_COMPATIBLE_STT_API_KEY", "OPENAI_COMPATIBLE_STT_MODEL"].filter((key) => !env[key]);
}

function missingOpenAiAudioTranscriptionsConfig(env: NodeJS.ProcessEnv): string[] {
  return ["OPENAI_TRANSCRIPTIONS_STT_URL", "OPENAI_TRANSCRIPTIONS_STT_MODEL"].filter((key) => !env[key]);
}

function missingGptSovitsConfig(env: NodeJS.ProcessEnv): string[] {
  return ["GPT_SOVITS_TTS_URL", "GPT_SOVITS_REF_AUDIO_PATH", "GPT_SOVITS_PROMPT_TEXT"].filter((key) => !env[key]);
}

function missingMinimaxTtsConfig(env: NodeJS.ProcessEnv): string[] {
  return ["MINIMAX_API_KEY", "MINIMAX_GROUP_ID", "MINIMAX_TTS_MODEL", "MINIMAX_TTS_VOICE_ID"].filter((key) => !env[key]);
}

function requiredEnv(value: string | undefined): string {
  if (!value) throw new Error("Required environment value is missing.");
  return value;
}

function extractChatCompletionText(json: Record<string, unknown>): string {
  const choices = json.choices;
  if (!Array.isArray(choices)) return "";
  const first = choices[0] as Record<string, unknown> | undefined;
  const message = first?.message as Record<string, unknown> | undefined;
  return typeof message?.content === "string" ? message.content : "";
}

function extractAsrText(content: string): string | undefined {
  const match = content.match(/<asr_text>([\s\S]*?)(?:<\/asr_text>|$)/);
  const text = (match?.[1] ?? content).trim();
  return text || undefined;
}

function extractTranscriptionText(json: Record<string, unknown>): string | undefined {
  if (typeof json.text === "string") return json.text.trim() || undefined;
  const results = json.results;
  if (Array.isArray(results)) {
    const text = results
      .map((item) => typeof item === "object" && item !== null && "text" in item ? String((item as Record<string, unknown>).text ?? "") : "")
      .join(" ")
      .trim();
    if (text) return text;
  }
  const segments = json.segments;
  if (Array.isArray(segments)) {
    const text = segments
      .map((item) => typeof item === "object" && item !== null && "text" in item ? String((item as Record<string, unknown>).text ?? "") : "")
      .join(" ")
      .trim();
    if (text) return text;
  }
  return undefined;
}

function buildGptSovitsPayload(input: VoiceSynthesizeInput, env: NodeJS.ProcessEnv): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    text: input.text,
    text_lang: env.GPT_SOVITS_TEXT_LANG || "zh",
    ref_audio_path: requiredEnv(env.GPT_SOVITS_REF_AUDIO_PATH),
    prompt_text: requiredEnv(env.GPT_SOVITS_PROMPT_TEXT),
    prompt_lang: env.GPT_SOVITS_PROMPT_LANG || env.GPT_SOVITS_TEXT_LANG || "zh",
    seed: Number(env.GPT_SOVITS_SEED || "0"),
    top_k: Number(env.GPT_SOVITS_TOP_K || "5"),
    batch_size: Number(env.GPT_SOVITS_BATCH_SIZE || "1")
  };
  if (env.GPT_SOVITS_TEXT_SPLIT_METHOD) payload.text_split_method = env.GPT_SOVITS_TEXT_SPLIT_METHOD;
  return payload;
}

function buildMinimaxTtsUrl(env: NodeJS.ProcessEnv): string {
  const baseUrl = env.MINIMAX_TTS_URL || "https://api.minimax.chat/v1/t2a_v2";
  const url = new URL(baseUrl);
  if (!url.searchParams.has("GroupId")) {
    url.searchParams.set("GroupId", requiredEnv(env.MINIMAX_GROUP_ID));
  }
  return url.toString();
}

function buildMinimaxTtsPayload(input: VoiceSynthesizeInput, env: NodeJS.ProcessEnv): Record<string, unknown> {
  return {
    model: requiredEnv(env.MINIMAX_TTS_MODEL),
    text: input.text,
    stream: false,
    voice_setting: {
      voice_id: input.voice || requiredEnv(env.MINIMAX_TTS_VOICE_ID),
      speed: Number(env.MINIMAX_TTS_SPEED || "1"),
      vol: Number(env.MINIMAX_TTS_VOLUME || "1"),
      pitch: Number(env.MINIMAX_TTS_PITCH || "0")
    },
    audio_setting: {
      sample_rate: Number(env.MINIMAX_TTS_SAMPLE_RATE || "32000"),
      bitrate: Number(env.MINIMAX_TTS_BITRATE || "128000"),
      format: env.MINIMAX_TTS_FORMAT || "mp3",
      channel: Number(env.MINIMAX_TTS_CHANNEL || "1")
    }
  };
}

function extractMinimaxError(json: Record<string, unknown>): string | undefined {
  const baseResp = json.base_resp as Record<string, unknown> | undefined;
  const statusCode = Number(baseResp?.status_code ?? 0);
  if (statusCode === 0) return undefined;
  const statusMsg = typeof baseResp?.status_msg === "string" ? baseResp.status_msg : "MiniMax T2A v2 returned a provider error.";
  return `MiniMax T2A v2 provider error ${statusCode}: ${statusMsg}`;
}

function extractMinimaxAudioBase64(json: Record<string, unknown>): string | undefined {
  const data = json.data as Record<string, unknown> | undefined;
  const audio = data?.audio;
  if (typeof audio !== "string" || !audio) return undefined;
  return /^[0-9a-fA-F]+$/.test(audio) ? Buffer.from(audio, "hex").toString("base64") : audio;
}

function mimeTypeFromAudioFormat(format: string): string {
  switch (format.toLowerCase()) {
    case "wav":
      return "audio/wav";
    case "pcm":
      return "audio/L16";
    case "flac":
      return "audio/flac";
    case "mp3":
    default:
      return "audio/mpeg";
  }
}
