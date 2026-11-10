import axios from "axios";
import { prisma } from "./db.js";
import { findDriver, KNOWN_DRIVERS, type F1DriverDef } from "./f1-drivers.js";
import { findRider, KNOWN_RIDERS, type MotoGPRiderDef } from "./motogp-riders.js";

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
    role: "Estratega Analítico de Telemetría",
    style: "Cálculo puro de probabilidades, estadísticas de la temporada y ritmo de clasificación.",
  },
  pitwall: {
    id: "ai_pitwall@bot.local",
    name: "🤖 Pitwall AI",
    role: "Jefe de Muro de Boxes Audaz",
    style: "Estrategias agresivas, búsqueda de pilotos revelación y apuestas de alto riesgo.",
  },
};

interface AIPredictionResult {
  p1: { id: string; name: string };
  p2: { id: string; name: string };
  p3: { id: string; name: string };
  p4: { id: string; name: string };
  p5: { id: string; name: string };
  dnf: { id: string; name: string };
  comment: string;
}

/**
 * Recopila telemetría real del fin de semana de F1 (Entrenamientos Libres y Mundial)
 */
async function fetchF1RealTimeTelemetry(
  raceName: string,
  season: number,
  raceDateStr?: string
): Promise<string> {
  let context = "";

  // 1. Clasificación oficial del Mundial de Pilotos (Jolpica)
  try {
    const sRes = await axios.get("https://api.jolpi.ca/ergast/f1/current/driverStandings.json", { timeout: 6000 });
    const list = sRes.data?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings || [];
    if (list.length > 0) {
      const top8 = list.slice(0, 8).map((s: any) => `P${s.position}: ${s.Driver.familyName} (${s.Constructors[0]?.name}) ${s.points}pts`).join(", ");
      context += `ESTADO REAL DEL MUNDIAL F1:\n` +
        `- Equipos y pilotos dominantes: ${top8}\n` +
        `- Nota técnica: Mercedes, Ferrari, McLaren y Red Bull compiten por las victorias y el Top 5.\n`;
    }
  } catch (e: any) {
    console.error("Error obteniendo clasificación para telemetría IA:", e?.message);
  }

  // 2. Tiempos y posiciones en Entrenamientos Libres (OpenF1)
  try {
    const meetingsRes = await axios.get(`https://api.openf1.org/v1/meetings?year=${season}`, { timeout: 6000 });
    const meetings = meetingsRes.data || [];
    let targetMeeting: any = null;

    if (raceDateStr) {
      const rDate = new Date(raceDateStr);
      targetMeeting = meetings.find((m: any) => {
        const mDate = new Date(m.date_start);
        const diffDays = Math.abs(mDate.getTime() - rDate.getTime()) / (1000 * 60 * 60 * 24);
        return diffDays <= 4;
      });
    }

    if (!targetMeeting) {
      targetMeeting = meetings.find((m: any) =>
        raceName.toLowerCase().includes(m.circuit_short_name?.toLowerCase() || "___") ||
        raceName.toLowerCase().includes(m.meeting_name?.toLowerCase() || "___")
      );
    }

    if (targetMeeting) {
      const sessRes = await axios.get(`https://api.openf1.org/v1/sessions?meeting_key=${targetMeeting.meeting_key}`, { timeout: 6000 });
      const practices = (sessRes.data || []).filter((s: any) => s.session_name?.includes("Practice"));

      let latestResults: any[] = [];
      let latestSession: any = null;

      for (let pIdx = practices.length - 1; pIdx >= 0; pIdx--) {
        const p = practices[pIdx];
        try {
          const resRes = await axios.get(`https://api.openf1.org/v1/session_result?session_key=${p.session_key}`, { timeout: 4000 });
          if (Array.isArray(resRes.data) && resRes.data.length > 0) {
            latestResults = resRes.data;
            latestSession = p;
            break;
          }
        } catch {
          // Sesión no disputada aún o sin resultados
        }
      }

      if (latestSession && latestResults.length > 0) {
        const driversRes = await axios.get(`https://api.openf1.org/v1/drivers?session_key=${latestSession.session_key}`, { timeout: 6000 });
        const driverMap = new Map((driversRes.data || []).map((d: any) => [d.driver_number, d]));
        const sorted = latestResults.sort((a: any, b: any) => a.position - b.position);

        context += `\nTELEMETRÍA REAL DE LIBRES (${latestSession.session_name} - ${targetMeeting.meeting_name}):\n`;
        const top6 = sorted.slice(0, 6).map((r: any) => {
          const d: any = driverMap.get(r.driver_number);
          return `P${r.position}: ${d?.broadcast_name || r.driver_number} (${d?.team_name || ""})`;
        }).join(", ");
        context += `- Top 6 en Libres: ${top6}\n`;
      }
    }
  } catch (e: any) {
    // OpenF1 no disponible
  }

  return context;
}

