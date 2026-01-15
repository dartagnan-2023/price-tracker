import chokidar from "chokidar";
import path from "node:path";
import { INBOX_DIR } from "./config.js";
import { processFile } from "./ingestion/worker.js";

const IGNORED_PATTERNS = [".tmp", "~$", ".DS_Store", "Thumbs.db"];

export function startWatcher() {
  const watcher = chokidar.watch(INBOX_DIR, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 1000,
      pollInterval: 100
    },
    ignored: (filePath) => {
      const base = path.basename(filePath);
      return IGNORED_PATTERNS.some((pattern) => base.includes(pattern));
    }
  });

  watcher.on("add", async (filePath) => {
    try {
      const result = await processFile(filePath);
      if (result.status === "duplicate") {
        console.info(`[watcher] Duplicado ignorado: ${filePath}`);
      } else {
        console.info(`[watcher] Processado ${filePath}: ${result.status}`);
      }
    } catch (error) {
      console.error(`[watcher] Erro ao processar ${filePath}`, error);
    }
  });

  watcher.on("error", (error) => {
    console.error("[watcher] Erro no watcher", error);
  });

  console.info(`[watcher] Monitorando ${INBOX_DIR}`);

  return watcher;
}
