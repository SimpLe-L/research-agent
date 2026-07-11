import { Controller, Delete, Get, Inject } from "@nestjs/common";
import { ResearchAccessService } from "./research-access.service.js";

@Controller("research/access")
export class ResearchAccessController {
  constructor(@Inject(ResearchAccessService) private readonly researchAccessService: ResearchAccessService) {}

  @Get()
  get() {
    return this.researchAccessService.get();
  }

  @Delete()
  disable() {
    return this.researchAccessService.disable();
  }
}