/**
 * Recopila estado actual de MotoGP para la IA
 */
async function fetchMotoGPRealTimeTelemetry(): Promise<string> {
  try {
    const sRes = await axios.get("https://api.motogp.pulselive.com/motogp/v1/results/seasons", { timeout: 6000 });
    const currentSeason = sRes.data.find((s: any) => s.current) || sRes.data[0];
    const catRes = await axios.get(`https://api.motogp.pulselive.com/motogp/v1/results/categories?seasonUuid=${currentSeason.id}`, { timeout: 6000 });
    const cat = catRes.data.find((c: any) => c.name.toLowerCase().includes("motogp")) || catRes.data[0];
    const standRes = await axios.get(`https://api.motogp.pulselive.com/motogp/v1/results/standings?seasonUuid=${currentSeason.id}&categoryUuid=${cat.id}`, { timeout: 6000 });
    const list = standRes.data?.classification || [];
    if (list.length > 0) {
      const top8 = list.slice(0, 8).map((c: any) => `P${c.position}: ${c.rider?.full_name} (${c.constructor?.name}) ${c.points}pts`).join(", ");
      return `ESTADO REAL DEL MUNDIAL MOTOGP:\n- Pilotos líderes: ${top8}\n- Ducati, Aprilia y KTM lideran el ritmo de carrera.\n`;
    }
  } catch (e: any) {
    // omit
  }
  return "Mundial MotoGP: Ducati, Aprilia y KTM compiten por las victorias con Marc Márquez, Martín, Bagnaia y Acosta.";
}

/**
 * Consulta a Gemini AI para generar una predicción de Porra (Top 5 + DNF)
 */
