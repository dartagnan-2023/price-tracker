import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const envRoot = process.env.PRICE_TRACKER_ROOT;
export const ROOT_DIR = envRoot ? path.resolve(envRoot) : path.resolve(currentDir, "..", "..");
export const INBOX_DIR = path.join(ROOT_DIR, "inbox");
export const DATA_DIR = path.join(ROOT_DIR, "data");
export const PROCESSED_DIR = path.join(ROOT_DIR, "processed");
export const PENDING_REVIEW_DIR = path.join(ROOT_DIR, "pending_review");
export const FAILED_DIR = path.join(ROOT_DIR, "failed");

export const PARTNUMBER_AUTO_THRESHOLD = 0.92;
export const PARTNUMBER_REVIEW_THRESHOLD = 0.85;
