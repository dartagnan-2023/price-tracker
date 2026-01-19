import fs from "node:fs/promises";
import path from "node:path";
import { BatchStatus, FileType } from "../constants.js";
import { prisma } from "../db.js";
import {
  detectCompetenceFromText,
  detectFullDateFromText,
  formatFullDate,
} from "./detector.js";
import { detectHeaderMapping, isDescriptionHeader, findDescriptionHeader } from "./mapper.js";
import { detectFileType, parseFile } from "./file.js";
import { normalizePartNumber, parsePriceToCents } from "./normalizer.js";
import { validatePartNumber, validateUnitPriceCents } from "./validator.js";
import type { ParsedRow } from "./parsers/types.js";
import { ensureLocalFilePath } from "../storage/file-cache.js";
import { IngestionError, IngestionErrorCodes } from "./errors.js";
import { applyPartNumberCorrection, loadKnownPartNumbers } from "./correction-service.js";
import {
  getOrCreateMonth,
  resolvePendingReason,
  upsertBatch,
} from "./batch-service.js";
import {
  coerceFileType,
  hashFile,
  hasFullDateInName,
} from "./file-service.js";
import {
  ensureSupabaseStorage,
  moveFileAndUpdateAsset,
} from "./storage-service.js";

export type ProcessResult = {
  status: "completed" | "pending_review" | "failed" | "duplicate";
  batchId?: number;
  reason?: string;
};

export type MappingOverride = {
  partNumber: string;
  unitPrice: string;
};

export type MonthOverride = {
  year: number;
  month: number;
  day?: number;
};

export type ProcessOptions = {
  monthOverride?: MonthOverride;
  mappingOverride?: MappingOverride;
  forceReimport?: boolean;
};

export async function processFile(filePath: string, options: ProcessOptions = {}): Promise<ProcessResult> {
  try {
    const fileType = detectFileType(filePath);
    if (!fileType) {
      throw new IngestionError("Tipo de arquivo nao suportado", IngestionErrorCodes.UNSUPPORTED_FILE_TYPE);
    }

    const fileStats = await fs.stat(filePath);
    const fileHash = await hashFile(filePath);

    const existingFile = await prisma.fileAsset.findUnique({
      where: { hash: fileHash }
    });

    if (existingFile && !options.forceReimport) {
      return { status: "duplicate", reason: "Arquivo duplicado" };
    }

    const fileAsset = existingFile ??
      (await prisma.fileAsset.create({
        data: {
          originalFilename: path.basename(filePath),
          filePath,
          fileType,
          fileSize: fileStats.size,
          hash: fileHash
        }
      }));

    await ensureSupabaseStorage(fileAsset, filePath, fileHash);

    return await parseAndPersist({
      filePath,
      fileAssetId: fileAsset.id,
      fileType,
      options
    });
  } catch (error) {
    console.error("[worker] Erro ao processar arquivo:", error);
    return {
      status: "failed",
      reason: error instanceof IngestionError ? error.message : "Erro interno no processamento"
    };
  }
}

export async function reprocessBatch(batchId: number, options: ProcessOptions): Promise<ProcessResult> {
  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId },
    include: { fileAsset: true }
  });

  if (!batch?.fileAsset) {
    return { status: "failed", reason: "Batch ou arquivo nao encontrado" };
  }

  const localPath = await ensureLocalFilePath(batch.fileAsset);

  return parseAndPersist({
    filePath: localPath,
    fileAssetId: batch.fileAsset.id,
    fileType: coerceFileType(batch.fileAsset.fileType),
    options,
    existingBatchId: batch.id,
    filenameOverride: batch.fileAsset.originalFilename
  });
}

type ParsePersistInput = {
  filePath: string;
  fileAssetId: number;
  fileType: FileType;
  options: ProcessOptions;
  existingBatchId?: number;
  filenameOverride?: string;
};

