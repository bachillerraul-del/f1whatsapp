import cron from "node-cron";
import {
  prisma,
  wasAlertSent,
  markAlertSent,
  isBotActiveInChat,
  getAllKnownActiveChatJids,
} from "./db.js";
import { getNextRace, fetchNextF1RaceData, fetchLastF1RaceData } from "./f1.js";
import {
  getNextMotoGP,
  getNextMotoGPEventInfo,
  getLastMotoGPResultsData,
} from "./motogp.js";
import { ensureAIParticipants } from "./ai-participants.js";
import { calculatePorraResults, showSeasonRanking } from "./porra.js";
import type { WASocket } from "@whiskeysockets/baileys";

let activeSock: WASocket | null = null;
let alertsCronTask: cron.ScheduledTask | null = null;
let isRunningCycle = false;

/**
 * Obtiene únicamente los chats y grupos donde el bot ha sido activado (!bot on)
 * o tiene actividad legítima en la Porra, sin escanear grupos personales ajenos.
 */
async function getActiveTargetChats(): Promise<string[]> {
  return getAllKnownActiveChatJids();
}

/**
 * Comprueba si ya están disponibles los resultados oficiales de la última carrera (F1 o MotoGP).
 * Si hay grupos con apuestas registradas pendientes de evaluar para esa carrera, publica
 * automáticamente:
 * 1) Los resultados de la jornada (con imagen del podio y desglose).
 * 2) La clasificación general acumulada de la temporada.
 */
async function checkAndPublishAvailablePorraResults(
  sock: WASocket,
  sport: "f1" | "motogp"
) {
  try {
    let season: number | null = null;
    let round: number | null = null;
    let raceName = "";

    if (sport === "f1") {
      const lastRace = await fetchLastF1RaceData();
      if (!lastRace || !lastRace.Results || lastRace.Results.length < 5) return;
      season = parseInt(lastRace.season, 10);
      round = parseInt(lastRace.round, 10);
      raceName = lastRace.raceName || `GP Ronda ${round}`;
    } else {
      const motoData = await getLastMotoGPResultsData();
      if (!motoData || motoData.top5.length < 5) return;
      season = motoData.season;
      round = motoData.round;
      raceName = motoData.raceName;
    }

    if (!season || !round) return;

    // Buscar apuestas registradas para esta temporada y ronda
    const betsForRound = await prisma.porraBet.findMany({
      where: {
        sport,
        season,
        round,
      },
      select: {
        groupJid: true,
        points: true,
      },
    });

    if (betsForRound.length === 0) return;

    // Agrupar por chat/grupo
    const groupsWithPendingPoints = new Set<string>();
    for (const b of betsForRound) {
      if (b.points === null) {
        groupsWithPendingPoints.add(b.groupJid);
      }
    }

    for (const groupJid of groupsWithPendingPoints) {
      const alertKey = `porra-auto-results-${sport}-${season}-${round}-${groupJid}`;
      if (await wasAlertSent(alertKey)) continue;

      const chatActive = await isBotActiveInChat(groupJid);
      if (!chatActive) continue;

      console.log(
        `🏁 [Auto-Resultados ${sport.toUpperCase()}] Publicando resultados y clasificación general de ${raceName} en ${groupJid}`
      );

      // 1. Calcular y enviar los resultados de la jornada (con imagen del podio)
      const resultsResponse = await calculatePorraResults(groupJid, sport);
      if (resultsResponse.imageBuffer) {
        await sock.sendMessage(groupJid, {
          image: resultsResponse.imageBuffer,
          caption: resultsResponse.text,
        });
      } else {
        await sock.sendMessage(groupJid, { text: resultsResponse.text });
      }

      // 2. Enviar inmediatamente después la Clasificación General acumulada
      const rankingMessage = await showSeasonRanking(groupJid, sport);
      await sock.sendMessage(groupJid, { text: rankingMessage });

      await markAlertSent(alertKey);
    }
  } catch (err: any) {
    console.error(
      `[Auto-Resultados ${sport.toUpperCase()} Error]:`,
      err?.message
    );
  }
}

