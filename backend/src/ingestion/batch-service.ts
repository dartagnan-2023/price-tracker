import { prisma } from "../db.js";
import { BatchStatus } from "../constants.js";
import { normalizeHeaderValue } from "./mapper.js";

export type BatchUpsertInput = {
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

export async function getOrCreateMonth(year: number, month: number) {
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

export function formatMonthLabel(year: number, month: number) {
    return `${year}-${month.toString().padStart(2, "0")}`;
}

export async function upsertBatch({
    existingBatchId,
    monthId,
    status,
    fileAssetId,
    pendingReason,
    ocrConfidenceAvg,
    mappingConfidence,
    competenceSource,
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

export async function hasActiveBatch(monthId: number, excludeBatchId?: number): Promise<boolean> {
    const active = await prisma.importBatch.findFirst({
        where: {
            monthId,
            isActive: true,
            ...(excludeBatchId ? { id: { not: excludeBatchId } } : {})
        }
    });
    return Boolean(active);
}

export type PendingReasonInput = {
    mapping: { partNumber?: string; unitPrice?: string; confidence: { partNumber: number; unitPrice: number } };
    mappingOk: boolean;
    detectedCompetence: { year: number; month: number } | null;
    ocrOk: boolean;
};

export function resolvePendingReason({ mapping, mappingOk, detectedCompetence, ocrOk }: PendingReasonInput): string | null {
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
