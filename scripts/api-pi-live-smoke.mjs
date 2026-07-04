import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

await import("../apps/api/dist/apps/api/src/env.js").catch(() => undefined);

const port = Number(process.env.SMOKE_API_PORT ?? 5600 + Math.floor(Math.random() * 1000));
const base = process.env.SMOKE_API_BASE ?? `http://127.0.0.1:${port}/api`;
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 45000);
const dataDir = await mkdtemp(join(tmpdir(), "sp-agent-api-pi-live-"));
let apiProcess;

async function main() {
  assert(Boolean(process.env.SILICONFLOW_API_KEY || process.env.PI_API_KEY), "Live API smoke requires SILICONFLOW_API_KEY or PI_API_KEY in .env.");

  if (!process.env.SMOKE_API_BASE) {
    apiProcess = spawn(process.execPath, ["apps/api/dist/apps/api/src/main.js"], {
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
    apiProcess.stdout.on("data", (chunk) => process.stdout.write(`[api] ${chunk}`));
    apiProcess.stderr.on("data", (chunk) => process.stderr.write(`[api] ${chunk}`));
  }

  await waitForHealth();

  const providers = await getJson(`${base}/providers/status`);
  const runtime = providers.providers?.find((provider) => provider.name === "agent-runtime");
  assert(runtime?.configured === true, `expected configured agent-runtime, got ${JSON.stringify(runtime)}`);
  assert(runtime?.reachable === true, `expected reachable agent-runtime, got ${runtime?.degradedReason ?? "unknown"}`);

  const session = await postJson(`${base}/chat/sessions`, { title: "Live Pi API smoke" });
  const turn = await postJson(`${base}/agent/messages`, {
    sessionId: session.id,
    content: "用一句中文说明你是谁。"
  });

  assert(turn.role === "assistant", "expected assistant response");
  assert(turn.provider === "pi", `expected pi provider, got ${turn.provider}`);
  assert(!turn.degradedReason, `expected live API turn without degradedReason, got ${turn.degradedReason}`);
  assert(typeof turn.content === "string" && turn.content.trim().length > 0, "expected live API assistant content");

  const savedSession = await getJson(`${base}/chat/sessions/${session.id}`);
  assert(savedSession.messages?.length === 2, "expected live turn to persist user and assistant messages");

  console.log(
    JSON.stringify(
      {
        ok: true,
        base,
        model: turn.model,
        contentPreview: turn.content.slice(0, 120),
        activeTools: turn.activeTools ?? []
      },
      null,
      2
    )
  );
}

async function waitForHealth() {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const health = await getJson(`${base}/health`);
      if (health.ok) return;
    } catch {
      await sleep(250);
    }
  }
  throw new Error(`Timed out waiting for ${base}/health`);
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
  const data = text ? JSON.parse(text) : {};
  assert(response.ok, `${url} returned HTTP ${response.status}: ${text}`);
  return data;
}

async function stopApi() {
  if (!apiProcess || apiProcess.exitCode !== null || apiProcess.signalCode) return;
  apiProcess.kill("SIGINT");
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      apiProcess.kill("SIGKILL");
      reject(new Error("Timed out stopping API process"));
    }, 5000);
    apiProcess.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

process.on("exit", () => {
  if (apiProcess && apiProcess.exitCode === null && !apiProcess.signalCode) {
    apiProcess.kill("SIGKILL");
  }
});

main()
  .catch(async (error) => {
    await stopApi().catch(() => undefined);
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await stopApi().catch(() => undefined);
    await rm(dataDir, { recursive: true, force: true }).catch(() => undefined);
  });
