import axios from "axios";
import { prisma } from "./db.js";
import { findDriver, KNOWN_DRIVERS } from "./f1-drivers.js";
import { findRider, KNOWN_RIDERS } from "./motogp-riders.js";

const GEMINI_MODELS = [
  "gemini-flash-latest",
  "gemini-3.8-flash",
  "gemini-3.1-flash-lite",
];

export interface AIPersonality {
  id: string; // userJid
  name: string; // display name
  role: string;
  style: string;
}

export const AI_PARTICIPANTS: Record<"jarvis" | "pitwall", AIPersonality> = {
  jarvis: {
    id: "ai_jarvis@bot.local",
    name: "🤖 Jarvis AI",
    role: "Estratega Cuantitativo Monte Carlo",
    style:
      "Optimización matemática de Valor Esperado (EV): cruza ritmo de sesiones libres/sprint, media ponderada de las últimas carreras y posición en el mundial para maximizar plenos, bonos de podio (+3 pts) y proximidad ±1 (2 pts), eligiendo el DNF con mayor tasa estadística de abandono.",
  },
  pitwall: {
    id: "ai_pitwall@bot.local",
    name: "🤖 Pitwall AI",
    role: "Ingeniero Jefe de Ritmo de Carrera",
    style:
      "Especialista en ritmo de tanda larga del domingo, gestión de degradación de neumáticos y remontadas en carrera: prioriza a los pilotos que más posiciones ganan en domingo y detecta abandonos por incidentes en la zona media de parrilla.",
  },
};

interface AIPredictionResult {
  p1: { id: string; name: string };
  p2: { id: string; name: string };
  p3: { id: string; name: string };
  p4: { id: string; name: string };
  p5: { id: string; name: string };
  dnf: { id: string; name: string };
  qualyP3: { id: string; name: string };
  comment: string;
}

interface RankedDriverCandidate {
  id: string;
  name: string;
  team: string;
  evScore: number; // Puntuación compuesta para Jarvis (equilibrio Qualy + Ritmo + Mundial)
  raceCraftScore: number; // Puntuación compuesta para Pitwall (énfasis en ritmo de carrera y tanda larga)
  weekendPos?: number;
  recentAvgPos?: number;
  champPos?: number;
  champPoints?: number;
}

interface DnfCandidate {
  id: string;
  name: string;
  team: string;
  dnfScore: number;
  dnfCount: number;
}

interface CompetitiveIntelligence {
  telemetryText: string;
  rankedCandidates: RankedDriverCandidate[];
  dnfCandidates: DnfCandidate[];
}

const F1_CLASSIFIED_REGEX = /^(Finished|\+\d+\s*Laps?)$/i;

/**
 * Construye un dossier de inteligencia competitiva para F1 combinando:
 * 1. Clasificación actual del Mundial (Jolpica)
 * 2. Rendimiento real y tasa de abandonos (DNF) en las últimas carreras disputadas (Jolpica)
 * 3. Todas las sesiones completadas del fin de semana actual: FP1, FP2, FP3, Sprint Qualy y Sprint (OpenF1)
 */
