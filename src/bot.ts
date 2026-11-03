import fs from "fs";
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
  getNextMotoGP,
  getMotoGPStandings,
  getMotoGPConstructors,
  getLastMotoGPResults,
} from "./motogp.js";
import {
  addSubscriber,
  removeSubscriber,
  isSubscribed,
  prisma,
} from "./db.js";
import { setupAlerts } from "./alerts.js";
import { pushSessionToDb } from "./session-sync.js";

export let currentQr: string | null = null;
export let isBotConnected: boolean = false;
export let currentSock: WASocket | null = null;
export let messagesCount: number = 0;
export let lastMessageLog: string | null = null;

const GENERAL_HELP_MESSAGE = `🏁 *MOTORSPORT BOT - F1 & MOTOGP* 🏁\n` +
  `━━━━━━━━━━━━━━━━━━━━━\n` +
  `🏎️ *FÓRMULA 1:*\n` +
  `🔹 *!f1 prox* : Próximo GP y horarios (hora España)\n` +
  `🔹 *!f1 pilotos* : Clasificación del mundial\n` +
  `🔹 *!f1 constructores* : Clasificación de escuderías\n` +
  `🔹 *!f1 ult* : Resultados de la última carrera\n\n` +
  `🏍️ *MOTOGP:*\n` +
  `🔹 *!motogp prox* : Próximo GP y horarios (hora España)\n` +
  `🔹 *!motogp pilotos* : Clasificación del mundial\n` +
  `🔹 *!motogp constructores* : Clasificación de marcas\n` +
  `🔹 *!motogp ult* : Resultados del último Gran Premio\n\n` +
  `🔔 *ALERTAS AUTOMÁTICAS:*\n` +
  `🔹 *!f1 suscribir* : Recibir las 3 alertas clave de cada GP\n` +
  `🔹 *!f1 desuscribir* : Cancelar suscripción\n` +
  `🔹 *!f1 estado* : Ver estado de tu suscripción\n` +
  `━━━━━━━━━━━━━━━━━━━━━\n` +
  `💡 _Envía cualquier comando en el chat para obtener la información._`;

