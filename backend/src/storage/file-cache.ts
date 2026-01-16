import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FileAsset } from "@prisma/client";
import { downloadFileFromSupabase, isSupabaseConfigured } from "./supabase.js";

const CACHE_DIR = path.join(os.tmpdir(), "price-tracker", "uploads");

export async function ensureLocalFilePath(fileAsset: FileAsset): Promise<string> {
  try {
    await fs.access(fileAsset.filePath);
    return fileAsset.filePath;
  } catch {
    if (!isSupabaseConfigured() || !fileAsset.storagePath) {
      throw new Error(`Arquivo nao encontrado e sem storage remoto: ${fileAsset.filePath}`);
    }
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const targetPath = path.join(CACHE_DIR, `${fileAsset.id}-${Date.now()}-${path.basename(fileAsset.filePath)}`);
    await downloadFileFromSupabase(fileAsset.storagePath, targetPath);
    return targetPath;
  }
}
