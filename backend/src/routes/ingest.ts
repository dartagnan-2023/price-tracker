import type { FastifyInstance } from "fastify";
import type { FastifyRequest } from "fastify";
import type { MultipartFile } from "@fastify/multipart";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { INBOX_DIR } from "../config.js";
import { processFile } from "../ingestion/worker.js";

export async function ingestRoutes(app: FastifyInstance) {
  app.post("/ingest/manual", async (request, reply) => {
    const body = request.body as { filename?: string };
    if (!body.filename) {
      reply.code(400);
      return { error: "filename obrigatorio" };
    }

    const filePath = path.join(INBOX_DIR, body.filename);
    try {
      await fs.access(filePath);
    } catch {
      reply.code(404);
      return { error: "Arquivo nao encontrado" };
    }
    const result = await processFile(filePath, { forceReimport: true });

    if (result.status === "failed") {
      reply.code(400);
      return { error: result.reason ?? "Erro ao processar" };
    }

    return { message: "Processamento iniciado", batchId: result.batchId };
  });

  app.post("/ingest/upload", async (request, reply) => {
    type UploadRequest = FastifyRequest & {
      file: () => Promise<MultipartFile | undefined>;
    };
    const uploadRequest = request as UploadRequest;
    const data = await uploadRequest.file();
    if (!data) {
      reply.code(400);
      return { error: "Arquivo obrigatorio" };
    }

    await fs.mkdir(INBOX_DIR, { recursive: true });

    const originalName = path.basename(data.filename || "upload.bin");
    const targetPath = await resolveUniquePath(path.join(INBOX_DIR, originalName));

    await pipeline(data.file, createWriteStream(targetPath));

    const result = await processFile(targetPath, { forceReimport: true });

    if (result.status === "failed") {
      reply.code(400);
      return { error: result.reason ?? "Falha ao processar" };
    }

    return {
      message: "Arquivo enviado e processado",
      filename: path.basename(targetPath),
      status: result.status,
      batchId: result.batchId
    };
  });
}

async function resolveUniquePath(filePath: string) {
  if (!(await fileExists(filePath))) {
    return filePath;
  }
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const dir = path.dirname(filePath);
  return path.join(dir, `${base}-${Date.now()}${ext}`);
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
