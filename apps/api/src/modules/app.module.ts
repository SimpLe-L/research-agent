import { Module } from "@nestjs/common";
import { AgentShellController } from "./agent-shell.controller.js";
import { AgentShellService } from "./agent-shell.service.js";
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

@Module({
  controllers: [
    HealthController,
    ProvidersController,
    SettingsController,
    ChatController,
    MemoryController,
    AgentShellController,
    ExtensionsController
  ],
  providers: [LocalJsonStore, SettingsService, ChatService, MemoryService, AgentShellService, ExtensionsService]
})
export class AppModule {}
