import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  type WASocket,
  type WAMessage,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import pino from "pino";
import { Boom } from "@hapi/boom";
import {
  getNextRace,
  getDriverStandings,
  getConstructorStandings,
  getLastRaceResults,
} from "./f1.js";
import {
  addSubscriber,
  removeSubscriber,
  isSubscribed,
} from "./db.js";
import { setupAlerts } from "./alerts.js";
import { pushSessionToDb } from "./session-sync.js";

const HELP_MESSAGE = `🏎️ *BOT DE FÓRMULA 1 - COMANDOS* 🏁\n` +
  `━━━━━━━━━━━━━━━━━━━━━\n` +
  `🔹 *!f1 prox* : Ver próxima carrera y horarios de sesiones\n` +
  `🔹 *!f1 pilotos* : Clasificación del campeonato de pilotos\n` +
  `🔹 *!f1 constructores* : Clasificación del mundial de equipos\n` +
  `🔹 *!f1 ult* : Resultados del último Gran Premio disputado\n` +
  `🔹 *!f1 suscribir* : Recibir alertas automáticas antes de cada carrera/sesión\n` +
  `🔹 *!f1 desuscribir* : Dejar de recibir notificaciones\n` +
  `🔹 *!f1 estado* : Ver si estás suscrito a las alertas\n` +
  `━━━━━━━━━━━━━━━━━━━━━\n` +
  `💡 _Envía cualquiera de estos comandos en el chat para obtener la información al instante._`;

function extractText(msg: WAMessage): string {
  const m = msg.message;
  if (!m) return "";

  const unwrapped =
    (m as any).ephemeralMessage?.message ||
    (m as any).viewOnceMessage?.message ||
    (m as any).viewOnceMessageV2?.message ||
    (m as any).documentWithCaptionMessage?.message ||
    m;

  return (
    unwrapped.conversation ||
    unwrapped.extendedTextMessage?.text ||
    unwrapped.imageMessage?.caption ||
    unwrapped.videoMessage?.caption ||
    ""
  );
}

export async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");
  const { version } = await fetchLatestBaileysVersion();

  const sock: WASocket = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    auth: state,
  });

  sock.ev.on("creds.update", async () => {
    await saveCreds();
    await pushSessionToDb();
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\n==========================================");
      console.log("📲 ESCANEA ESTE CÓDIGO QR CON WHATSAPP:");
      console.log("(Abre WhatsApp > Dispositivos vinculados > Vincular un dispositivo)");
      console.log("==========================================\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(`🔌 Conexión cerrada (Código: ${statusCode}). Reconectando: ${shouldReconnect}`);
      if (shouldReconnect) {
        startBot();
      } else {
        console.log("❌ Sesión cerrada permanentemente. Elimina auth_info_baileys y escanea de nuevo.");
      }
    } else if (connection === "open") {
      console.log("\n🟢 ¡BOT DE F1 CONECTADO EXITOSAMENTE A WHATSAPP! 🏁🏎️\n");
      console.log("👉 Prueba enviar *!f1* o *!f1 prox* en cualquier chat o en tu propio chat de WhatsApp.\n");
      setupAlerts(sock);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    for (const msg of messages) {
      if (!msg.message) continue;

      const rawText = extractText(msg);
      const cleanText = rawText.trim().toLowerCase();

      // Ignore messages that do not start with !f1
      if (!cleanText.startsWith("!f1")) continue;

      const remoteJid = msg.key.remoteJid;
      if (!remoteJid) continue;

      const pushName = msg.pushName || "Fan de F1";
      console.log(`📩 [Comando detectado] "${cleanText}" de ${pushName} (${remoteJid}) [fromMe=${msg.key.fromMe}]`);

      try {
        if (cleanText === "!f1" || cleanText === "!f1 ayuda" || cleanText === "!f1 help") {
          await sock.sendMessage(remoteJid, { text: HELP_MESSAGE });
        } else if (cleanText.includes("prox") || cleanText.includes("next")) {
          await sock.sendPresenceUpdate("composing", remoteJid);
          const response = await getNextRace();
          await sock.sendMessage(remoteJid, { text: response });
        } else if (cleanText.includes("piloto") || cleanText.includes("driver") || cleanText.includes("standing")) {
          await sock.sendPresenceUpdate("composing", remoteJid);
          const response = await getDriverStandings();
          await sock.sendMessage(remoteJid, { text: response });
        } else if (cleanText.includes("constructor") || cleanText.includes("equipo") || cleanText.includes("team")) {
          await sock.sendPresenceUpdate("composing", remoteJid);
          const response = await getConstructorStandings();
          await sock.sendMessage(remoteJid, { text: response });
        } else if (cleanText.includes("ult") || cleanText.includes("resultado") || cleanText.includes("result") || cleanText.includes("last")) {
          await sock.sendPresenceUpdate("composing", remoteJid);
          const response = await getLastRaceResults();
          await sock.sendMessage(remoteJid, { text: response });
        } else if (cleanText.includes("suscribir") || cleanText.includes("activar")) {
          await addSubscriber(remoteJid, pushName);
          await sock.sendMessage(remoteJid, {
            text: `✅ ¡Te has suscrito exitosamente a las alertas de F1, *${pushName}*! 🎉\n\nTe avisaremos antes de que comiencen las sesiones y carreras. Puedes cancelar en cualquier momento con *!f1 desuscribir*.`,
          });
        } else if (cleanText.includes("desuscribir") || cleanText.includes("cancelar")) {
          await removeSubscriber(remoteJid);
          await sock.sendMessage(remoteJid, {
            text: `ℹ️ Te has desuscrito de las alertas de F1. Ya no recibirás recordatorios automáticos. Escribe *!f1 suscribir* si cambias de opinión.`,
          });
        } else if (cleanText.includes("estado") || cleanText.includes("status")) {
          const subscribed = await isSubscribed(remoteJid);
          const statusText = subscribed
            ? `🟢 *Activo*: Estás suscrito y recibirás alertas antes de cada sesión.`
            : `🔴 *Inactivo*: No estás suscrito a las alertas automáticas. Escribe *!f1 suscribir* para activarlas.`;
          await sock.sendMessage(remoteJid, { text: `📊 *Estado de tu suscripción:*\n${statusText}` });
        } else {
          await sock.sendMessage(remoteJid, {
            text: `❓ Comando no reconocido.\n\nEscribe *!f1 ayuda* para ver los comandos válidos.`,
          });
        }
      } catch (err: any) {
        console.error("❌ Error procesando comando F1:", err?.message);
        try {
          await sock.sendMessage(remoteJid, {
            text: `⚠️ Ocurrió un error al procesar tu solicitud. Por favor intenta de nuevo en unos momentos.`,
          });
        } catch {}
      }
    }
  });

  return sock;
}
