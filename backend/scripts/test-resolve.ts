import { prisma } from "../src/db.js";
import { resolvePartNumber } from "../src/services/lines.js";

async function main() {
  const year = 2250 + Math.floor(Math.random() * 50);
  const month = Math.floor(Math.random() * 12) + 1;
  const label = `${year}-${month.toString().padStart(2, "0")}`;

  const createdMonth = await prisma.month.create({
    data: { year, month, label }
  });

  const batch = await prisma.importBatch.create({
    data: {
      monthId: createdMonth.id,
      status: "COMPLETED",
      isActive: true
    }
  });

  const line = await prisma.productLine.create({
    data: {
      importBatchId: batch.id,
      partNumber: "PN123",
      rawPartNumber: "PN12S",
      unitPriceCents: 1000,
      correctionStatus: "NEEDS_REVIEW",
      suggestedPartNumber: "PN123",
      correctionConfidence: 0.9
    }
  });

  const updated = await resolvePartNumber(line.id, "accept");

  if (updated.partNumber !== "PN123" || updated.correctionStatus !== "RESOLVED") {
    throw new Error("Falha: resolucao nao aplicada");
  }

  console.log("OK: resolve-partnumber aplica RESOLVED e atualiza partNumber");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
