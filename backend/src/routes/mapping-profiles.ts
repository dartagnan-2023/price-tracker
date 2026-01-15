import { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import type { MappingProfile } from "@prisma/client";

export async function mappingProfilesRoutes(app: FastifyInstance) {
  app.get("/mapping-profiles", async () => {
    const profiles = await prisma.mappingProfile.findMany({
      orderBy: { createdAt: "desc" }
    });

    return profiles.map((profile: MappingProfile) => ({
      id: profile.id,
      name: profile.name,
      mappingJson: profile.mappingJson
    }));
  });

  app.post("/mapping-profiles", async (request, reply) => {
    const body = request.body as {
      name?: string;
      mapping?: Record<string, string>;
    };

    if (!body.name || !body.mapping) {
      reply.code(400);
      return { error: "Dados invalidos" };
    }

    const profile = await prisma.mappingProfile.create({
      data: {
        name: body.name,
        mappingJson: JSON.stringify(body.mapping),
        autoDetected: false
      }
    });

    return { id: profile.id, message: "Perfil criado" };
  });
}
