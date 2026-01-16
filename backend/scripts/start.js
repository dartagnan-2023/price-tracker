import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.resolve(backendRoot, "..", "data");
process.env.DATABASE_URL ??= `file:${path.join(dataDir, "price_tracker.db")}`;

const migrate = spawnSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit", cwd: backendRoot, shell: true });
if (migrate.status && migrate.status !== 0) {
  process.exit(migrate.status);
}

const serverPath = path.join(backendRoot, "dist", "server.js");
const server = spawn(process.execPath, [serverPath], { stdio: "inherit" });
server.on("exit", (code) => process.exit(code ?? 0));
