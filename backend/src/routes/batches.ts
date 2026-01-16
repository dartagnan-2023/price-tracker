import { FastifyInstance } from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import type { FileAsset } from "@prisma/client";
import { prisma } from "../db.js";
import { FAILED_DIR, INBOX_DIR, PENDING_REVIEW_DIR, PROCESSED_DIR } from "../config.js";
import { FileType } from "../constants.js";
import {
  detectCompetenceFromText,
  detectFullDateFromText,
  formatFullDate
} from "../ingestion/detector.js";
import { parseFile } from "../ingestion/file.js";
import { detectHeaderMapping, findDescriptionHeader, normalizeHeaderValue } from "../ingestion/mapper.js";
import { reprocessBatch } from "../ingestion/worker.js";
import { activateBatch } from "../services/batches.js";
import { ensureLocalFilePath } from "../storage/file-cache.js";

type ProductLineRecord = {
  id: number;
  partNumber: string;
  unitPriceCents: number;
  rawPartNumber: string | null;
  correctionStatus: string;
  suggestedPartNumber: string | null;
  correctionConfidence: number | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
};

type BatchDTO = {
  id: number;
  status: string;
  isActive: boolean;
  totalLines: number;
  validLines: number;
  errorLog: string | null;
  pendingReason: string | null;
  ocrConfidenceAvg: number | null;
  mappingConfidence: number | null;
  competenceSource: string | null;
  importedAt: Date;
  fullDate: string | null;
  month: { id: number; label: string } | null;
  fileAsset: { id: number; originalFilename: string; fileType: string } | null;
};

interface BatchLineSummary {
  id: number;
  partNumber: string;
  unitPrice: number;
  rawPartNumber: string | null;
  correctionStatus: string;
  suggestedPartNumber: string | null;
  correctionConfidence: number | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
}

