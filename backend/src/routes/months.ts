import { FastifyInstance } from "fastify";
import { prisma } from "../db.js";

type MonthWithBatchesDTO = {
  id: number;
  year: number;
  month: number;
  label: string;
  batches: Array<{
    id: number;
    status: string;
    isActive: boolean;
    totalLines: number;
    validLines: number;
    importedAt: Date;
    fullDate: string | null;
  }>;
};

export async function monthsRoutes(app: FastifyInstance) {
  app.get("/months", async () => {
    const months = await prisma.month.findMany({
      orderBy: { label: "desc" },
      include: {
        batches: {
          orderBy: { importedAt: "desc" }
        }
      }
    }) as MonthWithBatchesDTO[];

    return months.map((month) => {
      const primaryBatch = month.batches[0] ?? null;
      return {
        id: month.id,
        year: month.year,
        month: month.month,
        label: month.label,
        fullDate: primaryBatch?.fullDate ?? null,
        batches: month.batches.map((batch) => ({
          id: batch.id,
          status: batch.status,
          isActive: batch.isActive,
          totalLines: batch.totalLines,
          validLines: batch.validLines,
          importedAt: batch.importedAt,
          fullDate: batch.fullDate
        }))
      };
    });
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
