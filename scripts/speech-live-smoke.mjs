import { Buffer } from "node:buffer";
import { getSpeechStatus, synthesizeVoice, transcribeVoice } from "../packages/speech/dist/speech/src/index.js";

if (process.env.SPEECH_PROVIDER_LIVE_SMOKE !== "1") {
  console.log(
    JSON.stringify(
      {
        ok: true,
        skipped: true,
        reason: "Set SPEECH_PROVIDER_LIVE_SMOKE=1 with real STT/TTS provider env to run live speech provider smoke."
      },
      null,
      2
    )
  );
  process.exit(0);
}

const status = await getSpeechStatus(process.env);
assert(status.ready === true, status.degradedReason ?? "Live speech providers are not ready.");

const transcript = await transcribeVoice({
  audioBase64: process.env.SPEECH_LIVE_AUDIO_BASE64 || Buffer.from("live smoke placeholder audio").toString("base64"),
  mimeType: process.env.SPEECH_LIVE_AUDIO_MIME_TYPE || "audio/webm"
});
assert(transcript.transcript, transcript.degradedReason ?? "Live STT did not return transcript.");

const audio = await synthesizeVoice({
  text: process.env.SPEECH_LIVE_TTS_TEXT || `语音 live smoke：${transcript.transcript}`
});
assert(audio.audioBase64, audio.degradedReason ?? "Live TTS did not return audio.");
assert(audio.mimeType, "Live TTS did not return mimeType.");

console.log(
  JSON.stringify(
    {
      ok: true,
      sttProvider: transcript.provider,
      ttsProvider: audio.provider,
      transcript: transcript.transcript,
      mimeType: audio.mimeType,
      audioBytes: Buffer.from(audio.audioBase64, "base64").byteLength
    },
    null,
    2
  )
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
