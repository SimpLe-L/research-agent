import { createServer } from "node:http";
import { Buffer } from "node:buffer";
import { getSpeechStatus, synthesizeVoice, transcribeVoice } from "../packages/speech/dist/speech/src/index.js";

const requests = [];
const server = createServer(async (req, res) => {
  const body = await readRequestBody(req);
  const isJson = String(req.headers["content-type"] ?? "").includes("application/json");
  const json = isJson && body ? JSON.parse(body) : {};
  requests.push({
    url: req.url,
    method: req.method,
    authorization: req.headers.authorization,
    contentType: req.headers["content-type"],
    body,
    json
  });

  if (req.url === "/stt-ok") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: "<asr_text>请总结当前语音模块测试状态</asr_text>"
            }
          }
        ]
      })
    );
    return;
  }

  if (req.url === "/stt-empty") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: "" } }] }));
    return;
  }

  if (req.url === "/transcriptions-ok") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ text: "FunASR 转写成功" }));
    return;
  }

  if (req.url === "/transcriptions-text") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("FunASR plain text transcript");
    return;
  }

  if (req.url === "/tts-ok") {
    res.writeHead(200, { "content-type": "audio/wav" });
    res.end(Buffer.from("mock-gpt-sovits-wav", "utf8"));
    return;
  }

  if (req.url === "/tts-error") {
    res.writeHead(503, { "content-type": "text/plain" });
    res.end("mock tts unavailable");
    return;
  }

  if (req.url?.startsWith("/minimax-tts-ok")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        data: {
          audio: Buffer.from("mock-minimax-mp3", "utf8").toString("hex")
        },
        base_resp: {
          status_code: 0,
          status_msg: "success"
        }
      })
    );
    return;
  }

  if (req.url?.startsWith("/minimax-tts-error")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        base_resp: {
          status_code: 1008,
          status_msg: "mock minimax quota exceeded"
        }
      })
    );
    return;
  }

  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
});