async function buildF1CompetitiveIntelligence(
  raceName: string,
  season: number,
  raceDateStr?: string
): Promise<CompetitiveIntelligence> {
  let telemetryText = "";

  const champMap = new Map<
    string,
    { pos: number; points: number; wins: number; team: string }
  >();
  const recentFinishesMap = new Map<string, number[]>();
  const dnfCountMap = new Map<string, number>();
  const weekendPositionsMap = new Map<string, number[]>();
  const fp2OrSprintPosMap = new Map<string, number>();

  // 1. Clasificación del Mundial de Pilotos (Jolpica)
  try {
    const sRes = await axios.get(
      "https://api.jolpi.ca/ergast/f1/current/driverStandings.json",
      { timeout: 6000 }
    );
    const list =
      sRes.data?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings ||
      [];
    if (list.length > 0) {
      for (const s of list) {
        const parsed =
          findDriver(s.Driver?.driverId || "") ||
          findDriver(s.Driver?.familyName || "") ||
          findDriver(`${s.Driver?.givenName || ""} ${s.Driver?.familyName || ""}`);
        if (parsed) {
          champMap.set(parsed.id, {
            pos: parseInt(s.position, 10) || 20,
            points: parseFloat(s.points) || 0,
            wins: parseInt(s.wins, 10) || 0,
            team: s.Constructors?.[0]?.name || "F1 Team",
          });
        }
      }
      const top10 = list
        .slice(0, 10)
        .map(
          (s: any) =>
            `P${s.position}: ${s.Driver.familyName} (${s.Constructors?.[0]?.name}) ${s.points}pts [${s.wins} vict]`
        )
        .join(", ");
      telemetryText += `1) CLASIFICACIÓN ACTUAL DEL MUNDIAL F1:\n- Top 10 Mundial: ${top10}\n`;
    }
  } catch (e: any) {
    console.error("Error obteniendo mundial F1 para telemetría IA:", e?.message);
  }

  // 2. Estado de forma reciente y estadística real de abandonos (DNF) en las últimas carreras
  try {
    const rRes = await axios.get(
      "https://api.jolpi.ca/ergast/f1/current/results.json?limit=120",
      { timeout: 7000 }
    );
    const races: any[] = rRes.data?.MRData?.RaceTable?.Races || [];
    const recentRaces = races.slice(-5); // Últimas 5 carreras disponibles

    if (recentRaces.length > 0) {
      const recentWinners: string[] = [];
      for (const r of recentRaces) {
        const results: any[] = r.Results || [];
        const p1 = results[0];
        if (p1) {
          recentWinners.push(`${r.raceName}: 1º ${p1.Driver?.familyName}`);
        }
        for (const item of results) {
          const parsed =
            findDriver(item.Driver?.driverId || "") ||
            findDriver(item.Driver?.familyName || "");
          if (!parsed) continue;

          const posNum = parseInt(item.position, 10) || 20;
          const posText = String(item.positionText || "").toUpperCase();
          const status = String(item.status || "").trim();
          const isDnf =
            ["R", "D", "E", "W", "F", "N"].includes(posText) ||
            (!F1_CLASSIFIED_REGEX.test(status) && posNum > 15);

          if (!recentFinishesMap.has(parsed.id)) {
            recentFinishesMap.set(parsed.id, []);
          }
          recentFinishesMap.get(parsed.id)!.push(posNum);

          if (isDnf) {
            dnfCountMap.set(parsed.id, (dnfCountMap.get(parsed.id) || 0) + 1);
          }
        }
      }

      telemetryText += `\n2) TENDENCIA EN LAS ÚLTIMAS ${recentRaces.length} CARRERAS:\n`;
      telemetryText += `- Ganadores recientes: ${recentWinners.join(" | ")}\n`;
    }
  } catch {
    // Continúa si el historial reciente falla
  }

  // 3. Telemetría en vivo de TODAS las sesiones completadas del GP actual (OpenF1)
  try {
    const meetingsRes = await axios.get(
      `https://api.openf1.org/v1/meetings?year=${season}`,
      { timeout: 6000 }
    );
    const meetings = meetingsRes.data || [];
    let targetMeeting: any = null;

    if (raceDateStr) {
      const rDate = new Date(raceDateStr);
      targetMeeting = meetings.find((m: any) => {
        const mDate = new Date(m.date_start);
        const diffDays =
          Math.abs(mDate.getTime() - rDate.getTime()) / (1000 * 60 * 60 * 24);
        return diffDays <= 4;
      });
    }

    if (!targetMeeting) {
      targetMeeting = meetings.find(
        (m: any) =>
          raceName
            .toLowerCase()
            .includes(m.circuit_short_name?.toLowerCase() || "___") ||
          raceName
            .toLowerCase()
            .includes(m.meeting_name?.toLowerCase() || "___")
      );
    }

    if (targetMeeting) {
      const sessRes = await axios.get(
        `https://api.openf1.org/v1/sessions?meeting_key=${targetMeeting.meeting_key}`,
        { timeout: 6000 }
      );
      const allSessions: any[] = sessRes.data || [];
      // Filtrar prácticas y sesiones Sprint previas a la Qualy
      const relevantSessions = allSessions.filter((s: any) => {
        const name = String(s.session_name || "").toLowerCase();
        return name.includes("practice") || name.includes("sprint");
      });

      const sessionSummaries: string[] = [];

      for (const s of relevantSessions) {
        try {
          const resRes = await axios.get(
            `https://api.openf1.org/v1/session_result?session_key=${s.session_key}`,
            { timeout: 4000 }
          );
          if (!Array.isArray(resRes.data) || resRes.data.length === 0) continue;

          const driversRes = await axios.get(
            `https://api.openf1.org/v1/drivers?session_key=${s.session_key}`,
            { timeout: 4000 }
          );
          const driverMap = new Map(
            (driversRes.data || []).map((d: any) => [d.driver_number, d])
          );
          const sorted = resRes.data
            .filter((r: any) => r.position && r.position > 0)
            .sort((a: any, b: any) => a.position - b.position);

          if (sorted.length === 0) continue;

          const isLongRunSession =
            String(s.session_name).toLowerCase().includes("practice 2") ||
            String(s.session_name).toLowerCase() === "sprint";

          for (const r of sorted) {
            const dInfo: any = driverMap.get(r.driver_number);
            const parsed =
              findDriver(dInfo?.last_name || "") ||
              findDriver(dInfo?.broadcast_name || "") ||
              findDriver(dInfo?.name_acronym || "") ||
              findDriver(String(r.driver_number));

            if (parsed) {
              if (!weekendPositionsMap.has(parsed.id)) {
                weekendPositionsMap.set(parsed.id, []);
              }
              weekendPositionsMap.get(parsed.id)!.push(r.position);
              if (isLongRunSession) {
                fp2OrSprintPosMap.set(parsed.id, r.position);
              }
            }
          }

          const top8 = sorted
            .slice(0, 8)
            .map((r: any) => {
              const d: any = driverMap.get(r.driver_number);
              return `P${r.position}:${d?.name_acronym || d?.broadcast_name || r.driver_number}`;
            })
            .join(", ");
          sessionSummaries.push(`- ${s.session_name}: ${top8}`);
        } catch {
          // Sesión aún no disputada
        }
      }

      if (sessionSummaries.length > 0) {
        telemetryText += `\n3) TELEMETRÍA EN PISTA ESTE FIN DE SEMANA (${targetMeeting.meeting_name}):\n`;
        telemetryText += sessionSummaries.join("\n") + "\n";
      }
    }
  } catch {
    // OpenF1 no disponible
  }

  // 4. Construir el modelo cuantitativo de Valor Esperado (EV) por piloto
  const rankedCandidates: RankedDriverCandidate[] = [];
  const dnfCandidates: DnfCandidate[] = [];

  for (const driver of KNOWN_DRIVERS) {
    const champ = champMap.get(driver.id);
    const finishes = recentFinishesMap.get(driver.id) || [];
    const weekendPosList = weekendPositionsMap.get(driver.id) || [];
    const dnfCount = dnfCountMap.get(driver.id) || 0;

    // Si un piloto del catálogo no está activo ni tiene datos ni puntos, darle peso base bajo
    const champPos = champ?.pos ?? 18;
    const recentAvgPos =
      finishes.length > 0
        ? finishes.reduce((acc, v, idx) => acc + v * (idx + 1), 0) /
          finishes.reduce((acc, _, idx) => acc + (idx + 1), 0)
        : champPos;

    // Media ponderada de sesiones del fin de semana (la última sesión pesa más)
    const weekendAvgPos =
      weekendPosList.length > 0
        ? weekendPosList.reduce((acc, v, idx) => acc + v * (idx + 1), 0) /
          weekendPosList.reduce((acc, _, idx) => acc + (idx + 1), 0)
        : undefined;

    const longRunPos = fp2OrSprintPosMap.get(driver.id) ?? weekendAvgPos ?? recentAvgPos;

    // Convertir posiciones esperadas (1..20) en puntuación (0..100)
    const champScore = Math.max(0, 100 - (champPos - 1) * 5.2);
    const recentScore = Math.max(0, 100 - (recentAvgPos - 1) * 5.2);
    const weekendScore =
      weekendAvgPos !== undefined
        ? Math.max(0, 100 - (weekendAvgPos - 1) * 5.2)
        : recentScore * 0.65 + champScore * 0.35;
    const longRunScore = Math.max(0, 100 - (longRunPos - 1) * 5.2);

    // Jarvis prioriza la precisión combinada (50% ritmo fin de semana, 30% racha reciente, 20% mundial)
    const evScore = Number(
      (weekendScore * 0.5 + recentScore * 0.3 + champScore * 0.2).toFixed(1)
    );

    // Pitwall prioriza ritmo de carrera / tanda larga (45% FP2/Sprint, 35% racha en carrera, 20% mundial)
    const raceCraftScore = Number(
      (longRunScore * 0.45 + recentScore * 0.35 + champScore * 0.2).toFixed(1)
    );

    rankedCandidates.push({
      id: driver.id,
      name: driver.name,
      team: champ?.team || "F1",
      evScore,
      raceCraftScore,
      weekendPos: weekendAvgPos ? Number(weekendAvgPos.toFixed(1)) : undefined,
      recentAvgPos: Number(recentAvgPos.toFixed(1)),
      champPos: champ?.pos,
      champPoints: champ?.points,
    });

    // Índice de riesgo de DNF: prioriza pilotos con abandonos reales recientes y de mitad de parrilla (P8..P18)
    // donde hay más toques en salida y fallos mecánicos, evitando desperdiciar el DNF en el Top 4.
    const isMidfield = champPos >= 7 && champPos <= 19;
    const dnfScore =
      dnfCount * 25 +
      (isMidfield ? 18 : 0) +
      (champPos >= 11 ? 8 : 0) -
      (champPos <= 4 ? 30 : 0);

    dnfCandidates.push({
      id: driver.id,
      name: driver.name,
      team: champ?.team || "F1",
      dnfScore,
      dnfCount,
    });
  }

  rankedCandidates.sort((a, b) => b.evScore - a.evScore);
  dnfCandidates.sort((a, b) => b.dnfScore - a.dnfScore);

  const top8Model = rankedCandidates
    .slice(0, 8)
    .map(
      (c, i) =>
        `${i + 1}. id="${c.id}" (${c.name}, EV:${c.evScore}${
          c.weekendPos ? `, Libres:P${c.weekendPos}` : ""
        }, MediaReciente:P${c.recentAvgPos})`
    )
    .join("\n  ");

  const top5DnfModel = dnfCandidates
    .slice(0, 5)
    .map(
      (d) =>
        `id="${d.id}" (${d.name}, AbandonosRecientes:${d.dnfCount}, Riesgo:${d.dnfScore})`
    )
    .join(", ");

  telemetryText += `\n4) SIMULACIÓN CUANTITATIVA DE VALOR ESPERADO (MODELO MONTE CARLO):\n  ${top8Model}\n`;
  telemetryText += `\n5) PILOTOS CON MAYOR PROBABILIDAD ESTADÍSTICA DE DNF (ABANDONO):\n  ${top5DnfModel}\n`;

  return {
    telemetryText,
    rankedCandidates,
    dnfCandidates,
  };
}

