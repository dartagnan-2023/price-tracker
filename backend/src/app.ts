import fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyReply } from "fastify";
import { monthsRoutes } from "./routes/months.js";
import { batchesRoutes } from "./routes/batches.js";
import { compareRoutes } from "./routes/compare.js";
import { ingestRoutes } from "./routes/ingest.js";
import { linesRoutes } from "./routes/lines.js";
import { mappingProfilesRoutes } from "./routes/mapping-profiles.js";

export function buildApp() {
  const app = fastify({ logger: true });

  app.register(cors, { origin: true });
  app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024
    }
  });

  app.register(monthsRoutes, { prefix: "/api" });
  app.register(batchesRoutes, { prefix: "/api" });
  app.register(compareRoutes, { prefix: "/api" });
  app.register(ingestRoutes, { prefix: "/api" });
  app.register(linesRoutes, { prefix: "/api" });
  app.register(mappingProfilesRoutes, { prefix: "/api" });

  const frontendDist = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../frontend/dist");
  const serveFrontend = process.env.NODE_ENV !== "development";
  if (serveFrontend) {
    app.register(fastifyStatic, {
      root: frontendDist,
      wildcard: true
    });

    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith("/api") || request.raw.url?.startsWith("/ingest")) {
        reply.callNotFound();
        return;
      }
      (reply as FastifyReply & { sendFile: (filename: string) => FastifyReply }).sendFile("index.html");
    });
  }

  return app;
}
