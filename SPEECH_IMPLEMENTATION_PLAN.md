# SPEECH_IMPLEMENTATION_PLAN.md

## Goal

Add voice chat to the existing local-first chat agent without changing the core architecture.

Speech is an interaction layer around the current typed agent loop:

```text
Electron renderer
-> local NestJS API gateway
-> app-owned memory retrieval
-> runtime adapter
-> extension/workflow/approval boundary
-> assistant text
-> speech output
```

Do not migrate the project to a MoeChat-style Python/FastAPI stack. Borrow the useful voice pipeline ideas, especially VAD, ASR, sentence splitting, TTS queues, and low-latency audio playback, but implement them inside the current TypeScript/NestJS/Electron boundaries.

The product direction is chat-first personal agent:

- Chat and voice are the primary experience.
- Long-term memory gives continuity and personal context.
- General agent abilities such as token research, project search, email drafting/sending, and future connectors are implemented as skills/workflows.
- Skills remain permissioned and auditable; voice never bypasses approval.

## Non-Negotiable Boundaries

- Pi and future model runtimes must not own STT, TTS, microphone capture, audio storage, or voice session state.
- The API gateway owns provider readiness, speech provider calls, transcript persistence policy, memory retrieval, and audit events.
- Voice input must enter the same `POST /api/agent/messages` path as typed chat after STT.
- Raw audio is not persisted by default.
- Transcript persistence must be explicit and traceable through normal chat/session metadata.
- Missing STT/TTS providers must produce visible degraded reasons, not crashes or fake transcripts/audio.
- Write/provider/destructive capabilities still require approval through the existing approval queue.

## Architecture Target

```text
apps/web
  record button / disabled-until-ready mic slot
  capture audio clip
  show transcript and voice state
  play returned audio

apps/api
  /api/voice/status
  /api/voice/transcribe
  /api/voice/chat
  /api/voice/synthesize

packages/speech
  SpeechProviderRegistry
  SttProviderAdapter
  TtsProviderAdapter
  audio validation helpers
  degraded provider status contracts

existing path
  /api/agent/messages
  memory.search
  runtime adapter
  extension invocation
  approval queue
```

Provider adapters should follow the same degraded-state shape used elsewhere:

```ts
type SpeechProviderStatus = {
  name: string;
  configured: boolean;
  reachable: boolean;
  degradedReason?: string;
};
```

## Phase 1: Memory-Aware Half-Duplex Voice Chat

Purpose: prove the full voice loop with minimal latency ambition, maximum architectural safety, and the same memory-aware agent behavior as typed chat.

User flow:

```text
press record
-> capture one audio clip
-> upload to /api/voice/transcribe
-> STT returns final transcript
-> transcript is sent to /api/agent/messages
-> existing agent loop retrieves memory, exposes read-only skills, and returns assistant text
-> /api/voice/synthesize turns text into audio
-> renderer plays audio
```

Deliverables:

- Add `packages/speech` with shared STT/TTS adapter interfaces.
- Register `local.speech` as active only when at least one STT and one TTS adapter has a configured provider.
- Add `GET /api/voice/status`.
- Add `POST /api/voice/transcribe`.
- Add `POST /api/voice/synthesize`.
- Add `POST /api/voice/chat` as the convenience endpoint that runs transcribe -> agent message -> synthesize.
- Add renderer mic control in the existing assistant-ui shell.
- Open a dedicated voice call overlay from the composer mic so transcript, assistant speech state, provider labels, and call controls stay outside the normal text composer.
- Keep typed chat fully usable when speech providers are missing.
- Store assistant/user transcript messages through the existing chat session path.
- Store no raw audio unless a future explicit retention setting is added.
- Mark transcript messages with voice provenance metadata.

Initial provider choices:

- STT: start with `openai-compatible-stt`, an API-compatible adapter that sends base64 audio through an OpenAI-style chat-completions payload.
- TTS: start with `gpt-sovits-api`, an optional GPT-SoVITS `/tts` API adapter. This matches MoeChat's provider shape without copying its Python/FastAPI stack.
- Add deterministic degraded adapters for smoke tests so CI/local smoke does not require live audio providers.

API contracts:

```ts
type VoiceTranscribeResponse = {
  transcript?: string;
  provider: string;
  degradedReason?: string;
};

type VoiceSynthesizeResponse = {
  audioBase64?: string;
  mimeType?: string;
  provider: string;
  degradedReason?: string;
};

type VoiceChatResponse = {
  sessionId: string;
  transcript?: string;
  assistantText: string;
  audioBase64?: string;
  mimeType?: string;
  degradedReason?: string;
};
```

Acceptance:

- `pnpm typecheck`
- `pnpm build`
- `pnpm smoke:api:speech`
- `pnpm smoke:web:routes`
- Existing `pnpm smoke:api`, `pnpm smoke:api:memory`, and `pnpm smoke:agent-runtime` still pass.
- With no speech provider configured, `/api/voice/status` is truthful and `/api/voice/chat` returns a degraded reason without breaking typed chat.
- With configured providers, one recorded clip produces transcript, persisted user/assistant messages, and playable audio.

## Phase 2: Provider Boundary, Persona, And Memory Policy

Purpose: make speech configurable, auditable, compatible with long-term memory, and expressive enough for a chat-agent experience.

User flow remains half-duplex, but provider and persistence behavior becomes first-class.

Deliverables:

