import cron from "node-cron";
import axios from "axios";
import { getActiveSubscribers, wasAlertSent, markAlertSent, prisma } from "./db.js";
import { getNextRace } from "./f1.js";
import { getNextMotoGP } from "./motogp.js";
import { calculatePorraResults } from "./porra.js";
import { ensureAIParticipants } from "./ai-participants.js";
import type { WASocket } from "@whiskeysockets/baileys";

const JOLPICA_BASE = "https://api.jolpi.ca/ergast/f1";
const MOTOGP_BASE = "https://api.motogp.pulselive.com/motogp/v1";

async function broadcastAlert(sock: WASocket, message: string) {
  const subscribers = await getActiveSubscribers();
  for (const sub of subscribers) {
    try {
      await sock.sendMessage(sub.jid, { text: message });
    } catch (e: any) {
      console.error(`Error enviando alerta a ${sub.jid}:`, e?.message);
    }
  }
}

export function setupAlerts(sock: WASocket) {
  // Check every 15 minutes to accurately catch the 24h and 2h windows
  cron.schedule("*/15 * * * *", async () => {
    const now = new Date();

    // =========================================================
    // 🏎️ 1. ALERTAS DE FÓRMULA 1
    // =========================================================
    try {
      const res = await axios.get(`${JOLPICA_BASE}/current/next.json`, { timeout: 8000 });
      const race = res.data.MRData?.RaceTable?.Races?.[0];

      if (race) {
        // --- ALERTA 1: 24 horas antes de la Práctica 1 con horarios completos ---
        if (race.FirstPractice?.date) {
          const fp1Time = race.FirstPractice.time || "12:00:00Z";
          const fp1Date = new Date(`${race.FirstPractice.date}T${fp1Time}`);
          const diffMinutes = Math.round((fp1Date.getTime() - now.getTime()) / (1000 * 60));

          // Ventana de 24 horas (entre 23h y 25h antes)
          if (diffMinutes >= 1380 && diffMinutes <= 1500) {
            const alertKey = `f1-${race.season}-${race.round}-24h-fp1`;
            if (!(await wasAlertSent(alertKey))) {
              console.log(`🚀 [Alerta 1 F1] 24h antes de FP1 para ${race.raceName}`);
              const schedulePreview = await getNextRace();
              const message = `🚨 *¡ATENCIÓN: EL GRAN PREMIO DE F1 COMIENZA EN 24 HORAS!* 🚨\n\n${schedulePreview}`;
              await broadcastAlert(sock, message);
              await markAlertSent(alertKey);
            }
          }
        }

        // --- ALERTA 2: 2 horas antes de la Carrera Sprint (si la hay) ---
        if (race.Sprint?.date) {
          const sprintTime = race.Sprint.time || "12:00:00Z";
          const sprintDate = new Date(`${race.Sprint.date}T${sprintTime}`);
          const diffMinutes = Math.round((sprintDate.getTime() - now.getTime()) / (1000 * 60));

          // Ventana de 2 horas (entre 1h45m y 2h15m)
          if (diffMinutes >= 105 && diffMinutes <= 135) {
            const alertKey = `f1-${race.season}-${race.round}-2h-sprint`;
            if (!(await wasAlertSent(alertKey))) {
              console.log(`🚀 [Alerta 2 F1] 2 horas antes de la Sprint para ${race.raceName}`);
              const message = `⚡ *¡ALERTA F1: QUEDAN 2 HORAS PARA EL COMIENZO DE LA SPRINT!* 🚨\n` +
                `━━━━━━━━━━━━━━━━━━━━━\n` +
                `🏎️ *${race.raceName}*\n` +
                `⏱️ Sesión: *Carrera Sprint*\n` +
                `📍 Circuito: ${race.Circuit?.circuitName || ""}\n\n` +
                `¡Prepárate, los semáforos se apagan en 2 horas! 🏁⚡`;
              await broadcastAlert(sock, message);
              await markAlertSent(alertKey);
            }
          }
        }

        // --- RECORDATORIO PORRA: 2 horas antes de la Clasificación (Qualy Q1) ---
        if (race.Qualifying?.date) {
          const qualyTime = race.Qualifying.time || "14:00:00Z";
          const qualyDate = new Date(`${race.Qualifying.date}T${qualyTime}`);
          const diffMinutes = Math.round((qualyDate.getTime() - now.getTime()) / (1000 * 60));

          // Ventana de 2 horas (entre 1h45m y 2h15m)
          if (diffMinutes >= 105 && diffMinutes <= 135) {
            const alertKey = `f1-${race.season}-${race.round}-2h-qualy-porra`;
            if (!(await wasAlertSent(alertKey))) {
              console.log(`🚀 [Alerta Porra F1] 2h antes de la Qualy para ${race.raceName}`);

              const season = parseInt(race.season, 10);
              const round = parseInt(race.round, 10);
              const raceDateStr = race.date ? `${race.date}T${race.time || "12:00:00Z"}` : undefined;

              // Asegurar que las IAs participen en cada grupo con telemetría definitiva de los 3 libres
              const subscribers = await getActiveSubscribers();
              let aiSummary = "";

              for (const sub of subscribers) {
                try {
                  const aiRes = await ensureAIParticipants(sub.jid, season, round, race.raceName, {
                    force: true,
                    raceDateStr,
                  });
                  if (!aiSummary && aiRes.text) {
                    aiSummary = aiRes.text;
                  }
                } catch (e: any) {
                  // omit
                }
              }

              const message = `⏰ *¡ALERTA PORRA F1: QUEDAN 2 HORAS PARA EL CIERRE DE APUESTAS!* 🚨\n` +
                `━━━━━━━━━━━━━━━━━━━━━\n` +
                `🏎️ *${race.raceName}*\n` +
                `⏱️ La Clasificación (Qualy) comienza en 2 horas.\n\n` +
                (aiSummary ? `${aiSummary}\n\n` : `🤖 *Jarvis AI* y *Pitwall AI* ya han registrado sus estrategias tras analizar los entrenamientos libres.\n\n`) +
                `👉 ¡Última oportunidad para enviar o modificar tu pronóstico!\n` +
                `Usa: *!porra [P4] [P5] [P6] [Alonso] [Sainz]*\n` +
                `_Ejemplo: !porra norris leclerc piastri P8 P5 (o DNF si crees que abandonan)_\n\n` +
                `📊 Consulta todas las apuestas (incluyendo a las IAs) con *!porra ver*. ¡Que no se te pase! 🏁`;
              await broadcastAlert(sock, message);
              await markAlertSent(alertKey);
            }
          }
        }

        // --- ALERTA 3: 2 horas antes de la Carrera Principal ---
        if (race.date) {
          const raceTime = race.time || "12:00:00Z";
          const raceDate = new Date(`${race.date}T${raceTime}`);
          const diffMinutes = Math.round((raceDate.getTime() - now.getTime()) / (1000 * 60));

          // Ventana de 2 horas (entre 1h45m y 2h15m)
          if (diffMinutes >= 105 && diffMinutes <= 135) {
            const alertKey = `f1-${race.season}-${race.round}-2h-carrera`;
            if (!(await wasAlertSent(alertKey))) {
              console.log(`🚀 [Alerta 3 F1] 2 horas antes de la Carrera para ${race.raceName}`);
              const message = `🏁 *¡ALERTA F1: QUEDAN 2 HORAS PARA EL COMIENZO DE LA CARRERA!* 🚨\n` +
                `━━━━━━━━━━━━━━━━━━━━━\n` +
                `🏎️ *${race.raceName}*\n` +
                `⏱️ Sesión: *CARRERA PRINCIPAL*\n` +
                `📍 Circuito: ${race.Circuit?.circuitName || ""}\n\n` +
                `¡Los semáforos se apagan en 2 horas! ¡Que empiece el espectáculo! 🏆🏁`;
              await broadcastAlert(sock, message);
              await markAlertSent(alertKey);
            }
          }
        }
      }
    } catch (err: any) {
      console.error("[Cron F1 Error]:", err?.message);
    }

    // =========================================================
    // 🏍️ 2. ALERTAS DE MOTOGP
    // =========================================================
    try {
      const seasonsRes = await axios.get(`${MOTOGP_BASE}/results/seasons`, { timeout: 8000 });
      const currentSeason =
        seasonsRes.data.find((s: any) => s.current) ||
        seasonsRes.data.find((s: any) => s.year === now.getFullYear()) ||
        seasonsRes.data[0];

      if (currentSeason) {
        const eventsRes = await axios.get(`${MOTOGP_BASE}/results/events?seasonUuid=${currentSeason.id}`, {
          timeout: 8000,
        });
        const events: any[] = (eventsRes.data || []).filter((e: any) => !e.test);

        const nextEvent = events.find((e: any) => {
          const end = new Date(`${e.date_end}T23:59:59Z`);
          return end >= now;
        });

        if (nextEvent) {
          const catRes = await axios.get(`${MOTOGP_BASE}/results/categories?seasonUuid=${currentSeason.id}`, {
            timeout: 8000,
          });
          const motogpCat =
            catRes.data.find((c: any) => c.name.toLowerCase().includes("motogp")) || catRes.data[0];

          if (motogpCat) {
            const sessionsRes = await axios.get(
              `${MOTOGP_BASE}/results/sessions?eventUuid=${nextEvent.id}&categoryUuid=${motogpCat.id}`,
              { timeout: 8000 }
            );
            const sessions: any[] = sessionsRes.data || [];

            // Identificar FP1, Sprint (SPR) y Carrera (RAC)
            const fp1Session = sessions.find((s: any) => s.type === "FP" && s.number === 1) || sessions.find((s: any) => s.type === "FP1");
            const sprintSession = sessions.find((s: any) => s.type === "SPR");
            const raceSession = sessions.find((s: any) => s.type === "RAC");

            // --- ALERTA 1 (MotoGP): 24h antes de FP1 con horarios completos ---
            if (fp1Session?.date) {
              const fp1Date = new Date(fp1Session.date);
              const diffMinutes = Math.round((fp1Date.getTime() - now.getTime()) / (1000 * 60));

              if (diffMinutes >= 1380 && diffMinutes <= 1500) {
                const alertKey = `motogp-${nextEvent.id}-24h-fp1`;
                if (!(await wasAlertSent(alertKey))) {
                  console.log(`🚀 [Alerta 1 MotoGP] 24h antes de FP1 para ${nextEvent.name}`);
                  const schedulePreview = await getNextMotoGP();
                  const message = `🚨 *¡ATENCIÓN: EL GRAN PREMIO DE MOTOGP COMIENZA EN 24 HORAS!* 🚨\n\n${schedulePreview}`;
                  await broadcastAlert(sock, message);
                  await markAlertSent(alertKey);
                }
              }
            }

            // --- ALERTA 2 (MotoGP): 2 horas antes del Sprint ---
            if (sprintSession?.date) {
              const sprintDate = new Date(sprintSession.date);
              const diffMinutes = Math.round((sprintDate.getTime() - now.getTime()) / (1000 * 60));

              if (diffMinutes >= 105 && diffMinutes <= 135) {
                const alertKey = `motogp-${nextEvent.id}-2h-sprint`;
                if (!(await wasAlertSent(alertKey))) {
                  console.log(`🚀 [Alerta 2 MotoGP] 2 horas antes de Sprint para ${nextEvent.name}`);
                  const message = `⚡ *¡ALERTA MOTOGP: QUEDAN 2 HORAS PARA EL COMIENZO DEL SPRINT!* 🚨\n` +
                    `━━━━━━━━━━━━━━━━━━━━━\n` +
                    `🏍️ *${nextEvent.sponsored_name || nextEvent.name}*\n` +
                    `⏱️ Sesión: *Carrera Sprint*\n` +
                    `📍 Circuito: ${nextEvent.circuit?.name || ""}\n\n` +
                    `¡Gas a fondo en 2 horas! 🏁⚡`;
                  await broadcastAlert(sock, message);
                  await markAlertSent(alertKey);
                }
              }
            }

            // --- ALERTA 3 (MotoGP): 2 horas antes de la Carrera Principal ---
            if (raceSession?.date) {
              const raceDate = new Date(raceSession.date);
              const diffMinutes = Math.round((raceDate.getTime() - now.getTime()) / (1000 * 60));

              if (diffMinutes >= 105 && diffMinutes <= 135) {
                const alertKey = `motogp-${nextEvent.id}-2h-carrera`;
                if (!(await wasAlertSent(alertKey))) {
                  console.log(`🚀 [Alerta 3 MotoGP] 2 horas antes de Carrera para ${nextEvent.name}`);
                  const message = `🏁 *¡ALERTA MOTOGP: QUEDAN 2 HORAS PARA EL COMIENZO DE LA CARRERA!* 🚨\n` +
                    `━━━━━━━━━━━━━━━━━━━━━\n` +
                    `🏍️ *${nextEvent.sponsored_name || nextEvent.name}*\n` +
                    `⏱️ Sesión: *CARRERA PRINCIPAL*\n` +
                    `📍 Circuito: ${nextEvent.circuit?.name || ""}\n\n` +
                    `¡Se apaga el semáforo en 2 horas! ¡A disfrutar de las motos! 🏆🏁`;
                  await broadcastAlert(sock, message);
                  await markAlertSent(alertKey);
                }
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.error("[Cron MotoGP Error]:", err?.message);
    }

    // =========================================================
    // 🏆 3. PUBLICACIÓN AUTOMÁTICA DE RESULTADOS DE LA PORRA
    // =========================================================
    try {
      const lastRes = await axios.get(`${JOLPICA_BASE}/current/last/results.json`, { timeout: 8000 });
      const lastRace = lastRes.data.MRData?.RaceTable?.Races?.[0];

      if (lastRace && lastRace.Results && lastRace.Results.length >= 6) {
        const season = parseInt(lastRace.season, 10);
        const round = parseInt(lastRace.round, 10);
        const alertKey = `f1-${season}-${round}-auto-porra-results`;

        if (!(await wasAlertSent(alertKey))) {
          // Comprobar que la carrera finalizó recientemente (dentro de las últimas 72 horas)
          const raceDate = new Date(`${lastRace.date}T${lastRace.time || "14:00:00Z"}`);
          const hoursSinceRace = (now.getTime() - raceDate.getTime()) / (1000 * 60 * 60);

          if (hoursSinceRace >= 0 && hoursSinceRace <= 72) {
            // Buscar todos los grupos que tengan apuestas registradas para este GP
            const distinctGroups = await prisma.porraBet.findMany({
              where: {
                season,
                round,
              },
              select: { groupJid: true },
              distinct: ["groupJid"],
            });

            if (distinctGroups.length > 0) {
              console.log(`🏆 [Auto-Resultados Porra] Enviando resultados a ${distinctGroups.length} grupo(s) para ${lastRace.raceName}`);
              for (const g of distinctGroups) {
                try {
                  const res = await calculatePorraResults(g.groupJid);
                  const captionText = `📢 *¡RESULTADOS OFICIALES Y PODIO DE LA PORRA TRAS LA CARRERA!* 🏁\n\n` + res.text;
                  if (res.imageBuffer) {
                    await sock.sendMessage(g.groupJid, {
                      image: res.imageBuffer,
                      caption: captionText,
                    });
                  } else {
                    await sock.sendMessage(g.groupJid, {
                      text: captionText,
                    });
                  }
                } catch (e: any) {
                  console.error(`Error enviando resultados de porra a ${g.groupJid}:`, e?.message);
                }
              }
            }
            await markAlertSent(alertKey);
          } else if (hoursSinceRace > 72) {
            // Carrera antigua, marcar para no reevaluar
            await markAlertSent(alertKey);
          }
        }
      }
    } catch (err: any) {
      console.error("[Cron Auto-Resultados Porra Error]:", err?.message);
    }
  });

  console.log("✅ Sistema de alertas y porra automática configurado.");
}