try {
  await listen(server);
  const base = `http://127.0.0.1:${server.address().port}`;
  const env = {
    SPEECH_STT_PROVIDER: "openai-compatible-stt",
    OPENAI_COMPATIBLE_STT_URL: `${base}/stt-ok`,
    OPENAI_COMPATIBLE_STT_API_KEY: "mock-stt-key",
    OPENAI_COMPATIBLE_STT_MODEL: "mock-audio-model",
    SPEECH_TTS_PROVIDER: "gpt-sovits-api",
    GPT_SOVITS_TTS_URL: `${base}/tts-ok`,
    GPT_SOVITS_REF_AUDIO_PATH: "/tmp/mock-ref.wav",
    GPT_SOVITS_PROMPT_TEXT: "参考音频文本",
    GPT_SOVITS_TEXT_LANG: "zh",
    GPT_SOVITS_PROMPT_LANG: "zh",
    GPT_SOVITS_TEXT_SPLIT_METHOD: "cut0"
  };

  const status = await getSpeechStatus(env);
  assert(status.ready === true, "mock real providers should be ready when env is complete");
  assert(status.stt.name === "openai-compatible-stt", "expected openai-compatible-stt status");
  assert(status.tts.name === "gpt-sovits-api", "expected gpt-sovits-api status");

  const transcript = await transcribeVoice(
    {
      audioBase64: Buffer.from("fake webm audio").toString("base64"),
      mimeType: "audio/webm"
    },
    env
  );
  assert(transcript.transcript === "请总结当前语音模块测试状态", "STT should parse asr_text transcript");
  assert(transcript.provider === "openai-compatible-stt", "STT provider id should be returned");
  const sttRequest = requests.find((request) => request.url === "/stt-ok");
  assert(sttRequest?.method === "POST", "STT should use POST");
  assert(sttRequest?.authorization === "Bearer mock-stt-key", "STT should send bearer token");
  assert(sttRequest?.json.model === "mock-audio-model", "STT should send configured model");
  assert(
    sttRequest?.json.messages?.[0]?.content?.[0]?.audio_url?.url?.startsWith("data:audio/webm;base64,"),
    "STT should send base64 audio_url content"
  );

  const transcriptionsEnv = {
    SPEECH_STT_PROVIDER: "openai-audio-transcriptions-stt",
    OPENAI_TRANSCRIPTIONS_STT_URL: `${base}/transcriptions-ok`,
    OPENAI_TRANSCRIPTIONS_STT_MODEL: "sensevoice",
    OPENAI_TRANSCRIPTIONS_STT_API_KEY: "mock-transcriptions-key",
    OPENAI_TRANSCRIPTIONS_STT_RESPONSE_FORMAT: "verbose_json",
    OPENAI_TRANSCRIPTIONS_STT_LANGUAGE: "zh",
    OPENAI_TRANSCRIPTIONS_STT_FILENAME: "speech.webm",
    SPEECH_TTS_PROVIDER: "gpt-sovits-api",
    GPT_SOVITS_TTS_URL: `${base}/tts-ok`,
    GPT_SOVITS_REF_AUDIO_PATH: "/tmp/mock-ref.wav",
    GPT_SOVITS_PROMPT_TEXT: "参考音频文本"
  };
  const transcriptionsStatus = await getSpeechStatus(transcriptionsEnv);
  assert(transcriptionsStatus.ready === true, "OpenAI audio transcriptions STT should be ready when env is complete");
  const transcriptionsTranscript = await transcribeVoice(
    {
      audioBase64: Buffer.from("fake funasr audio").toString("base64"),
      mimeType: "audio/webm"
    },
    transcriptionsEnv
  );
  assert(transcriptionsTranscript.transcript === "FunASR 转写成功", "transcriptions STT should parse JSON text");
  const transcriptionsRequest = requests.find((request) => request.url === "/transcriptions-ok");
  assert(transcriptionsRequest?.authorization === "Bearer mock-transcriptions-key", "transcriptions STT should send bearer token when configured");
  assert(String(transcriptionsRequest?.contentType).includes("multipart/form-data"), "transcriptions STT should use multipart/form-data");
  assert(transcriptionsRequest?.body.includes('name="model"'), "transcriptions STT should include model form field");
  assert(transcriptionsRequest?.body.includes("sensevoice"), "transcriptions STT should include configured model value");
  assert(transcriptionsRequest?.body.includes('filename="speech.webm"'), "transcriptions STT should include configured filename");

  const plainTranscriptionsTranscript = await transcribeVoice(
    {
      audioBase64: Buffer.from("fake funasr audio").toString("base64"),
      mimeType: "audio/webm"
    },
    {
      ...transcriptionsEnv,
      OPENAI_TRANSCRIPTIONS_STT_URL: `${base}/transcriptions-text`
    }
  );
  assert(plainTranscriptionsTranscript.transcript === "FunASR plain text transcript", "transcriptions STT should parse plain text response");

  const audio = await synthesizeVoice(
    {
      text: "这是语音 provider smoke。",
      voice: "default"
    },
    env
  );
  assert(audio.provider === "gpt-sovits-api", "TTS provider id should be returned");
  assert(audio.mimeType === "audio/wav", "TTS should preserve response content-type");
  assert(Buffer.from(audio.audioBase64 ?? "", "base64").toString("utf8") === "mock-gpt-sovits-wav", "TTS should return response audio bytes");
  const ttsRequest = requests.find((request) => request.url === "/tts-ok");
  assert(ttsRequest?.method === "POST", "TTS should use POST");
  assert(ttsRequest?.json.text === "这是语音 provider smoke。", "TTS should send text");
  assert(ttsRequest?.json.ref_audio_path === "/tmp/mock-ref.wav", "TTS should send ref_audio_path");
  assert(ttsRequest?.json.prompt_text === "参考音频文本", "TTS should send prompt_text");
  assert(ttsRequest?.json.text_split_method === "cut0", "TTS should send text_split_method when configured");

  const minimaxEnv = {
    SPEECH_STT_PROVIDER: "deterministic",
    SPEECH_TTS_PROVIDER: "minimax-t2a-v2",
    MINIMAX_TTS_URL: `${base}/minimax-tts-ok`,
    MINIMAX_API_KEY: "mock-minimax-key",
    MINIMAX_GROUP_ID: "mock-group",
    MINIMAX_TTS_MODEL: "speech-02-hd",
    MINIMAX_TTS_VOICE_ID: "mock-voice",
    MINIMAX_TTS_FORMAT: "mp3",
    MINIMAX_TTS_SAMPLE_RATE: "32000",
    MINIMAX_TTS_BITRATE: "128000"
  };
  const minimaxStatus = await getSpeechStatus(minimaxEnv);
  assert(minimaxStatus.tts.name === "minimax-t2a-v2", "expected minimax-t2a-v2 status");
  assert(minimaxStatus.tts.reachable === true, "MiniMax TTS should be ready when env is complete");
  const minimaxAudio = await synthesizeVoice(
    {
      text: "这是 MiniMax 语音 provider smoke。",
      voice: "override-voice"
    },
    minimaxEnv
  );
  assert(minimaxAudio.provider === "minimax-t2a-v2", "MiniMax TTS provider id should be returned");
  assert(minimaxAudio.mimeType === "audio/mpeg", "MiniMax TTS should infer mp3 mime type");
  assert(Buffer.from(minimaxAudio.audioBase64 ?? "", "base64").toString("utf8") === "mock-minimax-mp3", "MiniMax TTS should decode hex audio");
  const minimaxRequest = requests.find((request) => request.url === "/minimax-tts-ok?GroupId=mock-group");
  assert(minimaxRequest?.method === "POST", "MiniMax TTS should use POST");
  assert(minimaxRequest?.authorization === "Bearer mock-minimax-key", "MiniMax TTS should send bearer token");
  assert(minimaxRequest?.json.model === "speech-02-hd", "MiniMax TTS should send configured model");
  assert(minimaxRequest?.json.text === "这是 MiniMax 语音 provider smoke。", "MiniMax TTS should send text");
  assert(minimaxRequest?.json.voice_setting?.voice_id === "override-voice", "MiniMax TTS should prefer request voice override");
  assert(minimaxRequest?.json.audio_setting?.format === "mp3", "MiniMax TTS should send configured audio format");

  const emptyTranscript = await transcribeVoice(
    {
      audioBase64: Buffer.from("fake webm audio").toString("base64"),
      mimeType: "audio/webm"
    },
    {
      ...env,
      OPENAI_COMPATIBLE_STT_URL: `${base}/stt-empty`
    }
  );
  assert(emptyTranscript.degradedReason?.includes("did not include transcript"), "empty STT response should degrade");

  const ttsError = await synthesizeVoice(
    {
      text: "失败路径"
    },
    {
      ...env,
      GPT_SOVITS_TTS_URL: `${base}/tts-error`
    }
  );
  assert(ttsError.degradedReason?.includes("HTTP 503"), "TTS HTTP error should degrade with status");

  const minimaxProviderError = await synthesizeVoice(
    {
      text: "MiniMax 失败路径"
    },
    {
      ...minimaxEnv,
      MINIMAX_TTS_URL: `${base}/minimax-tts-error`
    }
  );
  assert(minimaxProviderError.degradedReason?.includes("provider error 1008"), "MiniMax provider error should degrade with status code");

  console.log(
    JSON.stringify(
      {
        ok: true,
        requestCount: requests.length,
        sttTranscript: transcript.transcript,
        transcriptionsTranscript: transcriptionsTranscript.transcript,
        ttsMimeType: audio.mimeType,
        minimaxTtsMimeType: minimaxAudio.mimeType
      },
      null,
      2
    )
  );
} finally {
  await close(server);
}

function listen(target) {
  return new Promise((resolve, reject) => {
    target.once("error", reject);
    target.listen(0, "127.0.0.1", () => {
      target.off("error", reject);
      resolve();
    });
  });
}

function close(target) {
  return new Promise((resolve, reject) => {
    target.close((error) => (error ? reject(error) : resolve()));
  });
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
