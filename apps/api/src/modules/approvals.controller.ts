import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import { createApprovalRequestSchema, decideApprovalRequestSchema } from "@sp-agent/shared";
import type { ApprovalRequest } from "@sp-agent/shared";
import { ApprovalsService } from "./approvals.service.js";

@Controller("approvals")
export class ApprovalsController {
  constructor(@Inject(ApprovalsService) private readonly approvalsService: ApprovalsService) {}

  @Get()
  async list(@Query("status") status?: ApprovalRequest["status"]) {
    return {
      approvals: await this.approvalsService.list(status)
    };
  }

  @Post()
  async create(@Body() body: unknown) {
    const input = createApprovalRequestSchema.parse(body);
    return this.approvalsService.create(input);
  }

  @Patch(":id")
  async decide(@Param("id") id: string, @Body() body: unknown) {
    const input = decideApprovalRequestSchema.parse(body);
    return this.approvalsService.decide(id, input);
  }
}
