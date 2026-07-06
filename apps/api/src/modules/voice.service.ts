import { Inject, Injectable, Logger } from "@nestjs/common";
import { getSpeechStatus, synthesizeVoice, transcribeVoice } from "@sp-agent/speech";
import type {
  VoiceChatInput,
  VoiceChatResponse,
  VoiceStatus,
  VoiceSynthesizeInput,
  VoiceSynthesizeResponse,
  VoiceTranscribeInput,
  VoiceTranscribeResponse
} from "@sp-agent/shared";
import { AgentShellService } from "./agent-shell.service.js";
import { VoiceAuditService } from "./voice-audit.service.js";

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);

  constructor(
    @Inject(AgentShellService) private readonly agentShellService: AgentShellService,
    @Inject(VoiceAuditService) private readonly voiceAuditService: VoiceAuditService
  ) {}

  async status(): Promise<VoiceStatus> {
    return getSpeechStatus();
  }

  async audit(sessionId?: string) {
    return { events: await this.voiceAuditService.list(sessionId) };
  }

  async transcribe(input: VoiceTranscribeInput): Promise<VoiceTranscribeResponse> {
    const status = await getSpeechStatus();
    await this.voiceAuditService.record({
      action: "voice.transcribe_requested",
      sessionId: input.sessionId,
      provider: status.stt.name,
      status: "requested",
      metadata: {
        mimeType: input.mimeType,
        audioPersisted: false
      }
    });
    const result = await transcribeVoice(input);
    await this.voiceAuditService.record({
      action: result.degradedReason ? "voice.degraded" : "voice.transcribe_completed",
      sessionId: input.sessionId,
      provider: result.provider,
      status: result.degradedReason ? "degraded" : "completed",
      degradedReason: result.degradedReason,
      metadata: {
        transcriptLength: result.transcript?.length ?? 0,
        audioPersisted: false
      }
    });
    return result;
  }

  async synthesize(input: VoiceSynthesizeInput): Promise<VoiceSynthesizeResponse> {
    const status = await getSpeechStatus();
    await this.voiceAuditService.record({
      action: "voice.synthesize_requested",
      sessionId: input.sessionId,
      provider: status.tts.name,
      status: "requested",
      metadata: {
        textLength: input.text.length,
        voice: input.voice
      }
    });
    const result = await synthesizeVoice(input);
    await this.voiceAuditService.record({
      action: result.degradedReason ? "voice.degraded" : "voice.synthesize_completed",
      sessionId: input.sessionId,
      provider: result.provider,
      status: result.degradedReason ? "degraded" : "completed",
      degradedReason: result.degradedReason,
      metadata: {
        textLength: input.text.length,
        mimeType: result.mimeType,
        audioReturned: Boolean(result.audioBase64)
      }
    });
    return result;
  }

  async chat(input: VoiceChatInput): Promise<VoiceChatResponse> {
    const startedAt = Date.now();
    const transcript = await this.transcribe(input);
    const transcribedAt = Date.now();
    if (!transcript.transcript) {
      const timing = {
        sttMs: transcribedAt - startedAt,
        agentMs: 0,
        ttsMs: 0,
        totalMs: transcribedAt - startedAt
      };
      this.logger.warn(`voice.chat degraded timing stt=${timing.sttMs}ms agent=0ms tts=0ms total=${timing.totalMs}ms reason=${transcript.degradedReason ?? "missing transcript"}`);
      return {
        sessionId: input.sessionId ?? "",
        assistantText: "",
        timing,
        degradedReason: transcript.degradedReason ?? "STT provider did not return a transcript."
      };
    }

    const assistant = await this.agentShellService.runMessage({
      content: transcript.transcript,
      sessionId: input.sessionId,
      extensionIds: []
    }, {
      source: "voice",
      sttProvider: transcript.provider,
      audioPersisted: false
    });
    const agentCompletedAt = Date.now();
    const audio = await this.synthesize({
      text: assistant.content,
      voice: input.voice,
      sessionId: assistant.sessionId
    });
    const completedAt = Date.now();
    const timing = {
      sttMs: transcribedAt - startedAt,
      agentMs: agentCompletedAt - transcribedAt,
      ttsMs: completedAt - agentCompletedAt,
      totalMs: completedAt - startedAt
    };
    this.logger.log(`voice.chat timing stt=${timing.sttMs}ms agent=${timing.agentMs}ms tts=${timing.ttsMs}ms total=${timing.totalMs}ms session=${assistant.sessionId}`);
    return {
      sessionId: assistant.sessionId,
      transcript: transcript.transcript,
      assistantText: assistant.content,
      audioBase64: audio.audioBase64,
      mimeType: audio.mimeType,
      timing,
      degradedReason: [transcript.degradedReason, assistant.degradedReason, audio.degradedReason].filter(Boolean).join(" ") || undefined
    };
  }
}
