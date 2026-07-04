import "reflect-metadata";
import "./env.js";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./modules/app.module.js";

const port = Number(process.env.PORT ?? 4317);
const app = await NestFactory.create(AppModule, { cors: true });
app.setGlobalPrefix("api");
await app.listen(port);

console.log(`sp-agent API listening on http://localhost:${port}/api`);
