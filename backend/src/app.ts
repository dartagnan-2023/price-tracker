import fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { fastifyStatic } from "@fastify/static";
import { fastifyJwt } from "@fastify/jwt";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyReply, FastifyRequest } from "fastify";
import { monthsRoutes } from "./routes/months.js";
import { batchesRoutes } from "./routes/batches.js";
import { compareRoutes } from "./routes/compare.js";
import { ingestRoutes } from "./routes/ingest.js";
import { linesRoutes } from "./routes/lines.js";
import { mappingProfilesRoutes } from "./routes/mapping-profiles.js";
import { AUTH_ALLOW_UNAUTH, AUTH_PASSWORD, AUTH_SECRET, AUTH_USER } from "./config.js";

export function buildApp() {
  const app = fastify({ logger: true });

  app.register(cors, { origin: true });
  app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024
    }
  });

  app.register(fastifyJwt, { secret: AUTH_SECRET });

  app.post("/api/auth", {
    schema: {
      body: {
        type: "object",
        properties: {
          username: { type: "string" },
          password: { type: "string" }
        },
        required: ["username", "password"]
      }
    }
  }, async (request, reply) => {
    const body = request.body as { username?: string; password?: string };
    if (body.username !== AUTH_USER || body.password !== AUTH_PASSWORD) {
      reply.code(401);
      return { error: "Credenciais invalidas" };
    }
    const token = await (reply as unknown as { jwtSign: (payload: unknown) => Promise<string> }).jwtSign({
      username: body.username
    });
    return { token };
  });

  app.addHook("onRequest", async (request, reply) => {
    if (AUTH_ALLOW_UNAUTH) {
      return;
    }
    const url = request.raw.url ?? "";
    const pathName = url.split("?")[0];
    if (pathName === "/api/auth") {
      return;
    }
    if (pathName.startsWith("/api") || pathName.startsWith("/ingest")) {
      try {
        await (request as FastifyRequest & { jwtVerify: () => Promise<void> }).jwtVerify();
      } catch {
        reply.code(401).send({ error: "Unauthorized" });
      }
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