async function askGeminiForPrediction(
  personality: AIPersonality,
  raceName: string,
  season: number,
  existingBets: any[],
  raceDateStr?: string,
  sport: "f1" | "motogp" = "f1"
): Promise<AIPredictionResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const telemetry = sport === "motogp"
    ? await fetchMotoGPRealTimeTelemetry()
    : await fetchF1RealTimeTelemetry(raceName, season, raceDateStr);

  const existingSummaries = existingBets
    .map((b) => `${b.userName}: P1=${b.p1Driver}, P2=${b.p2Driver}, P3=${b.p3Driver}, P4=${b.p4Driver}, P5=${b.p5Driver}, DNF=${b.dnfDriver}`)
    .join(" | ");

  const sportName = sport === "motogp" ? "MotoGP" : "Fórmula 1";

  const prompt = `Eres ${personality.name}, un estratega e ingeniero jefe de ${sportName} con el rol de "${personality.role}".
Tu estilo es: ${personality.style}.
Estamos en la temporada ${season} de ${sportName}, disputando el "${raceName}".

DATOS REALES Y RENDIMIENTO:
${telemetry}

OBJETIVO DEL JUEGO:
1. Pronosticar el TOP 5 de la carrera del domingo: P1 (Ganador), P2, P3, P4 y P5.
2. Pronosticar 1 DNF (piloto que abandonará o no terminará la carrera).
3. REGLAS:
   - Los 5 pilotos del Top 5 deben ser COMPLETAMENTE DISTINTOS entre sí.
   - El piloto DNF NO PUEDE ser uno de los 5 pilotos elegidos para el Top 5.
   - REGLA ANTI-COPIA: No coincidas en más de 4 pronósticos exactos con ninguna de las siguientes apuestas ya hechas: [${existingSummaries || "Ninguna aún"}].

Responde ÚNICAMENTE un objeto JSON válido con este formato exacto, sin texto adicional ni markdown:
{
  "p1": "id_piloto",
  "p2": "id_piloto",
  "p3": "id_piloto",
  "p4": "id_piloto",
  "p5": "id_piloto",
  "dnf": "id_piloto_que_abandona",
  "comment": "Frase justificando tu pronóstico con ritmo y estrategia (máx 15 palabras)"
}`;

  for (const model of GEMINI_MODELS) {
    try {
      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: personality.id.includes("pitwall") ? 0.8 : 0.3,
            maxOutputTokens: 250,
            responseMimeType: "application/json",
          },
        },
        { timeout: 9000 }
      );

      const rawText = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) continue;

      const data = JSON.parse(rawText.replace(/```json|```/g, "").trim());

      const resolveObj = (tok: string) => sport === "motogp" ? findRider(tok) : findDriver(tok);

      const p1 = resolveObj(data.p1);
      const p2 = resolveObj(data.p2);
      const p3 = resolveObj(data.p3);
      const p4 = resolveObj(data.p4);
      const p5 = resolveObj(data.p5);
      const dnf = resolveObj(data.dnf);

      if (p1 && p2 && p3 && p4 && p5 && dnf) {
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
            comment: data.comment || "Estrategia calculada.",
          };
        }
      }
    } catch (err: any) {
      console.error(`[Gemini AI (${model}) for ${personality.name}]:`, err?.response?.data?.error?.message || err?.message);
    }
  }

  return null;
}

/**
 * Heurística inteligente y realista en caso de no tener API Key de Gemini
 */
function generateHeuristicPrediction(
  aiKey: "jarvis" | "pitwall",
  sport: "f1" | "motogp" = "f1"
): AIPredictionResult {
  if (sport === "motogp") {
    if (aiKey === "jarvis") {
      return {
        p1: { id: "marquez", name: "Marc Márquez" },
        p2: { id: "martin", name: "Jorge Martín" },
        p3: { id: "bagnaia", name: "Francesco Bagnaia" },
        p4: { id: "acosta", name: "Pedro Acosta" },
        p5: { id: "bezzecchi", name: "Marco Bezzecchi" },
        dnf: { id: "binder", name: "Brad Binder" },
        comment: "Telemetría Ducati y ritmo superior en tandas largas para el podio.",
      };
    } else {
      return {
        p1: { id: "martin", name: "Jorge Martín" },
        p2: { id: "marquez", name: "Marc Márquez" },
        p3: { id: "acosta", name: "Pedro Acosta" },
        p4: { id: "bastianini", name: "Enea Bastianini" },
        p5: { id: "quartararo", name: "Fabio Quartararo" },
        dnf: { id: "vinales", name: "Maverick Viñales" },
        comment: "Apuesta agresiva por Martín en salida y Acosta en el podio.",
      };
    }
  }

  // F1
  if (aiKey === "jarvis") {
    return {
      p1: { id: "norris", name: "Lando Norris" },
      p2: { id: "max_verstappen", name: "Max Verstappen" },
      p3: { id: "leclerc", name: "Charles Leclerc" },
      p4: { id: "russell", name: "George Russell" },
      p5: { id: "piastri", name: "Oscar Piastri" },
      dnf: { id: "alonso", name: "Fernando Alonso" },
      comment: "Simulación de telemetría: McLaren y Red Bull dominan ritmo; riesgo mecánico en Aston Martin.",
    };
  } else {
    return {
      p1: { id: "hamilton", name: "Lewis Hamilton" },
      p2: { id: "norris", name: "Lando Norris" },
      p3: { id: "piastri", name: "Oscar Piastri" },
      p4: { id: "leclerc", name: "Charles Leclerc" },
      p5: { id: "russell", name: "George Russell" },
      dnf: { id: "sainz", name: "Carlos Sainz" },
      comment: "Estrategia de neumáticos blandos para Hamilton; alto riesgo de degradación para Williams.",
    };
  }
}

