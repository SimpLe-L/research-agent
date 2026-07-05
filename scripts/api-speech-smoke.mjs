import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getSpeechStatus,
  listSttProviderAdapters,
  listTtsProviderAdapters,
  synthesizeVoice,
  transcribeVoice
} from "../packages/speech/dist/speech/src/index.js";

const port = Number(process.env.SMOKE_API_PORT ?? 4900 + Math.floor(Math.random() * 1000));
const base = process.env.SMOKE_API_BASE ?? `http://127.0.0.1:${port}/api`;
const dataDir = await mkdtemp(join(tmpdir(), "sp-agent-speech-smoke-"));
let apiProcess;

try {
  const missingStatus = await getSpeechStatus({
    SPEECH_STT_PROVIDER: "",
    SPEECH_TTS_PROVIDER: ""
  });
  assert(missingStatus.ready === false, "missing speech providers should not be ready");
  assert(
    listSttProviderAdapters().some((adapter) => adapter.id === "openai-compatible-stt"),
    "openai-compatible-stt adapter should be registered"
  );
  assert(
    listTtsProviderAdapters().some((adapter) => adapter.id === "gpt-sovits-api"),
    "gpt-sovits-api adapter should be registered"
  );
  const realProviderMissingStatus = await getSpeechStatus({
    SPEECH_STT_PROVIDER: "openai-compatible-stt",
    SPEECH_TTS_PROVIDER: "gpt-sovits-api"
  });
  assert(realProviderMissingStatus.ready === false, "real speech providers without env should not be ready");
  assert(
    realProviderMissingStatus.degradedReason?.includes("OPENAI_COMPATIBLE_STT_URL") &&
      realProviderMissingStatus.degradedReason?.includes("GPT_SOVITS_TTS_URL"),
    "real speech providers should report missing env keys"
  );
  const realProviderMissingTranscript = await transcribeVoice(
    {
      audioBase64: Buffer.from("fake audio").toString("base64"),
      mimeType: "audio/webm"
    },
    {
      SPEECH_STT_PROVIDER: "openai-compatible-stt"
    }
  );
  assert(
    realProviderMissingTranscript.degradedReason?.includes("OPENAI_COMPATIBLE_STT_URL"),
    "openai-compatible-stt should report missing env keys during transcription"
  );
  const realProviderMissingAudio = await synthesizeVoice(
    {
      text: "hello"
    },
    {
      SPEECH_TTS_PROVIDER: "gpt-sovits-api"
    }
  );
  assert(
    realProviderMissingAudio.degradedReason?.includes("GPT_SOVITS_TTS_URL"),
    "gpt-sovits-api should report missing env keys during synthesis"
  );
  const missingTranscript = await transcribeVoice(
    {
      audioBase64: Buffer.from("fake audio").toString("base64"),
      mimeType: "audio/webm"
    },
    {
      SPEECH_STT_PROVIDER: "",
      SPEECH_TTS_PROVIDER: ""
    }
  );
  assert(missingTranscript.degradedReason, "missing STT should return degraded reason");
  const missingAudio = await synthesizeVoice(
    {
      text: "hello"
    },
    {
      SPEECH_STT_PROVIDER: "",
      SPEECH_TTS_PROVIDER: ""
    }
  );
  assert(missingAudio.degradedReason, "missing TTS should return degraded reason");

  if (!process.env.SMOKE_API_BASE) {
    apiProcess = spawn(process.execPath, ["apps/api/dist/apps/api/src/main.js"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        SP_AGENT_DATA_DIR: dataDir,
        SILICONFLOW_API_KEY: "",
        PI_API_KEY: "",
        SPEECH_STT_PROVIDER: "deterministic",
        SPEECH_TTS_PROVIDER: "deterministic",
        SPEECH_DETERMINISTIC_TRANSCRIPT: "语音 smoke：当前 agent 有哪些能力？"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    await waitForApi();
  }

  const status = await getJson(`${base}/voice/status`);
  assert(status.ready === true, "speech status should be ready with deterministic providers");
  assert(status.stt.name === "deterministic", "expected deterministic STT");
  assert(status.tts.name === "deterministic", "expected deterministic TTS");

  const readiness = await getJson(`${base}/settings/readiness`);
  assert(readiness.items.some((item) => item.id === "speech-stt" && item.status === "ready"), "speech STT readiness should be ready");
  assert(readiness.items.some((item) => item.id === "speech-tts" && item.status === "ready"), "speech TTS readiness should be ready");

  const registry = await getJson(`${base}/extensions`);
  const speech = registry.extensions.find((extension) => extension.id === "local.speech");
  assert(speech?.status === "active", "local.speech should be active when deterministic providers are ready");

  const transcribed = await postJson(`${base}/voice/transcribe`, {
    audioBase64: Buffer.from("fake audio").toString("base64"),
    mimeType: "audio/webm"
  });
  assert(transcribed.transcript === "语音 smoke：当前 agent 有哪些能力？", "deterministic STT should return configured transcript");

  const synthesized = await postJson(`${base}/voice/synthesize`, {
    text: "这是语音合成 smoke。"
  });
  assert(synthesized.audioBase64, "deterministic TTS should return audioBase64");
  assert(synthesized.mimeType?.startsWith("text/plain"), "deterministic TTS should return test mime type");

  const voiceChat = await postJson(`${base}/voice/chat`, {
    audioBase64: Buffer.from("fake audio").toString("base64"),
    mimeType: "audio/webm"
  });
  assert(voiceChat.sessionId, "voice chat should return a session id");
  assert(voiceChat.transcript === "语音 smoke：当前 agent 有哪些能力？", "voice chat should include transcript");
  assert(voiceChat.assistantText, "voice chat should include assistant text");
  assert(voiceChat.audioBase64, "voice chat should include synthesized audio");

  const session = await getJson(`${base}/chat/sessions/${voiceChat.sessionId}`);
  const userMessage = session.messages.find((message) => message.role === "user");
  assert(userMessage?.metadata?.source === "voice", "voice chat should persist user transcript with voice source metadata");
  assert(userMessage?.metadata?.audioPersisted === false, "voice chat should mark raw audio as not persisted");

  const audit = await getJson(`${base}/voice/audit?sessionId=${voiceChat.sessionId}`);
  assert(
    audit.events.some((event) => event.action === "voice.synthesize_requested" && event.sessionId === voiceChat.sessionId),
    "voice audit should include synthesize request for voice chat session"
  );
  assert(
    audit.events.some((event) => event.action === "voice.synthesize_completed" && event.sessionId === voiceChat.sessionId),
    "voice audit should include synthesize completion for voice chat session"
  );
  const allAudit = await getJson(`${base}/voice/audit`);
  assert(
    allAudit.events.some((event) => event.action === "voice.transcribe_completed"),
    "voice audit should include transcribe completion"
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        sessionId: voiceChat.sessionId,
        transcript: voiceChat.transcript,
        dataDir
      },
      null,
      2
    )
  );
} finally {
  if (apiProcess) apiProcess.kill("SIGTERM");
  await rm(dataDir, { recursive: true, force: true });
}

async function waitForApi() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const health = await getJson(`${base}/health`);
      if (health.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`API did not start at ${base}`);
}

async function getJson(url) {
  const response = await fetch(url);
  return readJson(response, url);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return readJson(response, url);
}

async function readJson(response, url) {
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  assert(response.ok, `${url} failed with ${response.status}: ${text}`);
  return json;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
