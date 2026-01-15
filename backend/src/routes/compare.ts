import { FastifyInstance } from "fastify";
import { compareMonths } from "../services/comparison.js";

export async function compareRoutes(app: FastifyInstance) {
  app.get("/compare", async (request, reply) => {
    const query = request.query as {
      month_a?: string;
      month_b?: string;
      filter?: string;
    };

    const monthAId = Number(query.month_a);
    const monthBId = Number(query.month_b);

    if (!monthAId || !monthBId) {
      reply.code(400);
      return { error: "Parametros invalidos" };
    }

    try {
      return await compareMonths(monthAId, monthBId, query.filter ?? null);
    } catch (error) {
      reply.code(404);
      return { error: "Comparacao nao encontrada" };
    }
  });
}
