import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { checkDatabaseReachable, createDatabaseClient, LanceDbVectorStore, migrateDatabase, ResearchRepository } from "@sp-agent/database";

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly client = createDatabaseClient();
  private readonly vectorStore = new LanceDbVectorStore();
  private repository: ResearchRepository | undefined;
  private reachable = false;
  private degradedReason: string | undefined;

  async onModuleInit() {
    const status = await checkDatabaseReachable(this.client);
    if (!status.reachable) {
      this.reachable = false;
      this.degradedReason = status.degradedReason;
      return;
    }

    try {
      await migrateDatabase(this.client);
      this.repository = new ResearchRepository(this.client);
      this.reachable = true;
      this.degradedReason = undefined;
    } catch (error) {
      this.repository = undefined;
      this.reachable = false;
      this.degradedReason = error instanceof Error ? error.message : "Database migration failed.";
    }
  }

  async onModuleDestroy() {
    await this.client.pool.end();
  }

  getResearchRepository() {
    return this.repository;
  }

  getStatus() {
    return {
      name: "postgres",
      configured: Boolean(process.env.DATABASE_URL) || true,
      reachable: this.reachable,
      degradedReason: this.degradedReason
    };
  }

  getVectorStore() {
    return this.vectorStore;
  }
}
