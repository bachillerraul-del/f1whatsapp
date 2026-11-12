import axios from "axios";
import { findRider } from "./motogp-riders.js";

const BASE_URL = "https://api.motogp.pulselive.com/motogp/v1";

// Cache variables for season and category to avoid repeated requests
let cachedSeasonUuid: string | null = null;
let cachedCategoryUuid: string | null = null;

// Formatter to Spain peninsular time
function formatMotoGPDate(dateIso?: string): string {
  if (!dateIso) return "Por confirmar";
  try {
    const d = new Date(dateIso);
    return d.toLocaleString("es-ES", {
      timeZone: "Europe/Madrid",
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return dateIso;
  }
}

async function getSeasonAndCategory(): Promise<{ seasonUuid: string; categoryUuid: string }> {
  if (cachedSeasonUuid && cachedCategoryUuid) {
    return { seasonUuid: cachedSeasonUuid, categoryUuid: cachedCategoryUuid };
  }

  const seasonsRes = await axios.get(`${BASE_URL}/results/seasons`, { timeout: 8000 });
  const currentSeason =
    seasonsRes.data.find((s: any) => s.current) ||
    seasonsRes.data.find((s: any) => s.year === new Date().getFullYear()) ||
    seasonsRes.data[0];

  cachedSeasonUuid = currentSeason.id;

  const catRes = await axios.get(`${BASE_URL}/results/categories?seasonUuid=${cachedSeasonUuid}`, {
    timeout: 8000,
  });
  const motogpCat =
    catRes.data.find((c: any) => c.name.toLowerCase().includes("motogp")) || catRes.data[0];

  cachedCategoryUuid = motogpCat.id;

  return { seasonUuid: cachedSeasonUuid!, categoryUuid: cachedCategoryUuid! };
}

export async function getNextMotoGP(): Promise<string> {
  try {
    const { seasonUuid, categoryUuid } = await getSeasonAndCategory();

    const eventsRes = await axios.get(`${BASE_URL}/results/events?seasonUuid=${seasonUuid}`, {
      timeout: 10000,
    });
    const events: any[] = eventsRes.data.filter((e: any) => !e.test);

    const now = new Date();
    // Find next event where date_end is >= today
    let targetEvent = events.find((e: any) => {
      const end = new Date(`${e.date_end}T23:59:59Z`);
      return end >= now;
    });

    if (!targetEvent && events.length > 0) {
      targetEvent = events[events.length - 1]; // fallback to last
    }

    if (!targetEvent) {
      return "🏍️ No hay información del próximo Gran Premio de MotoGP disponible en este momento.";
    }

    // Fetch sessions for this event
    const sessionsRes = await axios.get(
      `${BASE_URL}/results/sessions?eventUuid=${targetEvent.id}&categoryUuid=${categoryUuid}`,
      { timeout: 10000 }
    );
    const sessions: any[] = sessionsRes.data || [];

    let msg = `🏍️ *PRÓXIMO GRAN PREMIO DE MOTOGP*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🏆 *${targetEvent.sponsored_name || targetEvent.name}*\n`;
    msg += `📍 ${targetEvent.circuit?.name || ""} - ${targetEvent.circuit?.place || ""}, ${targetEvent.country?.name || ""}\n`;
    msg += `📅 Fechas: ${targetEvent.date_start} al ${targetEvent.date_end}\n\n`;
    msg += `🗓️ *Horarios de Sesiones (Hora España / Peninsular):*\n`;

    const sessionNames: Record<string, string> = {
      FP1: "🔹 Práctica Libre 1 (FP1)",
      FP2: "🔹 Práctica Libre 2 (FP2)",
      FP3: "🔹 Práctica Libre 3 (FP3)",
      PR: "⏱️ Práctica Clasificatoria (PR)",
      Q1: "⏱️ Clasificación 1 (Q1)",
      Q2: "⏱️ Clasificación 2 (Q2)",
      SPR: "⚡ Carrera Sprint",
      WUP: "🔹 Warm Up",
      RAC: "🏁 CARRERA PRINCIPAL",
    };

    if (sessions.length > 0) {
      // Sort sessions by date
      sessions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      for (const s of sessions) {
        let typeKey = s.type;
        if (s.number) {
          typeKey = `${s.type}${s.number}`;
        }
        const name = sessionNames[typeKey] || `🔹 ${s.type}`;
        msg += `${name}: ${formatMotoGPDate(s.date)}\n`;
      }
    } else {
      msg += `_Horarios detallados pendientes de confirmación por la FIM._\n`;
    }

    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💡 _Escribe *!motogp ayuda* para más opciones._`;
    return msg;
  } catch (err: any) {
    console.error("Error fetching next MotoGP:", err?.message);
    return "⚠️ Error al consultar el próximo Gran Premio de MotoGP. Intenta más tarde.";
  }
}

const MOTOGP_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
let motoGPStandingsRawCache: { data: any[]; expiresAt: number } | null = null;

async function fetchMotoGPStandingsRaw(): Promise<any[]> {
  const nowMs = Date.now();
  if (motoGPStandingsRawCache && motoGPStandingsRawCache.expiresAt > nowMs) {
    return motoGPStandingsRawCache.data;
  }
  const { seasonUuid, categoryUuid } = await getSeasonAndCategory();
  const res = await axios.get(
    `${BASE_URL}/results/standings?seasonUuid=${seasonUuid}&categoryUuid=${categoryUuid}`,
    { timeout: 10000 }
  );
  const classification: any[] = res.data?.classification || [];
  if (classification.length > 0) {
    motoGPStandingsRawCache = { data: classification, expiresAt: nowMs + MOTOGP_CACHE_TTL_MS };
  }
  return classification;
}

export async function getMotoGPStandings(): Promise<string> {
  try {
    const classification = await fetchMotoGPStandingsRaw();
    if (classification.length === 0) {
      return "📊 No hay datos de la clasificación de pilotos de MotoGP en este momento.";
    }

    let msg = `🏆 *CAMPEONATO DEL MUNDO MOTOGP*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

    const medals = ["🥇", "🥈", "🥉"];
    classification.slice(0, 15).forEach((item: any, idx: number) => {
      const icon = medals[idx] || `${item.position}.`;
      const rider = item.rider?.full_name || "Piloto";
      const team = item.constructor?.name || item.team?.name || "";
      const wins = item.race_wins || 0;
      const sprintWins = item.sprint_wins || 0;

      let winsStr = `${wins} vict`;
      if (sprintWins > 0) winsStr += ` + ${sprintWins} sprint`;

      msg += `${icon} *${rider}* (${team})\n      Puntos: *${item.points} pts* (${winsStr})\n`;
    });

    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💡 _Top 15 mostrado. Escribe *!motogp ayuda* para más comandos._`;
    return msg;
  } catch (err: any) {
    console.error("Error fetching MotoGP standings:", err?.message);
    return "⚠️ Error al obtener la clasificación de MotoGP. Intenta de nuevo más tarde.";
  }
}

export async function getMotoGPConstructors(): Promise<string> {
  try {
    const classification = await fetchMotoGPStandingsRaw();
    if (classification.length === 0) {
      return "📊 No hay datos de clasificación de constructores de MotoGP.";
    }

    // Aggregate points by constructor
    const constructorMap: Record<string, { points: number; wins: number }> = {};
    for (const item of classification) {
      const name = item.constructor?.name || item.team?.name || "Desconocido";
      if (!constructorMap[name]) {
        constructorMap[name] = { points: 0, wins: 0 };
      }
      constructorMap[name].points += item.points || 0;
      constructorMap[name].wins += (item.race_wins || 0) + (item.sprint_wins || 0);
    }

    const sortedConstructors = Object.entries(constructorMap).sort(
      (a, b) => b[1].points - a[1].points
    );

    let msg = `🏍️ *MUNDIAL DE CONSTRUCTORES MOTOGP*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

    const medals = ["🥇", "🥈", "🥉"];
    sortedConstructors.forEach(([name, stats], idx) => {
      const icon = medals[idx] || `${idx + 1}.`;
      msg += `${icon} *${name}*\n      Puntos totales: *${stats.points} pts* (Victorias: ${stats.wins})\n`;
    });

    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    return msg;
  } catch (err: any) {
    console.error("Error fetching MotoGP constructors:", err?.message);
    return "⚠️ Error al consultar constructores de MotoGP.";
  }
}

export async function getLastMotoGPResults(): Promise<string> {
  try {
    const { seasonUuid, categoryUuid } = await getSeasonAndCategory();

    const eventsRes = await axios.get(`${BASE_URL}/results/events?seasonUuid=${seasonUuid}`, {
      timeout: 10000,
    });
    const finishedEvents = (eventsRes.data || []).filter(
      (e: any) => !e.test && e.status === "FINISHED"
    );

    if (finishedEvents.length === 0) {
      return "🏁 No hay resultados recientes de MotoGP finalizados.";
    }

    // Pick the most recent finished event
    const lastEvent = finishedEvents[finishedEvents.length - 1];

    // Find the RAC (Race) session for this event
    const sessionsRes = await axios.get(
      `${BASE_URL}/results/sessions?eventUuid=${lastEvent.id}&categoryUuid=${categoryUuid}`,
      { timeout: 10000 }
    );
    const sessions = sessionsRes.data || [];
    const raceSession =
      sessions.find((s: any) => s.type === "RAC") ||
      sessions.find((s: any) => s.type === "SPR") ||
      sessions[sessions.length - 1];

    if (!raceSession) {
      return `🏁 No se encontraron resultados de carrera para ${lastEvent.name}.`;
    }

    const classRes = await axios.get(
      `${BASE_URL}/results/session/${raceSession.id}/classification?test=false`,
      { timeout: 10000 }
    );
    const results = classRes.data?.classification || [];

    let msg = `🏁 *RESULTADOS ÚLTIMA CARRERA MOTOGP*\n`;
    msg += `🏆 *${lastEvent.sponsored_name || lastEvent.name}*\n`;
    msg += `📍 ${lastEvent.circuit?.name || ""} (${lastEvent.date_end})\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

    const medals = ["🥇", "🥈", "🥉"];
    results.slice(0, 10).forEach((item: any, idx: number) => {
      const icon = medals[idx] || `${item.position || idx + 1}.`;
      const rider = item.rider?.full_name || "Piloto";
      const constructor = item.constructor?.name || item.team?.name || "";
      const time = item.time || (item.gap ? `+${item.gap.first}s` : item.status);
      msg += `${icon} *${rider}* (${constructor})\n      Tiempo: ${time} | +${item.points || 0} pts\n`;
    });

    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💡 _Top 10 mostrado._`;
    return msg;
  } catch (err: any) {
    console.error("Error fetching last MotoGP results:", err?.message);
    return "⚠️ Error al obtener los resultados del último GP de MotoGP.";
  }
}

export interface NextMotoGPInfo {
  eventId: string;
  season: number;
  round: number;
  raceName: string;
  fp1Date?: Date;
  qualyDate?: Date;
  raceDate?: Date;
}

let nextMotoGPInfoCache: { data: NextMotoGPInfo; expiresAt: number } | null = null;
let lastMotoGPResultsCache: { data: MotoGPResultData; expiresAt: number } | null = null;

export async function getNextMotoGPEventInfo(): Promise<NextMotoGPInfo | null> {
  try {
    const nowMs = Date.now();
    if (nextMotoGPInfoCache && nextMotoGPInfoCache.expiresAt > nowMs) {
      return nextMotoGPInfoCache.data;
    }

    const { seasonUuid, categoryUuid } = await getSeasonAndCategory();
    const eventsRes = await axios.get(`${BASE_URL}/results/events?seasonUuid=${seasonUuid}`, {
      timeout: 10000,
    });
    const events: any[] = eventsRes.data.filter((e: any) => !e.test);
    const now = new Date();

    let targetIndex = events.findIndex((e: any) => {
      const end = new Date(`${e.date_end}T23:59:59Z`);
      return end >= now;
    });

    if (targetIndex === -1 && events.length > 0) {
      targetIndex = events.length - 1;
    }

    if (targetIndex === -1) return null;

    const targetEvent = events[targetIndex];
    const season = new Date(targetEvent.date_start).getFullYear() || new Date().getFullYear();
    const round = targetIndex + 1;
    const raceName = targetEvent.sponsored_name || targetEvent.name || `GP Ronda ${round}`;

    const sessionsRes = await axios.get(
      `${BASE_URL}/results/sessions?eventUuid=${targetEvent.id}&categoryUuid=${categoryUuid}`,
      { timeout: 10000 }
    );
    const sessions: any[] = sessionsRes.data || [];
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

    const info: NextMotoGPInfo = {
      eventId: String(targetEvent.id),
      season,
      round,
      raceName,
      fp1Date: firstSession?.date ? new Date(firstSession.date) : undefined,
      qualyDate: qualySession?.date ? new Date(qualySession.date) : undefined,
      raceDate: raceSession?.date ? new Date(raceSession.date) : undefined,
    };

    nextMotoGPInfoCache = { data: info, expiresAt: nowMs + MOTOGP_CACHE_TTL_MS };
    return info;
  } catch (err: any) {
    console.error("Error getting next MotoGP event info:", err?.message);
    return null;
  }
}

export interface MotoGPResultData {
  season: number;
  round: number;
  raceName: string;
  top5: Array<{ id: string; name: string }>;
  dnfs: Array<{ id: string; name: string }>;
  qualyTop5: Array<{ id: string; name: string }>;
}

export async function getLastMotoGPResultsData(): Promise<MotoGPResultData | null> {
  try {
    const nowMs = Date.now();
    if (lastMotoGPResultsCache && lastMotoGPResultsCache.expiresAt > nowMs) {
      return lastMotoGPResultsCache.data;
    }

    const { seasonUuid, categoryUuid } = await getSeasonAndCategory();
    const eventsRes = await axios.get(`${BASE_URL}/results/events?seasonUuid=${seasonUuid}`, {
      timeout: 10000,
    });
    const finishedEvents: any[] = (eventsRes.data || []).filter(
      (e: any) => !e.test && e.status === "FINISHED"
    );

    if (finishedEvents.length === 0) return null;

    const lastEvent = finishedEvents[finishedEvents.length - 1];
    const allEvents = eventsRes.data.filter((e: any) => !e.test);
    const round = allEvents.indexOf(lastEvent) + 1;
    const season = new Date(lastEvent.date_start).getFullYear() || new Date().getFullYear();
    const raceName = lastEvent.name || lastEvent.sponsored_name || `GP Ronda ${round}`;

    const sessionsRes = await axios.get(
      `${BASE_URL}/results/sessions?eventUuid=${lastEvent.id}&categoryUuid=${categoryUuid}`,
      { timeout: 10000 }
    );
    const sessions = sessionsRes.data || [];
    const raceSession = sessions.find((s: any) => s.type === "RAC");
    if (!raceSession) return null;

    const classRes = await axios.get(
      `${BASE_URL}/results/session/${raceSession.id}/classification?test=false`,
      { timeout: 10000 }
    );
    const results: any[] = classRes.data?.classification || [];
    if (results.length < 5) return null;

    const top5: Array<{ id: string; name: string }> = [];
    for (const item of results.slice(0, 5)) {
      const parsed = findRider(item.rider?.full_name);
      top5.push({
        id: parsed?.id || item.rider?.id || "unknown",
        name: parsed?.name || item.rider?.full_name || "Piloto",
      });
    }

    const dnfs: Array<{ id: string; name: string }> = [];
    for (const item of results) {
      const statusUpper = String(item.status || "").toUpperCase();
      const isDnf =
        !item.position ||
        ["OUTSTND", "DNF", "RET", "NC", "DSQ", "DNS", "EX"].includes(statusUpper);
      if (isDnf) {
        const parsed = findRider(item.rider?.full_name);
        dnfs.push({
          id: parsed?.id || item.rider?.id || "unknown",
          name: parsed?.name || item.rider?.full_name || "Piloto",
        });
      }
    }

    // Clasificación de la sesión de Q2 / Qualy
    const qualyTop5: Array<{ id: string; name: string }> = [];
    const qSession =
      sessions.find((s: any) => s.type === "Q2") ||
      sessions.find((s: any) => s.type === "Q" && s.number === 2) ||
      sessions.find((s: any) => s.type === "Q1") ||
      sessions.find((s: any) => s.type === "Q");

    if (qSession) {
      try {
        const qClassRes = await axios.get(
          `${BASE_URL}/results/session/${qSession.id}/classification?test=false`,
          { timeout: 8000 }
        );
        const qList: any[] = qClassRes.data?.classification || [];
        for (const item of qList.slice(0, 5)) {
          const parsed = findRider(item.rider?.full_name);
          qualyTop5.push({
            id: parsed?.id || item.rider?.id || "unknown",
            name: parsed?.name || item.rider?.full_name || "Piloto",
          });
        }
      } catch (err: any) {
        console.error("Error fetching MotoGP Q2 session classification:", err?.message);
      }
    }

    const resultData: MotoGPResultData = {
      season,
      round,
      raceName,
      top5,
      dnfs,
      qualyTop5,
    };

    lastMotoGPResultsCache = { data: resultData, expiresAt: nowMs + MOTOGP_CACHE_TTL_MS };
    return resultData;
  } catch (err: any) {
    console.error("Error getting last MotoGP results data:", err?.message);
    return null;
  }
}

