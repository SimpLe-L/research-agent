import { Inject, Injectable } from "@nestjs/common";
import type { MarketSnapshot } from "@sp-agent/shared";
import { getMajorAssetMarketData } from "@sp-agent/data-connectors";
import { analyzeMarketSnapshot } from "@sp-agent/research-core";
import { DatabaseService } from "./database.service.js";

@Injectable()
export class MarketService {
  private readonly fallbackSnapshots = new Map<string, MarketSnapshot>();

  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  async analyze() {
    const market = await getMajorAssetMarketData(["bitcoin", "ethereum"], process.env);
    const snapshot = analyzeMarketSnapshot(market.assets, market.degradedReason ? [market.degradedReason] : []);
    const repository = this.databaseService.getResearchRepository();
    if (repository) {
      await repository.saveMarketSnapshot(snapshot);
    }
    this.fallbackSnapshots.set(snapshot.id, snapshot);
    return snapshot;
  }

  async listSnapshots() {
    const repository = this.databaseService.getResearchRepository();
    if (repository) return repository.listMarketSnapshots();
    return Array.from(this.fallbackSnapshots.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getLatestSnapshot() {
    const repository = this.databaseService.getResearchRepository();
    return (repository ? await repository.getLatestMarketSnapshot() : undefined) ?? this.listSnapshots().then((snapshots) => snapshots[0]);
  }
}

