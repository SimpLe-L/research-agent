import "reflect-metadata";
import "./env.js";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./modules/app.module.js";

const port = Number(process.env.PORT ?? 4317);
const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: true });
app.useBodyParser("json", { limit: process.env.API_JSON_BODY_LIMIT ?? "25mb" });
app.useBodyParser("urlencoded", { limit: process.env.API_JSON_BODY_LIMIT ?? "25mb", extended: true });
app.setGlobalPrefix("api");
await app.listen(port);

console.log(`sp-agent API listening on http://localhost:${port}/api`);
