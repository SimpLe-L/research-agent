import { Module } from "@nestjs/common";
import { AgentShellController } from "./agent-shell.controller.js";
import { AgentShellService } from "./agent-shell.service.js";
import { ApprovalsController } from "./approvals.controller.js";
import { ApprovalsService } from "./approvals.service.js";
import { ChatController } from "./chat.controller.js";
import { ChatService } from "./chat.service.js";
import { ExtensionsController } from "./extensions.controller.js";
import { ExtensionsService } from "./extensions.service.js";
import { HealthController } from "./health.controller.js";
import { LocalJsonStore } from "./local-json-store.service.js";
import { MemoryController } from "./memory.controller.js";
import { MemoryService } from "./memory.service.js";
import { ProvidersController } from "./providers.controller.js";
import { SettingsController } from "./settings.controller.js";
import { SettingsService } from "./settings.service.js";
import { VoiceAuditService } from "./voice-audit.service.js";
import { VoiceController } from "./voice.controller.js";
import { VoiceService } from "./voice.service.js";
import { WorkflowsController } from "./workflows.controller.js";
import { WorkflowsService } from "./workflows.service.js";

@Module({
  controllers: [
    HealthController,
    ProvidersController,
    SettingsController,
    ChatController,
    MemoryController,
    AgentShellController,
    ExtensionsController,
    ApprovalsController,
    WorkflowsController,
    VoiceController
  ],
  providers: [
    LocalJsonStore,
    SettingsService,
    ChatService,
    MemoryService,
    AgentShellService,
    ExtensionsService,
    ApprovalsService,
    WorkflowsService,
    VoiceAuditService,
    VoiceService
  ]
})
export class AppModule {}
