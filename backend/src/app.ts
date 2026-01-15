import fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
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

  return app;
}
