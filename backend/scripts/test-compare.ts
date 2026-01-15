import { prisma } from "../src/db.js";
import { compareMonths } from "../src/services/comparison.js";

async function main() {
  const yearA = 2300 + Math.floor(Math.random() * 20);
  const monthA = Math.floor(Math.random() * 12) + 1;
  const yearB = yearA + 1;
  const monthB = monthA;

  const labelA = `${yearA}-${monthA.toString().padStart(2, "0")}`;
  const labelB = `${yearB}-${monthB.toString().padStart(2, "0")}`;

  const monthARecord = await prisma.month.create({ data: { year: yearA, month: monthA, label: labelA } });
  const monthBRecord = await prisma.month.create({ data: { year: yearB, month: monthB, label: labelB } });

  const batchA = await prisma.importBatch.create({
    data: {
      monthId: monthARecord.id,
      status: "COMPLETED",
      isActive: true
    }
  });

  const batchB = await prisma.importBatch.create({
    data: {
      monthId: monthBRecord.id,
      status: "COMPLETED",
      isActive: true
    }
  });

  await prisma.productLine.createMany({
    data: [
      { importBatchId: batchA.id, partNumber: "PN1", rawPartNumber: "PN1", unitPriceCents: 1000 },
      { importBatchId: batchA.id, partNumber: "PN3", rawPartNumber: "PN3", unitPriceCents: 1500 },
      { importBatchId: batchA.id, partNumber: "PN4", rawPartNumber: "PN4", unitPriceCents: 0 },
      { importBatchId: batchB.id, partNumber: "PN1", rawPartNumber: "PN1", unitPriceCents: 1000 },
      { importBatchId: batchB.id, partNumber: "PN2", rawPartNumber: "PN2", unitPriceCents: 2000 },
      { importBatchId: batchB.id, partNumber: "PN4", rawPartNumber: "PN4", unitPriceCents: 1000 }
    ]
  });

  const comparison = await compareMonths(monthARecord.id, monthBRecord.id, "all");

  const rowByPart = new Map(comparison.comparison.map((row: any) => [row.partNumber, row]));
  const pn2 = rowByPart.get("PN2");
  const pn3 = rowByPart.get("PN3");
  const pn4 = rowByPart.get("PN4");

  if (pn2?.priceDiffPercent !== null || pn3?.priceDiffPercent !== null) {
    throw new Error("Falha: deltaPercent deveria ser null para new/removed");
  }
  if (pn4?.priceDiffPercent !== null) {
    throw new Error("Falha: deltaPercent deveria ser null quando priceA = 0");
  }

  console.log("OK: compare deltaPercent null para new/removed e priceA=0");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