async function parseAndPersist({
  filePath,
  fileAssetId,
  fileType,
  options,
  existingBatchId,
  filenameOverride
}: ParsePersistInput): Promise<ProcessResult> {
  const fileName = filenameOverride ?? path.basename(filePath);
  const parsed = await parseFile(filePath, fileType);

  const { detectedCompetence, competenceSource } = resolveCompetence(parsed, fileName, options.monthOverride);
  const { mapping, mappingOk, mappingConfidence } = resolveMapping(parsed, fileType, options.mappingOverride);

  const ocrConfidence = parsed.confidence ?? 0;
  const manualReview = Boolean(options.monthOverride || options.mappingOverride);
  const ocrOk = manualReview ? true : ocrConfidence >= 70;

  const pendingReason = resolvePendingReason({
    mapping,
    mappingOk,
    detectedCompetence,
    ocrOk
  });

  const formattedFullDate = resolveFullDate(parsed, fileName, options.monthOverride);

  const monthRecord = detectedCompetence
    ? await getOrCreateMonth(detectedCompetence.year, detectedCompetence.month)
    : null;
  const monthId = monthRecord?.id ?? null;

  let targetBatchId = existingBatchId ?? (monthId ? await findExistingBatchId(monthId) : undefined);

  if ((!mappingOk || !detectedCompetence || !ocrOk) && !manualReview) {
    const batch = await upsertBatch({
      existingBatchId: targetBatchId,
      monthId,
      status: BatchStatus.PENDING_REVIEW,
      fileAssetId,
      pendingReason,
      ocrConfidenceAvg: ocrConfidence,
      mappingConfidence,
      competenceSource,
      fullDate: formattedFullDate
    });

    await updateBatchStats(batch.id, {
      totalLines: targetBatchId ? undefined : parsed.rows.length,
      validLines: targetBatchId ? undefined : 0
    });

    await moveFileAndUpdateAsset({
      fileAssetId,
      filePath,
      status: BatchStatus.PENDING_REVIEW,
      monthLabel: monthRecord ? monthRecord.label : null
    });

    return { status: "pending_review", batchId: batch.id };
  }

  if (!monthRecord) {
    throw new IngestionError("Competencia nao detectada", IngestionErrorCodes.COMPETENCE_NOT_DETECTED);
  }

  const batch = await upsertBatch({
    existingBatchId: targetBatchId,
    monthId: monthRecord.id,
    status: BatchStatus.COMPLETED,
    fileAssetId,
    pendingReason: null,
    ocrConfidenceAvg: ocrConfidence,
    mappingConfidence,
    competenceSource,
    fullDate: formattedFullDate
  });

  const { productLines, errors, duplicatePartNumbers } = await processRows(parsed.rows, {
    batchId: batch.id,
    fileType,
    mapping,
  });

  if (productLines.length) {
    await prisma.productLine.createMany({ data: productLines });
  }

  const finalStatus = productLines.length > 0 ? BatchStatus.COMPLETED : BatchStatus.FAILED;
  const errorLog = formatErrorLog(errors, duplicatePartNumbers, productLines.length);

  await updateBatchStats(batch.id, {
    status: finalStatus,
    totalLines: parsed.rows.length,
    validLines: productLines.length,
    errorLog
  });

  await moveFileAndUpdateAsset({
    fileAssetId,
    filePath,
    status: finalStatus,
    monthLabel: finalStatus === BatchStatus.COMPLETED ? monthRecord.label : null
  });

  return {
    status: finalStatus === BatchStatus.COMPLETED ? "completed" : "failed",
    batchId: batch.id
  };
}

// --- Helper Functions ---

function resolveCompetence(parsed: any, fileName: string, override?: MonthOverride) {
  const headerText = parsed.headers.join(" ");
  const competenceText = parsed.rawLines && parsed.headerIndex !== undefined
    ? parsed.rawLines.slice(0, parsed.headerIndex).join(" ")
    : headerText;

  const headerCompetence = detectCompetenceFromText(competenceText);
  const filenameCompetence = hasFullDateInName(fileName) ? null : detectCompetenceFromText(fileName);

  const detectedCompetence = override ?? headerCompetence ?? filenameCompetence;
  const competenceSource = override ? "manual" : headerCompetence ? "header" : filenameCompetence ? "filename" : null;

  return { detectedCompetence, competenceSource };
}

