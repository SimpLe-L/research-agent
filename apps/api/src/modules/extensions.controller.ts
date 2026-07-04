import { Body, Controller, Get, Inject, Param, Post, Res } from "@nestjs/common";
import { invokeExtensionSchema } from "@sp-agent/shared";
import { ExtensionsService, type ExtensionSseResponse } from "./extensions.service.js";

@Controller("extensions")
export class ExtensionsController {
  constructor(@Inject(ExtensionsService) private readonly extensionsService: ExtensionsService) {}

  @Get()
  list() {
    return this.extensionsService.list();
  }

  @Get(":id/research/tasks/:taskId/events/stream")
  streamResearchTaskEvents(@Param("id") id: string, @Param("taskId") taskId: string, @Res() response: ExtensionSseResponse) {
    return this.extensionsService.streamResearchTaskEvents(id, taskId, response);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.extensionsService.get(id);
  }

  @Post(":id/invoke")
  invoke(@Param("id") id: string, @Body() body: unknown) {
    const input = invokeExtensionSchema.parse(body ?? {});
    return this.extensionsService.invoke(id, input);
  }
}
