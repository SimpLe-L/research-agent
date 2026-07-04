import "reflect-metadata";
import "./env.js";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./modules/app.module.js";

process.env.RESEARCH_TASK_EXECUTOR_MODE ??= "worker";

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ["log", "warn", "error"]
});

console.log("sp-agent research worker running. Press Ctrl+C to stop.");

async function shutdown(signal: NodeJS.Signals) {
  console.log(`sp-agent research worker received ${signal}, shutting down.`);
  await app.close();
  process.exit(0);
}

process.on("SIGINT", (signal) => {
  void shutdown(signal);
});

process.on("SIGTERM", (signal) => {
  void shutdown(signal);
});