function resolveMapping(parsed: any, fileType: FileType, override?: MappingOverride) {
  const mapping = override
    ? {
      partNumber: override.partNumber,
      unitPrice: override.unitPrice,
      confidence: { partNumber: 1, unitPrice: 1 }
    }
    : detectHeaderMapping(parsed.headers);

  const adjustedMapping = shouldApplyImageFallback(fileType)
    ? applyImageMappingFallback(mapping, parsed.headers, parsed.rows)
    : mapping;

  const mappingConfidence = Math.min(adjustedMapping.confidence.partNumber, adjustedMapping.confidence.unitPrice);
  const mappingOk = Boolean(adjustedMapping.partNumber && adjustedMapping.unitPrice)
    && adjustedMapping.confidence.partNumber >= 0.8
    && adjustedMapping.confidence.unitPrice >= 0.8;

  return { mapping: adjustedMapping, mappingOk, mappingConfidence };
}

function resolveFullDate(parsed: any, fileName: string, override?: MonthOverride) {
  const rawContent = parsed.rawText ?? parsed.rawLines?.join(" ") ?? "";
  const dateFromContent = detectFullDateFromText(rawContent);
  const dateFromFilename = detectFullDateFromText(fileName);
  const overrideFullDate = override && typeof override.day === "number"
    ? { year: override.year, month: override.month, day: override.day }
    : null;

  const fullDateValue = overrideFullDate ?? dateFromContent ?? dateFromFilename;
  return fullDateValue ? formatFullDate(fullDateValue) : null;
}

async function findExistingBatchId(monthId: number) {
  const existingBatch = await prisma.importBatch.findFirst({
    where: { monthId },
    orderBy: [{ isActive: "desc" }, { importedAt: "desc" }]
  });
  return existingBatch?.id;
}

async function updateBatchStats(batchId: number, data: any) {
  await prisma.importBatch.update({
    where: { id: batchId },
    data
  });
}

async function processRows(rows: ParsedRow[], context: { batchId: number; fileType: FileType; mapping: any }) {
  const { batchId, fileType, mapping } = context;
  const knownPartNumbers = await loadKnownPartNumbers(batchId);

  const existingParts = await prisma.productLine.findMany({
    where: { importBatchId: batchId },
    select: { partNumber: true }
  });
  const existingPartNumbers = new Set(existingParts.map(r => r.partNumber));

  const partNumberNeedsExtraction = shouldApplyImageFallback(fileType)
    && mapping.partNumber
    && isDescriptionHeader(mapping.partNumber);

  const errors: string[] = [];
  const duplicatePartNumbers = new Set<string>();

  const productLines = rows.flatMap((row, index) => {
    const rawPart = row[mapping.partNumber] ?? "";
    const rawPrice = row[mapping.unitPrice] ?? "";
    const rowLine = shouldApplyImageFallback(fileType) ? Object.values(row).join(" ") : "";

    const extractedPart = partNumberNeedsExtraction ? extractPartNumberFromDescription(rawPart || rowLine) : null;
    const partSource = extractedPart ?? rawPart;
    const allowLineFallback = !shouldApplyImageFallback(fileType);
    const priceCandidate = rawPrice || (allowLineFallback && rowLine ? extractPriceFromLine(rowLine) : "");
    const priceCents = parsePriceToCents(priceCandidate);

    if (partNumberNeedsExtraction && !extractedPart && !priceCents) return [];

    const partNumberError = validatePartNumber(partSource);
    if (partNumberError) {
      errors.push(`Linha ${index + 2}: ${partNumberError}`);
      return [];
    }

    const normalizedPart = normalizePartNumber(partSource);
    const priceError = validateUnitPriceCents(priceCents);
    if (priceError) {
      errors.push(`Linha ${index + 2}: ${priceError}`);
      return [];
    }

    const correction = applyPartNumberCorrection(normalizedPart, knownPartNumbers);
    const finalPartNumber = correction.partNumber;

    if (existingPartNumbers.has(finalPartNumber)) {
      duplicatePartNumbers.add(finalPartNumber);
    } else {
      existingPartNumbers.add(finalPartNumber);
    }

    return [{
      importBatchId: batchId,
      partNumber: finalPartNumber,
      rawPartNumber: rawPart,
      unitPriceCents: priceCents as number,
      lineNumber: index + 2,
      correctionStatus: correction.status,
      suggestedPartNumber: correction.suggestedPartNumber,
      correctionConfidence: correction.confidence
    }];
  });

  return { productLines, errors, duplicatePartNumbers: Array.from(duplicatePartNumbers) };
}

