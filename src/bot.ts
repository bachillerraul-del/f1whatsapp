import fs from "fs";
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
  type WAMessage,
  type CacheStore,
  type proto,
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
  isBotActiveInChat,
  setBotActiveInChat,
  prisma,
} from "./db.js";
import { setupAlerts, runAlertsCycle } from "./alerts.js";
import { pushSessionToDb, schedulePushSessionToDb, clearSessionCache } from "./session-sync.js";
import { handlePorraCommand, showSeasonRanking } from "./porra.js";

export let currentQr: string | null = null;
export let isBotConnected: boolean = false;
export let currentSock: WASocket | null = null;
export let messagesCount: number = 0;
export let lastMessageLog: string | null = null;

let reconnectAttempts = 0;
let reconnectTimer: NodeJS.Timeout | null = null;

function scheduleReconnect(delayMs: number) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startBot().catch((err) => {
      console.error("Error al reconectar el bot:", err?.message);
    });
  }, delayMs);
}

class SimpleCacheStore implements CacheStore {
  private cache = new Map<string, any>();

  get<T>(key: string): T | undefined {
    return this.cache.get(key);
  }
  set<T>(key: string, value: T): void {
    this.cache.set(key, value);
    if (this.cache.size > 3000) {
      const first = this.cache.keys().next().value;
      if (first) this.cache.delete(first);
    }
  }
  del(key: string): void {
    this.cache.delete(key);
  }
  flushAll(): void {
    this.cache.clear();
  }
}

// In-memory cache de mensajes para responder a reintentos E2E (elimina "Esperando mensaje...")
const messageStore = new Map<string, proto.IMessage>();

export function saveMessageToStore(id: string, message: proto.IMessage) {
  messageStore.set(id, message);
  if (messageStore.size > 3000) {
    const firstKey = messageStore.keys().next().value;
    if (firstKey) messageStore.delete(firstKey);
  }
}

const GENERAL_HELP_MESSAGE = `🏁 *MOTORSPORT BOT - GUÍA DE COMANDOS* 🏁\n` +
  `━━━━━━━━━━━━━━━━━━━━━\n` +
  `🏎️ *FÓRMULA 1 (` + "`!f1`" + `)* y 🏍️ *MOTOGP (` + "`!moto`" + `)*\n` +
  `🔹 *!f1* / *!moto* : Próximo GP y horarios (hora España)\n` +
  `🔹 *!f1 pilotos* / *!moto pilotos* : Mundial de pilotos\n` +
  `🔹 *!f1 equipos* / *!moto equipos* : Mundial de constructores\n` +
  `🔹 *!f1 ult* / *!moto ult* : Resultados de la última carrera\n\n` +
  `🏆 *LA PORRA (` + "`!porra`" + ` F1 | ` + "`!porramoto`" + ` MotoGP)*\n` +
  `🔹 *!porra [1º..5º] [DNF] [QP3]* : Enviar apuesta\n` +
  `🔹 *!porra ver* : Ver apuestas del grupo y de las IAs\n` +
  `🔹 *!porra puntos* : Calcular resultados y podio del GP\n` +
  `🔹 *!porra tabla* : Clasificación general (suma de puntos)\n` +
  `🔹 *!porra historial* : Resumen de GPs de la temporada\n` +
  `🔹 *!porra ia* : Pronósticos de las IAs / auditar apuesta\n` +
  `🔹 *!porra reglas* : Puntuación y normas\n` +
  `_(Para MotoGP usa *!porramoto* o *!porra moto*)_\n\n` +
  `🔔 *CONTROL DEL BOT*\n` +
  `🔹 *!bot on* / *off* : Activar o silenciar el bot y sus avisos automáticos en este chat\n` +
  `━━━━━━━━━━━━━━━━━━━━━\n` +
  `💡 _Las alertas (24h antes de FP1, 2h antes de Qualy y resultados tras la carrera) llegan automáticamente mientras el bot esté activo._`;

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

