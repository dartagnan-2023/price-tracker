import crypto, { type BinaryLike } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { BatchStatus, CorrectionStatus, FileType } from "../constants.js";
import { prisma } from "../db.js";
import { FAILED_DIR, PENDING_REVIEW_DIR, PROCESSED_DIR } from "../config.js";
import {
  detectCompetenceFromText,
  detectFullDateFromText,
  formatFullDate
} from "./detector.js";
import { detectHeaderMapping, findDescriptionHeader, normalizeHeaderValue } from "./mapper.js";
import { detectFileType, parseFile } from "./file.js";
import { normalizePartNumber, parsePriceToCents } from "./normalizer.js";
import { findBestMatch } from "./partnumber.js";
import { PARTNUMBER_AUTO_THRESHOLD, PARTNUMBER_REVIEW_THRESHOLD } from "../config.js";
import { validatePartNumber, validateUnitPriceCents } from "./validator.js";

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
};

export type ProcessOptions = {
  monthOverride?: MonthOverride;
  mappingOverride?: MappingOverride;
  forceReimport?: boolean;
};

export async function processFile(filePath: string, options: ProcessOptions = {}): Promise<ProcessResult> {
  const fileType = detectFileType(filePath);
  if (!fileType) {
    return { status: "failed", reason: "Tipo de arquivo nao suportado" };
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

  return parseAndPersist({
    filePath,
    fileAssetId: fileAsset.id,
    fileType,
    options
  });
}

export async function reprocessBatch(batchId: number, options: ProcessOptions): Promise<ProcessResult> {
  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId },
    include: { fileAsset: true }
  });

  if (!batch?.fileAsset) {
    return { status: "failed", reason: "Batch ou arquivo nao encontrado" };
  }

  return parseAndPersist({
    filePath: batch.fileAsset.filePath,
    fileAssetId: batch.fileAsset.id,
    fileType: coerceFileType(batch.fileAsset.fileType),
    options,
    existingBatchId: batch.id
  });
}

type ParsePersistInput = {
  filePath: string;
  fileAssetId: number;
  fileType: FileType;
  options: ProcessOptions;
  existingBatchId?: number;
};

