import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller.js";
import { ProvidersController } from "./providers.controller.js";
import { ResearchQueueController } from "./research-queue.controller.js";
import { SettingsController } from "./settings.controller.js";
import { KnowledgeService } from "./knowledge.service.js";
import { MarketService } from "./market.service.js";
import { WatchlistController } from "./watchlist.controller.js";
import { WatchlistService } from "./watchlist.service.js";
import { ChatController } from "./chat.controller.js";
import { ChatService } from "./chat.service.js";
import { AgentShellController } from "./agent-shell.controller.js";
import { AgentShellService } from "./agent-shell.service.js";
import { ExtensionsController } from "./extensions.controller.js";
import { ExtensionsService } from "./extensions.service.js";
import { ResearchTaskQueueService } from "./research-task-queue.service.js";
import { ResearchService } from "./research.service.js";
import { SettingsService } from "./settings.service.js";
import { DatabaseService } from "./database.service.js";

@Module({
  controllers: [
    HealthController,
    ProvidersController,
    ResearchQueueController,
    SettingsController,
    WatchlistController,
    ChatController,
    AgentShellController,
    ExtensionsController
  ],
  providers: [
    DatabaseService,
    ResearchTaskQueueService,
    ResearchService,
    SettingsService,
    KnowledgeService,
    MarketService,
    WatchlistService,
    ChatService,
    AgentShellService,
    ExtensionsService
  ]
})
export class AppModule {}