export async function batchesRoutes(app: FastifyInstance) {
  app.get("/batches", async () => {
    const batches = await prisma.importBatch.findMany({
      orderBy: { importedAt: "desc" },
      include: { month: true, fileAsset: true }
    }) as BatchDTO[];

    return batches.map((batch) => ({
      id: batch.id,
      status: batch.status,
      isActive: batch.isActive,
      totalLines: batch.totalLines,
      validLines: batch.validLines,
      errorLog: batch.errorLog,
      pendingReason: batch.pendingReason,
      ocrConfidenceAvg: batch.ocrConfidenceAvg,
      mappingConfidence: batch.mappingConfidence,
      competenceSource: batch.competenceSource,
      importedAt: batch.importedAt,
      month: batch.month
        ? { id: batch.month.id, label: batch.month.label }
        : null,
      fileAsset: batch.fileAsset
        ? {
            id: batch.fileAsset.id,
            originalFilename: batch.fileAsset.originalFilename,
            fileType: batch.fileAsset.fileType
          }
        : null,
      fullDate: batch.fullDate
    }));
  });

  app.get("/batches/:id", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const batch = await prisma.importBatch.findUnique({
      where: { id },
      include: { fileAsset: true, month: true }
    });

    if (!batch) {
      reply.code(404);
      return { error: "Batch nao encontrado" };
    }

    return {
      id: batch.id,
      monthId: batch.monthId,
      status: batch.status,
      isActive: batch.isActive,
      totalLines: batch.totalLines,
      validLines: batch.validLines,
      errorLog: batch.errorLog,
      pendingReason: batch.pendingReason,
      ocrConfidenceAvg: batch.ocrConfidenceAvg,
      mappingConfidence: batch.mappingConfidence,
      competenceSource: batch.competenceSource,
      importedAt: batch.importedAt,
      month: batch.month ? { id: batch.month.id, label: batch.month.label } : null,
      fileAsset: batch.fileAsset
        ? {
            id: batch.fileAsset.id,
            originalFilename: batch.fileAsset.originalFilename,
            fileType: batch.fileAsset.fileType
          }
        : null,
      fullDate: batch.fullDate
    };
  });

  app.get("/batches/:id/lines", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const query = request.query as { page?: string; pageSize?: string };
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 50));

    const [lines, total, duplicates] = (await Promise.all([
      prisma.productLine.findMany({
        where: { importBatchId: id },
        orderBy: { partNumber: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      prisma.productLine.count({ where: { importBatchId: id } }),
      prisma.productLine.groupBy({
        by: ["partNumber"],
        where: { importBatchId: id },
        _count: { partNumber: true },
        having: {
          partNumber: {
            _count: {
              gt: 1
            }
          }
        }
      })
    ])) as [ProductLineRecord[], number, Array<{ partNumber: string; _count: { partNumber: number } }>];

    const duplicateMap = new Map(
      duplicates.map((row: { partNumber: string; _count: { partNumber: number } }) => [row.partNumber, row._count.partNumber])
    );

    if (!lines.length && total === 0) {
      const exists = await prisma.importBatch.findUnique({
        where: { id },
        select: { id: true }
      });
      if (!exists) {
        reply.code(404);
        return { error: "Batch nao encontrado" };
      }
    }

    return {
      page,
      pageSize,
      total,
      lines: lines.map((line: ProductLineRecord) => ({
        id: line.id,
        partNumber: line.partNumber,
        unitPrice: Number((line.unitPriceCents / 100).toFixed(2)),
        rawPartNumber: line.rawPartNumber,
        correctionStatus: line.correctionStatus,
        suggestedPartNumber: line.suggestedPartNumber,
        correctionConfidence: line.correctionConfidence,
        resolvedAt: line.resolvedAt,
        resolvedBy: line.resolvedBy,
        resolutionNote: line.resolutionNote,
        isDuplicate: (duplicateMap.get(line.partNumber) ?? 0) > 1,
        duplicateCount: duplicateMap.get(line.partNumber) ?? 0
      }))
    };
  });

  app.post("/batches/:id/activate", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    try {
      await activateBatch(id);
    } catch (error) {
      const message = (error as Error).message;
      if (message === "not_found" || message === "no_month") {
        reply.code(404);
        return { error: "Batch ou mes nao encontrado" };
      }
      if (message === "not_completed") {
        reply.code(400);
        return { error: "Somente batches COMPLETED podem ser ativados" };
      }
      reply.code(500);
      return { error: "Falha ao ativar batch" };
    }

    return { message: "Batch ativado com sucesso" };
  });

  app.post("/batches/:id/review", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const body = request.body as {
      monthId?: number;
      year?: number;
      month?: number;
      day?: number;
      mapping?: {
        partNumber: string;
        unitPrice: string;
      };
    };

    const monthOverride = body.monthId
      ? await prisma.month.findUnique({ where: { id: body.monthId } })
      : body.year && body.month
        ? { year: body.year, month: body.month }
        : null;

    if (!monthOverride) {
      reply.code(400);
      return { error: "Mes invalido" };
    }

    const dayValue = typeof body.day === "number" ? body.day : null;
    if (dayValue === null || dayValue < 1 || dayValue > 31) {
      reply.code(400);
      return { error: "Dia invalido" };
    }

    if (!body.mapping?.partNumber || !body.mapping?.unitPrice) {
      reply.code(400);
      return { error: "Mapping invalido" };
    }

    const result = await reprocessBatch(id, {
      monthOverride: {
        year: monthOverride.year,
        month: monthOverride.month,
        day: dayValue
      },
      mappingOverride: body.mapping
    });

    if (result.status === "failed") {
      reply.code(400);
      return { error: result.reason ?? "Falha ao reprocessar" };
    }

    return { message: "Batch processado", batchId: result.batchId };
  });

  app.delete("/batches/:id", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const batch = await prisma.importBatch.findUnique({
      where: { id },
      select: { id: true, monthId: true }
    });

    if (!batch) {
      reply.code(404);
      return { error: "Batch nao encontrado" };
    }

    await prisma.importBatch.delete({ where: { id: batch.id } });

    if (batch.monthId) {
      const remaining = await prisma.importBatch.count({
        where: { monthId: batch.monthId }
      });
      if (remaining === 0) {
        await prisma.month.delete({ where: { id: batch.monthId } });
      }
    }

    return { message: "Batch removido", id: batch.id };
  });

  app.get("/batches/:id/preview", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const batch = await prisma.importBatch.findUnique({
      where: { id },
      include: { fileAsset: true }
    });

    if (!batch?.fileAsset) {
      reply.code(404);
      return { error: "Batch ou arquivo nao encontrado" };
    }

    const parsed = await parseWithFallback(batch.fileAsset, coerceFileType(batch.fileAsset.fileType));
    const headers = parsed.headers;
    const sampleRows = parsed.rows.slice(0, 5);
    const mapping = applyImagePreviewFallback(
      batch.fileAsset.fileType,
      headers,
      parsed.rows,
      detectHeaderMapping(headers)
    );
    const competenceText = parsed.rawLines && parsed.headerIndex !== undefined
      ? parsed.rawLines.slice(0, parsed.headerIndex).join(" ")
      : headers.join(" ");
    const headerCompetence = detectCompetenceFromText(competenceText);
    const filenameCompetence = detectCompetenceFromText(batch.fileAsset.originalFilename);

    const competence = headerCompetence ?? filenameCompetence;
    const competenceSource = headerCompetence ? "header" : filenameCompetence ? "filename" : null;
    const rawText = parsed.rawText ?? parsed.rawLines?.join(" ") ?? "";
    const dateFromContent = detectFullDateFromText(rawText);
    const dateFromFilename = detectFullDateFromText(batch.fileAsset.originalFilename);
    const fullDateValue = dateFromContent ?? dateFromFilename;
    const fullDate = fullDateValue ? formatFullDate(fullDateValue) : null;

    return {
      headers,
      sampleRows,
      mappingSuggestion: mapping,
      competence,
      competenceSource,
      fullDate
    };
  });
}

