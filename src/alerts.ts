import cron from "node-cron";
import axios from "axios";
import { getActiveSubscribers, wasAlertSent, markAlertSent, isBotActiveInChat } from "./db.js";
import { getNextRace, fetchNextF1RaceData } from "./f1.js";
import { getNextMotoGP } from "./motogp.js";
import { ensureAIParticipants } from "./ai-participants.js";
import type { WASocket } from "@whiskeysockets/baileys";

const MOTOGP_BASE = "https://api.motogp.pulselive.com/motogp/v1";

let activeSock: WASocket | null = null;
let alertsCronTask: cron.ScheduledTask | null = null;

async function broadcastAlert(sock: WASocket, message: string) {
  const subscribers = await getActiveSubscribers();
  for (const sub of subscribers) {
    try {
      // Respetar la configuración de bot activo/inactivo por chat
      const active = await isBotActiveInChat(sub.jid);
      if (!active) continue;
      await sock.sendMessage(sub.jid, { text: message });
    } catch (e: any) {
      console.error(`Error enviando alerta a ${sub.jid}:`, e?.message);
    }
  }
}

export function setupAlerts(sock: WASocket) {
  activeSock = sock;

  if (alertsCronTask) {
    console.log("🔄 Socket de alertas actualizado (tarea cron ya activa).");
    return;
  }

  // Comprobar cada 15 minutos las ventanas de 24h (primera sesión) y 2h (cierre de apuestas)
  alertsCronTask = cron.schedule("*/15 * * * *", async () => {
    const currentSock = activeSock;
    if (!currentSock) return;
    const now = new Date();

    // =========================================================
    // 🏎️ 1. ALERTAS DE FÓRMULA 1
    // =========================================================
    try {
      const race = await fetchNextF1RaceData();

      if (race) {
        // --- ALERTA 1: 24 horas antes de la primera sesión (FP1) con horarios completos ---
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
              const message = `🚨 *¡EL GRAN PREMIO DE F1 COMIENZA EN 24 HORAS!* 🚨\n\n${schedulePreview}`;
              await broadcastAlert(currentSock, message);
              await markAlertSent(alertKey);
            }
          }
        }

        // --- ALERTA 2: 2 horas antes del cierre de apuestas (inicio de Clasificación / Qualy) ---
        if (race.Qualifying?.date) {
          const qualyTime = race.Qualifying.time || "14:00:00Z";
          const qualyDate = new Date(`${race.Qualifying.date}T${qualyTime}`);
          const diffMinutes = Math.round((qualyDate.getTime() - now.getTime()) / (1000 * 60));

          // Ventana de 2 horas (entre 1h45m y 2h15m)
          if (diffMinutes >= 105 && diffMinutes <= 135) {
            const alertKey = `f1-${race.season}-${race.round}-2h-qualy-porra`;
            if (!(await wasAlertSent(alertKey))) {
              console.log(`🚀 [Alerta 2 F1] 2h antes del cierre de apuestas para ${race.raceName}`);

              const season = parseInt(race.season, 10);
              const round = parseInt(race.round, 10);
              const raceDateStr = race.date ? `${race.date}T${race.time || "12:00:00Z"}` : undefined;

              const subscribers = await getActiveSubscribers();
              let aiSummary = "";

              for (const sub of subscribers) {
                try {
                  const aiRes = await ensureAIParticipants("f1", sub.jid, season, round, race.raceName, {
                    force: true,
                    raceDateStr,
                  });
                  if (!aiSummary && aiRes.text) {
                    aiSummary = aiRes.text;
                  }
                } catch {
                  // omit
                }
              }

              const message = `⏰ *¡QUEDAN 2 HORAS PARA EL CIERRE DE APUESTAS (F1)!* 🚨\n` +
                `━━━━━━━━━━━━━━━━━━━━━\n` +
                `🏎️ *${race.raceName}*\n` +
                `⏱️ La Clasificación (Qualy) comienza en 2 horas.\n\n` +
                (aiSummary ? `${aiSummary}\n\n` : `🤖 *Jarvis AI* y *Pitwall AI* ya han registrado sus pronósticos tras analizar los entrenamientos libres.\n\n`) +
                `👉 ¡Última oportunidad para enviar o modificar tu apuesta!\n` +
                `Usa: *!porra [1º] [2º] [3º] [4º] [5º] [DNF] [QP3]*\n` +
                `_Ejemplo: !porra ver nor lec pia rus dnf: col qp3: alo_\n\n` +
                `📊 Consulta las apuestas del grupo con *!porra ver*. 🏁`;
              await broadcastAlert(currentSock, message);
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

        const nextEventIndex = events.findIndex((e: any) => {
          const end = new Date(`${e.date_end}T23:59:59Z`);
          return end >= now;
        });
        const nextEvent = nextEventIndex !== -1 ? events[nextEventIndex] : undefined;

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

            // Ordenar sesiones cronológicamente para detectar la primera sesión del GP
            sessions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            const firstSession =
              sessions.find((s: any) => s.type === "FP" && s.number === 1) ||
              sessions.find((s: any) => s.type === "FP1") ||
              sessions[0];
            const qualySession =
              sessions.find((s: any) => s.type === "Q1") ||
              sessions.find((s: any) => s.type === "Q" && s.number === 1) ||
              sessions.find((s: any) => s.type === "Q2");
            const raceSession = sessions.find((s: any) => s.type === "RAC");

            // --- ALERTA 1 (MotoGP): 24h antes de la primera sesión (FP1) con horarios completos ---
            if (firstSession?.date) {
              const fp1Date = new Date(firstSession.date);
              const diffMinutes = Math.round((fp1Date.getTime() - now.getTime()) / (1000 * 60));

              if (diffMinutes >= 1380 && diffMinutes <= 1500) {
                const alertKey = `motogp-${nextEvent.id}-24h-fp1`;
                if (!(await wasAlertSent(alertKey))) {
                  console.log(`🚀 [Alerta 1 MotoGP] 24h antes de la primera sesión para ${nextEvent.name}`);
                  const schedulePreview = await getNextMotoGP();
                  const message = `🚨 *¡EL GRAN PREMIO DE MOTOGP COMIENZA EN 24 HORAS!* 🚨\n\n${schedulePreview}`;
                  await broadcastAlert(currentSock, message);
                  await markAlertSent(alertKey);
                }
              }
            }

            // --- ALERTA 2 (MotoGP): 2 horas antes del cierre de apuestas (inicio de Clasificación Q1) ---
            if (qualySession?.date) {
              const qualyDate = new Date(qualySession.date);
              const diffMinutes = Math.round((qualyDate.getTime() - now.getTime()) / (1000 * 60));

              if (diffMinutes >= 105 && diffMinutes <= 135) {
                const alertKey = `motogp-${nextEvent.id}-2h-qualy-porra`;
                if (!(await wasAlertSent(alertKey))) {
                  const eventName = nextEvent.sponsored_name || nextEvent.name || `GP Ronda ${nextEventIndex + 1}`;
                  const seasonYear = new Date(nextEvent.date_start).getFullYear() || now.getFullYear();
                  const roundNum = nextEventIndex + 1;
                  const raceDateStr = raceSession?.date ? new Date(raceSession.date).toISOString() : undefined;

                  console.log(`🚀 [Alerta 2 MotoGP] 2h antes del cierre de apuestas para ${eventName}`);

                  const subscribers = await getActiveSubscribers();
                  let aiSummary = "";

                  for (const sub of subscribers) {
                    try {
                      const aiRes = await ensureAIParticipants("motogp", sub.jid, seasonYear, roundNum, eventName, {
                        force: true,
                        raceDateStr,
                      });
                      if (!aiSummary && aiRes.text) {
                        aiSummary = aiRes.text;
                      }
                    } catch {
                      // omit
                    }
                  }

                  const message = `⏰ *¡QUEDAN 2 HORAS PARA EL CIERRE DE APUESTAS (MOTOGP)!* 🚨\n` +
                    `━━━━━━━━━━━━━━━━━━━━━\n` +
                    `🏍️ *${eventName}*\n` +
                    `⏱️ La Clasificación (Q1) comienza en 2 horas.\n\n` +
                    (aiSummary ? `${aiSummary}\n\n` : `🤖 *Jarvis AI* y *Pitwall AI* ya han registrado sus pronósticos tras analizar los entrenamientos.\n\n`) +
                    `👉 ¡Última oportunidad para enviar o modificar tu apuesta de MotoGP!\n` +
                    `Usa: *!porramoto [1º] [2º] [3º] [4º] [5º] [DNF] [QP3]*\n` +
                    `_Ejemplo: !porramoto marquez martin bagnaia acosta bastianini dnf: binder qp3: vinales_\n\n` +
                    `📊 Consulta las apuestas del grupo con *!porramoto ver*. 🏁`;
                  await broadcastAlert(currentSock, message);
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
  });

  console.log("✅ Sistema de alertas configurado (24h antes de FP1 y 2h antes del cierre de apuestas).");
}

