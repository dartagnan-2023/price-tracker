import { prisma } from "../src/db.js";
import { activateBatch } from "../src/services/batches.js";

async function main() {
  const year = 2200 + Math.floor(Math.random() * 50);
  const month = Math.floor(Math.random() * 12) + 1;
  const label = `${year}-${month.toString().padStart(2, "0")}`;

  const createdMonth = await prisma.month.create({
    data: { year, month, label }
  });

  const batchA = await prisma.importBatch.create({
    data: {
      monthId: createdMonth.id,
      status: "COMPLETED",
      isActive: true
    }
  });

  const batchB = await prisma.importBatch.create({
    data: {
      monthId: createdMonth.id,
      status: "COMPLETED",
      isActive: false
    }
  });

  await activateBatch(batchB.id);

  const active = await prisma.importBatch.findMany({
    where: { monthId: createdMonth.id, isActive: true }
  });

  if (active.length !== 1 || active[0].id !== batchB.id) {
    throw new Error("Falha: mais de um batch ativo ou batch errado");
  }

  console.log("OK: ativacao garante um unico batch ativo por mes");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
