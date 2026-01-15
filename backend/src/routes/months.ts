import { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import type { ImportBatch, Month } from "@prisma/client";

export async function monthsRoutes(app: FastifyInstance) {
  app.get("/months", async () => {
    const months = await prisma.month.findMany({
      orderBy: { label: "desc" },
      include: {
        batches: {
          orderBy: { importedAt: "desc" }
        }
      }
    });

    return months.map((month: Month & { batches: ImportBatch[] }) => ({
      id: month.id,
      year: month.year,
      month: month.month,
      label: month.label,
      batches: month.batches.map((batch: ImportBatch) => ({
        id: batch.id,
        status: batch.status,
        isActive: batch.isActive,
        totalLines: batch.totalLines,
        validLines: batch.validLines,
        importedAt: batch.importedAt
      }))
    }));
  });

  app.delete("/months/:id", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const existing = await prisma.month.findUnique({ where: { id } });
    if (!existing) {
      reply.code(404);
      return { error: "Mes nao encontrado" };
    }

    await prisma.month.delete({ where: { id } });
    return { message: "Mes removido", id: existing.id, label: existing.label };
  });
}
