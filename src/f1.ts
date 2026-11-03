import axios from "axios";

const JOLPICA_BASE = "https://api.jolpi.ca/ergast/f1";

// Helper to format dates to local Spanish format
function formatDate(dateStr?: string, timeStr?: string): string {
  if (!dateStr) return "Por confirmar";
  try {
    const fullIso = timeStr ? `${dateStr}T${timeStr}` : `${dateStr}T12:00:00Z`;
    const date = new Date(fullIso);
    return date.toLocaleString("es-ES", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: timeStr ? "2-digit" : undefined,
      minute: timeStr ? "2-digit" : undefined,
      timeZoneName: timeStr ? "short" : undefined,
    });
  } catch {
    return `${dateStr} ${timeStr || ""}`;
  }
}

export async function getNextRace(): Promise<string> {
  try {
    const res = await axios.get(`${JOLPICA_BASE}/current/next.json`, { timeout: 10000 });
    const race = res.data.MRData?.RaceTable?.Races?.[0];

    if (!race) {
      return "🏁 No hay información disponible para la próxima carrera en este momento.";
    }

    const { raceName, Circuit, round, season, date, time } = race;
    const { circuitName, Location } = Circuit || {};
    const { locality, country } = Location || {};

    let msg = `🏎️ *PRÓXIMO GRAN PREMIO DE F1*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🏆 *${raceName}* (Ronda ${round}/${season})\n`;
    msg += `📍 ${circuitName} - ${locality}, ${country}\n\n`;
    msg += `🗓️ *Horarios de Sesiones:*\n`;

    if (race.FirstPractice) {
      msg += `🔹 *Práctica 1:* ${formatDate(race.FirstPractice.date, race.FirstPractice.time)}\n`;
    }
    if (race.SecondPractice) {
      msg += `🔹 *Práctica 2:* ${formatDate(race.SecondPractice.date, race.SecondPractice.time)}\n`;
    }
    if (race.ThirdPractice) {
      msg += `🔹 *Práctica 3:* ${formatDate(race.ThirdPractice.date, race.ThirdPractice.time)}\n`;
    }
    if (race.SprintQualifying) {
      msg += `⚡ *Sprint Shootout:* ${formatDate(race.SprintQualifying.date, race.SprintQualifying.time)}\n`;
    }
    if (race.Sprint) {
      msg += `⚡ *Carrera Sprint:* ${formatDate(race.Sprint.date, race.Sprint.time)}\n`;
    }
    if (race.Qualifying) {
      msg += `⏱️ *Clasificación:* ${formatDate(race.Qualifying.date, race.Qualifying.time)}\n`;
    }
    msg += `🏁 *CARRERA:* ${formatDate(date, time)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💡 _Escribe *!f1 ayuda* para más opciones._`;

    return msg;
  } catch (err: any) {
    console.error("Error fetching next race:", err?.message);
    return "⚠️ Hubo un error al obtener la información de la próxima carrera. Intenta más tarde.";
  }
}

export async function getDriverStandings(): Promise<string> {
  try {
    const res = await axios.get(`${JOLPICA_BASE}/current/driverStandings.json`, { timeout: 10000 });
    const standingsList = res.data.MRData?.StandingsTable?.StandingsLists?.[0];

    if (!standingsList || !standingsList.DriverStandings?.length) {
      return "📊 No hay datos de la clasificación de pilotos disponibles.";
    }

    const { season, round, DriverStandings } = standingsList;

    let msg = `🏆 *CAMPEONATO DE PILOTOS F1 (${season})*\n`;
    msg += `📌 _Tras la Ronda ${round}_\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

    const medals = ["🥇", "🥈", "🥉"];
    DriverStandings.slice(0, 15).forEach((item: any, idx: number) => {
      const icon = medals[idx] || `${item.position}.`;
      const driver = `${item.Driver.givenName} ${item.Driver.familyName}`;
      const team = item.Constructors?.[0]?.name || "N/A";
      msg += `${icon} *${driver}* (${team})\n      Points: *${item.points} pts* (Victorias: ${item.wins})\n`;
    });

    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💡 _Top 15 mostrado. Escribe *!f1 ayuda* para más comandos._`;
    return msg;
  } catch (err: any) {
    console.error("Error fetching driver standings:", err?.message);
    return "⚠️ Error al consultar la tabla de pilotos. Intenta más tarde.";
  }
}

export async function getConstructorStandings(): Promise<string> {
  try {
    const res = await axios.get(`${JOLPICA_BASE}/current/constructorStandings.json`, { timeout: 10000 });
    const standingsList = res.data.MRData?.StandingsTable?.StandingsLists?.[0];

    if (!standingsList || !standingsList.ConstructorStandings?.length) {
      return "📊 No hay datos de la clasificación de constructores disponibles.";
    }

    const { season, round, ConstructorStandings } = standingsList;

    let msg = `🏎️ *CAMPEONATO DE CONSTRUCTORES F1 (${season})*\n`;
    msg += `📌 _Tras la Ronda ${round}_\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

    const medals = ["🥇", "🥈", "🥉"];
    ConstructorStandings.forEach((item: any, idx: number) => {
      const icon = medals[idx] || `${item.position}.`;
      const team = item.Constructor.name;
      msg += `${icon} *${team}*\n      Puntos: *${item.points} pts* (Victorias: ${item.wins})\n`;
    });

    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    return msg;
  } catch (err: any) {
    console.error("Error fetching constructor standings:", err?.message);
    return "⚠️ Error al consultar la tabla de constructores. Intenta más tarde.";
  }
}

export async function getLastRaceResults(): Promise<string> {
  try {
    const res = await axios.get(`${JOLPICA_BASE}/current/last/results.json`, { timeout: 10000 });
    const race = res.data.MRData?.RaceTable?.Races?.[0];

    if (!race || !race.Results?.length) {
      return "🏁 No hay resultados recientes de carreras disponibles.";
    }

    const { raceName, Circuit, Results, date } = race;

    let msg = `🏁 *RESULTADOS ÚLTIMA CARRERA*\n`;
    msg += `🏆 *${raceName}* (${date})\n`;
    msg += `📍 ${Circuit?.circuitName}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

    const medals = ["🥇", "🥈", "🥉"];
    Results.slice(0, 10).forEach((item: any, idx: number) => {
      const icon = medals[idx] || `${item.position}.`;
      const driver = `${item.Driver.givenName} ${item.Driver.familyName}`;
      const team = item.Constructor?.name || "";
      const timeOrStatus = item.Time?.time || item.status;
      msg += `${icon} *${driver}* (${team})\n      Tiempo: ${timeOrStatus} | +${item.points} pts\n`;
    });

    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💡 _Top 10 mostrado._`;
    return msg;
  } catch (err: any) {
    console.error("Error fetching last race results:", err?.message);
    return "⚠️ Error al obtener los resultados de la última carrera.";
  }
}