export async function runAlertsCycle() {
  const currentSock = activeSock;
  if (!currentSock || isRunningCycle) return;
  isRunningCycle = true;

  try {
    const now = new Date();
    const targetChats = await getActiveTargetChats();

    // =========================================================
    // 🏎️ 1. ALERTAS DE FÓRMULA 1
    // =========================================================
    try {
      const race = await fetchNextF1RaceData();

      if (race && targetChats.length > 0) {
        // --- ALERTA 1: 24 horas antes de la primera sesión (FP1) con horarios completos ---
        // (Incluye ventana de recuperación hasta el inicio de FP1 por si el bot estuvo apagado o recién activado)
        if (race.FirstPractice?.date) {
          const fp1Time = race.FirstPractice.time || "12:00:00Z";
          const fp1Date = new Date(`${race.FirstPractice.date}T${fp1Time}`);
          const diffMinutes = Math.round((fp1Date.getTime() - now.getTime()) / (1000 * 60));

          if (diffMinutes > 0 && diffMinutes <= 1500) {
            let schedulePreview: string | null = null;
            const header =
              diffMinutes >= 1260
                ? `🚨 *¡EL GRAN PREMIO DE F1 COMIENZA EN 24 HORAS!* 🚨`
                : `🚨 *¡HORARIOS OFICIALES DEL GRAN PREMIO DE F1!* 🚨`;

            for (const jid of targetChats) {
              const chatAlertKey = `f1-${race.season}-${race.round}-24h-fp1-${jid}`;
              if (await wasAlertSent(chatAlertKey)) continue;

              const active = await isBotActiveInChat(jid);
              if (!active) continue;

              if (!schedulePreview) {
                schedulePreview = await getNextRace();
              }

              try {
                console.log(`🚀 [Alerta 1 F1] Enviando horarios de ${race.raceName} a ${jid}`);
                await currentSock.sendMessage(jid, {
                  text: `${header}\n\n${schedulePreview}`,
                });
                await markAlertSent(chatAlertKey);
              } catch (e: any) {
                console.error(`Error enviando Alerta 1 F1 a ${jid}:`, e?.message);
              }
            }
          }
        }

        // --- ALERTA 2: 2 horas antes del cierre de apuestas (inicio de Clasificación / Qualy) ---
        if (race.Qualifying?.date) {
          const qualyTime = race.Qualifying.time || "14:00:00Z";
          const qualyDate = new Date(`${race.Qualifying.date}T${qualyTime}`);
          const diffMinutes = Math.round((qualyDate.getTime() - now.getTime()) / (1000 * 60));

          // Ventana de 2 horas (hasta 5 min antes de Qualy por si hubo reinicio)
          if (diffMinutes >= 5 && diffMinutes <= 135) {
            const season = parseInt(race.season, 10);
            const round = parseInt(race.round, 10);
            const raceDateStr = race.date ? `${race.date}T${race.time || "12:00:00Z"}` : undefined;

            for (const jid of targetChats) {
              const chatAlertKey = `f1-${race.season}-${race.round}-2h-qualy-${jid}`;
              if (await wasAlertSent(chatAlertKey)) continue;

              const active = await isBotActiveInChat(jid);
              if (!active) continue;

              try {
                console.log(`🚀 [Alerta 2 F1] Enviando aviso de cierre de apuestas de ${race.raceName} a ${jid}`);
                let aiSummary = "";
                try {
                  const aiRes = await ensureAIParticipants("f1", jid, season, round, race.raceName, {
                    force: true,
                    raceDateStr,
                  });
                  aiSummary = aiRes.text || "";
                } catch {
                  // omit
                }

                const message =
                  `⏰ *¡QUEDAN 2 HORAS PARA EL CIERRE DE APUESTAS (F1)!* 🚨\n` +
                  `━━━━━━━━━━━━━━━━━━━━━\n` +
                  `🏎️ *${race.raceName}*\n` +
                  `⏱️ La Clasificación (Qualy) está a punto de comenzar.\n\n` +
                  (aiSummary
                    ? `${aiSummary}\n\n`
                    : `🤖 *Jarvis AI* y *Pitwall AI* ya han registrado sus pronósticos tras analizar los entrenamientos libres.\n\n`) +
                  `👉 ¡Última oportunidad para enviar o modificar tu apuesta!\n` +
                  `Usa: *!porra [1º] [2º] [3º] [4º] [5º] [DNF] [QP3]*\n` +
                  `_Ejemplo: !porra ver nor lec pia rus dnf: col qp3: alo_\n\n` +
                  `📊 Consulta las apuestas del grupo con *!porra ver*. 🏁`;

                await currentSock.sendMessage(jid, { text: message });
                await markAlertSent(chatAlertKey);
              } catch (e: any) {
                console.error(`Error enviando Alerta 2 F1 a ${jid}:`, e?.message);
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.error("[Cron F1 Error]:", err?.message);
    }

    // =========================================================
    // 🏍️ 2. ALERTAS DE MOTOGP (usando caché compartida)
    // =========================================================
    try {
      const motoInfo = await getNextMotoGPEventInfo();

      if (motoInfo && targetChats.length > 0) {
        // --- ALERTA 1 (MotoGP): 24h antes de la primera sesión (FP1) con horarios completos ---
        if (motoInfo.fp1Date) {
          const diffMinutes = Math.round((motoInfo.fp1Date.getTime() - now.getTime()) / (1000 * 60));

          if (diffMinutes > 0 && diffMinutes <= 1500) {
            let schedulePreview: string | null = null;
            const header =
              diffMinutes >= 1260
                ? `🚨 *¡EL GRAN PREMIO DE MOTOGP COMIENZA EN 24 HORAS!* 🚨`
                : `🚨 *¡HORARIOS OFICIALES DEL GRAN PREMIO DE MOTOGP!* 🚨`;

            for (const jid of targetChats) {
              const chatAlertKey = `motogp-${motoInfo.eventId}-24h-fp1-${jid}`;
              if (await wasAlertSent(chatAlertKey)) continue;

              const active = await isBotActiveInChat(jid);
              if (!active) continue;

              if (!schedulePreview) {
                schedulePreview = await getNextMotoGP();
              }

              try {
                console.log(`🚀 [Alerta 1 MotoGP] Enviando horarios de ${motoInfo.raceName} a ${jid}`);
                await currentSock.sendMessage(jid, {
                  text: `${header}\n\n${schedulePreview}`,
                });
                await markAlertSent(chatAlertKey);
              } catch (e: any) {
                console.error(`Error enviando Alerta 1 MotoGP a ${jid}:`, e?.message);
              }
            }
          }
        }

        // --- ALERTA 2 (MotoGP): 2 horas antes del cierre de apuestas (inicio de Clasificación Q1) ---
        if (motoInfo.qualyDate) {
          const diffMinutes = Math.round((motoInfo.qualyDate.getTime() - now.getTime()) / (1000 * 60));

          if (diffMinutes >= 5 && diffMinutes <= 135) {
            const raceDateStr = motoInfo.raceDate ? motoInfo.raceDate.toISOString() : undefined;

            for (const jid of targetChats) {
              const chatAlertKey = `motogp-${motoInfo.eventId}-2h-qualy-${jid}`;
              if (await wasAlertSent(chatAlertKey)) continue;

              const active = await isBotActiveInChat(jid);
              if (!active) continue;

              try {
                console.log(`🚀 [Alerta 2 MotoGP] Enviando aviso de cierre de apuestas de ${motoInfo.raceName} a ${jid}`);
                let aiSummary = "";
                try {
                  const aiRes = await ensureAIParticipants(
                    "motogp",
                    jid,
                    motoInfo.season,
                    motoInfo.round,
                    motoInfo.raceName,
                    {
                      force: true,
                      raceDateStr,
                    }
                  );
                  aiSummary = aiRes.text || "";
                } catch {
                  // omit
                }

                const message =
                  `⏰ *¡QUEDAN 2 HORAS PARA EL CIERRE DE APUESTAS (MOTOGP)!* 🚨\n` +
                  `━━━━━━━━━━━━━━━━━━━━━\n` +
                  `🏍️ *${motoInfo.raceName}*\n` +
                  `⏱️ La Clasificación (Q1) está a punto de comenzar.\n\n` +
                  (aiSummary
                    ? `${aiSummary}\n\n`
                    : `🤖 *Jarvis AI* y *Pitwall AI* ya han registrado sus pronósticos tras analizar los entrenamientos.\n\n`) +
                  `👉 ¡Última oportunidad para enviar o modificar tu apuesta de MotoGP!\n` +
                  `Usa: *!porramoto [1º] [2º] [3º] [4º] [5º] [DNF] [QP3]*\n` +
                  `_Ejemplo: !porramoto marquez martin bagnaia acosta bastianini dnf: binder qp3: vinales_\n\n` +
                  `📊 Consulta las apuestas del grupo con *!porramoto ver*. 🏁`;

                await currentSock.sendMessage(jid, { text: message });
                await markAlertSent(chatAlertKey);
              } catch (e: any) {
                console.error(`Error enviando Alerta 2 MotoGP a ${jid}:`, e?.message);
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.error("[Cron MotoGP Error]:", err?.message);
    }

    // =========================================================
    // 🏁 3. PUBLICACIÓN AUTOMÁTICA DE RESULTADOS Y CLASIFICACIÓN GENERAL
    // =========================================================
    await checkAndPublishAvailablePorraResults(currentSock, "f1");
    await checkAndPublishAvailablePorraResults(currentSock, "motogp");
  } finally {
    isRunningCycle = false;
  }
}

export function setupAlerts(sock: WASocket) {
  activeSock = sock;

  // Ejecutar una comprobación inmediata al conectar por si hay alguna alerta en ventana pendiente
  setTimeout(() => {
    runAlertsCycle().catch((err) => {
      console.error("Error en comprobación inicial de alertas:", err?.message);
    });
  }, 4000);

  if (alertsCronTask) {
    console.log("🔄 Socket de alertas actualizado (tarea cron ya activa).");
    return;
  }

  // Comprobar cada 15 minutos las ventanas de 24h (FP1), 2h (cierre Qualy) y resultados post-carrera
  alertsCronTask = cron.schedule("*/15 * * * *", () => {
    runAlertsCycle().catch((err) => {
      console.error("Error en ciclo de alertas:", err?.message);
    });
  });

  console.log(
    "✅ Sistema de alertas automáticas activo para todos los chats con el bot encendido (!bot on)."
  );
}

