import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

await import("../apps/api/dist/apps/api/src/env.js").catch(() => undefined);

const apiEntry = ["apps/api/dist/main.js", "apps/api/dist/apps/api/src/main.js"].find((candidate) => existsSync(candidate));
assert(apiEntry, "built API entry is missing");

const port = Number(process.env.SMOKE_DESKTOP_API_PORT ?? 5800 + Math.floor(Math.random() * 1000));
const base = `http://127.0.0.1:${port}/api`;
const dataDir = await mkdtemp(join(tmpdir(), "sp-agent-desktop-api-child-"));
const nodeBinary = process.env.NODE_BINARY || process.env.npm_node_execpath || "node";
let apiProcess;

try {
  apiProcess = spawn(nodeBinary, [apiEntry], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      SP_AGENT_DATA_DIR: dataDir,
      AGENT_RUNTIME_PROVIDER: "pi",
      PI_AGENT_RUNTIME_TIMEOUT_MS: process.env.PI_LIVE_SMOKE_TIMEOUT_MS ?? "120000"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  apiProcess.stdout.on("data", (chunk) => process.stdout.write(`[desktop-api] ${chunk}`));
  apiProcess.stderr.on("data", (chunk) => process.stderr.write(`[desktop-api] ${chunk}`));

  await waitForHealth();
  const status = await getJson(`${base}/agent/status`);
  assert(status.mode === "local_personal_agent", "expected local personal agent mode");
  assert(status.piRuntime?.configured === true, "expected Pi runtime configured from .env");
  assert(status.piRuntime?.sdkLoaded === true, `expected Pi SDK loaded, got ${status.piRuntime?.degradedReason ?? "unknown"}`);
  assert(status.extensions?.some((extension) => extension.id === "local.context"), "expected local.context in desktop API child registry");

  console.log(
    JSON.stringify(
      {
        ok: true,
        nodeBinary,
        apiEntry,
        base,
        piRuntime: status.piRuntime,
        extensionIds: status.extensions.map((extension) => extension.id)
      },
      null,
      2
    )
  );
} finally {
  if (apiProcess) apiProcess.kill("SIGTERM");
  await rm(dataDir, { recursive: true, force: true });
}

async function waitForHealth() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const health = await getJson(`${base}/health`);
      if (health.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`API child did not start at ${base}`);
}

async function getJson(url) {
  const response = await fetch(url);
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  assert(response.ok, `${url} failed with ${response.status}: ${text}`);
  return data;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
