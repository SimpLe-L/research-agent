import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));
const candidates = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../.env"),
  resolve(process.cwd(), "../../.env"),
  resolve(here, "../../../.env"),
  resolve(here, "../../../../.env"),
  resolve(here, "../../../../../.env")
];

const loaded = new Set<string>();
for (const candidate of candidates) {
  if (!existsSync(candidate) || loaded.has(candidate)) continue;
  config({ path: candidate, override: false });
  loaded.add(candidate);
}
