import { Inject, Injectable } from "@nestjs/common";
import type { CreateWatchlistItemInput, UpdateWatchlistItemInput, WatchlistItem } from "@sp-agent/shared";
import { DatabaseService } from "./database.service.js";

@Injectable()
export class WatchlistService {
  private readonly fallbackItems = new Map<string, WatchlistItem>();

  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  async create(input: CreateWatchlistItemInput) {
    const repository = this.databaseService.getResearchRepository();
    if (repository) return repository.createWatchlistItem(input);

    const item: WatchlistItem = {
      id: `watch_${crypto.randomUUID()}`,
      tokenId: `token_${crypto.randomUUID()}`,
      input: input.input,
      note: input.note,
      riskLevel: input.riskLevel,
      monitorRules: input.monitorRules,
      createdAt: new Date().toISOString()
    };
    this.fallbackItems.set(item.id, item);
    return item;
  }

  async list() {
    const repository = this.databaseService.getResearchRepository();
    if (repository) return repository.listWatchlistItems();
    return Array.from(this.fallbackItems.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async update(id: string, input: UpdateWatchlistItemInput) {
    const repository = this.databaseService.getResearchRepository();
    if (repository) return repository.updateWatchlistItem(id, input);

    const current = this.fallbackItems.get(id);
    if (!current) return undefined;
    const next: WatchlistItem = {
      ...current,
      note: input.note ?? current.note,
      riskLevel: input.riskLevel ?? current.riskLevel,
      monitorRules: {
        ...current.monitorRules,
        ...(input.monitorRules ?? {})
      }
    };
    this.fallbackItems.set(id, next);
    return next;
  }

  async delete(id: string) {
    const repository = this.databaseService.getResearchRepository();
    if (repository) return repository.deleteWatchlistItem(id);
    return this.fallbackItems.delete(id);
  }
}
