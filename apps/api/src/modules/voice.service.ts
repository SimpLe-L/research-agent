import { Inject, Injectable } from "@nestjs/common";
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
    const transcript = await this.transcribe(input);
    if (!transcript.transcript) {
      return {
        sessionId: input.sessionId ?? "",
        assistantText: "",
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
    const audio = await this.synthesize({
      text: assistant.content,
      voice: input.voice,
      sessionId: assistant.sessionId
    });
    return {
      sessionId: assistant.sessionId,
      transcript: transcript.transcript,
      assistantText: assistant.content,
      audioBase64: audio.audioBase64,
      mimeType: audio.mimeType,
      degradedReason: [transcript.degradedReason, assistant.degradedReason, audio.degradedReason].filter(Boolean).join(" ") || undefined
    };
  }
}
