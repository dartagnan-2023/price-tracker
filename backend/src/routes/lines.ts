import { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { resolvePartNumber, updateLine } from "../services/lines.js";

export async function linesRoutes(app: FastifyInstance) {
  type LineHistoryEntry = {
    importBatchId: number;
    partNumber: string;
    unitPriceCents: number;
    importBatch: {
      fullDate: string | null;
      month: { label: string } | null;
      status: string | null;
      importedAt: Date | null;
    } | null;
  };

  app.get("/lines/history", async (request, reply) => {
    const query = request.query as { partNumber?: string };
    const partNumber = query.partNumber?.trim();
    if (!partNumber) {
      reply.code(400);
      return { error: "partNumber obrigatorio" };
    }

    const lines = await prisma.productLine.findMany({
      where: { partNumber },
      include: {
        importBatch: {
          include: { month: true }
        }
      },
      orderBy: [
        { importBatch: { fullDate: "desc" } },
        { importBatch: { importedAt: "desc" } }
      ]
    });

    return {
      history: (lines as LineHistoryEntry[]).map((line) => ({
        batchId: line.importBatchId,
        partNumber: line.partNumber,
        fullDate: line.importBatch?.fullDate ?? null,
        monthLabel: line.importBatch?.month?.label ?? null,
        unitPrice: Number((line.unitPriceCents / 100).toFixed(2)),
        status: line.importBatch?.status ?? null,
        importedAt: line.importBatch?.importedAt ?? null
      }))
    };
  });

  app.patch("/lines/:id/resolve-partnumber", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const body = request.body as {
      resolution?: "accept" | "keep" | "edit";
      finalPartNumber?: string;
    };

    if (!body.resolution) {
      reply.code(400);
      return { error: "resolution obrigatorio" };
    }

    let updated;
    try {
      updated = await resolvePartNumber(id, body.resolution, body.finalPartNumber);
    } catch (error) {
      const message = (error as Error).message;
      if (message === "not_found") {
        reply.code(404);
        return { error: "Linha nao encontrada" };
      }
      if (message === "no_suggestion") {
        reply.code(400);
        return { error: "Sem sugestao disponivel" };
      }
      if (message === "missing_final") {
        reply.code(400);
        return { error: "finalPartNumber obrigatorio" };
      }
      reply.code(400);
      return { error: "resolution invalido" };
    }

    return {
      id: updated.id,
      partNumber: updated.partNumber,
      rawPartNumber: updated.rawPartNumber,
      correctionStatus: updated.correctionStatus,
      suggestedPartNumber: updated.suggestedPartNumber,
      correctionConfidence: updated.correctionConfidence,
      resolvedAt: updated.resolvedAt,
      resolvedBy: updated.resolvedBy,
      resolutionNote: updated.resolutionNote
    };
  });

  app.patch("/lines/:id", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const body = request.body as {
      partNumber?: string;
      unitPrice?: number | string;
    };

    let updated;
    try {
      updated = await updateLine(id, {
        partNumber: body.partNumber,
        unitPrice: body.unitPrice
      });
    } catch (error) {
      const message = (error as Error).message;
      if (message === "not_found") {
        reply.code(404);
        return { error: "Linha nao encontrada" };
      }
      if (message === "invalid_partnumber") {
        reply.code(400);
        return { error: "Partnumber invalido" };
      }
      if (message === "invalid_price") {
        reply.code(400);
        return { error: "Unit price invalido" };
      }
      if (message === "nothing_to_update") {
        reply.code(400);
        return { error: "Nada para atualizar" };
      }
      reply.code(400);
      return { error: "Falha ao atualizar linha" };
    }

    return {
      id: updated.id,
      partNumber: updated.partNumber,
      rawPartNumber: updated.rawPartNumber,
      unitPrice: Number((updated.unitPriceCents / 100).toFixed(2)),
      correctionStatus: updated.correctionStatus,
      resolvedAt: updated.resolvedAt,
      resolvedBy: updated.resolvedBy,
      resolutionNote: updated.resolutionNote
    };
  });

  app.delete("/lines/:id", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const line = await prisma.productLine.findUnique({
      where: { id },
      select: { id: true, importBatchId: true }
    });

    if (!line) {
      reply.code(404);
      return { error: "Linha nao encontrada" };
    }

    await prisma.productLine.delete({ where: { id: line.id } });
    const remaining = await prisma.productLine.count({
      where: { importBatchId: line.importBatchId }
    });
    await prisma.importBatch.update({
      where: { id: line.importBatchId },
      data: { validLines: remaining }
    });

    return { message: "Linha removida", id: line.id };
  });
}
