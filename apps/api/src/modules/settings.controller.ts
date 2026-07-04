import { Body, Controller, Get, Inject, Put } from "@nestjs/common";
import { settingsSchema } from "@sp-agent/shared";
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

  @Put()
  update(@Body() body: unknown) {
    const settings = settingsSchema.partial().parse(body);
    return this.settingsService.update(settings);
  }
}
