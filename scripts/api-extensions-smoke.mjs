import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = Number(process.env.SMOKE_API_PORT ?? 4700 + Math.floor(Math.random() * 1000));
const base = process.env.SMOKE_API_BASE ?? `http://127.0.0.1:${port}/api`;
const dataDir = await mkdtemp(join(tmpdir(), "sp-agent-extension-smoke-"));
let apiProcess;

try {
  if (!process.env.SMOKE_API_BASE) {
    apiProcess = spawn(process.execPath, ["apps/api/dist/apps/api/src/main.js"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        SP_AGENT_DATA_DIR: dataDir,
        SILICONFLOW_API_KEY: "",
        PI_API_KEY: ""
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    await waitForApi();
  }

  const registry = await getJson(`${base}/extensions`);
  const context = registry.extensions.find((extension) => extension.id === "local.context");
  assert(context?.status === "active", "expected active local.context extension");
  assert(context.capabilities.some((capability) => capability.id === "context.snapshot"), "expected context.snapshot capability");

  const invoked = await postJson(`${base}/extensions/local.context/invoke`, {
    capabilityId: "context.snapshot",
    input: {}
  });
  assert(invoked.status === "completed", "expected context.snapshot invocation to complete");
  assert(invoked.permissionAudit?.mode === "read_only", "expected context.snapshot to be read-only");
  assert(invoked.result?.extensionIds?.includes("local.context"), "expected context snapshot to include local.context");
  assert(typeof invoked.result?.now === "string", "expected context snapshot timestamp");

  console.log(
    JSON.stringify(
      {
        ok: true,
        extensionIds: registry.extensions.map((extension) => extension.id),
        contextSnapshot: invoked.result
      },
      null,
      2
    )
  );
} finally {
  if (apiProcess) apiProcess.kill("SIGTERM");
  await rm(dataDir, { recursive: true, force: true });
}

async function waitForApi() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const health = await getJson(`${base}/health`);
      if (health.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`API did not start at ${base}`);
}

async function getJson(url) {
  const response = await fetch(url);
  return readJson(response, url);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return readJson(response, url);
}

async function readJson(response, url) {
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  assert(response.ok, `${url} failed with ${response.status}: ${text}`);
  return json;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