async function parseAndPersist({
  filePath,
  fileAssetId,
  fileType,
  options,
  existingBatchId
}: ParsePersistInput): Promise<ProcessResult> {
  const parsed = await parseFile(filePath, fileType);
  const headerText = parsed.headers.join(" ");
  const fileName = path.basename(filePath);

  const competenceText = parsed.rawLines && parsed.headerIndex !== undefined
    ? parsed.rawLines.slice(0, parsed.headerIndex).join(" ")
    : headerText;
  const headerCompetence = detectCompetenceFromText(competenceText);
  const filenameCompetence = hasFullDateInName(fileName)
    ? null
    : detectCompetenceFromText(fileName);
  const detectedCompetence = options.monthOverride ?? headerCompetence ?? filenameCompetence;
  const competenceSource = options.monthOverride
    ? "manual"
    : headerCompetence
      ? "header"
      : filenameCompetence
        ? "filename"
        : null;

  const manualReview = Boolean(options.monthOverride || options.mappingOverride);

  const mapping = options.mappingOverride
    ? {
        partNumber: options.mappingOverride.partNumber,
        unitPrice: options.mappingOverride.unitPrice,
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

  const ocrConfidence = parsed.confidence ?? 0;
  const ocrOk = manualReview ? true : ocrConfidence >= 70;
  const pendingReason = resolvePendingReason({
    mapping: adjustedMapping,
    mappingOk,
    detectedCompetence,
    ocrOk
  });

  const rawContent = parsed.rawText ?? parsed.rawLines?.join(" ") ?? "";
  const dateFromContent = detectFullDateFromText(rawContent);
  const dateFromFilename = detectFullDateFromText(fileName);
  const fullDateValue = dateFromContent ?? dateFromFilename;
  const formattedFullDate = fullDateValue ? formatFullDate(fullDateValue) : null;

  const monthRecord = detectedCompetence
    ? await getOrCreateMonth(detectedCompetence.year, detectedCompetence.month)
    : null;
  const monthId = monthRecord?.id ?? null;

  let targetBatchId = existingBatchId;
  if (!targetBatchId && monthId) {
    const existingBatch = await prisma.importBatch.findFirst({
      where: { monthId },
      orderBy: [
        { isActive: "desc" },
        { importedAt: "desc" }
      ]
    });
    targetBatchId = existingBatch?.id;
  }

  const existingCounts = targetBatchId
    ? await prisma.importBatch.findUnique({
        where: { id: targetBatchId },
        select: { totalLines: true, validLines: true }
      })
    : null;
  const existingLineCount = targetBatchId
    ? await prisma.productLine.count({ where: { importBatchId: targetBatchId } })
    : 0;
  const baseTotalLines = existingCounts?.totalLines ?? existingLineCount;
  const baseValidLines = existingCounts?.validLines ?? existingLineCount;

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

    await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        totalLines: targetBatchId ? baseTotalLines : parsed.rows.length,
        validLines: targetBatchId ? baseValidLines : 0
      }
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
    return { status: "failed", reason: "Competencia nao detectada" };
  }

  const month = monthRecord;
  const batch = await upsertBatch({
    existingBatchId: targetBatchId,
    monthId: month.id,
    status: BatchStatus.COMPLETED,
    fileAssetId,
    pendingReason: null,
    ocrConfidenceAvg: ocrConfidence,
    mappingConfidence,
    competenceSource,
    fullDate: formattedFullDate
  });

  const knownPartNumbers = await loadKnownPartNumbers(batch.id);
  const existingParts = targetBatchId
    ? await prisma.productLine.findMany({
        where: { importBatchId: batch.id },
        select: { partNumber: true }
      })
    : [];
  const existingPartNumbers = new Set(existingParts.map((row) => row.partNumber));
  const duplicatePartNumbers = new Set<string>();
  const partNumberNeedsExtraction = shouldApplyImageFallback(fileType)
    && adjustedMapping.partNumber
    && isDescriptionHeader(adjustedMapping.partNumber);

  const errors: string[] = [];
  const productLines = parsed.rows.flatMap((row, index) => {
    const rawPart = row[adjustedMapping.partNumber as string] ?? "";
    const rawPrice = row[adjustedMapping.unitPrice as string] ?? "";
    const rowLine = shouldApplyImageFallback(fileType)
      ? Object.values(row).join(" ")
      : "";

    const extractedPart = partNumberNeedsExtraction
      ? extractPartNumberFromDescription(rawPart || rowLine)
      : null;
    const partSource = extractedPart ?? rawPart;
    const allowLineFallback = !shouldApplyImageFallback(fileType);
    const priceCandidate = rawPrice || (allowLineFallback && rowLine ? extractPriceFromLine(rowLine) : "");
    const priceCents = parsePriceToCents(priceCandidate);

    if (partNumberNeedsExtraction && !extractedPart && !priceCents) {
      return [];
    }

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
      importBatchId: batch.id,
      partNumber: finalPartNumber,
      rawPartNumber: rawPart,
      unitPriceCents: priceCents as number,
      lineNumber: index + 2,
      correctionStatus: correction.status,
      suggestedPartNumber: correction.suggestedPartNumber,
      correctionConfidence: correction.confidence
    }];
  });

  if (productLines.length) {
    await prisma.productLine.createMany({ data: productLines });
  }

  const mergedValidLines = baseValidLines + productLines.length;
  const mergedTotalLines = baseTotalLines + parsed.rows.length;
  const duplicateErrors = Array.from(duplicatePartNumbers).map(
    (partNumber) => `Duplicado no mesmo mes: ${partNumber}`
  );
  const errorMessages = [...errors, ...duplicateErrors];
  const finalStatus = mergedValidLines > 0 ? BatchStatus.COMPLETED : BatchStatus.FAILED;
  const errorLog = errorMessages.length
    ? errorMessages.join("\n")
    : mergedValidLines > 0
      ? null
      : "Nenhuma linha valida encontrada.";
  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      status: finalStatus,
      totalLines: mergedTotalLines,
      validLines: mergedValidLines,
      errorLog
    }
  });

  await moveFileAndUpdateAsset({
    fileAssetId,
    filePath,
    status: finalStatus,
    monthLabel: finalStatus === BatchStatus.COMPLETED ? month.label : null
  });

  return {
    status: finalStatus === BatchStatus.COMPLETED ? "completed" : "failed",
    batchId: batch.id
  };
}

