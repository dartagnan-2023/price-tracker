import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db.js";
import { BatchStatus } from "../constants.js";
import { FAILED_DIR, PENDING_REVIEW_DIR, PROCESSED_DIR } from "../config.js";
import { uploadFileToSupabase, isSupabaseConfigured } from "../storage/supabase.js";
import { FileAsset } from "@prisma/client";
import { fileExists, makeUniquePath } from "./file-service.js";

export async function moveFileAndUpdateAsset({ fileAssetId, filePath, status, monthLabel }: {
    fileAssetId: number;
    filePath: string;
    status: BatchStatus;
    monthLabel: string | null;
}) {
    const destinationDir = resolveDestinationDir(status, monthLabel);
    if (!destinationDir) return;

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
            console.error("[storage] Falha ao mover arquivo", error);
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

export async function ensureSupabaseStorage(fileAsset: FileAsset, localPath: string, fileHash: string) {
    if (!isSupabaseConfigured() || fileAsset.storagePath) {
        return;
    }

    const dateFolder = new Date().toISOString().split("T")[0];
    const fileName = encodeURIComponent(path.basename(localPath));
    const storageKey = path.posix.join("imports", dateFolder, `${fileHash}-${fileName}`);

    try {
        const uploaded = await uploadFileToSupabase(localPath, storageKey);
        if (uploaded) {
            await prisma.fileAsset.update({
                where: { id: fileAsset.id },
                data: {
                    storagePath: uploaded.path,
                    storageUrl: uploaded.url
                }
            });
        }
    } catch (error) {
        console.warn("[storage] erro ao fazer upload para Supabase:", (error as Error).message ?? error);
    }
}
