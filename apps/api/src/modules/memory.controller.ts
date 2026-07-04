import { Body, Controller, Delete, Get, Inject, Param, Post, Query } from "@nestjs/common";
import { createMemoryCandidateSchema, searchMemorySchema } from "@sp-agent/shared";
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

  @Post("candidates")
  async createCandidate(@Body() body: unknown) {
    const input = createMemoryCandidateSchema.parse(body);
    return this.memoryService.createCandidate(input);
  }

  @Delete(":id")
  async tombstone(@Param("id") id: string) {
    return this.memoryService.tombstone(id);
  }
}