async function hashFile(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buffer as unknown as BinaryLike).digest("hex");
}

async function getOrCreateMonth(year: number, month: number) {
  const label = formatMonthLabel(year, month);
  const existing = await prisma.month.findUnique({ where: { label } });
  if (existing) {
    return existing;
  }

  return prisma.month.create({
    data: {
      year,
      month,
      label
    }
  });
}

function formatMonthLabel(year: number, month: number) {
  return `${year}-${month.toString().padStart(2, "0")}`;
}

type BatchUpsertInput = {
  existingBatchId?: number;
  monthId: number | null;
  status: BatchStatus;
  fileAssetId: number;
  pendingReason: string | null;
  ocrConfidenceAvg: number | null;
  mappingConfidence: number | null;
  competenceSource: string | null;
  fullDate?: string | null;
};

async function upsertBatch({
  existingBatchId,
  monthId,
  status,
  fileAssetId,
  pendingReason,
  ocrConfidenceAvg,
  mappingConfidence,
  competenceSource
  ,
  fullDate
}: BatchUpsertInput) {
  if (existingBatchId) {
    const isActive = monthId ? !(await hasActiveBatch(monthId, existingBatchId)) : false;
    return prisma.importBatch.update({
      where: { id: existingBatchId },
      data: {
        monthId,
        status,
        isActive,
        fileAssetId,
        pendingReason,
        ocrConfidenceAvg,
        mappingConfidence,
        competenceSource,
        fullDate
      }
    });
  }

  const isActive = monthId ? !(await hasActiveBatch(monthId)) : false;

  return prisma.importBatch.create({
    data: {
      monthId,
      status,
      isActive,
      fileAssetId,
      pendingReason,
      ocrConfidenceAvg,
      mappingConfidence,
      competenceSource,
      fullDate
    }
  });
}

async function hasActiveBatch(monthId: number, excludeBatchId?: number): Promise<boolean> {
  const active = await prisma.importBatch.findFirst({
    where: {
      monthId,
      isActive: true,
      ...(excludeBatchId ? { id: { not: excludeBatchId } } : {})
    }
  });
  return Boolean(active);
}

async function loadKnownPartNumbers(currentBatchId: number): Promise<string[]> {
  const rows = await prisma.productLine.groupBy({
    by: ["partNumber"],
    where: { importBatchId: { not: currentBatchId } },
    _count: { partNumber: true }
  });

  return rows.map((row) => row.partNumber);
}

type CorrectionResult = {
  partNumber: string;
  status: CorrectionStatus;
  suggestedPartNumber: string | null;
  confidence: number | null;
};