const MOTOGP_HELP_MESSAGE = `🏍️ *BOT DE MOTOGP - COMANDOS* 🏁\n` +
  `━━━━━━━━━━━━━━━━━━━━━\n` +
  `🔹 *!motogp prox* : Próximo GP y horarios oficiales (hora peninsular)\n` +
  `🔹 *!motogp pilotos* : Clasificación del mundial de pilotos\n` +
  `🔹 *!motogp constructores* : Clasificación de marcas y equipos\n` +
  `🔹 *!motogp ult* : Resultados de la última carrera disputada\n` +
  `━━━━━━━━━━━━━━━━━━━━━\n` +
  `💡 _Escribe *!ayuda* para ver todos los deportes (F1 + MotoGP)._`;

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

  currentSock = sock;

  sock.ev.on("creds.update", async () => {
    await saveCreds();
    await pushSessionToDb();
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQr = qr;
      isBotConnected = false;
      console.log("\n==========================================");
      console.log("📲 ESCANEA ESTE CÓDIGO QR CON WHATSAPP:");
      console.log("(Abre WhatsApp > Dispositivos vinculados > Vincular un dispositivo)");
      console.log("O abre en el navegador: https://f1whatsapp.onrender.com/qr");
      console.log("==========================================\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      isBotConnected = false;
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;

      console.log(`🔌 Conexión cerrada (Código: ${statusCode}). Desconectado permanente: ${isLoggedOut}`);

      if (isLoggedOut) {
        console.log("❌ Sesión cerrada por WhatsApp. Limpiando credenciales antiguas para generar nuevo QR...");
        try {
          await prisma.sessionFile.deleteMany();
          if (fs.existsSync("auth_info_baileys")) {
            fs.rmSync("auth_info_baileys", { recursive: true, force: true });
          }
        } catch (e: any) {
          console.error("Error al limpiar sesión antigua:", e.message);
        }
        startBot();
      } else {
        startBot();
      }
    } else if (connection === "open") {
      currentQr = null;
      isBotConnected = true;
      console.log("\n🟢 ¡BOT DE F1 & MOTOGP CONECTADO EXITOSAMENTE A WHATSAPP! 🏁🏎️🏍️\n");
      await pushSessionToDb();
      setupAlerts(sock);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    for (const msg of messages) {
      if (!msg.message) continue;

      const rawText = extractText(msg);
      const cleanText = rawText.trim().toLowerCase();

      messagesCount++;
      lastMessageLog = `[${new Date().toISOString()}] fromMe=${msg.key.fromMe} text="${cleanText.slice(0, 50)}" from=${msg.key.remoteJid}`;

      // Only respond to supported prefixes
      const isF1 = cleanText.startsWith("!f1");
      const isMotoGP = cleanText.startsWith("!motogp") || cleanText.startsWith("!moto") || cleanText.startsWith("!gp");
      const isGeneralHelp = cleanText === "!ayuda" || cleanText === "!help" || cleanText === "!menu";

      if (!isF1 && !isMotoGP && !isGeneralHelp) continue;

      const remoteJid = msg.key.remoteJid;
      if (!remoteJid) continue;

      const pushName = msg.pushName || "Fan del Motorsport";
      console.log(`📩 [Comando detectado] "${cleanText}" de ${pushName} (${remoteJid})`);

      try {
        // GENERAL HELP
        if (isGeneralHelp || cleanText === "!f1" || cleanText === "!f1 ayuda" || cleanText === "!f1 help") {
          await sock.sendMessage(remoteJid, { text: GENERAL_HELP_MESSAGE });
          continue;
        }

        // MOTOGP COMMANDS
        if (isMotoGP) {
          if (cleanText === "!motogp" || cleanText === "!motogp ayuda" || cleanText === "!motogp help" || cleanText === "!moto" || cleanText === "!gp") {
            await sock.sendMessage(remoteJid, { text: MOTOGP_HELP_MESSAGE });
          } else if (cleanText.includes("prox") || cleanText.includes("next") || cleanText.includes("horario")) {
            await sock.sendPresenceUpdate("composing", remoteJid);
            const response = await getNextMotoGP();
            await sock.sendMessage(remoteJid, { text: response });
          } else if (cleanText.includes("piloto") || cleanText.includes("driver") || cleanText.includes("standing") || cleanText.includes("rider")) {
            await sock.sendPresenceUpdate("composing", remoteJid);
            const response = await getMotoGPStandings();
            await sock.sendMessage(remoteJid, { text: response });
          } else if (cleanText.includes("constructor") || cleanText.includes("equipo") || cleanText.includes("team") || cleanText.includes("marca")) {
            await sock.sendPresenceUpdate("composing", remoteJid);
            const response = await getMotoGPConstructors();
            await sock.sendMessage(remoteJid, { text: response });
          } else if (cleanText.includes("ult") || cleanText.includes("resultado") || cleanText.includes("result") || cleanText.includes("last")) {
            await sock.sendPresenceUpdate("composing", remoteJid);
            const response = await getLastMotoGPResults();
            await sock.sendMessage(remoteJid, { text: response });
          } else {
            await sock.sendMessage(remoteJid, { text: MOTOGP_HELP_MESSAGE });
          }
          continue;
        }

        // F1 COMMANDS
        if (isF1) {
          if (cleanText.includes("prox") || cleanText.includes("next") || cleanText.includes("horario")) {
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
              text: `✅ ¡Te has suscrito exitosamente a las alertas automáticas de F1 y MotoGP, *${pushName}*! 🎉\n\nRecibirás únicamente 3 alertas por Gran Premio:\n1️⃣ *24h antes de FP1* con todos los horarios del fin de semana\n2️⃣ *2h antes del Sprint*\n3️⃣ *2h antes de la Carrera Principal*\n\nPuedes cancelar en cualquier momento con *!f1 desuscribir*.`,
            });
          } else if (cleanText.includes("desuscribir") || cleanText.includes("cancelar")) {
            await removeSubscriber(remoteJid);
            await sock.sendMessage(remoteJid, {
              text: `ℹ️ Te has desuscrito de las alertas. Ya no recibirás recordatorios automáticos. Escribe *!f1 suscribir* si cambias de opinión.`,
            });
          } else if (cleanText.includes("estado") || cleanText.includes("status")) {
            const subscribed = await isSubscribed(remoteJid);
            const statusText = subscribed
              ? `🟢 *Activo*: Estás suscrito y recibirás alertas antes de cada carrera/sesión.`
              : `🔴 *Inactivo*: No estás suscrito a las alertas automáticas. Escribe *!f1 suscribir* para activarlas.`;
            await sock.sendMessage(remoteJid, { text: `📊 *Estado de tu suscripción:*\n${statusText}` });
          } else {
            await sock.sendMessage(remoteJid, {
              text: `❓ Comando no reconocido.\n\nEscribe *!f1 ayuda* o *!motogp ayuda* para ver los comandos válidos.`,
            });
          }
        }
      } catch (err: any) {
        console.error("❌ Error procesando comando:", err?.message);
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
