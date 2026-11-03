import cron from "node-cron";
import axios from "axios";
import { getActiveSubscribers, wasAlertSent, markAlertSent } from "./db.js";
import type { WASocket } from "@whiskeysockets/baileys";

const JOLPICA_BASE = "https://api.jolpi.ca/ergast/f1";
const MOTOGP_BASE = "https://api.motogp.pulselive.com/motogp/v1";

export function setupAlerts(sock: WASocket) {
  // Check every 30 minutes for upcoming F1 & MotoGP sessions
  cron.schedule("*/30 * * * *", async () => {
    const now = new Date();

    // 🏎️ 1. VERIFICAR ALERTAS DE FÓRMULA 1
    try {
      console.log("⏰ [Cron] Verificando próximas sesiones de F1 y MotoGP...");
      const res = await axios.get(`${JOLPICA_BASE}/current/next.json`, { timeout: 8000 });
      const race = res.data.MRData?.RaceTable?.Races?.[0];

      if (race) {
        const sessions = [
          { name: "Práctica 1", data: race.FirstPractice },
          { name: "Práctica 2", data: race.SecondPractice },
          { name: "Práctica 3", data: race.ThirdPractice },
          { name: "Sprint Shootout", data: race.SprintQualifying },
          { name: "Carrera Sprint", data: race.Sprint },
          { name: "Clasificación", data: race.Qualifying },
          { name: "Carrera Principal", data: { date: race.date, time: race.time } },
        ];

        for (const session of sessions) {
          if (!session.data?.date) continue;

          const sessionTime = session.data.time || "12:00:00Z";
          const sessionDate = new Date(`${session.data.date}T${sessionTime}`);
          const diffMs = sessionDate.getTime() - now.getTime();
          const diffMinutes = Math.round(diffMs / (1000 * 60));

          if (diffMinutes >= 20 && diffMinutes <= 70) {
            const alertKey = `f1-${race.season}-${race.round}-${session.name.replace(/\s+/g, "_")}`;
            const alreadySent = await wasAlertSent(alertKey);

            if (!alreadySent) {
              console.log(`🚀 [Alerta F1] Enviando aviso para ${session.name} de ${race.raceName}...`);
              const subscribers = await getActiveSubscribers();

              const message = `🚨 *¡ALERTA F1: COMIENZA EN ${diffMinutes} MINUTOS!* 🚨\n` +
                `━━━━━━━━━━━━━━━━━━━━━\n` +
                `🏎️ *${race.raceName}*\n` +
                `⏱️ Sesión: *${session.name}*\n` +
                `📍 Circuito: ${race.Circuit?.circuitName}\n\n` +
                `¡Prepárate para la acción! 🏁`;

              for (const sub of subscribers) {
                try {
                  await sock.sendMessage(sub.jid, { text: message });
                } catch (e: any) {
                  console.error(`Error enviando alerta a ${sub.jid}:`, e?.message);
                }
              }

              await markAlertSent(alertKey);
            }
          }
        }
      }
    } catch (err: any) {
      console.error("[Cron F1 Error]:", err?.message);
    }

    // 🏍️ 2. VERIFICAR ALERTAS DE MOTOGP
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

            for (const s of sessions) {
              if (!s.date) continue;
              const sessionDate = new Date(s.date);
              const diffMs = sessionDate.getTime() - now.getTime();
              const diffMinutes = Math.round(diffMs / (1000 * 60));

              if (diffMinutes >= 20 && diffMinutes <= 70) {
                const alertKey = `motogp-${s.id}`;
                const alreadySent = await wasAlertSent(alertKey);

                if (!alreadySent) {
                  const sType = s.type === "SPR" ? "Carrera Sprint" : s.type === "RAC" ? "CARRERA PRINCIPAL" : s.type;
                  console.log(`🚀 [Alerta MotoGP] Enviando aviso para ${sType} de ${nextEvent.name}...`);
                  const subscribers = await getActiveSubscribers();

                  const message = `🚨 *¡ALERTA MOTOGP: COMIENZA EN ${diffMinutes} MINUTOS!* 🚨\n` +
                    `━━━━━━━━━━━━━━━━━━━━━\n` +
                    `🏍️ *${nextEvent.sponsored_name || nextEvent.name}*\n` +
                    `⏱️ Sesión: *${sType}*\n` +
                    `📍 Circuito: ${nextEvent.circuit?.name || ""}\n\n` +
                    `¡Gas a fondo! 🏁🏍️`;

                  for (const sub of subscribers) {
                    try {
                      await sock.sendMessage(sub.jid, { text: message });
                    } catch (e: any) {
                      console.error(`Error enviando alerta a ${sub.jid}:`, e?.message);
                    }
                  }

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

  console.log("✅ Sistema de alertas de carreras programado (F1 & MotoGP cada 30 min).");
}