function applyPartNumberCorrection(partNumber: string, knownPartNumbers: string[]): CorrectionResult {
  if (!knownPartNumbers.length) {
    return {
      partNumber,
      status: CorrectionStatus.NONE,
      suggestedPartNumber: null,
      confidence: null
    };
  }

  if (!partNumber || knownPartNumbers.includes(partNumber)) {
    return {
      partNumber,
      status: CorrectionStatus.NONE,
      suggestedPartNumber: null,
      confidence: null
    };
  }

  const match = findBestMatch(partNumber, knownPartNumbers);
  if (!match) {
    return {
      partNumber,
      status: CorrectionStatus.NEEDS_REVIEW,
      suggestedPartNumber: null,
      confidence: null
    };
  }

  if (match.score >= PARTNUMBER_AUTO_THRESHOLD) {
    return {
      partNumber: match.match,
      status: CorrectionStatus.AUTO_CORRECTED,
      suggestedPartNumber: match.match,
      confidence: match.score
    };
  }

  if (match.score >= PARTNUMBER_REVIEW_THRESHOLD) {
    return {
      partNumber,
      status: CorrectionStatus.NEEDS_REVIEW,
      suggestedPartNumber: match.match,
      confidence: match.score
    };
  }

  return {
    partNumber,
    status: CorrectionStatus.NEEDS_REVIEW,
    suggestedPartNumber: null,
    confidence: match.score
  };
}

type PendingReasonInput = {
  mapping: { partNumber?: string; unitPrice?: string; confidence: { partNumber: number; unitPrice: number } };
  mappingOk: boolean;
  detectedCompetence: { year: number; month: number } | null;
  ocrOk: boolean;
};

function resolvePendingReason({ mapping, mappingOk, detectedCompetence, ocrOk }: PendingReasonInput): string | null {
  if (!ocrOk) {
    return "low_ocr_confidence";
  }
  if (!detectedCompetence) {
    return "no_competence";
  }
  if (!mapping.partNumber || !mapping.unitPrice) {
    return "no_mapping";
  }
  if (!mappingOk) {
    return "ambiguous_headers";
  }
  return null;
}

function shouldApplyImageFallback(fileType: FileType) {
  return fileType === FileType.PNG || fileType === FileType.JPG || fileType === FileType.JPEG;
}

function coerceFileType(value: string): FileType {
  const normalized = normalizeHeaderValue(value);
  if (normalized === "csv") {
    return FileType.CSV;
  }
  if (normalized === "xlsx") {
    return FileType.XLSX;
  }
  if (normalized === "xls") {
    return FileType.XLS;
  }
  if (normalized === "png") {
    return FileType.PNG;
  }
  if (normalized === "jpg") {
    return FileType.JPG;
  }
  if (normalized === "jpeg") {
    return FileType.JPEG;
  }
  return FileType.CSV;
}

function applyImageMappingFallback(
  mapping: { partNumber?: string; unitPrice?: string; confidence: { partNumber: number; unitPrice: number } },
  headers: string[],
  rows: Array<Record<string, string>>
) {
  let nextMapping = { ...mapping };

  const partHeader = nextMapping.partNumber;
  if (!partHeader || columnMostlyEmpty(rows, partHeader)) {
    const descriptionHeader = findDescriptionHeader(headers);
    if (descriptionHeader) {
      nextMapping = {
        ...nextMapping,
        partNumber: descriptionHeader,
        confidence: {
          ...nextMapping.confidence,
          partNumber: Math.max(nextMapping.confidence.partNumber, 0.9)
        }
      };
    }
  }

  return nextMapping;
}

function columnMostlyEmpty(rows: Array<Record<string, string>>, header: string) {
  if (!rows.length) {
    return false;
  }
  let total = 0;
  let empty = 0;
  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(row, header)) {
      total += 1;
      if (!row[header]?.trim()) {
        empty += 1;
      }
    }
  }
  if (total === 0) {
    return true;
  }
  return empty / total >= 0.8;
}

function isDescriptionHeader(header: string) {
  const normalized = normalizeHeaderValue(header);
  return normalized.includes("description") || normalized.includes("descriptions") || normalized.includes("quantities");
}

