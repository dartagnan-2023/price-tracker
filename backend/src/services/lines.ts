import { prisma } from "../db.js";
import { normalizePartNumber, parsePriceToCents } from "../ingestion/normalizer.js";

export type ResolutionAction = "accept" | "keep" | "edit";

export async function resolvePartNumber(
  lineId: number,
  resolution: ResolutionAction,
  finalPartNumber?: string
) {
  const line = await prisma.productLine.findUnique({ where: { id: lineId } });
  if (!line) {
    throw new Error("not_found");
  }

  let nextPartNumber: string | null = null;
  if (resolution === "accept") {
    if (!line.suggestedPartNumber) {
      throw new Error("no_suggestion");
    }
    nextPartNumber = line.suggestedPartNumber;
  } else if (resolution === "keep") {
    nextPartNumber = line.rawPartNumber;
  } else if (resolution === "edit") {
    const finalValue = finalPartNumber?.trim();
    if (!finalValue) {
      throw new Error("missing_final");
    }
    nextPartNumber = normalizePartNumber(finalValue);
  } else {
    throw new Error("invalid_resolution");
  }

  return prisma.productLine.update({
    where: { id: lineId },
    data: {
      partNumber: nextPartNumber,
      correctionStatus: "RESOLVED",
      resolvedAt: new Date(),
      resolvedBy: "user",
      resolutionNote: resolution
    }
  });
}

export async function updateLine(
  lineId: number,
  input: { partNumber?: string; unitPrice?: number | string }
) {
  const line = await prisma.productLine.findUnique({ where: { id: lineId } });
  if (!line) {
    throw new Error("not_found");
  }

  const data: {
    partNumber?: string;
    unitPriceCents?: number;
    correctionStatus?: string;
    resolvedAt?: Date;
    resolvedBy?: string;
    resolutionNote?: string;
  } = {};

  if (input.partNumber !== undefined) {
    const normalized = normalizePartNumber(input.partNumber);
    if (!normalized) {
      throw new Error("invalid_partnumber");
    }
    data.partNumber = normalized;
  }

  if (input.unitPrice !== undefined) {
    const priceCents = parsePriceToCents(input.unitPrice);
    if (!priceCents) {
      throw new Error("invalid_price");
    }
    data.unitPriceCents = priceCents;
  }

  if (!Object.keys(data).length) {
    throw new Error("nothing_to_update");
  }

  data.correctionStatus = "RESOLVED";
  data.resolvedAt = new Date();
  data.resolvedBy = "user";
  data.resolutionNote = "edit";

  return prisma.productLine.update({
    where: { id: lineId },
    data
  });
}
