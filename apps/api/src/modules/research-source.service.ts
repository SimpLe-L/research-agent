import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import {
  localBookmarkConnectorFileSchema,
  type ResearchFetchWebSourceInput,
  type ResearchImportSourceInput,
  type ResearchRequest,
  type ResearchSource,
  type ResearchWebSearchInput
} from "@sp-agent/shared";
import { LocalJsonStore } from "./local-json-store.service.js";

const PROJECT_DOCUMENT_ALLOWLIST = ["README.md", "AGENTS.md", "ARCHITECTURE.md", "PROCESS.md", "DEVELOPMENT_PLAN.md", "package.json"];

export type CollectedResearchSource = {
  source: ResearchSource;
  content: string;
};

export type ResearchSourceCollection = {
  sources: CollectedResearchSource[];
  degradedReasons: string[];
};

type TavilySearchResponse = {
  results?: Array<{
    title?: unknown;
    url?: unknown;
    content?: unknown;
    raw_content?: unknown;
    score?: unknown;
  }>;
};

@Injectable()
export class ResearchSourceService {
  constructor(private readonly store: LocalJsonStore) {}

  async collect(input: ResearchRequest, options: { includeStoredWeb?: boolean } = {}): Promise<ResearchSourceCollection> {
    const selected = new Set(input.sourceIds);
    const sources: CollectedResearchSource[] = [];
    const degradedReasons: string[] = [];

    if (input.sourceScopes.includes("local_documents")) {
      const documents = await this.readAllowlistedDocuments();
      sources.push(...filterSelected(documents, selected));
    }

    if (input.sourceScopes.includes("bookmarks")) {
      const bookmarks = await this.readBookmarks();
      if (bookmarks.length === 0) degradedReasons.push("No local bookmark records are configured.");
      sources.push(...filterSelected(bookmarks, selected));
    }

    if (input.sourceScopes.includes("user_provided")) {
      const imports = await this.readImportedSources("user_import");
      if (imports.length === 0) degradedReasons.push("No user-provided research sources are imported.");
      sources.push(...filterSelected(imports, selected));
    }

    if (input.sourceScopes.includes("web") && options.includeStoredWeb !== false) {
      const webSources = await this.readImportedSources("web");
      if (webSources.length === 0) degradedReasons.push("No approved web sources are imported.");
      sources.push(...filterSelected(webSources, selected));
    }

    const unique = new Map<string, CollectedResearchSource>();
    for (const item of sources) {
      if (!unique.has(item.source.contentHash)) unique.set(item.source.contentHash, item);
    }
    const collected = [...unique.values()].slice(0, input.maxSources);

    if (selected.size > 0) {
      const found = new Set(collected.map((item) => item.source.id));
      const unavailable = [...selected].filter((id) => !found.has(id));
      if (unavailable.length > 0) degradedReasons.push(`Requested source ids were unavailable or outside the allowed scope: ${unavailable.join(", ")}.`);
    }

    for (const item of collected) {
      if (item.source.degradedReason) degradedReasons.push(`${item.source.title}: ${item.source.degradedReason}`);
    }

    return { sources: collected, degradedReasons: uniqueStrings(degradedReasons) };
  }

  async importUserSource(input: ResearchImportSourceInput) {
    return this.saveImportedSource("user_import", input.title, input.content, input.locator ?? `user://import/${crypto.randomUUID()}`, { tags: input.tags, importedBy: "user" });
  }

  async fetchWebSource(input: ResearchFetchWebSourceInput) {
    const url = new URL(input.url);
    const allowedDomains = (process.env.RESEARCH_WEB_ALLOWLIST ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
    if (allowedDomains.length === 0 || !allowedDomains.includes(url.hostname.toLowerCase())) {
      throw new Error("Remote source host is not allowlisted. Set RESEARCH_WEB_ALLOWLIST to an explicit comma-separated host list.");
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { accept: "text/plain,text/html;q=0.9" } });
    if (!response.ok) throw new Error(`Remote source returned HTTP ${response.status}.`);
    const content = stripMarkup((await response.text()).slice(0, 200_000));
    if (!content) throw new Error("Remote source did not contain readable text.");
    return this.saveImportedSource("web", input.title ?? url.hostname, content, url.toString(), { host: url.hostname, fetchedAt: new Date().toISOString() });
  }

