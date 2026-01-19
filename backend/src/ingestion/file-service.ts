import crypto, { type BinaryLike } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { FileType } from "../constants.js";
import { normalizeHeaderValue } from "./mapper.js";

export async function hashFile(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    return crypto.createHash("sha256").update(buffer as unknown as BinaryLike).digest("hex");
}

export async function fileExists(filePath: string) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

export function coerceFileType(value: string): FileType {
    const normalized = normalizeHeaderValue(value);
    if (normalized === "csv") return FileType.CSV;
    if (normalized === "xlsx") return FileType.XLSX;
    if (normalized === "xls") return FileType.XLS;
    if (normalized === "png") return FileType.PNG;
    if (normalized === "jpg") return FileType.JPG;
    if (normalized === "jpeg") return FileType.JPEG;
    return FileType.CSV;
}

export function hasFullDateInName(fileName: string) {
    const normalized = fileName.toLowerCase();
    const yyyyMmDd = /20\d{2}[\/\-_.](0?[1-9]|1[0-2])[\/\-_.](0?[1-9]|[12]\d|3[01])/;
    const ddMmYyyy = /(0?[1-9]|[12]\d|3[01])[\/\-_.](0?[1-9]|1[0-2])[\/\-_.]20\d{2}/;
    return yyyyMmDd.test(normalized) || ddMmYyyy.test(normalized);
}

export function makeUniquePath(filePath: string) {
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    const dir = path.dirname(filePath);
    return path.join(dir, `${base}-${Date.now()}${ext}`);
}
