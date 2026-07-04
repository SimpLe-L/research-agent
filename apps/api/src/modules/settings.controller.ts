import { Body, Controller, Get, Inject, Post, Put, Query } from "@nestjs/common";
import { pruneRetentionSchema, settingsSchema } from "@sp-agent/shared";
import { SettingsService } from "./settings.service.js";

@Controller("settings")
export class SettingsController {
  constructor(@Inject(SettingsService) private readonly settingsService: SettingsService) {}

  @Get()
  get() {
    return this.settingsService.get();
  }

  @Get("readiness")
  readiness() {
    return this.settingsService.readiness();
  }

  @Get("retention/preview")
  retentionPreview(@Query("days") days?: string) {
    return this.settingsService.retentionPreview(days ? Number(days) : undefined);
  }

  @Post("retention/prune")
  pruneRetention(@Body() body: unknown) {
    const input = pruneRetentionSchema.parse(body ?? {});
    return this.settingsService.pruneRetention(input);
  }

  @Put()
  update(@Body() body: unknown) {
    const settings = settingsSchema.partial().parse(body);
    return this.settingsService.update(settings);
  }
}
