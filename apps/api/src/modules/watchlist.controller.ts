import { Body, Controller, Delete, Get, Inject, NotFoundException, Param, Patch, Post } from "@nestjs/common";
import { createWatchlistItemSchema, updateWatchlistItemSchema } from "@sp-agent/shared";
import { WatchlistService } from "./watchlist.service.js";

@Controller("watchlist")
export class WatchlistController {
  constructor(@Inject(WatchlistService) private readonly watchlistService: WatchlistService) {}

  @Post("items")
  async create(@Body() body: unknown) {
    const input = createWatchlistItemSchema.parse(body);
    return this.watchlistService.create(input);
  }

  @Get("items")
  async list() {
    return {
      items: await this.watchlistService.list()
    };
  }

  @Patch("items/:id")
  async update(@Param("id") id: string, @Body() body: unknown) {
    const input = updateWatchlistItemSchema.parse(body);
    const item = await this.watchlistService.update(id, input);
    if (!item) throw new NotFoundException(`Watchlist item ${id} not found`);
    return item;
  }

  @Delete("items/:id")
  async delete(@Param("id") id: string) {
    const deleted = await this.watchlistService.delete(id);
    if (!deleted) throw new NotFoundException(`Watchlist item ${id} not found`);
    return { deleted: true };
  }
}
