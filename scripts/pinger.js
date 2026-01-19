import fetch from "node-fetch";

const TARGET = process.env.PING_URL ?? "https://price-tracker-fxjx.onrender.com";
const INTERVAL_MS = 5 * 60 * 1000;

async function ping() {
  try {
    const response = await fetch(TARGET, { method: "GET" });
    console.log(`[pinger] ${new Date().toISOString()} ${response.status}`);
  } catch (error) {
    console.warn("[pinger] erro", error);
  }
}

(async () => {
  console.log(`[pinger] iniciando para ${TARGET} (intervalo ${INTERVAL_MS}ms)`);
  await ping();
  setInterval(ping, INTERVAL_MS);
})();
