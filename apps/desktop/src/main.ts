import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import { app, BrowserWindow } from "electron";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const apiPort = Number(process.env.PORT ?? 4317);
const apiBaseUrl = process.env.API_BASE_URL ?? `http://localhost:${apiPort}/api`;
const rendererUrl = process.env.RENDERER_URL ?? (app.isPackaged ? undefined : "http://127.0.0.1:5173");
let apiProcess: ChildProcess | undefined;

function apiEntryPoint(): string | undefined {
  const candidates = [
    resolve(repoRoot, "apps/api/dist/main.js"),
    resolve(repoRoot, "apps/api/dist/apps/api/src/main.js")
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

async function sleep(ms: number) {
  await new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function isApiReachable(): Promise<boolean> {
  try {
    const response = await fetch(`${apiBaseUrl}/health`, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function isRendererReachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1200) });
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureApiProcess(): Promise<void> {
  if (await isApiReachable()) return;

  const apiMain = apiEntryPoint();
  if (!apiMain) {
    throw new Error("API build output was not found. Run `pnpm --filter @sp-agent/api build` before launching desktop.");
  }

  apiProcess = spawn(process.execPath, [apiMain], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(apiPort)
    },
    stdio: "inherit"
  });

  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await isApiReachable()) return;
    if (apiProcess.exitCode !== null) {
      throw new Error(`API process exited before becoming ready with code ${apiProcess.exitCode}.`);
    }
    await sleep(500);
  }

  throw new Error(`API did not become reachable at ${apiBaseUrl}/health.`);
}

async function createWindow() {
  await ensureApiProcess();

  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    title: "SP Agent",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (rendererUrl && (await isRendererReachable(rendererUrl))) {
    await win.loadURL(rendererUrl);
    return;
  }

  await win.loadFile(resolve(repoRoot, "apps/web/dist/index.html"));
}

function shutdownApiProcess() {
  if (!apiProcess || apiProcess.killed) return;
  apiProcess.kill("SIGTERM");
  apiProcess = undefined;
}

app.whenReady().then(() => {
  void createWindow();
});

app.on("before-quit", shutdownApiProcess);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
