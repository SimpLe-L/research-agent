import { Controller, Get, Inject } from "@nestjs/common";
import { DatabaseService } from "./database.service.js";
import { ResearchTaskQueueService } from "./research-task-queue.service.js";

@Controller("research/queue")
export class ResearchQueueController {
  constructor(
    @Inject(ResearchTaskQueueService) private readonly queueService: ResearchTaskQueueService,
    @Inject(DatabaseService) private readonly databaseService: DatabaseService
  ) {}

  @Get()
  async status() {
    const status = this.queueService.status();
    const repository = this.databaseService.getResearchRepository();
    if (!repository) {
      return {
        ...status,
        databaseReachable: false,
        persistedPending: 0,
        persistedRunning: 0,
        persistedPendingTaskIds: [],
        persistedRunningTaskIds: []
      };
    }

    const activeTasks = await repository.listActiveQueueTasks();
    return {
      ...status,
      databaseReachable: true,
      persistedPending: activeTasks.pending.length,
      persistedRunning: activeTasks.running.length,
      persistedPendingTaskIds: activeTasks.pending.map((task) => task.id),
      persistedRunningTaskIds: activeTasks.running.map((task) => task.id)
    };
  }
}