async function parseWithFallback(fileAsset: FileAsset, fileType: string) {
  try {
    return await parseFile(fileAsset.filePath, coerceFileType(fileType));
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      throw error;
    }

    const fallbackPath = await findFallbackPath(fileAsset.originalFilename);
    if (fallbackPath) {
      await prisma.fileAsset.update({
        where: { id: fileAsset.id },
        data: { filePath: fallbackPath }
      });
      return parseFile(fallbackPath, coerceFileType(fileType));
    }

    const localPath = await ensureLocalFilePath(fileAsset);
    return parseFile(localPath, coerceFileType(fileType));
  }
}

async function findFallbackPath(filename: string) {
  const candidates = [
    path.join(INBOX_DIR, filename),
    path.join(PENDING_REVIEW_DIR, filename),
    path.join(FAILED_DIR, filename)
  ];

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  if (await fileExists(PROCESSED_DIR)) {
    const found = await findFileRecursive(PROCESSED_DIR, filename);
    if (found) {
      return found;
    }
  }

  return null;
}

async function findFileRecursive(dir: string, filename: string): Promise<string | null> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findFileRecursive(fullPath, filename);
      if (found) {
        return found;
      }
    } else if (entry.name === filename) {
      return fullPath;
    }
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

function applyImagePreviewFallback(
  fileType: string,
  headers: string[],
  rows: Array<Record<string, string>>,
  mapping: { partNumber?: string; unitPrice?: string; confidence: { partNumber: number; unitPrice: number } }
) {
  if (!isImageType(fileType)) {
    return mapping;
  }

  const partHeader = mapping.partNumber;
  const shouldReplace = !partHeader || columnMostlyEmpty(rows, partHeader);
  if (!shouldReplace) {
    return mapping;
  }

  const descriptionHeader = findDescriptionHeader(headers);
  if (!descriptionHeader) {
    return mapping;
  }

  return {
    ...mapping,
    partNumber: descriptionHeader,
    confidence: {
      ...mapping.confidence,
      partNumber: Math.max(mapping.confidence.partNumber, 0.9)
    }
  };
}

function isImageType(fileType: string) {
  const normalized = normalizeHeaderValue(fileType);
  return normalized === "png" || normalized === "jpg" || normalized === "jpeg";
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
