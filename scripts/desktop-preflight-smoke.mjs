import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const source = await readFile("apps/desktop/src/main.ts", "utf8");
const built = existsSync("apps/desktop/dist/main.js") ? await readFile("apps/desktop/dist/main.js", "utf8") : "";
const webHtml = existsSync("apps/web/dist/index.html") ? await readFile("apps/web/dist/index.html", "utf8") : "";

assert(existsSync("apps/api/dist/apps/api/src/main.js"), "built API entry is missing");
assert(existsSync("apps/web/dist/index.html"), "built web index is missing");
assert(existsSync("apps/desktop/dist/main.js"), "built desktop main is missing");

assert(source.includes("const rendererUrl = process.env.RENDERER_URL"), "desktop must only use explicit RENDERER_URL for dev server opt-in");
assert(!source.includes("127.0.0.1:5173"), "desktop must not hard-code stale Vite dev server fallback");
assert(!source.includes("ELECTRON_RUN_AS_NODE"), "desktop API child process must not use Electron Node mode");
assert(source.includes("process.env.NODE_BINARY") && source.includes("process.env.npm_node_execpath"), "desktop should prefer a real Node executable for the API child");
assert(source.includes("win.loadFile(resolve(repoRoot, \"apps/web/dist/index.html\"))"), "desktop should load the built renderer by default");

assert(built.includes("process.env.RENDERER_URL"), "built desktop main should preserve explicit RENDERER_URL opt-in");
assert(!built.includes("127.0.0.1:5173"), "built desktop main should not include stale Vite dev server fallback");
assert(!built.includes("ELECTRON_RUN_AS_NODE"), "built desktop main should not include Electron Node mode");

assert(webHtml.includes('<div id="root"></div>'), "built web should include React root");
assert(webHtml.includes("./assets/"), "built web should use relative assets for file:// Electron loading");

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: [
        "built API entry exists",
        "built web entry exists",
        "built desktop entry exists",
        "desktop defaults to built renderer",
        "desktop dev server requires explicit RENDERER_URL",
        "desktop API child uses real Node"
      ]
    },
    null,
    2
  )
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