/**
 * Construye un dossier de inteligencia competitiva para MotoGP combinando:
 * 1. Clasificación del Mundial MotoGP (PulseLive)
 * 2. Sesiones disputadas del GP actual: PR (Práctica que da acceso a Q2), FP1, FP2 (PulseLive)
 * 3. Resultados y caídas/abandonos (DNF) en los últimos 3 Grandes Premios (PulseLive)
 */
async function buildMotoGPCompetitiveIntelligence(): Promise<CompetitiveIntelligence> {
  let telemetryText = "";

  const champMap = new Map<
    string,
    { pos: number; points: number; wins: number; sprintWins: number; team: string }
  >();
  const recentFinishesMap = new Map<string, number[]>();
  const dnfCountMap = new Map<string, number>();
  const weekendPositionsMap = new Map<string, number[]>();

  try {
    const sRes = await axios.get(
      "https://api.motogp.pulselive.com/motogp/v1/results/seasons",
      { timeout: 6000 }
    );
    const currentSeason =
      sRes.data.find((s: any) => s.current) || sRes.data[0];
    const catRes = await axios.get(
      `https://api.motogp.pulselive.com/motogp/v1/results/categories?seasonUuid=${currentSeason.id}`,
      { timeout: 6000 }
    );
    const cat =
      catRes.data.find((c: any) => c.name.toLowerCase().includes("motogp")) ||
      catRes.data[0];

    // 1. Mundial de MotoGP
    const standRes = await axios.get(
      `https://api.motogp.pulselive.com/motogp/v1/results/standings?seasonUuid=${currentSeason.id}&categoryUuid=${cat.id}`,
      { timeout: 6000 }
    );
    const list: any[] = standRes.data?.classification || [];
    if (list.length > 0) {
      for (const c of list) {
        const parsed = findRider(c.rider?.full_name || "");
        if (parsed) {
          champMap.set(parsed.id, {
            pos: c.position || 20,
            points: c.points || 0,
            wins: c.race_wins || 0,
            sprintWins: c.sprint_wins || 0,
            team: c.constructor?.name || c.team?.name || "MotoGP",
          });
        }
      }
      const top10 = list
        .slice(0, 10)
        .map(
          (c: any) =>
            `P${c.position}: ${c.rider?.full_name} (${c.constructor?.name}) ${c.points}pts`
        )
        .join(", ");
      telemetryText += `1) CLASIFICACIÓN ACTUAL DEL MUNDIAL MOTOGP:\n- Top 10 Mundial: ${top10}\n`;
    }

    // 2. Eventos de la temporada (para sesiones del GP actual y últimos 3 GPs finalizados)
    const eventsRes = await axios.get(
      `https://api.motogp.pulselive.com/motogp/v1/results/events?seasonUuid=${currentSeason.id}`,
      { timeout: 6000 }
    );
    const events: any[] = (eventsRes.data || []).filter((e: any) => !e.test);
    const now = new Date();

    // 2a. Últimos 3 GPs finalizados (forma reciente y caídas/DNF reales)
    const finishedEvents = events
      .filter((e: any) => e.status === "FINISHED")
      .slice(-3);

    for (const ev of finishedEvents) {
      try {
        const sessRes = await axios.get(
          `https://api.motogp.pulselive.com/motogp/v1/results/sessions?eventUuid=${ev.id}&categoryUuid=${cat.id}`,
          { timeout: 5000 }
        );
        const racSession = (sessRes.data || []).find(
          (s: any) => s.type === "RAC"
        );
        if (!racSession) continue;

        const classRes = await axios.get(
          `https://api.motogp.pulselive.com/motogp/v1/results/session/${racSession.id}/classification?test=false`,
          { timeout: 5000 }
        );
        const results: any[] = classRes.data?.classification || [];
        for (const item of results) {
          const parsed = findRider(item.rider?.full_name || "");
          if (!parsed) continue;

          const statusUpper = String(item.status || "").toUpperCase();
          const isDnf =
            !item.position ||
            ["OUTSTND", "DNF", "RET", "NC", "DSQ", "DNS", "EX"].includes(
              statusUpper
            );

          const posNum = item.position ? Number(item.position) : 20;
          if (!recentFinishesMap.has(parsed.id)) {
            recentFinishesMap.set(parsed.id, []);
          }
          recentFinishesMap.get(parsed.id)!.push(posNum);

          if (isDnf) {
            dnfCountMap.set(parsed.id, (dnfCountMap.get(parsed.id) || 0) + 1);
          }
        }
      } catch {
        // omit
      }
    }

    // 2b. Sesiones completadas del GP actual (PR, FP1, FP2)
    const currentEvent = events.find((e: any) => {
      const end = new Date(`${e.date_end}T23:59:59Z`);
      return end >= now;
    });

    if (currentEvent) {
      try {
        const sessRes = await axios.get(
          `https://api.motogp.pulselive.com/motogp/v1/results/sessions?eventUuid=${currentEvent.id}&categoryUuid=${cat.id}`,
          { timeout: 5000 }
        );
        const practiceSessions = (sessRes.data || []).filter((s: any) =>
          ["FP", "FP1", "FP2", "PR"].includes(String(s.type).toUpperCase())
        );

        const sessionLines: string[] = [];
        for (const s of practiceSessions) {
          try {
            const classRes = await axios.get(
              `https://api.motogp.pulselive.com/motogp/v1/results/session/${s.id}/classification?test=false`,
              { timeout: 4000 }
            );
            const classList: any[] = classRes.data?.classification || [];
            if (classList.length === 0) continue;

            for (const item of classList) {
              if (!item.position) continue;
              const parsed = findRider(item.rider?.full_name || "");
              if (parsed) {
                if (!weekendPositionsMap.has(parsed.id)) {
                  weekendPositionsMap.set(parsed.id, []);
                }
                // Si es la sesión PR (que clasifica directo a Q2), darle doble peso
                const weight = String(s.type).toUpperCase() === "PR" ? 2 : 1;
                for (let w = 0; w < weight; w++) {
                  weekendPositionsMap.get(parsed.id)!.push(Number(item.position));
                }
              }
            }

            const sLabel = s.number ? `${s.type}${s.number}` : s.type;
            const top8 = classList
              .slice(0, 8)
              .map((c: any) => `P${c.position}:${c.rider?.full_name}`)
              .join(", ");
            sessionLines.push(`- Sesión ${sLabel}: ${top8}`);
          } catch {
            // Sesión aún no disputada
          }
        }

        if (sessionLines.length > 0) {
          telemetryText += `\n2) TIEMPOS EN PISTA ESTE FIN DE SEMANA (${currentEvent.name}):\n`;
          telemetryText += sessionLines.join("\n") + "\n";
        }
      } catch {
        // omit
      }
    }
  } catch {
    // Fallback si la API de MotoGP no responde
  }

  const rankedCandidates: RankedDriverCandidate[] = [];
  const dnfCandidates: DnfCandidate[] = [];

  for (const rider of KNOWN_RIDERS) {
    const champ = champMap.get(rider.id);
    const finishes = recentFinishesMap.get(rider.id) || [];
    const weekendPosList = weekendPositionsMap.get(rider.id) || [];
    const dnfCount = dnfCountMap.get(rider.id) || 0;

    const champPos = champ?.pos ?? 18;
    const recentAvgPos =
      finishes.length > 0
        ? finishes.reduce((a, b) => a + b, 0) / finishes.length
        : champPos;
    const weekendAvgPos =
      weekendPosList.length > 0
        ? weekendPosList.reduce((a, b) => a + b, 0) / weekendPosList.length
        : undefined;

    const champScore = Math.max(0, 100 - (champPos - 1) * 5.2);
    const recentScore = Math.max(0, 100 - (recentAvgPos - 1) * 5.2);
    const weekendScore =
      weekendAvgPos !== undefined
        ? Math.max(0, 100 - (weekendAvgPos - 1) * 5.2)
        : recentScore * 0.65 + champScore * 0.35;

    const evScore = Number(
      (weekendScore * 0.5 + recentScore * 0.3 + champScore * 0.2).toFixed(1)
    );
    const raceCraftScore = Number(
      (recentScore * 0.5 + weekendScore * 0.3 + champScore * 0.2).toFixed(1)
    );

    rankedCandidates.push({
      id: rider.id,
      name: rider.name,
      team: champ?.team || "MotoGP",
      evScore,
      raceCraftScore,
      weekendPos: weekendAvgPos ? Number(weekendAvgPos.toFixed(1)) : undefined,
      recentAvgPos: Number(recentAvgPos.toFixed(1)),
      champPos: champ?.pos,
      champPoints: champ?.points,
    });

    const isMidfield = champPos >= 6 && champPos <= 18;
    const dnfScore =
      dnfCount * 28 +
      (isMidfield ? 16 : 0) -
      (champPos <= 3 ? 25 : 0);

    dnfCandidates.push({
      id: rider.id,
      name: rider.name,
      team: champ?.team || "MotoGP",
      dnfScore,
      dnfCount,
    });
  }

  rankedCandidates.sort((a, b) => b.evScore - a.evScore);
  dnfCandidates.sort((a, b) => b.dnfScore - a.dnfScore);

  const top8Model = rankedCandidates
    .slice(0, 8)
    .map(
      (c, i) =>
        `${i + 1}. id="${c.id}" (${c.name}, EV:${c.evScore}${
          c.weekendPos ? `, Entrenos:P${c.weekendPos}` : ""
        }, MediaReciente:P${c.recentAvgPos})`
    )
    .join("\n  ");

  const top5DnfModel = dnfCandidates
    .slice(0, 5)
    .map(
      (d) =>
        `id="${d.id}" (${d.name}, CaídasRecientes:${d.dnfCount}, Riesgo:${d.dnfScore})`
    )
    .join(", ");

  telemetryText += `\n3) SIMULACIÓN CUANTITATIVA DE VALOR ESPERADO (MODELO MONTE CARLO):\n  ${top8Model}\n`;
  telemetryText += `\n4) PILOTOS CON MAYOR TASA ESTADÍSTICA DE CAÍDA/DNF:\n  ${top5DnfModel}\n`;

  return {
    telemetryText,
    rankedCandidates,
    dnfCandidates,
  };
}

