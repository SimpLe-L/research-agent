import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

const port = Number(process.env.SMOKE_WEB_PORT ?? 5175);
const host = process.env.SMOKE_WEB_HOST ?? "127.0.0.1";
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 45000);
const pollIntervalMs = Number(process.env.SMOKE_POLL_INTERVAL_MS ?? 300);
const routes = ["/", "/chat", "/research", "/market", "/knowledge", "/watchlist", "/reports", "/settings"];
const requiredBundleMarkers = [
  "data-testid",
  "view-research",
  "view-settings",
  "queue-status-panel",
  "readiness-panel",
  "copy-report-markdown",
  "reindex-report-vector",
  "delete-report-vector",
  "report-annotation-panel",
  "save-report-annotation",
  "retention-panel",
  "retention-preview",
  "retention-dry-run"
];

let previewProcess;

async function main() {
  assert(existsSync("apps/web/dist/index.html"), "apps/web/dist/index.html is missing. Run pnpm --filter @sp-agent/web build first.");
  previewProcess = spawn("pnpm", ["--filter", "@sp-agent/web", "exec", "vite", "preview", "--host", host, "--port", String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  previewProcess.stdout.on("data", (chunk) => process.stdout.write(`[web-preview] ${chunk}`));
  previewProcess.stderr.on("data", (chunk) => process.stderr.write(`[web-preview] ${chunk}`));

  const base = `http://${host}:${port}`;
  await waitForRoute(`${base}/`);

  const htmlByRoute = new Map();
  for (const route of routes) {
    const html = await readText(`${base}${route}`);
    assert(html.includes('<div id="root"></div>'), `${route} did not return the React root HTML`);
    assert(html.includes("assets/index-"), `${route} did not include built asset references`);
    htmlByRoute.set(route, html);
  }

  const rootHtml = htmlByRoute.get("/") ?? "";
  const assetPaths = [...rootHtml.matchAll(/(?:src|href)="\.\/(assets\/[^"]+)"/g)].map((match) => match[1]);
  assert(assetPaths.some((asset) => asset.endsWith(".js")), "built HTML did not reference a JS asset");
  assert(assetPaths.some((asset) => asset.endsWith(".css")), "built HTML did not reference a CSS asset");

  const bundleTexts = await Promise.all(
    assetPaths
      .filter((asset) => asset.endsWith(".js"))
      .map((asset) => readText(`${base}/${asset}`))
  );
  const combinedBundle = bundleTexts.join("\n");
  for (const marker of requiredBundleMarkers) {
    assert(combinedBundle.includes(marker), `built JS bundle is missing marker ${marker}`);
  }

  const cssAssets = assetPaths.filter((asset) => asset.endsWith(".css"));
  for (const asset of cssAssets) {
    const css = await readText(`${base}/${asset}`);
    assert(css.includes(".shell"), `${asset} did not include shell styles`);
  }

  await stopPreview();
  console.log(
    JSON.stringify(
      {
        ok: true,
        base,
        routes,
        assetCount: assetPaths.length
      },
      null,
      2
    )
  );
}

async function waitForRoute(url) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // keep polling while Vite preview starts
    }
    await sleep(pollIntervalMs);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function readText(url) {
  const response = await fetch(url);
  assert(response.ok, `${url} returned HTTP ${response.status}`);
  return response.text();
}

async function stopPreview() {
  if (!previewProcess || previewProcess.exitCode !== null || previewProcess.signalCode) return;
  previewProcess.kill("SIGINT");
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      previewProcess.kill("SIGKILL");
      reject(new Error("Timed out stopping web preview process"));
    }, 5000);
    previewProcess.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

process.on("exit", () => {
  if (previewProcess && previewProcess.exitCode === null && !previewProcess.signalCode) {
    previewProcess.kill("SIGKILL");
  }
});

main().catch(async (error) => {
  await stopPreview().catch(() => undefined);
  console.error(error);
  process.exit(1);
});
