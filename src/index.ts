import dotenv from "dotenv";
dotenv.config();

import http from "http";
import { startBot } from "./bot.js";
import { prisma } from "./db.js";
import { pullSessionFromDb, pushSessionToDb } from "./session-sync.js";

const PORT = process.env.PORT || 3000;

// HTTP Health Check server for Cloud hosting (Render, Railway, Koyeb, etc.)
function startHealthServer() {
  const server = http.createServer((req, res) => {
    if (req.url === "/health" || req.url === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          service: "F1 WhatsApp Bot",
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
        })
      );
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(PORT, () => {
    console.log(`🌐 Servidor HTTP activo en el puerto ${PORT} (Health Check para la nube)`);
  });
}

async function main() {
  console.log("🏎️ Iniciando Bot de WhatsApp para Fórmula 1...");

  // Start health server for cloud environments
  startHealthServer();

  // Verify DB connection
  try {
    await prisma.$connect();
    console.log("✅ Conexión con Supabase PostgreSQL establecida correctamente.");
  } catch (err: any) {
    console.error("⚠️ Advertencia: No se pudo conectar a la base de datos:", err?.message);
  }

  // Restore session from Supabase if running in a new cloud container
  await pullSessionFromDb();

  // Start WhatsApp bot
  await startBot();

  // Periodically back up session files to Supabase (every 10 minutes)
  setInterval(async () => {
    await pushSessionToDb();
  }, 10 * 60 * 1000);
}

main().catch((err) => {
  console.error("❌ Error crítico en el bot:", err);
  process.exit(1);
});