/**
 * Genera una predicción determinista de alta precisión usando el modelo cuantitativo en tiempo real
 * cuando Gemini no está disponible o devuelve un formato incompleto.
 */
function generateQuantitativePrediction(
  aiKey: "jarvis" | "pitwall",
  intel: CompetitiveIntelligence,
  sport: "f1" | "motogp" = "f1"
): AIPredictionResult {
  const candidates = [...intel.rankedCandidates];

  if (aiKey === "jarvis") {
    // Jarvis ordena estrictamente por Valor Esperado (evScore)
    candidates.sort((a, b) => b.evScore - a.evScore);
  } else {
    // Pitwall ordena por ritmo de carrera (raceCraftScore) e invierte estratégicamente P2/P3 o P4/P5
    candidates.sort((a, b) => b.raceCraftScore - a.raceCraftScore);
    if (candidates.length >= 5) {
      // Si el 2º y 3º están muy parejos en ritmo de carrera, Pitwall apuesta por el adelantamiento en domingo
      const temp = candidates[1];
      candidates[1] = candidates[2];
      candidates[2] = temp;
    }
  }

  const top5 = candidates.slice(0, 5);
  const top5Ids = new Set(top5.map((c) => c.id));

  // Seleccionar DNF entre los candidatos de mayor riesgo que NO estén en el Top 5
  const validDnfs = intel.dnfCandidates.filter((d) => !top5Ids.has(d.id));
  const chosenDnf =
    aiKey === "jarvis"
      ? validDnfs[0] || candidates[10]
      : validDnfs[1] || validDnfs[0] || candidates[11];

  // Seleccionar P3 de Clasificación (QP3)
  const qualyP3Candidate =
    aiKey === "jarvis"
      ? candidates[2] || candidates[1] || candidates[0]
      : candidates[1] || candidates[2] || candidates[0];

  const comment =
    aiKey === "jarvis"
      ? `Simulación Monte Carlo: Top 5 de máximo EV (${top5[0].name} P1), QP3: ${qualyP3Candidate.name} y DNF: ${chosenDnf.name}.`
      : `Ritmo de tanda larga superior para ${top5[0].name}; QP3 para ${qualyP3Candidate.name} y riesgo de incidente para ${chosenDnf.name}.`;

  return {
    p1: { id: top5[0].id, name: top5[0].name },
    p2: { id: top5[1].id, name: top5[1].name },
    p3: { id: top5[2].id, name: top5[2].name },
    p4: { id: top5[3].id, name: top5[3].name },
    p5: { id: top5[4].id, name: top5[4].name },
    dnf: { id: chosenDnf.id, name: chosenDnf.name },
    qualyP3: { id: qualyP3Candidate.id, name: qualyP3Candidate.name },
    comment,
  };
}

/**
 * Garantiza que la predicción de la IA cumpla las reglas anti-copia:
 * 1. Prohibido coincidir en la predicción DNF con otra apuesta.
 * 2. Límite de coincidencias exactas en máximo 3 del Top 5 (en QP3 no aplica regla anti-copia).
 */
