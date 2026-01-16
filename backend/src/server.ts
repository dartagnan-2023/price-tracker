import "dotenv/config";
import fs from "node:fs/promises";
import { buildApp } from "./app.js";
import { DATA_DIR, FAILED_DIR, INBOX_DIR, PENDING_REVIEW_DIR, PROCESSED_DIR } from "./config.js";
import { startWatcher } from "./watcher.js";

const app = buildApp();
const port = Number(process.env.PORT) || 3100;
const host = process.env.HOST ?? "0.0.0.0";

const start = async () => {
  try {
    await Promise.all([
      fs.mkdir(INBOX_DIR, { recursive: true }),
      fs.mkdir(DATA_DIR, { recursive: true }),
      fs.mkdir(PROCESSED_DIR, { recursive: true }),
      fs.mkdir(PENDING_REVIEW_DIR, { recursive: true }),
      fs.mkdir(FAILED_DIR, { recursive: true })
    ]);
    await app.listen({ port, host });
    startWatcher();
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

start();
