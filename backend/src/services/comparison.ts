import { prisma } from "../db.js";
import { centsToNumber } from "../ingestion/normalizer.js";

type ProductLineRecord = {
  partNumber: string;
  unitPriceCents: number;
};

export type ComparisonStatus = "new" | "removed" | "changed" | "equal";

export type ComparisonRow = {
  partNumber: string;
  unitPriceA: number | null;
  unitPriceB: number | null;
  priceDiff: number | null;
  priceDiffPercent: number | null;
  status: ComparisonStatus;
};

export async function compareMonths(monthAId: number, monthBId: number, filter: string | null) {
  const batchA = await prisma.importBatch.findFirst({
    where: { monthId: monthAId, isActive: true },
    include: { month: true }
  });

  const batchB = await prisma.importBatch.findFirst({
    where: { monthId: monthBId, isActive: true },
    include: { month: true }
  });

  if (!batchA || !batchB) {
    throw new Error("Batch ativo nao encontrado para um dos meses");
  }

  const [linesA, linesB]: [ProductLineRecord[], ProductLineRecord[]] = await Promise.all([
    prisma.productLine.findMany({ where: { importBatchId: batchA.id } }),
    prisma.productLine.findMany({ where: { importBatchId: batchB.id } })
  ]);

  const mapA = new Map(linesA.map((line) => [line.partNumber, line]));
  const mapB = new Map(linesB.map((line) => [line.partNumber, line]));
  const partNumbers = new Set([...mapA.keys(), ...mapB.keys()]);

  const rows: ComparisonRow[] = [];
  for (const partNumber of partNumbers) {
    const lineA = mapA.get(partNumber);
    const lineB = mapB.get(partNumber);

    const unitPriceA = lineA ? centsToNumber(lineA.unitPriceCents) : null;
    const unitPriceB = lineB ? centsToNumber(lineB.unitPriceCents) : null;

    let status: ComparisonStatus;
    if (lineA && lineB) {
      status = lineA.unitPriceCents === lineB.unitPriceCents ? "equal" : "changed";
    } else if (lineA) {
      status = "removed";
    } else {
      status = "new";
    }

    const priceDiff = unitPriceA !== null && unitPriceB !== null
      ? Number((unitPriceB - unitPriceA).toFixed(2))
      : null;

    const priceDiffPercent = unitPriceA !== null && unitPriceB !== null && unitPriceA !== 0
      ? Number((((unitPriceB - unitPriceA) / unitPriceA) * 100).toFixed(2))
      : null;

    rows.push({
      partNumber,
      unitPriceA,
      unitPriceB,
      priceDiff,
      priceDiffPercent,
      status
    });
  }

  const filteredRows = applyFilter(rows, filter);
  const totalsFullA = calculateTotalsFromLines(linesA);
  const totalsFullB = calculateTotalsFromLines(linesB);
  const totalsFilteredA = calculateTotalsFromRows(filteredRows, "A");
  const totalsFilteredB = calculateTotalsFromRows(filteredRows, "B");

  return {
    monthA: { id: batchA.month?.id, label: batchA.month?.label },
    monthB: { id: batchB.month?.id, label: batchB.month?.label },
    comparison: filteredRows,
    totals_full_a: totalsFullA,
    totals_full_b: totalsFullB,
    totals_filtered_a: totalsFilteredA,
    totals_filtered_b: totalsFilteredB,
    totalsA: totalsFilteredA,
    totalsB: totalsFilteredB
  };
}

function applyFilter(rows: ComparisonRow[], filter: string | null): ComparisonRow[] {
  if (!filter || filter === "all") {
    return rows;
  }

  const normalized = filter.toLowerCase();
  return rows.filter((row) => row.status === normalized);
}

function calculateTotalsFromRows(rows: ComparisonRow[], side: "A" | "B") {
  const prices = rows
    .map((row) => (side === "A" ? row.unitPriceA : row.unitPriceB))
    .filter((value): value is number => value !== null);

  return buildTotals(prices);
}

function calculateTotalsFromLines(lines: ProductLineRecord[]) {
  const prices = lines.map((line) => centsToNumber(line.unitPriceCents) ?? 0);
  const filtered = prices.filter((value) => value > 0);
  return buildTotals(filtered);
}

function buildTotals(prices: number[]) {
  if (!prices.length) {
    return {
      totalSkus: 0,
      avgUnitPrice: 0,
      minUnitPrice: 0,
      maxUnitPrice: 0
    };
  }

  const sum = prices.reduce((acc, value) => acc + value, 0);
  const avg = sum / prices.length;
  const min = Math.min(...prices);
  const max = Math.max(...prices);

  return {
    totalSkus: prices.length,
    avgUnitPrice: Number(avg.toFixed(2)),
    minUnitPrice: Number(min.toFixed(2)),
    maxUnitPrice: Number(max.toFixed(2))
  };
}