function enforceAntiCopyOptimal(
  prediction: AIPredictionResult,
  existingBets: any[],
  intel: CompetitiveIntelligence
): AIPredictionResult {
  const countTop5Matches = (pred: AIPredictionResult, other: any): number => {
    let m = 0;
    if (other.p1Driver === pred.p1.id) m++;
    if (other.p2Driver === pred.p2.id) m++;
    if (other.p3Driver === pred.p3.id) m++;
    if (other.p4Driver === pred.p4.id) m++;
    if (other.p5Driver === pred.p5.id) m++;
    return m;
  };

  const hasConflict = (pred: AIPredictionResult) =>
    existingBets.some(
      (b) =>
        b.dnfDriver === pred.dnf.id ||
        countTop5Matches(pred, b) > 3
    );

  // Asegurar primero que el DNF no coincida con el de ninguna otra apuesta
  let basePred: AIPredictionResult = { ...prediction };
  const usedDnfs = new Set(existingBets.map((b) => b.dnfDriver));
  const currentTop5Ids = new Set([
    basePred.p1.id,
    basePred.p2.id,
    basePred.p3.id,
    basePred.p4.id,
    basePred.p5.id,
  ]);
  if (usedDnfs.has(basePred.dnf.id)) {
    const altDnf =
      intel.dnfCandidates.find(
        (d) => !currentTop5Ids.has(d.id) && !usedDnfs.has(d.id)
      ) ||
      intel.rankedCandidates
        .slice()
        .reverse()
        .find((d) => !currentTop5Ids.has(d.id) && !usedDnfs.has(d.id));
    if (altDnf) {
      basePred = {
        ...basePred,
        dnf: { id: altDnf.id, name: altDnf.name },
      };
    }
  }

  if (!hasConflict(basePred)) return basePred;

  // Permutaciones estratégicas del Top 5 (en QP3 no aplica regla anti-copia)
  const topCandidates = intel.rankedCandidates.slice(0, 9);
  const altP5Candidates = [
    basePred.p5,
    ...topCandidates
      .filter(
        (c) =>
          c.id !== basePred.p1.id &&
          c.id !== basePred.p2.id &&
          c.id !== basePred.p3.id &&
          c.id !== basePred.p4.id &&
          c.id !== basePred.dnf.id
      )
      .map((c) => ({ id: c.id, name: c.name })),
  ];

  for (const p5Cand of altP5Candidates) {
    const perms: Array<[
      { id: string; name: string },
      { id: string; name: string },
      { id: string; name: string },
      { id: string; name: string },
      { id: string; name: string }
    ]> = [
      [basePred.p1, basePred.p2, basePred.p3, basePred.p4, p5Cand],
      [basePred.p1, basePred.p2, basePred.p3, p5Cand, basePred.p4],
      [basePred.p1, basePred.p3, basePred.p2, basePred.p4, p5Cand],
      [basePred.p1, basePred.p3, basePred.p2, p5Cand, basePred.p4],
      [basePred.p2, basePred.p1, basePred.p3, p5Cand, basePred.p4],
      [basePred.p2, basePred.p3, basePred.p1, p5Cand, basePred.p4],
      [basePred.p3, basePred.p2, basePred.p1, basePred.p4, p5Cand],
    ];

    for (const [p1, p2, p3, p4, p5] of perms) {
      const candidatePred: AIPredictionResult = {
        ...basePred,
        p1,
        p2,
        p3,
        p4,
        p5,
      };
      if (!hasConflict(candidatePred)) {
        return candidatePred;
      }
    }
  }

  return basePred;
}

/**
 * Consulta a Gemini AI con el dossier cuantitativo completo y optimización de teoría de juegos (sistema 3-2-1)
 */
async function askGeminiForPrediction(
  aiKey: "jarvis" | "pitwall",
  personality: AIPersonality,
  raceName: string,
  season: number,
  existingBets: any[],
  intel: CompetitiveIntelligence,
  sport: "f1" | "motogp" = "f1"
): Promise<AIPredictionResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const existingSummaries = existingBets
    .map(
      (b) =>
        `${b.userName}: P1=${b.p1Driver}, P2=${b.p2Driver}, P3=${b.p3Driver}, P4=${b.p4Driver}, P5=${b.p5Driver}, DNF=${b.dnfDriver}`
    )
    .join(" | ");

  const sportName = sport === "motogp" ? "MotoGP" : "Fórmula 1";
  const validIdsList = intel.rankedCandidates
    .slice(0, 18)
    .map((c) => `"${c.id}" (${c.name})`)
    .join(", ");

  const strategyDirective =
    aiKey === "jarvis"
      ? `ESTRATEGIA DE JARVIS AI (MÁXIMO VALOR ESPERADO - MONTE CARLO):
- Tu objetivo es ser PRÁCTICAMENTE IMBATIBLE a largo plazo maximizando el Valor Esperado (EV) según las reglas de puntuación:
  * Acierto exacto (P1..P5): 3 pts | Margen ±1 posición: 2 pts | Margen ±2 o más dentro del Top 5: 1 pt | DNF acertado: 3 pts.
  * P3 en Clasificación (Qualy P3): 3 pts si aciertas P3 exacto, 2 pts si queda P2 o P4, 1 pt si queda P1 o P5.
- Elige en el Top 5 a los 5 pilotos con mayor puntuación EV y mejor ritmo real en entrenamientos/clasificación y últimas carreras.
- Coloca en P1, P2 y P3 a los tres candidatos más sólidos al podio para asegurar 3 pts o al menos 2 pts por proximidad (±1).
- Para el DNF, elige estrictamente uno de los pilotos con mayor riesgo estadístico de abandono (Sección 5 del informe) que NO esté en tu Top 5 y que NO haya sido elegido como DNF en las apuestas existentes.
- Para "qualyP3", elige al piloto con mayor probabilidad de clasificar 3º en la sesión de Clasificación del sábado.`
      : `ESTRATEGIA DE PITWALL AI (ESPECIALISTA EN RITMO DE CARRERA Y REMONTADAS):
- Tu objetivo es GANAR LA JORNADA detectando quién tiene mejor ritmo de tanda larga el domingo (FP2 / Sprint / media de últimas carreras) frente a una sola vuelta.
- Mantén en tu Top 5 a los pilotos punteros de mayor rendimiento real (no regales puntos metiendo pilotos lentos en el Top 5), pero ajusta el orden de P1-P5 premiando a los pilotos que siempre remontan en carrera o gestionan mejor la degradación.
- Para "qualyP3", detecta al especialista de vuelta rápida de los sábados para asegurar el podio de clasificación.
- Diferénciate inteligentemente de las apuestas existentes (${existingSummaries || "ninguna aún"}) buscando ventaja competitiva en el orden del podio y eligiendo un piloto de zona media combativa con alta tasa de incidentes para el DNF (sin repetir el DNF de otra apuesta).`;

  const prompt = `Eres ${personality.name}, ingeniero jefe de competición de ${sportName} con el rol de "${personality.role}".
Estamos en la temporada ${season} de ${sportName}, disputando el "${raceName}".

DOSSIER DE TELEMETRÍA Y MODELO CUANTITATIVO EN TIEMPO REAL:
${intel.telemetryText}

${strategyDirective}

CATÁLOGO DE IDs VÁLIDOS DE PILOTOS (usa exactamente estos IDs):
${validIdsList}

REGLAS ESTRICTAS:
1. Los 5 pilotos del Top 5 (p1, p2, p3, p4, p5) deben ser 5 IDs COMPLETAMENTE DISTINTOS entre sí.
2. El piloto "dnf" NO PUEDE estar entre los 5 pilotos del Top 5.
3. El piloto "qualyP3" debe ser un ID válido que pronosticas que terminará 3º en la Clasificación del sábado (en qualyP3 no aplica regla anti-copia).
4. REGLAS ANTI-COPIA (aplican a Carrera: Top 5 + DNF):
   - Prohibido coincidir en la predicción DNF con ninguna apuesta existente: [${existingSummaries || "Ninguna aún"}].
   - Máximo 3 coincidencias exactas en el Top 5 con ninguna apuesta existente.

Responde ÚNICAMENTE un objeto JSON válido con este formato exacto, sin markdown:
{
  "p1": "id_piloto",
  "p2": "id_piloto",
  "p3": "id_piloto",
  "p4": "id_piloto",
  "p5": "id_piloto",
  "dnf": "id_piloto_que_abandona",
  "qualyP3": "id_piloto_p3_clasificacion",
  "comment": "Análisis técnico afilado justificando tu estrategia (máx 18 palabras)"
}`;

  // Temperaturas bajas/controladas para evitar alucinaciones o apuestas irracionales
  const temperature = aiKey === "jarvis" ? 0.15 : 0.4;

  for (const model of GEMINI_MODELS) {
    try {
      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature,
            maxOutputTokens: 250,
            responseMimeType: "application/json",
          },
        },
        { timeout: 9000 }
      );

      const rawText = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) continue;

      const data = JSON.parse(rawText.replace(/```json|```/g, "").trim());
      const resolveObj = (tok: string) =>
        sport === "motogp" ? findRider(String(tok || "")) : findDriver(String(tok || ""));

      const p1 = resolveObj(data.p1);
      const p2 = resolveObj(data.p2);
      const p3 = resolveObj(data.p3);
      const p4 = resolveObj(data.p4);
      const p5 = resolveObj(data.p5);
      const dnf = resolveObj(data.dnf);
      const qualyP3 = resolveObj(data.qualyP3) || resolveObj(data.p3) || p3;

      if (p1 && p2 && p3 && p4 && p5 && dnf && qualyP3) {
        const top5Ids = [p1.id, p2.id, p3.id, p4.id, p5.id];
        const uniqueSet = new Set(top5Ids);
        if (uniqueSet.size === 5 && !uniqueSet.has(dnf.id)) {
          return {
            p1: { id: p1.id, name: p1.name },
            p2: { id: p2.id, name: p2.name },
            p3: { id: p3.id, name: p3.name },
            p4: { id: p4.id, name: p4.name },
            p5: { id: p5.id, name: p5.name },
            dnf: { id: dnf.id, name: dnf.name },
            qualyP3: { id: qualyP3.id, name: qualyP3.name },
            comment: data.comment || "Estrategia de máximo valor esperado.",
          };
        }
      }
    } catch (err: any) {
      console.error(
        `[Gemini AI (${model}) for ${personality.name}]:`,
        err?.response?.data?.error?.message || err?.message
      );
    }
  }

  return null;
}

