import { BatchStatus } from "../constants.js";
import { prisma } from "../db.js";
import type { Prisma } from "@prisma/client";

export type ActivationResult = {
  monthId: number;
};

export async function activateBatch(batchId: number): Promise<ActivationResult> {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });

  if (!batch) {
    throw new Error("not_found");
  }

  if (!batch.monthId) {
    throw new Error("no_month");
  }

  if (batch.status !== BatchStatus.COMPLETED) {
    throw new Error("not_completed");
  }

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.importBatch.updateMany({
      where: { monthId: batch.monthId },
      data: { isActive: false }
    });
    await tx.importBatch.update({
      where: { id: batch.id },
      data: { isActive: true }
    });

    const activeCount = await tx.importBatch.count({
      where: { monthId: batch.monthId, isActive: true }
    });
    if (activeCount !== 1) {
      throw new Error("active_violation");
    }
  });

  return { monthId: batch.monthId };
}
