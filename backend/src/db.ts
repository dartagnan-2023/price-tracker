import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

if (!process.env.DATABASE_URL) {
  const candidates = [
    path.join(process.cwd(), "data", "price_tracker.db"),
    path.join(process.cwd(), "..", "data", "price_tracker.db"),
    path.join(process.cwd(), "..", "..", "data", "price_tracker.db")
  ];

  let dbPath = candidates[0];
  for (const candidate of candidates) {
    if (fs.existsSync(path.dirname(candidate))) {
      dbPath = candidate;
      break;
    }
  }

  process.env.DATABASE_URL = `file:${dbPath}`;
}

export const prisma = new PrismaClient();