export interface AIPredictionWindowStatus {
  isOpen: boolean;
  isClosed: boolean;
  qualyDate?: Date;
  diffMinutes: number;
}

export function checkAIPredictionWindow(race: any): AIPredictionWindowStatus {
  const qualyDateRaw = race?.Qualifying?.date
    ? `${race.Qualifying.date}T${race.Qualifying.time || "14:00:00Z"}`
    : race?.qualyDate;
  if (!qualyDateRaw) {
    return { isOpen: true, isClosed: false, diffMinutes: 0 };
  }

  const qualyDate = new Date(qualyDateRaw);
  const now = new Date();
  const diffMinutes = Math.round(
    (qualyDate.getTime() - now.getTime()) / (1000 * 60)
  );

  if (diffMinutes <= 0) {
    return { isOpen: false, isClosed: true, qualyDate, diffMinutes };
  }

  if (diffMinutes <= 120) {
    return { isOpen: true, isClosed: false, qualyDate, diffMinutes };
  }

  return { isOpen: false, isClosed: false, qualyDate, diffMinutes };
}

function formatRemainingTime(minutes: number): string {
  if (minutes < 60) return `${minutes} minutos`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return `${hours}h${remainingMinutes > 0 ? " " + remainingMinutes + "m" : ""}`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days} día${days > 1 ? "s" : ""}${remHours > 0 ? " y " + remHours + "h" : ""}`;
}

export function getAIPendingMessage(
  race: any,
  diffMinutes: number,
  sport: "f1" | "motogp" = "f1"
): string {
  const raceName = race?.raceName || "Gran Premio";
  const timeStr = formatRemainingTime(diffMinutes);
  const icon = sport === "motogp" ? "🏍️" : "🏎️";

  return (
    `⏳ *TELEMETRÍA EN ESPERA - JARVIS AI & PITWALL AI* ${icon}📊\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `🏆 *${raceName.toUpperCase()}*\n` +
    `⏱️ Faltan *${timeStr}* para el inicio de la Clasificación.\n\n` +
    `🤖 *Jarvis AI (Estratega Cuantitativo):*\n` +
    `_«Simulación Monte Carlo en espera: Necesito los datos completos de todas las sesiones de Libres para calibrar el modelo de Valor Esperado (EV) y bloquear mi Top 5 óptimo.»_\n\n` +
    `🤖 *Pitwall AI (Ingeniero Jefe de Muro):*\n` +
    `_«No regalamos ventaja en el muro. Analizaremos la degradación en tanda larga hasta 2 horas antes de la Qualy para lanzar un pronóstico letal.»_\n\n` +
    `⏰ *¿CUÁNDO PUBLICARÁN SUS PRONÓSTICOS?*\n` +
    `Ambas IAs publicarán automáticamente sus apuestas en este grupo *exactamente 2 horas antes de la Clasificación*, con toda la telemetría del fin de semana procesada.\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 _¡Los humanos sí podéis registrar o cambiar ya vuestra apuesta con *!porra${sport === "motogp" ? "moto" : ""}*!_`
  );
}

/**
 * Registra o actualiza la apuesta de los dos participantes IA (Jarvis y Pitwall) en un grupo
 */
