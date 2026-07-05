import { Body, Controller, Get, Inject, Param, Post } from "@nestjs/common";
import { projectDocSearchSchema } from "@sp-agent/shared";
import { WorkflowsService } from "./workflows.service.js";

@Controller("workflows")
export class WorkflowsController {
  constructor(@Inject(WorkflowsService) private readonly workflowsService: WorkflowsService) {}

  @Get()
  async list() {
    return {
      workflows: await this.workflowsService.list()
    };
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    return {
      workflow: await this.workflowsService.get(id)
    };
  }

  @Post("local-project/search-docs")
  async searchProjectDocs(@Body() body: unknown) {
    const input = projectDocSearchSchema.parse(body);
    return this.workflowsService.runProjectDocSearch(input);
  }

  @Post("local-project/search-docs/async")
  async startProjectDocSearch(@Body() body: unknown) {
    const input = projectDocSearchSchema.parse(body);
    return this.workflowsService.startProjectDocSearch(input);
  }

  @Post(":id/cancel")
  async cancel(@Param("id") id: string) {
    return this.workflowsService.cancel(id);
  }

  @Post(":id/retry")
  async retry(@Param("id") id: string) {
    return this.workflowsService.retry(id);
  }
}