function formatErrorLog(errors: string[], duplicatePartNumbers: string[], validCount: number) {
  const duplicateErrors = duplicatePartNumbers.map(p => `Duplicado no mesmo mes: ${p}`);
  const allErrors = [...errors, ...duplicateErrors];

  if (allErrors.length) return allErrors.join("\n");
  if (validCount === 0) return "Nenhuma linha valida encontrada.";
  return null;
}

function shouldApplyImageFallback(fileType: FileType) {
  return fileType === FileType.PNG || fileType === FileType.JPG || fileType === FileType.JPEG;
}

function applyImageMappingFallback(mapping: any, headers: string[], rows: any[]) {
  const partHeader = mapping.partNumber;
  if (!partHeader || columnMostlyEmpty(rows, partHeader)) {
    const descriptionHeader = findDescriptionHeader(headers);
    if (descriptionHeader) {
      return {
        ...mapping,
        partNumber: descriptionHeader,
        confidence: { ...mapping.confidence, partNumber: Math.max(mapping.confidence.partNumber, 0.9) }
      };
    }
  }
  return mapping;
}

function columnMostlyEmpty(rows: any[], header: string) {
  if (!rows.length) return false;
  let total = 0, empty = 0;
  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(row, header)) {
      total++;
      if (!row[header]?.trim()) empty++;
    }
  }
  return total === 0 ? true : empty / total >= 0.8;
}

function extractPartNumberFromDescription(value: string): string | null {
  if (!value) return null;
  const cleaned = value.replace(/\b\d+\s*(?:PCS|PC|PES)\b/gi, " ");
  const upper = cleaned.toUpperCase();
  const priceIndex = upper.indexOf("US");
  const trimmed = (priceIndex >= 0 ? cleaned.slice(0, priceIndex) : cleaned)
    .replace(/\s*\/\s*/g, "/")
    .replace(/([A-Z0-9/-]{4,})(\d{2,5}\s*(?:PCS|PC|PES))/gi, "$1 $2");

  const patternMatch = trimmed.match(/[A-Z]{1,6}\d{1,4}-[A-Z0-9/]+/i);
  if (patternMatch) return patternMatch[0];

  const candidates = trimmed.replace(/[()]/g, " ").split(/\s+/).map(t => t.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "")).filter(Boolean);
  const structured = candidates.filter(t => /[A-Za-z]/.test(t) && /\d/.test(t) && /[-/]/.test(t) && t.length >= 4);
  if (structured.length) return structured[0];

  if (/\bPCS\b|\bPC\b/.test(upper)) {
    const withDigits = candidates.filter(t => /[A-Za-z]/.test(t) && /\d/.test(t) && t.length >= 4);
    if (withDigits.length) return withDigits[0];
  }
  return null;
}

function extractPriceFromLine(value: string): string {
  if (!value) return "";
  const normalized = value.replace(/O/g, "0");
  const match = normalized.match(/U\s*S\s*\$?\s*\d+(?:[.,]\d+)?/i);
  if (match) return match[0].replace(/[^0-9.,]/g, "");
  const numeric = normalized.match(/\b\d+[.,]\d+\b/);
  return numeric ? numeric[0] : "";
}
