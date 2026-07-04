import { Injectable } from "@nestjs/common";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

@Injectable()
export class LocalJsonStore {
  private readonly dataDir = resolve(process.env.SP_AGENT_DATA_DIR ?? ".sp-agent-data");

  async read<T>(name: string, fallback: T): Promise<T> {
    try {
      const raw = await readFile(this.pathFor(name), "utf8");
      return JSON.parse(raw) as T;
    } catch (error) {
      if (isMissingFile(error)) return fallback;
      throw error;
    }
  }

  async write<T>(name: string, value: T): Promise<void> {
    const file = this.pathFor(name);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }

  pathFor(name: string): string {
    return resolve(this.dataDir, name);
  }
}

function isMissingFile(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