async function handleAlertSubscriptionCommand(
  sock: WASocket,
  remoteJid: string,
  _pushName: string,
  subCommand: string
) {
  if (subCommand === "off" || subCommand === "desactivar" || subCommand === "desuscribir" || subCommand === "cancelar") {
    await setBotActiveInChat(remoteJid, false);
    await sock.sendMessage(remoteJid, {
      text: `🔴 *Bot y alertas desactivados en este chat.*\nPara volver a activarlos cuando quieras, escribe *!bot on*.`,
    });
  } else {
    await setBotActiveInChat(remoteJid, true);
    await sock.sendMessage(remoteJid, {
      text: `🟢 *¡Alertas automáticas activas!* 🎉\n\n` +
        `Ya *no es necesario suscribirse*: mientras el bot esté activo en este chat (*!bot on*), recibirás automáticamente:\n` +
        `1️⃣ *24h antes de la 1ª sesión (FP1)* con todos los horarios del GP.\n` +
        `2️⃣ *2h antes del cierre de apuestas (Qualy)* con los pronósticos de las IAs.\n` +
        `3️⃣ *Resultados de la jornada y Clasificación General* tras cada carrera.`,
    });
  }
}

export async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");
  const { version } = await fetchLatestBaileysVersion();

  // Escuchar cuando Baileys guarda nuevas claves criptográficas para sincronizarlas con Supabase
  const originalKeysSet = state.keys.set;
  state.keys.set = async (data: any) => {
    await originalKeysSet(data);
    schedulePushSessionToDb(2500);
  };

  const msgRetryCache = new SimpleCacheStore();

  const sock: WASocket = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
    },
    msgRetryCounterCache: msgRetryCache,
    getMessage: async (key) => {
      if (key.id && messageStore.has(key.id)) {
        return messageStore.get(key.id);
      }
      return undefined;
    },
  });

  // Interceptar todos los envíos de mensajes para guardarlos en el almacén de reintentos
  const rawSendMessage = sock.sendMessage.bind(sock);
  sock.sendMessage = (async (...args: any[]) => {
    const res = await (rawSendMessage as any)(...args);
    if (res?.key?.id && res.message) {
      saveMessageToStore(res.key.id, res.message);
    }
    return res;
  }) as any;

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
          clearSessionCache();
          await prisma.sessionFile.deleteMany();
          if (fs.existsSync("auth_info_baileys")) {
            fs.rmSync("auth_info_baileys", { recursive: true, force: true });
          }
        } catch (e: any) {
          console.error("Error al limpiar sesión antigua:", e.message);
        }
        scheduleReconnect(2000);
      } else {
        reconnectAttempts++;
        const delayMs = Math.min(3000 * Math.pow(1.5, reconnectAttempts - 1), 30000);
        console.log(`⏳ Reconectando WhatsApp en ${(delayMs / 1000).toFixed(1)}s (intento #${reconnectAttempts})...`);
        scheduleReconnect(delayMs);
      }
    } else if (connection === "open") {
      reconnectAttempts = 0;
      currentQr = null;
      isBotConnected = true;
      console.log("\n🟢 ¡BOT DE F1 & MOTOGP CONECTADO EXITOSAMENTE A WHATSAPP! 🏁🏎️🏍️\n");
      await pushSessionToDb();
      setupAlerts(sock);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const msg of messages) {
      if (msg.key?.id && msg.message) {
        saveMessageToStore(msg.key.id, msg.message);
      }
      if (!msg.message) continue;

      const rawText = extractText(msg);
      const cleanText = rawText.trim().toLowerCase();

      messagesCount++;
      lastMessageLog = `[${new Date().toISOString()}] fromMe=${msg.key.fromMe} text="${cleanText.slice(0, 50)}" from=${msg.key.remoteJid}`;

      // Prefijos soportados
      const isBot = cleanText === "!bot" || cleanText.startsWith("!bot ");
      const isAlertas = cleanText === "!alertas" || cleanText.startsWith("!alertas ") || cleanText === "!alerta" || cleanText.startsWith("!alerta ");
      const isPorra = cleanText.startsWith("!porra") || cleanText.startsWith("!porramoto");
      const isF1 = cleanText === "!f1" || cleanText.startsWith("!f1 ");
      const isMotoGP =
        cleanText === "!moto" ||
        cleanText.startsWith("!moto ") ||
        cleanText === "!motogp" ||
        cleanText.startsWith("!motogp ") ||
        cleanText === "!gp" ||
        cleanText.startsWith("!gp ");
      const isGeneralHelp = cleanText === "!ayuda" || cleanText === "!help" || cleanText === "!menu" || cleanText === "!comandos";

      if (!isBot && !isAlertas && !isF1 && !isMotoGP && !isPorra && !isGeneralHelp) continue;

      const remoteJid = msg.key.remoteJid;
      if (!remoteJid) continue;

      const pushName = msg.pushName || "Fan del Motorsport";
      console.log(`📩 [Comando detectado] "${cleanText}" de ${pushName} (${remoteJid})`);

      try {
        // 1. CONTROL DEL BOT (!bot on / !bot off) — siempre accesible
        if (isBot) {
          const subCommand = cleanText.replace(/^!bot\s*/, "").trim();
          if (subCommand === "off" || subCommand === "desactivar") {
            await setBotActiveInChat(remoteJid, false);
            await sock.sendMessage(remoteJid, {
              text: `🔴 *Bot desactivado en este chat.*\n\nYa no responderé a ningún comando aquí.\nPara volver a activarme, escribe *!bot on*.`,
            });
          } else if (subCommand === "on" || subCommand === "activar") {
            await setBotActiveInChat(remoteJid, true);
            await sock.sendMessage(remoteJid, {
              text: `🟢 *¡Bot activado en este chat!*\n\nVuelvo a estar operativo. 🏎️🏍️\nEscribe *!ayuda* para ver los comandos disponibles.`,
            });
          } else {
            const active = await isBotActiveInChat(remoteJid);
            await sock.sendMessage(remoteJid, {
              text: `🤖 *Estado del bot en este chat:* ${active ? "🟢 Activado" : "🔴 Desactivado"}\n\n` +
                `🔹 *!bot on* — Activar el bot\n` +
                `🔹 *!bot off* — Desactivar el bot`,
            });
          }
          continue;
        }

        // CHEQUEO: Si el bot está desactivado en este chat, no procesar más comandos
        const botActive = await isBotActiveInChat(remoteJid);
        if (!botActive) continue;

        // 2. MENÚ DE AYUDA GENERAL (!ayuda)
        if (isGeneralHelp) {
          await sock.sendMessage(remoteJid, { text: GENERAL_HELP_MESSAGE });
          continue;
        }

        // 3. ALERTAS AUTOMÁTICAS (!alertas on / !alertas off)
        if (isAlertas) {
          const subCommand = cleanText.replace(/^!alertas?\s*/, "").trim();
          await handleAlertSubscriptionCommand(sock, remoteJid, pushName, subCommand);
          continue;
        }

        // 4. LA PORRA (F1 & MOTOGP)
        if (isPorra) {
          await sock.sendPresenceUpdate("composing", remoteJid);
          const senderJid = msg.key.participant || remoteJid;
          const defaultSport = cleanText.startsWith("!porramoto") ? "motogp" : undefined;
          const response = await handlePorraCommand(remoteJid, senderJid, pushName, rawText, defaultSport);

          if (typeof response === "string") {
            await sock.sendMessage(remoteJid, { text: response });

            if (response.includes("¡PRONÓSTICO REGISTRADO!")) {
              const isMoto = defaultSport === "motogp" || cleanText.includes("moto");
              try {
                await sock.sendMessage(remoteJid, {
                  react: { text: isMoto ? "🏍️" : "🏎️", key: msg.key },
                });
              } catch (e: any) {
                console.error("Error enviando reacción de emoji:", e?.message);
              }
            }
          } else {
            if (response.imageBuffer) {
              await sock.sendMessage(remoteJid, {
                image: response.imageBuffer,
                caption: response.text,
              });
            } else {
              await sock.sendMessage(remoteJid, { text: response.text });
            }

            // Si se acaban de calcular resultados válidos, mostrar a continuación la Clasificación General
            if (response.text.includes("RESULTADOS OFICIALES")) {
              const isMoto = defaultSport === "motogp" || /^!porra\s+moto/i.test(cleanText);
              const rankingMsg = await showSeasonRanking(remoteJid, isMoto ? "motogp" : "f1");
              await sock.sendMessage(remoteJid, { text: rankingMsg });
            }
          }
          continue;
        }

        // 5. COMANDOS DE MOTOGP (!moto / !motogp)
        if (isMotoGP) {
          const arg = cleanText.replace(/^!(motogp|moto|gp)\s*/, "").trim();
          if (arg === "ayuda" || arg === "help" || arg === "menu") {
            await sock.sendMessage(remoteJid, { text: GENERAL_HELP_MESSAGE });
          } else if (!arg || arg.includes("prox") || arg.includes("next") || arg.includes("horario") || arg.includes("calendario")) {
            await sock.sendPresenceUpdate("composing", remoteJid);
            const response = await getNextMotoGP();
            await sock.sendMessage(remoteJid, { text: response });
          } else if (arg.includes("piloto") || arg.includes("driver") || arg.includes("standing") || arg.includes("rider") || arg.includes("mundial")) {
            await sock.sendPresenceUpdate("composing", remoteJid);
            const response = await getMotoGPStandings();
            await sock.sendMessage(remoteJid, { text: response });
          } else if (arg.includes("equipo") || arg.includes("constructor") || arg.includes("team") || arg.includes("marca")) {
            await sock.sendPresenceUpdate("composing", remoteJid);
            const response = await getMotoGPConstructors();
            await sock.sendMessage(remoteJid, { text: response });
          } else if (arg.includes("ult") || arg.includes("resultado") || arg.includes("result") || arg.includes("last") || arg.includes("carrera")) {
            await sock.sendPresenceUpdate("composing", remoteJid);
            const response = await getLastMotoGPResults();
            await sock.sendMessage(remoteJid, { text: response });
          } else {
            await sock.sendMessage(remoteJid, { text: GENERAL_HELP_MESSAGE });
          }
          continue;
        }

        // 6. COMANDOS DE FÓRMULA 1 (!f1)
        if (isF1) {
          const arg = cleanText.replace(/^!f1\s*/, "").trim();
          if (arg === "ayuda" || arg === "help" || arg === "menu") {
            await sock.sendMessage(remoteJid, { text: GENERAL_HELP_MESSAGE });
          } else if (!arg || arg.includes("prox") || arg.includes("next") || arg.includes("horario") || arg.includes("calendario")) {
            await sock.sendPresenceUpdate("composing", remoteJid);
            const response = await getNextRace();
            await sock.sendMessage(remoteJid, { text: response });
          } else if (arg.includes("piloto") || arg.includes("driver") || arg.includes("standing") || arg.includes("mundial")) {
            await sock.sendPresenceUpdate("composing", remoteJid);
            const response = await getDriverStandings();
            await sock.sendMessage(remoteJid, { text: response });
          } else if (arg.includes("equipo") || arg.includes("constructor") || arg.includes("team") || arg.includes("escuderia")) {
            await sock.sendPresenceUpdate("composing", remoteJid);
            const response = await getConstructorStandings();
            await sock.sendMessage(remoteJid, { text: response });
          } else if (arg.includes("ult") || arg.includes("resultado") || arg.includes("result") || arg.includes("last") || arg.includes("carrera")) {
            await sock.sendPresenceUpdate("composing", remoteJid);
            const response = await getLastRaceResults();
            await sock.sendMessage(remoteJid, { text: response });
          } else if (arg.includes("suscribir") || arg.includes("activar")) {
            await handleAlertSubscriptionCommand(sock, remoteJid, pushName, "on");
          } else if (arg.includes("desuscribir") || arg.includes("cancelar") || arg.includes("desactivar")) {
            await handleAlertSubscriptionCommand(sock, remoteJid, pushName, "off");
          } else if (arg.includes("estado") || arg.includes("status") || arg.includes("alerta")) {
            await handleAlertSubscriptionCommand(sock, remoteJid, pushName, "estado");
          } else {
            await sock.sendMessage(remoteJid, { text: GENERAL_HELP_MESSAGE });
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
