import { prisma } from "../db.js";
import { CorrectionStatus } from "../constants.js";
import { findBestMatch } from "./partnumber.js";
import { PARTNUMBER_AUTO_THRESHOLD, PARTNUMBER_REVIEW_THRESHOLD } from "../config.js";

export type CorrectionResult = {
    partNumber: string;
    status: CorrectionStatus;
    suggestedPartNumber: string | null;
    confidence: number | null;
};

export async function loadKnownPartNumbers(currentBatchId: number): Promise<string[]> {
    const rows = await prisma.productLine.groupBy({
        by: ["partNumber"],
        where: { importBatchId: { not: currentBatchId } },
        _count: { partNumber: true }
    });

    return rows.map((row) => row.partNumber);
}

export function applyPartNumberCorrection(partNumber: string, knownPartNumbers: string[]): CorrectionResult {
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