  async searchWeb(input: ResearchWebSearchInput): Promise<ResearchSourceCollection> {
    const apiKey = process.env.TAVILY_API_KEY?.trim();
    if (!apiKey) {
      return {
        sources: [],
        degradedReasons: ["Web search is unavailable because TAVILY_API_KEY is not configured."]
      };
    }

    const endpoint = process.env.TAVILY_SEARCH_URL?.trim() || "https://api.tavily.com/search";
    try {
      const url = new URL(endpoint);
      if (url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
        throw new Error("Web search endpoint must use HTTPS.");
      }
      const response = await fetch(url, {
        method: "POST",
        signal: AbortSignal.timeout(20_000),
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query: input.question,
          max_results: input.maxResults,
          search_depth: "basic",
          include_answer: false,
          include_raw_content: false
        })
      });
      if (!response.ok) throw new Error(`Tavily search returned HTTP ${response.status}.`);
      const payload = (await response.json()) as TavilySearchResponse;
      const sources = (payload.results ?? [])
        .flatMap((result, index) => {
          if (typeof result.url !== "string" || typeof result.title !== "string") return [];
          const content = [result.title, typeof result.content === "string" ? result.content : typeof result.raw_content === "string" ? result.raw_content : ""]
            .join(". ")
            .trim();
          if (!content) return [];
          return [
            makeCollectedSource({
              id: `web:tavily:${hash(result.url)}`,
              type: "web",
              title: result.title,
              locator: result.url,
              content,
              metadata: {
                provider: "tavily",
                rank: index + 1,
                providerScore: typeof result.score === "number" ? result.score : undefined,
                query: input.question
              }
            })
          ];
        })
        .slice(0, input.maxResults);
      return {
        sources,
        degradedReasons: sources.length === 0 ? ["The configured web search returned no readable source snippets."] : []
      };
    } catch (error) {
      return {
        sources: [],
        degradedReasons: [error instanceof Error ? `Web search failed: ${error.message}` : "Web search failed."]
      };
    }
  }

  private async readAllowlistedDocuments(): Promise<CollectedResearchSource[]> {
    const root = resolve(process.env.SP_AGENT_PROJECT_ROOT ?? process.cwd());
    return Promise.all(
      PROJECT_DOCUMENT_ALLOWLIST.map(async (file) => {
        const absolute = resolve(root, file);
        try {
          const content = await readFile(absolute, "utf8");
          return makeCollectedSource({
            id: `local_document:${basename(absolute)}`,
            type: "local_document",
            title: basename(absolute),
            locator: `local://project/${basename(absolute)}`,
            content,
            metadata: { allowlisted: true, relativePath: file }
          });
        } catch (error) {
          return makeCollectedSource({
            id: `local_document:${basename(absolute)}`,
            type: "local_document",
            title: basename(absolute),
            locator: `local://project/${basename(absolute)}`,
            content: "",
            degradedReason: error instanceof Error ? `Could not read allowlisted document: ${error.message}` : "Could not read allowlisted document.",
            metadata: { allowlisted: true, relativePath: file }
          });
        }
      })
    );
  }

  private async readBookmarks(): Promise<CollectedResearchSource[]> {
    const file = localBookmarkConnectorFileSchema.parse(await this.store.read("connectors/bookmarks.json", { bookmarks: [] }));
    return file.bookmarks.map((bookmark) =>
      makeCollectedSource({
        id: `bookmark:${bookmark.id}`,
        type: "bookmark",
        title: bookmark.title,
        locator: bookmark.url,
        content: [bookmark.title, bookmark.description ?? "", bookmark.tags.join(" "), bookmark.url].filter(Boolean).join("\n"),
        metadata: { bookmarkId: bookmark.id, source: bookmark.source, tags: bookmark.tags, createdAt: bookmark.createdAt }
      })
    );
  }

  private async readImportedSources(type: "user_import" | "web"): Promise<CollectedResearchSource[]> {
    const file = await this.store.read<{ sources: Array<{ id: string; type: "user_import" | "web"; title: string; content: string; locator: string; metadata?: Record<string, unknown>; createdAt: string }> }>("research/sources.json", { sources: [] });
    return file.sources.filter((source) => source.type === type).map((source) => makeCollectedSource({ id: `${type}:${source.id}`, type, title: source.title, locator: source.locator, content: source.content, metadata: { ...source.metadata, importedAt: source.createdAt } }));
  }

  private async saveImportedSource(type: "user_import" | "web", title: string, content: string, locator: string, metadata: Record<string, unknown>) {
    const file = await this.store.read<{ sources: Array<{ id: string; type: "user_import" | "web"; title: string; content: string; locator: string; metadata?: Record<string, unknown>; createdAt: string }> }>("research/sources.json", { sources: [] });
    const record = { id: `source_${crypto.randomUUID()}`, type, title: title.trim(), content: content.trim(), locator, metadata, createdAt: new Date().toISOString() };
    file.sources.push(record);
    await this.store.write("research/sources.json", file);
    return makeCollectedSource({ id: `${type}:${record.id}`, type, title: record.title, locator: record.locator, content: record.content, metadata: { ...metadata, importedAt: record.createdAt } }).source;
  }
}

function filterSelected(sources: CollectedResearchSource[], selected: Set<string>) {
  if (selected.size === 0) return sources;
  return sources.filter((item) => selected.has(item.source.id));
}

function makeCollectedSource(input: {
  id: string;
  type: ResearchSource["type"];
  title: string;
  locator: string;
  content: string;
  degradedReason?: string;
  metadata: Record<string, unknown>;
}): CollectedResearchSource {
  const content = input.content.replace(/\s+/g, " ").trim();
  const source: ResearchSource = {
    id: input.id,
    type: input.type,
    title: input.title,
    locator: input.locator,
    retrievedAt: new Date().toISOString(),
    contentHash: hash(content || `${input.id}:${input.degradedReason ?? "unavailable"}`),
    contentPreview: content ? truncate(content, 320) : undefined,
    degradedReason: input.degradedReason,
    metadata: input.metadata
  };
  return { source, content };
}

function hash(value: string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function truncate(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function stripMarkup(value: string) {
  return value.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/giu, " ").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
}
