import axios from "axios";

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

export async function getMotoGPStandings(): Promise<string> {
  try {
    const { seasonUuid, categoryUuid } = await getSeasonAndCategory();

    const res = await axios.get(
      `${BASE_URL}/results/standings?seasonUuid=${seasonUuid}&categoryUuid=${categoryUuid}`,
      { timeout: 10000 }
    );

    const classification: any[] = res.data?.classification || [];
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
    const { seasonUuid, categoryUuid } = await getSeasonAndCategory();

    const res = await axios.get(
      `${BASE_URL}/results/standings?seasonUuid=${seasonUuid}&categoryUuid=${categoryUuid}`,
      { timeout: 10000 }
    );

    const classification: any[] = res.data?.classification || [];
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
