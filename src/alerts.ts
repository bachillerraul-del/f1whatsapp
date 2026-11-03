import cron from "node-cron";
import axios from "axios";
import { getActiveSubscribers, wasAlertSent, markAlertSent } from "./db.js";
import type { WASocket } from "@whiskeysockets/baileys";

const JOLPICA_BASE = "https://api.jolpi.ca/ergast/f1";

export function setupAlerts(sock: WASocket) {
  // Runs every 30 minutes to check if a session is starting soon
  cron.schedule("*/30 * * * *", async () => {
    try {
      console.log("⏰ [Cron] Verificando próximas sesiones de F1...");
      const res = await axios.get(`${JOLPICA_BASE}/current/next.json`, { timeout: 8000 });
      const race = res.data.MRData?.RaceTable?.Races?.[0];

      if (!race) return;

      const now = new Date();
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

        // Alert if session starts between 30 and 70 minutes from now
        if (diffMinutes >= 20 && diffMinutes <= 70) {
          const alertKey = `${race.season}-${race.round}-${session.name.replace(/\s+/g, "_")}`;
          const alreadySent = await wasAlertSent(alertKey);

          if (!alreadySent) {
            console.log(`🚀 [Alerta] Enviando aviso para ${session.name} de ${race.raceName}...`);
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
    } catch (err: any) {
      console.error("[Cron Error]:", err?.message);
    }
  });

  console.log("✅ Sistema de alertas de carreras programado (cada 30 min).");
}
