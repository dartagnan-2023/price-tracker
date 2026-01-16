import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_BUCKET, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "../config.js";

let supabaseClient = null as ReturnType<typeof createClient> | null;

if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseClient && SUPABASE_BUCKET);
}

export async function uploadFileToSupabase(localPath: string, destination: string) {
  if (!supabaseClient || !SUPABASE_BUCKET) {
    return null;
  }
  const bucket = supabaseClient.storage.from(SUPABASE_BUCKET);
  const buffer = await fs.readFile(localPath);
  const { error } = await bucket.upload(destination, buffer, { upsert: true });
  if (error) {
    throw error;
  }
  const { data } = bucket.getPublicUrl(destination);
  return { path: destination, url: data.publicUrl };
}

export async function downloadFileFromSupabase(storagePath: string, targetPath: string) {
  if (!supabaseClient || !SUPABASE_BUCKET) {
    throw new Error("Supabase storage not configured");
  }
  const bucket = supabaseClient.storage.from(SUPABASE_BUCKET);
  const { data, error } = await bucket.download(storagePath);
  if (error || !data) {
    throw error ?? new Error("Failed to download asset");
  }
  const buffer = Buffer.from(await data.arrayBuffer());
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, buffer);
  return targetPath;
}