export interface AIPredictionWindowStatus {
  isOpen: boolean;
  isClosed: boolean;
  qualyDate?: Date;
  diffMinutes: number;
}

export function checkAIPredictionWindow(race: any): AIPredictionWindowStatus {
  const qualyDateRaw = race?.Qualifying?.date ? `${race.Qualifying.date}T${race.Qualifying.time || "14:00:00Z"}` : race?.qualyDate;
  if (!qualyDateRaw) {
    return { isOpen: true, isClosed: false, diffMinutes: 0 };
  }

  const qualyDate = new Date(qualyDateRaw);
  const now = new Date();
  const diffMinutes = Math.round((qualyDate.getTime() - now.getTime()) / (1000 * 60));

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

export function getAIPendingMessage(race: any, diffMinutes: number, sport: "f1" | "motogp" = "f1"): string {
  const raceName = race?.raceName || "Gran Premio";
  const timeStr = formatRemainingTime(diffMinutes);
  const icon = sport === "motogp" ? "🏍️" : "🏎️";

  return `⏳ *TELEMETRÍA EN ESPERA - JARVIS AI & PITWALL AI* ${icon}📊\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `🏆 *${raceName.toUpperCase()}*\n` +
    `⏱️ Faltan *${timeStr}* para el inicio de la Clasificación.\n\n` +
    `🤖 *Jarvis AI (Estratega Analítico):*\n` +
    `_«Protocolo en espera: Aún no se han completado los entrenamientos libres. Formular un pronóstico de Top 5 y abandono sin ritmo real en pista violaría mis algoritmos de precisión.»_\n\n` +
    `🤖 *Pitwall AI (Jefe de Muro):*\n` +
    `_«En el box no quemamos gomas antes de tiempo. Esperaremos a ver el ritmo de tanda larga antes de arriesgar nuestra estrategia.»_\n\n` +
    `⏰ *¿CUÁNDO PUBLICARÁN SUS PRONÓSTICOS?*\n` +
    `Ambas IAs publicarán automáticamente sus apuestas en este grupo *exactamente 2 horas antes de la Qualy*, con todos los datos procesados.\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 _¡Los humanos sí podéis registrar o cambiar ya vuestra apuesta con *!porra${sport === "motogp" ? " moto" : ""}*!_`;
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
  const announcements: string[] = [];
  let registeredCount = 0;

  for (const aiKey of aiList) {
    const personality = AI_PARTICIPANTS[aiKey];
    const alreadyBet = existingBets.find((b) => b.userJid === personality.id);

    if (alreadyBet && !options?.force) continue;

    let prediction = await askGeminiForPrediction(
      personality,
      raceName,
      season,
      existingBets,
      options?.raceDateStr,
      sport
    );

    if (!prediction) {
      prediction = generateHeuristicPrediction(aiKey, sport);
    }

    // Regla anti-copia: no coincidir en más de 4 exactos
    for (const other of existingBets) {
      let matches = 0;
      if (other.p1Driver === prediction.p1.id) matches++;
      if (other.p2Driver === prediction.p2.id) matches++;
      if (other.p3Driver === prediction.p3.id) matches++;
      if (other.p4Driver === prediction.p4.id) matches++;
      if (other.p5Driver === prediction.p5.id) matches++;
      if (other.dnfDriver === prediction.dnf.id) matches++;

      if (matches > 4) {
        if (sport === "f1") {
          prediction.p5 = prediction.p5.id === "piastri"
            ? { id: "russell", name: "George Russell" }
            : { id: "piastri", name: "Oscar Piastri" };
          prediction.dnf = prediction.dnf.id === "alonso"
            ? { id: "colapinto", name: "Franco Colapinto" }
            : { id: "stroll", name: "Lance Stroll" };
        } else {
          prediction.p5 = prediction.p5.id === "bezzecchi"
            ? { id: "bastianini", name: "Enea Bastianini" }
            : { id: "bezzecchi", name: "Marco Bezzecchi" };
          prediction.dnf = prediction.dnf.id === "binder"
            ? { id: "mir", name: "Joan Mir" }
            : { id: "binder", name: "Brad Binder" };
        }
      }
    }

    // Guardar en BD
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
    });

    announcements.push(
      `🔹 *${personality.name}* (${personality.role}):\n` +
        `  • Top 5: 1º *${prediction.p1.name}* | 2º *${prediction.p2.name}* | 3º *${prediction.p3.name}* | 4º *${prediction.p4.name}* | 5º *${prediction.p5.name}*\n` +
        `  • 💥 DNF: *${prediction.dnf.name}*\n` +
        `  💬 _«${prediction.comment}»_`
    );
    registeredCount++;
  }

  if (registeredCount === 0) {
    const existingJarvis = existingBets.find((b) => b.userJid === AI_PARTICIPANTS.jarvis.id);
    const existingPitwall = existingBets.find((b) => b.userJid === AI_PARTICIPANTS.pitwall.id);
    let summary = `🤖 *PRONÓSTICOS REGISTRADOS DE LA IA - ${raceName.toUpperCase()}* ⚡\n━━━━━━━━━━━━━━━━━━━━━\n`;
    if (existingJarvis) {
      summary += `🔹 *${AI_PARTICIPANTS.jarvis.name}*:\n  • Top 5: 1º ${existingJarvis.p1Name} | 2º ${existingJarvis.p2Name} | 3º ${existingJarvis.p3Name} | 4º ${existingJarvis.p4Name} | 5º ${existingJarvis.p5Name}\n  • 💥 DNF: ${existingJarvis.dnfName}\n\n`;
    }
    if (existingPitwall) {
      summary += `🔹 *${AI_PARTICIPANTS.pitwall.name}*:\n  • Top 5: 1º ${existingPitwall.p1Name} | 2º ${existingPitwall.p2Name} | 3º ${existingPitwall.p3Name} | 4º ${existingPitwall.p4Name} | 5º ${existingPitwall.p5Name}\n  • 💥 DNF: ${existingPitwall.dnfName}\n\n`;
    }
    summary += `━━━━━━━━━━━━━━━━━━━━━\nConsulta todos los pronósticos con *!porra${sport === "motogp" ? " moto" : ""} ver*.`;

    return {
      text: summary,
      registeredCount: 0,
    };
  }

  const sportLabel = sport === "motogp" ? "MOTOGP" : "FÓRMULA 1";
  const header = `🤖 *¡LOS PARTICIPANTES IA SE UNEN A LA PORRA (${sportLabel})!* ⚡\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `🏆 *${raceName.toUpperCase()}*\n` +
    `Gemini AI ha procesado los datos y formulado las siguientes apuestas de Top 5 y abandono:\n\n` +
    announcements.join("\n\n") +
    `\n━━━━━━━━━━━━━━━━━━━━━\n` +
    `¿Podrá algún humano superar a la Inteligencia Artificial este fin de semana? ¡Manda tu apuesta con *!porra${sport === "motogp" ? " moto" : ""}*! 🏁`;

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
  const telemetry = sport === "motogp"
    ? await fetchMotoGPRealTimeTelemetry()
    : await fetchF1RealTimeTelemetry(raceName, season, raceDateStr);

  let probability = "18%";
  let jarvisComment = "Top 5 coherente con el ritmo de carrera; el pronóstico de abandono aporta un balance matemático adecuado.";
  let pitwallComment = "¡Apuesta con garra! Si la salida es caótica y hay toques en la primera curva, te llevas el bote.";

  if (apiKey) {
    const prompt = `Eres el panel técnico de ingenieros de competición compuesto por Jarvis AI y Pitwall AI.
Estamos en la temporada ${season}, disputando el "${raceName}" de ${sport === "motogp" ? "MotoGP" : "F1"}.
El jugador "${bet.userName}" ha registrado el siguiente pronóstico:
- Top 5: 1º ${bet.p1Name}, 2º ${bet.p2Name}, 3º ${bet.p3Name}, 4º ${bet.p4Name}, 5º ${bet.p5Name}
- Abandono (DNF): ${bet.dnfName}

DATOS Y TELEMETRÍA REAL:
${telemetry}

INSTRUCCIONES:
1. Evalúa la viabilidad del pronóstico de ${bet.userName} con realismo técnico y humor de competición.
2. Jarvis AI: Estratega analítico. Evalúa probabilidades, ritmo y viabilidad del Top 5 y DNF (máx 25 palabras).
3. Pitwall AI: Ingeniero de muro pasional. Opina sobre agresividad, salidas, caídas/toques o lluvia (máx 25 palabras).
4. Estima un porcentaje de probabilidad creíble (ej: "14%", "28%", etc.).

Responde ÚNICAMENTE un JSON válido con este formato:
{
  "probability": "22%",
  "jarvis": "Comentario técnico de Jarvis...",
  "pitwall": "Comentario apasionado de Pitwall..."
}`;

    for (const model of GEMINI_MODELS) {
      try {
        const res = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,
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
  return `📊 *AUDITORÍA TELEMÉTRICA DE APUESTA (${sport.toUpperCase()})* ${icon}🔍\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 *Piloto:* ${bet.userName}\n` +
    `🏆 *Gran Premio:* ${raceName}\n` +
    `🎯 *Pronóstico auditado:*\n` +
    `  • Top 5: 1º *${bet.p1Name}* | 2º *${bet.p2Name}* | 3º *${bet.p3Name}* | 4º *${bet.p4Name}* | 5º *${bet.p5Name}*\n` +
    `  • 💥 DNF (Abandono): *${bet.dnfName}*\n\n` +
    `📈 *Probabilidad estimada:* *${probability}*\n\n` +
    `🤖 *Jarvis AI (Telemetría):*\n` +
    `_«${jarvisComment}»_\n\n` +
    `🤖 *Pitwall AI (Muro de Boxes):*\n` +
    `_«${pitwallComment}»_\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 _Puedes afinar o cambiar tu pronóstico antes de la Clasificación con *!porra${sport === "motogp" ? " moto" : ""}*._`;
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
 * INTERACCIÓN POSTERIOR: Mensajes de radio de equipo tras la carrera con felicitaciones y pique
 */
export async function generatePostRaceRadioBanter(data: PostRaceRadioData): Promise<string> {
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

Genera dos mensajes de radio cortos estilo competición (máx 20 palabras cada uno):
1. Jarvis AI: Frase analítica felicitando al ganador o comentando la telemetría del Top 5.
2. Pitwall AI: Frase visceral y divertida vacilando con humor al perdedor o celebrando la emoción de la carrera.

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
              temperature: 0.8,
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

  return `📻 *RADIO DE EQUIPO TRAS LA BANDERA A CUADROS* 🏁\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `🤖 *Jarvis AI:* _«${jarvisMsg}»_\n\n` +
    `🤖 *Pitwall AI:* _«${pitwallMsg}»_\n` +
    `━━━━━━━━━━━━━━━━━━━━━`;
}