function extractPartNumberFromDescription(value: string): string | null {
  if (!value) {
    return null;
  }

  const cleanedValue = value.replace(/\b\d+\s*(?:PCS|PC|PES)\b/gi, " ");
  const upper = cleanedValue.toUpperCase();
  const priceIndex = upper.indexOf("US");
  const trimmed = (priceIndex >= 0 ? cleanedValue.slice(0, priceIndex) : cleanedValue)
    .replace(/\s*\/\s*/g, "/")
    .replace(/([A-Z0-9/-]{4,})(\d{2,5}\s*(?:PCS|PC|PES))/gi, "$1 $2");

  const patternMatch = trimmed.match(/[A-Z]{1,6}\d{1,4}-[A-Z0-9/]+/i);
  if (patternMatch) {
    return patternMatch[0];
  }

  const candidates = trimmed
    .replace(/[()]/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ""))
    .filter(Boolean);

  const structured = candidates.filter(
    (token) => /[A-Za-z]/.test(token) && /\d/.test(token) && /[-/]/.test(token) && token.length >= 4
  );
  if (structured.length) {
    return structured[0];
  }

  const hasQuantity = /\bPCS\b|\bPC\b/.test(upper);
  if (hasQuantity) {
    const withDigits = candidates.filter((token) => /[A-Za-z]/.test(token) && /\d/.test(token) && token.length >= 4);
    if (withDigits.length) {
      return withDigits[0];
    }
  }

  return null;
}

function extractPriceFromLine(value: string): string {
  if (!value) {
    return "";
  }
  const normalized = value.replace(/O/g, "0");
  const match = normalized.match(/U\s*S\s*\$?\s*\d+(?:[.,]\d+)?/i);
  if (match) {
    return match[0].replace(/[^0-9.,]/g, "");
  }
  const numeric = normalized.match(/\b\d+[.,]\d+\b/);
  return numeric ? numeric[0] : "";
}

type MoveFileInput = {
  fileAssetId: number;
  filePath: string;
  status: BatchStatus;
  monthLabel: string | null;
};

async function moveFileAndUpdateAsset({ fileAssetId, filePath, status, monthLabel }: MoveFileInput) {
  const destinationDir = resolveDestinationDir(status, monthLabel);
  if (!destinationDir) {
    return;
  }

  await fs.mkdir(destinationDir, { recursive: true });

  const baseName = path.basename(filePath);
  let destinationPath = path.join(destinationDir, baseName);
  const currentPath = path.resolve(filePath);

  if (path.resolve(destinationPath) !== currentPath) {
    if (await fileExists(destinationPath)) {
      destinationPath = makeUniquePath(destinationPath);
    }

    try {
      await fs.rename(filePath, destinationPath);
    } catch (error) {
      console.error("[ingestion] Falha ao mover arquivo", error);
      return;
    }
  }

  await prisma.fileAsset.update({
    where: { id: fileAssetId },
    data: { filePath: destinationPath }
  });
}

function resolveDestinationDir(status: BatchStatus, monthLabel: string | null) {
  if (status === BatchStatus.COMPLETED && monthLabel) {
    return path.join(PROCESSED_DIR, monthLabel);
  }
  if (status === BatchStatus.PENDING_REVIEW) {
    return PENDING_REVIEW_DIR;
  }
  if (status === BatchStatus.FAILED) {
    return FAILED_DIR;
  }
  return null;
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function makeUniquePath(filePath: string) {
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const dir = path.dirname(filePath);
  return path.join(dir, `${base}-${Date.now()}${ext}`);
}

function hasFullDateInName(fileName: string) {
  const normalized = fileName.toLowerCase();
  const yyyyMmDd = /20\d{2}[\/\-_.](0?[1-9]|1[0-2])[\/\-_.](0?[1-9]|[12]\d|3[01])/;
  const ddMmYyyy = /(0?[1-9]|[12]\d|3[01])[\/\-_.](0?[1-9]|1[0-2])[\/\-_.]20\d{2}/;
  return yyyyMmDd.test(normalized) || ddMmYyyy.test(normalized);
}
