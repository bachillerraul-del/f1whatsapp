import dotenv from "dotenv";
dotenv.config();

import http from "http";
import QRCode from "qrcode";
import {
  startBot,
  currentQr,
  isBotConnected,
  currentSock,
  messagesCount,
  lastMessageLog,
} from "./bot.js";
import { prisma, getAllKnownActiveChatJids } from "./db.js";
import { pullSessionFromDb, pushSessionToDb } from "./session-sync.js";

const PORT = process.env.PORT || 3000;

async function getResolvedActiveChats(): Promise<Array<{ jid: string; name: string; type: "group" | "private" }>> {
  try {
    const jids = await getAllKnownActiveChatJids();
    const results: Array<{ jid: string; name: string; type: "group" | "private" }> = [];

    for (const jid of jids) {
      if (jid.endsWith("@g.us")) {
        let name = `Grupo (${jid.split("@")[0]})`;
        if (currentSock) {
          try {
            const meta = await currentSock.groupMetadata(jid);
            if (meta?.subject) name = meta.subject;
          } catch {}
        }
        results.push({ jid, name, type: "group" });
      } else {
        results.push({
          jid,
          name: `Chat privado (${jid.split("@")[0]})`,
          type: "private",
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

// HTTP Health Check and Web QR viewer
function startHealthServer() {
  const server = http.createServer(async (req, res) => {
    // Health Check endpoint
    if (req.url === "/health") {
      const activeChats = await getResolvedActiveChats();

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          service: "F1 WhatsApp Bot",
          connected: isBotConnected,
          activeChatsCount: activeChats.length,
          activeChats: activeChats.map((c) => ({ name: c.name, type: c.type })),
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    // Debug endpoint to diagnose WhatsApp status (sanitized by default)
    if (req.url?.startsWith("/debug")) {
      const reqUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const token = reqUrl.searchParams.get("token");
      const isAuthorized = Boolean(process.env.DEBUG_TOKEN && token === process.env.DEBUG_TOKEN);

      const activeChats = await getResolvedActiveChats();

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify(
          {
            connected: isBotConnected,
            registered: Boolean((currentSock?.authState as any)?.creds?.registered),
            activeChatsCount: activeChats.length,
            activeChats: activeChats.map((c) => ({
              name: c.name,
              type: c.type,
              ...(isAuthorized ? { jid: c.jid } : {}),
            })),
            messagesCount,
            uptime: Math.round(process.uptime()),
            timestamp: new Date().toISOString(),
            ...(isAuthorized
              ? {
                  user: currentSock?.user,
                  lastMessageLog,
                }
              : {}),
          },
          null,
          2
        )
      );
      return;
    }

    // QR Code visual web page
    if (req.url === "/qr" || req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });

      if (isBotConnected) {
        const activeChats = await getResolvedActiveChats();
        const chatItemsHtml =
          activeChats.length > 0
            ? activeChats
                .map(
                  (c) =>
                    `<li style="padding: 8px 12px; border-bottom: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center;">
                      <span>${c.type === "group" ? "👥" : "👤"} <b>${c.name.replace(/</g, "&lt;")}</b></span>
                      <span style="color: #3fb950; font-size: 0.8rem;">🟢 Activo</span>
                    </li>`
                )
                .join("")
            : `<li style="padding: 12px; color: #8b949e;">Ningún chat activo actualmente. Escribe <b>!bot on</b> en un grupo para activarlo.</li>`;

        res.end(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>F1 Bot WhatsApp - Conectado</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0d1117; color: #fff; text-align: center; padding: 40px 20px; }
              .card { background: #161b22; max-width: 520px; margin: 0 auto; padding: 30px; border-radius: 16px; border: 1px solid #30363d; }
              .badge { display: inline-block; background: #238636; color: #fff; padding: 6px 14px; border-radius: 20px; font-weight: bold; margin-bottom: 20px; }
              h1 { margin-bottom: 10px; }
              p { color: #8b949e; line-height: 1.6; }
              .chat-list { list-style: none; padding: 0; margin: 20px 0 0; background: #0d1117; border-radius: 10px; border: 1px solid #30363d; text-align: left; overflow: hidden; }
              .chat-header { background: #21262d; padding: 10px 14px; font-weight: 600; font-size: 0.9rem; color: #c9d1d9; border-bottom: 1px solid #30363d; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="badge">🟢 EN LÍNEA</div>
              <h1>🏎️ Bot de F1 & MotoGP Conectado</h1>
              <p>El bot está vinculado correctamente a WhatsApp. Las alertas automáticas solo se envían a los chats autorizados y activos:</p>
              <div class="chat-list">
                <div class="chat-header">📊 Chats Activos (${activeChats.length})</div>
                <ul style="list-style: none; padding: 0; margin: 0;">
                  ${chatItemsHtml}
                </ul>
              </div>
              <p style="margin-top: 20px; font-size: 0.9rem;">Usa <b>!bot on</b> o <b>!bot off</b> en WhatsApp para activar o desactivar un grupo.</p>
            </div>
          </body>
          </html>
        `);
        return;
      }

      if (currentQr) {
        try {
          const qrDataUrl = await QRCode.toDataURL(currentQr, { width: 320, margin: 2 });
          res.end(`
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <meta http-equiv="refresh" content="7">
              <title>Vincular WhatsApp - F1 Bot</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0d1117; color: #fff; text-align: center; padding: 40px 20px; }
                .card { background: #161b22; max-width: 480px; margin: 0 auto; padding: 30px; border-radius: 16px; border: 1px solid #30363d; }
                img { border-radius: 12px; background: #fff; padding: 12px; margin: 20px 0; max-width: 100%; height: auto; }
                .sub { color: #8b949e; font-size: 0.9rem; margin-top: 15px; }
              </style>
            </head>
            <body>
              <div class="card">
                <h1>🏎️ Vincula tu WhatsApp</h1>
                <p>1. Abre WhatsApp en tu teléfono.<br>2. Ve a <b>Dispositivos vinculados > Vincular un dispositivo</b>.<br>3. Escanea este código:</p>
                <img src="${qrDataUrl}" alt="Código QR WhatsApp" />
                <p class="sub">🔄 Esta página se actualiza automáticamente cada 7 segundos.</p>
              </div>
            </body>
            </html>
          `);
          return;
        } catch (e: any) {
          console.error("Error generando QR data URL:", e.message);
        }
      }

      // Waiting for QR or initializing
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <meta http-equiv="refresh" content="3">
          <title>Iniciando F1 Bot...</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0d1117; color: #fff; text-align: center; padding: 60px 20px; }
            .card { background: #161b22; max-width: 480px; margin: 0 auto; padding: 30px; border-radius: 16px; border: 1px solid #30363d; }
            p { color: #8b949e; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>⏳ Generando código QR...</h1>
            <p>Espera unos segundos mientras el bot se conecta a los servidores de WhatsApp.</p>
          </div>
        </body>
        </html>
      `);
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(PORT, () => {
    console.log(`🌐 Servidor HTTP activo en el puerto ${PORT} (Health Check & QR Dashboard)`);
  });
}

async function main() {
  console.log("🏎️ Iniciando Bot de WhatsApp para Fórmula 1...");

  // Start health & QR web server
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
