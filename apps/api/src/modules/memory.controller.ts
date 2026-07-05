import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import { createMemoryCandidateSchema, mergeMemorySchema, promoteMemorySchema, searchMemorySchema, updateMemorySchema } from "@sp-agent/shared";
import { MemoryService } from "./memory.service.js";

@Controller("memory")
export class MemoryController {
  constructor(@Inject(MemoryService) private readonly memoryService: MemoryService) {}

  @Get()
  async list() {
    return {
      memories: await this.memoryService.list()
    };
  }

  @Get("search")
  async search(@Query() query: unknown) {
    const input = searchMemorySchema.parse(query);
    return this.memoryService.search(input);
  }

  @Get("audit")
  async audit(@Query("memoryId") memoryId?: string) {
    return {
      auditEvents: await this.memoryService.audit(memoryId)
    };
  }

  @Post("candidates")
  async createCandidate(@Body() body: unknown) {
    const input = createMemoryCandidateSchema.parse(body);
    return this.memoryService.createCandidate(input);
  }

  @Post("merge")
  async merge(@Body() body: unknown) {
    const input = mergeMemorySchema.parse(body);
    return this.memoryService.merge(input);
  }

  @Post(":id/promote")
  async promote(@Param("id") id: string, @Body() body: unknown) {
    const input = promoteMemorySchema.parse(body ?? {});
    return this.memoryService.promote(id, input);
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: unknown) {
    const input = updateMemorySchema.parse(body);
    return this.memoryService.update(id, input);
  }

  @Delete(":id")
  async tombstone(@Param("id") id: string) {
    return this.memoryService.tombstone(id);
  }
}
