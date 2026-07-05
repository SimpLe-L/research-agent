import { Body, Controller, Get, Inject, Post, Query } from "@nestjs/common";
import { voiceChatSchema, voiceSynthesizeSchema, voiceTranscribeSchema } from "@sp-agent/shared";
import { VoiceService } from "./voice.service.js";

@Controller("voice")
export class VoiceController {
  constructor(@Inject(VoiceService) private readonly voiceService: VoiceService) {}

  @Get("status")
  async status() {
    return this.voiceService.status();
  }

  @Get("audit")
  async audit(@Query("sessionId") sessionId?: string) {
    return this.voiceService.audit(sessionId);
  }

  @Post("transcribe")
  async transcribe(@Body() body: unknown) {
    return this.voiceService.transcribe(voiceTranscribeSchema.parse(body));
  }

  @Post("synthesize")
  async synthesize(@Body() body: unknown) {
    return this.voiceService.synthesize(voiceSynthesizeSchema.parse(body));
  }

  @Post("chat")
  async chat(@Body() body: unknown) {
    return this.voiceService.chat(voiceChatSchema.parse(body));
  }
}