export async function ensureAIParticipants(
  sport: "f1" | "motogp",
  groupJid: string,
  season: number,
  round: number,
  raceName: string,
  options?: {
    force?: boolean;
    raceDateStr?: string;
  }
): Promise<{ text: string; registeredCount: number }> {
  if (options?.force) {
    await prisma.porraBet.deleteMany({
      where: {
        sport,
        groupJid,
        season,
        round,
        userJid: { in: [AI_PARTICIPANTS.jarvis.id, AI_PARTICIPANTS.pitwall.id] },
      },
    });
  }

  const existingBets: any[] = await prisma.porraBet.findMany({
    where: { sport, groupJid, season, round },
  });

  const aiList: Array<"jarvis" | "pitwall"> = ["jarvis", "pitwall"];
  const needsComputation = aiList.some(
    (aiKey) =>
      options?.force ||
      !existingBets.some((b) => b.userJid === AI_PARTICIPANTS[aiKey].id)
  );

  // Construir el dossier de inteligencia competitiva una sola vez para ambas IAs
  const intel: CompetitiveIntelligence | null = needsComputation
    ? sport === "motogp"
      ? await buildMotoGPCompetitiveIntelligence()
      : await buildF1CompetitiveIntelligence(
          raceName,
          season,
          options?.raceDateStr
        )
    : null;

  const announcements: string[] = [];
  let registeredCount = 0;

  for (const aiKey of aiList) {
    const personality = AI_PARTICIPANTS[aiKey];
    const alreadyBet = existingBets.find((b) => b.userJid === personality.id);

    if (alreadyBet && !options?.force) continue;

    const currentIntel =
      intel ||
      (sport === "motogp"
        ? await buildMotoGPCompetitiveIntelligence()
        : await buildF1CompetitiveIntelligence(
            raceName,
            season,
            options?.raceDateStr
          ));

    let prediction = await askGeminiForPrediction(
      aiKey,
      personality,
      raceName,
      season,
      existingBets,
      currentIntel,
      sport
    );

    if (!prediction) {
      prediction = generateQuantitativePrediction(aiKey, currentIntel, sport);
    }

    // Garantizar regla anti-copia sin perder Valor Esperado ni crear pilotos duplicados
    prediction = enforceAntiCopyOptimal(prediction, existingBets, currentIntel);

    await prisma.porraBet.upsert({
      where: {
        sport_groupJid_season_round_userJid: {
          sport,
          groupJid,
          season,
          round,
          userJid: personality.id,
        },
      },
      create: {
        sport,
        groupJid,
        userJid: personality.id,
        userName: personality.name,
        season,
        round,
        raceName,
        p1Driver: prediction.p1.id,
        p1Name: prediction.p1.name,
        p2Driver: prediction.p2.id,
        p2Name: prediction.p2.name,
        p3Driver: prediction.p3.id,
        p3Name: prediction.p3.name,
        p4Driver: prediction.p4.id,
        p4Name: prediction.p4.name,
        p5Driver: prediction.p5.id,
        p5Name: prediction.p5.name,
        dnfDriver: prediction.dnf.id,
        dnfName: prediction.dnf.name,
        qualyP3Driver: prediction.qualyP3.id,
        qualyP3Name: prediction.qualyP3.name,
      },
      update: {
        userName: personality.name,
        raceName,
        p1Driver: prediction.p1.id,
        p1Name: prediction.p1.name,
        p2Driver: prediction.p2.id,
        p2Name: prediction.p2.name,
        p3Driver: prediction.p3.id,
        p3Name: prediction.p3.name,
        p4Driver: prediction.p4.id,
        p4Name: prediction.p4.name,
        p5Driver: prediction.p5.id,
        p5Name: prediction.p5.name,
        dnfDriver: prediction.dnf.id,
        dnfName: prediction.dnf.name,
        qualyP3Driver: prediction.qualyP3.id,
        qualyP3Name: prediction.qualyP3.name,
        points: null,
        breakdown: null,
      },
    });

    existingBets.push({
      userJid: personality.id,
      userName: personality.name,
      p1Driver: prediction.p1.id,
      p2Driver: prediction.p2.id,
      p3Driver: prediction.p3.id,
      p4Driver: prediction.p4.id,
      p5Driver: prediction.p5.id,
      dnfDriver: prediction.dnf.id,
      qualyP3Driver: prediction.qualyP3.id,
    });

    announcements.push(
      `🔹 *${personality.name}* (${personality.role}):\n` +
        `  • Top 5: 1º *${prediction.p1.name}* | 2º *${prediction.p2.name}* | 3º *${prediction.p3.name}* | 4º *${prediction.p4.name}* | 5º *${prediction.p5.name}*\n` +
        `  • 💥 DNF: *${prediction.dnf.name}* | ⏱️ P3 Qualy: *${prediction.qualyP3.name}*\n` +
        `  💬 _«${prediction.comment}»_`
    );
    registeredCount++;
  }

  if (registeredCount === 0) {
    const existingJarvis = existingBets.find(
      (b) => b.userJid === AI_PARTICIPANTS.jarvis.id
    );
    const existingPitwall = existingBets.find(
      (b) => b.userJid === AI_PARTICIPANTS.pitwall.id
    );
    let summary = `🤖 *PRONÓSTICOS REGISTRADOS DE LA IA - ${raceName.toUpperCase()}* ⚡\n━━━━━━━━━━━━━━━━━━━━━\n`;
    if (existingJarvis) {
      summary += `🔹 *${AI_PARTICIPANTS.jarvis.name}*:\n  • Top 5: 1º ${existingJarvis.p1Name} | 2º ${existingJarvis.p2Name} | 3º ${existingJarvis.p3Name} | 4º ${existingJarvis.p4Name} | 5º ${existingJarvis.p5Name}\n  • 💥 DNF: ${existingJarvis.dnfName} | ⏱️ P3 Qualy: ${existingJarvis.qualyP3Name || "—"}\n\n`;
    }
    if (existingPitwall) {
      summary += `🔹 *${AI_PARTICIPANTS.pitwall.name}*:\n  • Top 5: 1º ${existingPitwall.p1Name} | 2º ${existingPitwall.p2Name} | 3º ${existingPitwall.p3Name} | 4º ${existingPitwall.p4Name} | 5º ${existingPitwall.p5Name}\n  • 💥 DNF: ${existingPitwall.dnfName} | ⏱️ P3 Qualy: ${existingPitwall.qualyP3Name || "—"}\n\n`;
    }
    summary += `━━━━━━━━━━━━━━━━━━━━━\nConsulta todos los pronósticos con *!porra${sport === "motogp" ? "moto" : ""} ver*.`;

    return {
      text: summary,
      registeredCount: 0,
    };
  }

  const sportLabel = sport === "motogp" ? "MOTOGP" : "FÓRMULA 1";
  const header =
    `🤖 *¡TELEMETRÍA PROCESADA: LAS IAs LANZAN SU APUESTA (${sportLabel})!* ⚡\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `🏆 *${raceName.toUpperCase()}*\n` +
    `Tras cruzar sesiones libres, ritmo de tanda larga, estado de forma y tasas de abandono, los modelos han bloqueado sus pronósticos (Top 5 + DNF + P3 Qualy):\n\n` +
    announcements.join("\n\n") +
    `\n━━━━━━━━━━━━━━━━━━━━━\n` +
    `¿Podrá algún humano superar el algoritmo este fin de semana? ¡Manda tu apuesta con *!porra${sport === "motogp" ? "moto" : ""}*! 🏁`;

  return {
    text: header,
    registeredCount,
  };
}

export interface UserBetToAnalyze {
  userName: string;
  sport?: "f1" | "motogp";
  p1Name: string;
  p1Driver: string;
  p2Name: string;
  p2Driver: string;
  p3Name: string;
  p3Driver: string;
  p4Name: string;
  p4Driver: string;
  p5Name: string;
  p5Driver: string;
  dnfName: string;
  dnfDriver: string;
  qualyP3Name?: string;
  qualyP3Driver?: string;
}

/**
 * INTERACCIÓN PREVIA: Auditoría y crítica de una apuesta con Jarvis AI y Pitwall AI
 */
export async function auditUserBetWithAI(
  bet: UserBetToAnalyze,
  raceName: string,
  season: number,
  raceDateStr?: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  const sport = bet.sport || "f1";
  const intel =
    sport === "motogp"
      ? await buildMotoGPCompetitiveIntelligence()
      : await buildF1CompetitiveIntelligence(raceName, season, raceDateStr);

  let probability = "18%";
  let jarvisComment =
    "Top 5 coherente con el ritmo de carrera; el pronóstico de abandono y P3 en Qualy aportan un balance matemático adecuado.";
  let pitwallComment =
    "¡Apuesta con garra! Si la salida es caótica y la clasificación se aprieta, estarás en la pelea.";

  if (apiKey) {
    const prompt = `Eres el panel técnico de ingenieros de competición compuesto por Jarvis AI y Pitwall AI.
Estamos en la temporada ${season}, disputando el "${raceName}" de ${sport === "motogp" ? "MotoGP" : "F1"}.
El jugador "${bet.userName}" ha registrado el siguiente pronóstico:
- Top 5 Carrera: 1º ${bet.p1Name}, 2º ${bet.p2Name}, 3º ${bet.p3Name}, 4º ${bet.p4Name}, 5º ${bet.p5Name}
- Abandono (DNF): ${bet.dnfName}
- P3 en Clasificación (Qualy): ${bet.qualyP3Name || "No indicado"}

DATOS Y TELEMETRÍA REAL DEL FIN DE SEMANA:
${intel.telemetryText}

INSTRUCCIONES:
1. Evalúa la viabilidad del pronóstico de ${bet.userName} comparándolo con nuestro modelo cuantitativo de telemetría (Top 5 Carrera, DNF y P3 Clasificación).
2. Jarvis AI: Estratega cuantitativo implacable. Señala qué aciertos o fallos matemáticos de Valor Esperado tiene su Top 5, su DNF y su P3 de Qualy (máx 25 palabras).
3. Pitwall AI: Ingeniero jefe de muro. Opina sobre el ritmo de tanda larga, degradación y dónde puede perder puntos frente a la IA (máx 25 palabras).
4. Estima un porcentaje de probabilidad creíble de superar a la IA (ej: "12%", "26%", "34%").

Responde ÚNICAMENTE un JSON válido con este formato:
{
  "probability": "22%",
  "jarvis": "Comentario técnico de Jarvis...",
  "pitwall": "Comentario estratégico de Pitwall..."
}`;

    for (const model of GEMINI_MODELS) {
      try {
        const res = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.6,
              maxOutputTokens: 250,
              responseMimeType: "application/json",
            },
          },
          { timeout: 9000 }
        );
        const rawText = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const data = JSON.parse(rawText.replace(/```json|```/g, "").trim());
          if (data.jarvis && data.pitwall) {
            probability = data.probability || "20%";
            jarvisComment = data.jarvis;
            pitwallComment = data.pitwall;
            break;
          }
        }
      } catch {
        // siguiente modelo
      }
    }
  }

  const icon = sport === "motogp" ? "🏍️" : "🏎️";
  return (
    `📊 *AUDITORÍA TELEMÉTRICA DE APUESTA (${sport.toUpperCase()})* ${icon}🔍\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 *Piloto:* ${bet.userName}\n` +
    `🏆 *Gran Premio:* ${raceName}\n` +
    `🎯 *Pronóstico auditado (7 selecciones):*\n` +
    `  • Top 5: 1º *${bet.p1Name}* | 2º *${bet.p2Name}* | 3º *${bet.p3Name}* | 4º *${bet.p4Name}* | 5º *${bet.p5Name}*\n` +
    `  • 💥 DNF (Abandono): *${bet.dnfName}*\n` +
    `  • ⏱️ P3 Clasificación: *${bet.qualyP3Name || "No indicado"}*\n\n` +
    `📈 *Probabilidad de batir a la IA:* *${probability}*\n\n` +
    `🤖 *Jarvis AI (Modelo Monte Carlo):*\n` +
    `_«${jarvisComment}»_\n\n` +
    `🤖 *Pitwall AI (Muro de Boxes):*\n` +
    `_«${pitwallComment}»_\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 _Puedes afinar o cambiar tu pronóstico antes de la Clasificación con *!porra${sport === "motogp" ? "moto" : ""}*._`
  );
}

export interface PostRaceRadioData {
  raceName: string;
  sport?: "f1" | "motogp";
  winner: { userName: string; points: number };
  lastPlace?: { userName: string; points: number };
  jarvisPoints?: number;
  pitwallPoints?: number;
  officialP1: string;
  officialP2: string;
  officialP3: string;
  officialP4: string;
  officialP5: string;
  officialDnfs: string;
}

/**
 * INTERACCIÓN POSTERIOR: Mensajes de radio de equipo tras la carrera con felicitaciones y pique competitivo
 */
export async function generatePostRaceRadioBanter(
  data: PostRaceRadioData
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;

  let jarvisMsg = `Enhorabuena a ${data.winner.userName}. Su modelo predictivo del Top 5 superó hoy con creces la media de la parrilla.`;
  let pitwallMsg = `¡Vaya carrera! Box, box para ${data.lastPlace?.userName || "la cola del pelotón"}, necesitamos cambio de estrategia urgente para el próximo GP.`;

  if (apiKey) {
    const prompt = `Eres el sistema de radio de equipo (Team Radio) para Jarvis AI y Pitwall AI tras el "${data.raceName}" de ${data.sport === "motogp" ? "MotoGP" : "F1"}.
Resultados de la porra en el grupo:
- Ganador de la jornada: ${data.winner.userName} con ${data.winner.points} pts.
${data.lastPlace ? `- Último lugar: ${data.lastPlace.userName} con ${data.lastPlace.points} pts.` : ""}
- Puntos conseguidos por Jarvis AI: ${data.jarvisPoints ?? 0} pts.
- Puntos conseguidos por Pitwall AI: ${data.pitwallPoints ?? 0} pts.
Top 5 real oficial: 1º ${data.officialP1}, 2º ${data.officialP2}, 3º ${data.officialP3}, 4º ${data.officialP4}, 5º ${data.officialP5}.
Abandonos (DNF): ${data.officialDnfs || "Ninguno"}.

Genera dos mensajes de radio cortos y competitivos estilo competición (máx 20 palabras cada uno):
1. Jarvis AI: Si ganó una IA, presume con elegancia de la superioridad del modelo matemático; si ganó un humano, felicítalo reconociendo qué variable rompió la simulación.
2. Pitwall AI: Frase competitiva y divertida vacilando con humor al último clasificado o retando a los humanos para el próximo GP.

Responde ÚNICAMENTE en JSON válido:
{
  "jarvis": "...",
  "pitwall": "..."
}`;

    for (const model of GEMINI_MODELS) {
      try {
        const res = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.75,
              maxOutputTokens: 200,
              responseMimeType: "application/json",
            },
          },
          { timeout: 7000 }
        );
        const rawText = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const parsed = JSON.parse(rawText.replace(/```json|```/g, "").trim());
          if (parsed.jarvis && parsed.pitwall) {
            jarvisMsg = parsed.jarvis;
            pitwallMsg = parsed.pitwall;
            break;
          }
        }
      } catch {
        // siguiente modelo
      }
    }
  }

  return (
    `📻 *RADIO DE EQUIPO TRAS LA BANDERA A CUADROS* 🏁\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `🤖 *Jarvis AI:* _«${jarvisMsg}»_\n\n` +
    `🤖 *Pitwall AI:* _«${pitwallMsg}»_\n` +
    `━━━━━━━━━━━━━━━━━━━━━`
  );
}
