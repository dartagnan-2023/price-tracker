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

const envSecret = process.env.AUTH_SECRET;
const fallbackSecret = envSecret ?? (process.env.NODE_ENV === "production" ? undefined : "dev-secret");

if (!fallbackSecret) {
  throw new Error("AUTH_SECRET must be set in production");
}

export const AUTH_SECRET = fallbackSecret;
export const AUTH_USER = process.env.AUTH_USER ?? "admin";
export const AUTH_PASSWORD = process.env.AUTH_PASSWORD ?? "password";
export const AUTH_ALLOW_UNAUTH = process.env.AUTH_ALLOW_UNAUTH === "true";

export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET ?? "price-tracker-uploads";