- Add provider readiness items for STT and TTS under settings readiness. Done as `speech-stt` and `speech-tts`.
- Add speech settings to app settings:
  - selected STT provider
  - selected TTS provider
  - audio retention policy, default `none`
  - transcript retention policy, default `chat_messages`
  - voice autoplay setting
  - voice persona/profile label
- Add provider-specific config through environment variables first, not UI secret editing.
- Add speech audit events. Done for the half-duplex API path:
  - `voice.transcribe_requested`
  - `voice.transcribe_completed`
  - `voice.synthesize_requested`
  - `voice.synthesize_completed`
  - `voice.degraded`
- Add transcript provenance metadata to chat messages:
  - `source: "voice"`
  - `sttProvider`
  - `ttsProvider`
  - `audioPersisted: false`
- Make voice transcript content eligible for the existing memory candidate path only through the same memory policy as typed chat.
- Do not auto-promote voice-derived identity facts or preferences.
- Add memory-candidate affordances for important voice-derived facts, but keep acceptance governed by the same memory approval/promotion policy.

Provider adapter candidates:

- `http-stt`: generic multipart/base64 HTTP STT adapter.
- `openai-compatible-stt`: implemented API-compatible adapter using `OPENAI_COMPATIBLE_STT_URL`, `OPENAI_COMPATIBLE_STT_API_KEY`, and `OPENAI_COMPATIBLE_STT_MODEL`.
- `funasr-http`: optional local FunASR adapter.
- `gpt-sovits-api`: implemented GPT-SoVITS `/tts` adapter using `GPT_SOVITS_TTS_URL`, `GPT_SOVITS_REF_AUDIO_PATH`, and `GPT_SOVITS_PROMPT_TEXT`.
- `browser-tts`: optional renderer-side fallback only if it does not bypass API readiness/audit. Prefer API-owned TTS first.

Acceptance:

- `pnpm smoke:api:speech` covers missing provider, deterministic provider, settings readiness, and metadata/audit behavior.
- `pnpm smoke:api:memory` confirms voice transcripts do not bypass candidate/promote/update/merge/forget rules.
- `/api/providers/status` and `/api/settings/readiness` show STT/TTS readiness.
- Raw audio is not written under `SP_AGENT_DATA_DIR` in default mode.
- The renderer clearly distinguishes recording, transcribing, thinking, synthesizing, playing, and degraded states.

## Phase 3: Low-Latency Streaming Voice

Purpose: reduce perceived latency after the safe half-duplex loop is stable.

Target flow:

```text
microphone stream
-> VAD detects speech boundaries
-> partial/final STT events
-> final transcript enters agent turn
-> agent text streams by token or chunk
-> sentence splitter emits speakable segments
-> TTS queue synthesizes segments
-> audio playback queue starts before full response is complete
-> user can interrupt playback or start a new utterance
```

This phase is where MoeChat's design is most useful. Borrow the queue pattern, not the stack:

```text
agentTextQueue
-> sentenceSplitter
-> ttsTextQueue
-> ttsAudioQueue
-> renderer playbackQueue
```

Deliverables:

- Add streaming agent response support only if the selected runtime adapter can expose text chunks safely.
- Add `POST /api/voice/chat/stream` or `GET /api/voice/sessions/:id/events` using SSE.
- Add VAD support in renderer or API. Prefer renderer-side VAD for local microphone responsiveness, with API-side validation.
- Add sentence splitting before TTS. Keep it language-aware enough for Chinese and English punctuation.
- Add TTS queue with backpressure and cancellation.
- Add playback interruption:
  - stop current audio
  - cancel pending TTS tasks
  - start a new voice turn
- Add voice session observability:
  - transcript status
  - agent status
  - TTS segment status
  - playback status
  - degraded reason

Streaming event examples:

```ts
type VoiceStreamEvent =
  | { type: "transcript.partial"; text: string }
  | { type: "transcript.final"; text: string }
  | { type: "assistant.text.delta"; text: string }
  | { type: "assistant.text.segment"; text: string; segmentId: string }
  | { type: "audio.segment"; segmentId: string; audioBase64: string; mimeType: string }
  | { type: "done"; assistantText: string }
  | { type: "degraded"; degradedReason: string };
```

Acceptance:

- Half-duplex `/api/voice/chat` remains available as the stable fallback.
- Streaming smoke covers cancellation, degraded TTS segment, and final transcript persistence.
- A long assistant response starts audio playback before the full text is complete.
- A new recording can interrupt playback without corrupting chat session history.
- Memory retrieval remains deterministic and happens before the agent turn; streaming does not create hidden memory writes.

## Recommended Implementation Order

1. Add shared schemas in `packages/shared` for voice status, transcribe, synthesize, voice chat, and voice audit metadata.
2. Create `packages/speech` with provider interfaces and deterministic test adapters.
3. Add `VoiceService` and `VoiceController` in `apps/api`.
4. Wire `local.speech` from planned to degraded/active based on provider readiness.
5. Add `pnpm smoke:api:speech`.
6. Add renderer record/upload/playback UI while keeping typed chat unchanged.
7. Add settings readiness for STT/TTS providers.
8. Add provider adapters one at a time. Done for `openai-compatible-stt` and `gpt-sovits-api`.
9. Add streaming only after the half-duplex path is stable.

## What Not To Do

- Do not replace NestJS with FastAPI for the main app.
- Do not move memory ownership into a speech or character-agent module.
- Do not store raw microphone audio by default.
- Do not let a TTS provider become required for typed chat.
- Do not add always-on microphone capture before explicit record-to-send works.
- Do not let voice bypass approval, extension permissions, or memory audit.
- Do not copy MoeChat GPL code into this repository.
