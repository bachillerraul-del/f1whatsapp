import axios from "axios";
import { prisma } from "./db.js";
import { findDriver, parsePosOrDNF, KNOWN_DRIVERS, formatPos, type F1DriverDef } from "./f1-drivers.js";

const GEMINI_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
  "gemini-flash-latest",
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
    style: "Estrategias agresivas, búsqueda de pilotos revelación y apuestas arriesgadas con Alonso y Sainz.",
  },
};

interface AIPredictionResult {
  p4: F1DriverDef;
  p5: F1DriverDef;
  p6: F1DriverDef;
  alonsoPos: number; // 0 para DNF, 1..22
  sainzPos: number;
  comment: string;
}

/**
 * Recopila telemetría real del fin de semana (Entrenamientos Libres y Mundial)
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
      const alo = list.find((s: any) => s.Driver.driverId === "alonso");
      const sai = list.find((s: any) => s.Driver.driverId === "sainz");

      context += `ESTADO REAL DEL MUNDIAL:\n` +
        `- Equipos dominantes del Top 8: ${top8}\n` +
        `- Fernando Alonso: P${alo?.position || 17} con ${alo?.Constructors[0]?.name || "Aston Martin"} (${alo?.points || 0} pts). Ritmo habitual en carrera: P11 a P16.\n` +
        `- Carlos Sainz: P${sai?.position || 18} con ${sai?.Constructors[0]?.name || "Williams"} (${sai?.points || 0} pts). Ritmo habitual en carrera: P12 a P18.\n` +
        `- Nota técnica: Mercedes, Ferrari, McLaren y Red Bull copan habitualmente las posiciones 1 a 6.\n`;
    }
  } catch (e: any) {
    console.error("Error obteniendo clasificación para telemetría IA:", e?.message);
  }

  // 2. Tiempos y posiciones en Entrenamientos Libres de este Gran Premio específico (OpenF1)
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

      // Buscar de la última a la primera práctica que tenga resultados computados
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

        context += `\nTELEMETRÍA REAL DE ENTRENAMIENTOS LIBRES (${latestSession.session_name} - ${targetMeeting.meeting_name}):\n`;
        const top6 = sorted.slice(0, 6).map((r: any) => {
          const d: any = driverMap.get(r.driver_number);
          return `P${r.position}: ${d?.broadcast_name || r.driver_number} (${d?.team_name || ""})`;
        }).join(", ");
        context += `- Top 6 en Libres: ${top6}\n`;

        const alofp = sorted.find((r: any) => r.driver_number === 14);
        const saifp = sorted.find((r: any) => r.driver_number === 55);
        if (alofp) context += `- Alonso en Libres: P${alofp.position}\n`;
        if (saifp) context += `- Sainz en Libres: P${saifp.position}\n`;
      } else {
        context += `\nESTADO DE ENTRENAMIENTOS: Los entrenamientos libres de este Gran Premio aún están por disputarse o en progreso. Análisis fundamentado en ritmo de mundial y configuración de circuito.\n`;
      }
    }
  } catch (e: any) {
    // OpenF1 no disponible
  }

  return context;
}

/**
 * Consulta a Gemini AI para generar una predicción de Porra de F1
 */
async function askGeminiForPrediction(
  personality: AIPersonality,
  raceName: string,
  season: number,
  existingBets: any[],
  raceDateStr?: string
): Promise<AIPredictionResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const telemetry = await fetchF1RealTimeTelemetry(raceName, season, raceDateStr);
  const driversList = KNOWN_DRIVERS.map((d) => d.id).join(", ");
  const existingSummaries = existingBets
    .map((b) => `${b.userName}: P4=${b.p4Driver}, P5=${b.p5Driver}, P6=${b.p6Driver}, Alo=${b.alonsoPos}, Sai=${b.sainzPos}`)
    .join(" | ");

  const prompt = `Eres ${personality.name}, un ingeniero y estratega de F1 con el rol de "${personality.role}".
Tu estilo es: ${personality.style}.
Estamos en la temporada ${season} de Fórmula 1, disputando el "${raceName}".

DATOS REALES DE TELEMETRÍA Y ENTRENAMIENTOS:
${telemetry}

INSTRUCCIONES CLAVE DE REALISMO:
1. P4, P5 y P6: Debes elegir 3 pilotos distintos que razonablemente lucharán por esas posiciones según la telemetría y los libres (típicamente pilotos de Mercedes, Ferrari, McLaren o Red Bull como Russell, Leclerc, Hamilton, Norris, Piastri, etc.).
2. Fernando Alonso (Aston Martin): asígnale un puesto acorde a su ritmo real en los libres y rendimiento de su coche (típicamente zona media P10-P16, salvo que apuestes DNF o veas ritmo sobresaliente).
3. Carlos Sainz (Williams): asígnale un puesto acorde a su ritmo real en los libres y rendimiento de su coche (típicamente zona media P11-P18, o DNF).
4. NO repitas al mismo piloto en dos posiciones del Top 6.
5. REGLA ANTI-COPIA: No coincidas en más de 3 pronósticos con ninguna de las siguientes apuestas ya hechas: [${existingSummaries || "Ninguna aún"}].

Responde ÚNICAMENTE un objeto JSON válido con este formato exacto, sin texto adicional:
{
  "p4": "driver_id",
  "p5": "driver_id",
  "p6": "driver_id",
  "alonso": "puesto_o_DNF",
  "sainz": "puesto_o_DNF",
  "comment": "Frase justificando tu pronóstico con telemetría/ritmo de libres (máx 15 palabras)"
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

      const p4 = findDriver(data.p4);
      const p5 = findDriver(data.p5);
      const p6 = findDriver(data.p6);
      const alonsoPos = parsePosOrDNF(String(data.alonso));
      const sainzPos = parsePosOrDNF(String(data.sainz));

      if (p4 && p5 && p6 && alonsoPos !== null && sainzPos !== null) {
        // Validar que los 3 pilotos sean distintos
        if (p4.id !== p5.id && p4.id !== p6.id && p5.id !== p6.id) {
          return {
            p4,
            p5,
            p6,
            alonsoPos,
            sainzPos,
            comment: data.comment || "Telemetría calculada.",
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
 * Heurística deportiva inteligente y realista en caso de no tener API Key de Gemini
 */
function generateHeuristicPrediction(
  aiKey: "jarvis" | "pitwall",
  existingBets: any[]
): AIPredictionResult {
  if (aiKey === "jarvis") {
    // Jarvis: Analítico, ritmo constante de los punteros
    const p4 = findDriver("russell")!;
    const p5 = findDriver("leclerc")!;
    const p6 = findDriver("norris")!;
    return {
      p4,
      p5,
      p6,
      alonsoPos: 13,
      sainzPos: 15,
      comment: "Simulación de telemetría: Mercedes, Ferrari y McLaren copan el Top 6; zona media para Aston y Williams.",
    };
  } else {
    // Pitwall: Agresivo, busca oportunidades y arriesga con Williams
    const p4 = findDriver("hamilton")!;
    const p5 = findDriver("piastri")!;
    const p6 = findDriver("bearman")!;
    return {
      p4,
      p5,
      p6,
      alonsoPos: 11,
      sainzPos: 0, // DNF
      comment: "Estrategia de undercut para Hamilton; alto riesgo de degradación y abandono para Williams.",
    };
  }
}

export interface AIPredictionWindowStatus {
  isOpen: boolean;
  isClosed: boolean;
  qualyDate?: Date;
  diffMinutes: number;
}

/**
 * Comprueba si la ventana para que las IAs formulen sus apuestas está abierta.
 * La ventana oficial se abre 2 horas (120 minutos) antes de la Qualy (Q1),
 * tras haberse disputado y cerrado FP1, FP2 y FP3.
 */
export function checkAIPredictionWindow(race: any): AIPredictionWindowStatus {
  if (!race?.Qualifying?.date) {
    return { isOpen: true, isClosed: false, diffMinutes: 0 };
  }

  const qualyTime = race.Qualifying.time || "14:00:00Z";
  const qualyDate = new Date(`${race.Qualifying.date}T${qualyTime}`);
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

/**
 * Mensaje in-character de Jarvis y Pitwall cuando un usuario desafía a la IA
 * antes de haberse disputado las sesiones de entrenamientos libres.
 */
export function getAIPendingMessage(race: any, diffMinutes: number): string {
  const raceName = race?.raceName || "Gran Premio";
  const timeStr = formatRemainingTime(diffMinutes);

  let scheduleStr = "";
  if (race.FirstPractice?.date) {
    const fp1 = new Date(`${race.FirstPractice.date}T${race.FirstPractice.time || "12:00:00Z"}`);
    scheduleStr += `  • *FP1:* ${fp1.toLocaleString("es-ES", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" })}\n`;
  }
  if (race.SecondPractice?.date) {
    const fp2 = new Date(`${race.SecondPractice.date}T${race.SecondPractice.time || "15:00:00Z"}`);
    scheduleStr += `  • *FP2:* ${fp2.toLocaleString("es-ES", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" })}\n`;
  }
  if (race.ThirdPractice?.date) {
    const fp3 = new Date(`${race.ThirdPractice.date}T${race.ThirdPractice.time || "12:00:00Z"}`);
    scheduleStr += `  • *FP3:* ${fp3.toLocaleString("es-ES", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" })}\n`;
  }
  if (race.Qualifying?.date) {
    const q = new Date(`${race.Qualifying.date}T${race.Qualifying.time || "15:00:00Z"}`);
    scheduleStr += `  • *Clasificación (Q1):* ${q.toLocaleString("es-ES", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" })}\n`;
  }

  return `⏳ *TELEMETRÍA EN ESPERA - JARVIS AI & PITWALL AI* 🏎️📊\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `🏆 *${raceName.toUpperCase()}*\n` +
    `⏱️ Faltan *${timeStr}* para el inicio de la Clasificación.\n\n` +
    `🤖 *Jarvis AI (Estratega Analítico):*\n` +
    `_«Protocolo en espera: Aún no se han disputado los entrenamientos libres (FP1, FP2 y FP3). Formular un pronóstico sin telemetría de ritmo en pista y degradación violaría mis algoritmos de precisión.»_\n\n` +
    `🤖 *Pitwall AI (Jefe de Muro):*\n` +
    `_«En el box no quemamos neumáticos antes de tiempo. Esperaremos a ver el ritmo de tanda larga en los libres antes de arriesgar nuestra estrategia con Carlos y Fernando.»_\n\n` +
    `📅 *SESIONES CLAVE (Hora española):*\n` +
    (scheduleStr || "  • Consulta los horarios oficiales con *!f1 prox*\n") + `\n` +
    `⏰ *¿CUÁNDO PUBLICARÁN SUS PRONÓSTICOS?*\n` +
    `Ambas IAs publicarán automáticamente sus apuestas en este grupo *exactamente 2 horas antes de la Qualy*, con todos los datos de los entrenamientos libres ya procesados.\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 _¡Los humanos sí podéis registrar o cambiar ya vuestra apuesta con *!porra*!_`;
}

/**
 * Registra o actualiza la apuesta de los dos participantes IA (Jarvis y Pitwall) en un grupo
 */
export async function ensureAIParticipants(
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
        groupJid,
        season,
        round,
        userJid: { in: [AI_PARTICIPANTS.jarvis.id, AI_PARTICIPANTS.pitwall.id] },
      },
    });
  }

  const existingBets: any[] = await prisma.porraBet.findMany({
    where: { groupJid, season, round },
  });

  const aiList: Array<"jarvis" | "pitwall"> = ["jarvis", "pitwall"];
  const announcements: string[] = [];
  let registeredCount = 0;

  for (const aiKey of aiList) {
    const personality = AI_PARTICIPANTS[aiKey];
    const alreadyBet = existingBets.find((b) => b.userJid === personality.id);

    if (alreadyBet && !options?.force) continue; // Ya tiene apuesta registrada

    // 1. Intentar con Gemini AI
    let prediction = await askGeminiForPrediction(
      personality,
      raceName,
      season,
      existingBets,
      options?.raceDateStr
    );

    // 2. Si no hay API key o falló, usar heurística
    if (!prediction) {
      prediction = generateHeuristicPrediction(aiKey, existingBets);
    }

    // 3. Ajustar regla anti-copia si coincidiera en más de 3 con alguien
    for (const other of existingBets) {
      let matches = 0;
      if (other.p4Driver === prediction.p4.id) matches++;
      if (other.p5Driver === prediction.p5.id) matches++;
      if (other.p6Driver === prediction.p6.id) matches++;
      if (other.alonsoPos === prediction.alonsoPos) matches++;
      if (other.sainzPos === prediction.sainzPos) matches++;

      if (matches > 3) {
        // Diferenciar cambiando un piloto o una posición manteniendo el máximo realismo
        if (prediction.p6.id === other.p6Driver) {
          const topCandidates = ["antonelli", "russell", "hamilton", "piastri", "leclerc", "norris", "verstappen"];
          const altId = topCandidates.find((c) => c !== prediction.p4.id && c !== prediction.p5.id && c !== other.p6Driver);
          const alternative = findDriver(altId || "antonelli");
          if (alternative) prediction.p6 = alternative;
        }
        if (prediction.sainzPos === other.sainzPos) {
          // Williams en zona media (P12 a P18) o DNF
          prediction.sainzPos = prediction.sainzPos === 0 ? 16 : (prediction.sainzPos >= 18 ? 13 : prediction.sainzPos + 1);
        }
      }
    }

    // 4. Guardar en Base de Datos
    await prisma.porraBet.upsert({
      where: {
        groupJid_season_round_userJid: {
          groupJid,
          season,
          round,
          userJid: personality.id,
        },
      },
      create: {
        groupJid,
        userJid: personality.id,
        userName: personality.name,
        season,
        round,
        raceName,
        p4Driver: prediction.p4.id,
        p4Name: prediction.p4.name,
        p5Driver: prediction.p5.id,
        p5Name: prediction.p5.name,
        p6Driver: prediction.p6.id,
        p6Name: prediction.p6.name,
        alonsoPos: prediction.alonsoPos,
        sainzPos: prediction.sainzPos,
      },
      update: {
        userName: personality.name,
        raceName,
        p4Driver: prediction.p4.id,
        p4Name: prediction.p4.name,
        p5Driver: prediction.p5.id,
        p5Name: prediction.p5.name,
        p6Driver: prediction.p6.id,
        p6Name: prediction.p6.name,
        alonsoPos: prediction.alonsoPos,
        sainzPos: prediction.sainzPos,
        points: null,
        breakdown: null,
      },
    });

    existingBets.push({
      userJid: personality.id,
      userName: personality.name,
      p4Driver: prediction.p4.id,
      p5Driver: prediction.p5.id,
      p6Driver: prediction.p6.id,
      alonsoPos: prediction.alonsoPos,
      sainzPos: prediction.sainzPos,
    });

    announcements.push(
      `🔹 *${personality.name}* (${personality.role}):\n` +
        `  • P4: ${prediction.p4.name} | P5: ${prediction.p5.name} | P6: ${prediction.p6.name}\n` +
        `  • 🇪🇸 Alo: ${formatPos(prediction.alonsoPos)} | Sai: ${formatPos(prediction.sainzPos)}\n` +
        `  💬 _«${prediction.comment}»_`
    );
    registeredCount++;
  }

  if (registeredCount === 0) {
    const existingJarvis = existingBets.find((b) => b.userJid === AI_PARTICIPANTS.jarvis.id);
    const existingPitwall = existingBets.find((b) => b.userJid === AI_PARTICIPANTS.pitwall.id);
    let summary = `🤖 *PRONÓSTICOS REGISTRADOS DE LA IA - ${raceName.toUpperCase()}* ⚡\n━━━━━━━━━━━━━━━━━━━━━\n`;
    if (existingJarvis) {
      summary += `🔹 *${AI_PARTICIPANTS.jarvis.name}*:\n  • P4: ${existingJarvis.p4Name} | P5: ${existingJarvis.p5Name} | P6: ${existingJarvis.p6Name}\n  • 🇪🇸 Alo: ${formatPos(existingJarvis.alonsoPos)} | Sai: ${formatPos(existingJarvis.sainzPos)}\n\n`;
    }
    if (existingPitwall) {
      summary += `🔹 *${AI_PARTICIPANTS.pitwall.name}*:\n  • P4: ${existingPitwall.p4Name} | P5: ${existingPitwall.p5Name} | P6: ${existingPitwall.p6Name}\n  • 🇪🇸 Alo: ${formatPos(existingPitwall.alonsoPos)} | Sai: ${formatPos(existingPitwall.sainzPos)}\n\n`;
    }
    summary += `━━━━━━━━━━━━━━━━━━━━━\nConsulta todos los pronósticos con *!porra ver*.`;

    return {
      text: summary,
      registeredCount: 0,
    };
  }

  const header = `🤖 *¡LOS PARTICIPANTES IA SE UNEN A LA PORRA!* ⚡\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `🏆 *${raceName.toUpperCase()}*\n` +
    `Gemini AI ha procesado los datos de telemetría y formulado las siguientes apuestas:\n\n` +
    announcements.join("\n\n") +
    `\n━━━━━━━━━━━━━━━━━━━━━\n` +
    `¿Podrá algún humano superar a la Inteligencia Artificial este fin de semana? ¡Manda tu apuesta con *!porra*! 🏁`;

  return {
    text: header,
    registeredCount,
  };
}

export interface UserBetToAnalyze {
  userName: string;
  p4Name: string;
  p4Driver: string;
  p5Name: string;
  p5Driver: string;
  p6Name: string;
  p6Driver: string;
  alonsoPos: number; // 0=DNF, 1..22
  sainzPos: number;
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
  const telemetry = await fetchF1RealTimeTelemetry(raceName, season, raceDateStr);

  const aloStr = bet.alonsoPos === 0 ? "DNF (Abandono)" : `P${bet.alonsoPos}`;
  const saiStr = bet.sainzPos === 0 ? "DNF (Abandono)" : `P${bet.sainzPos}`;

  let probability = "14%";
  let jarvisComment = "Degradación y ritmo de carrera comprometen las posiciones elegidas en zona media.";
  let pitwallComment = "¡Apuesta agresiva! Si hay coche de seguridad o lluvia en pista, puedes llevarte el podio.";

  if (apiKey) {
    const prompt = `Eres el panel técnico de ingenieros de F1 compuesto por Jarvis AI y Pitwall AI.
Estamos en la temporada ${season}, disputando el "${raceName}".
El jugador "${bet.userName}" ha registrado el siguiente pronóstico:
- P4: ${bet.p4Name}
- P5: ${bet.p5Name}
- P6: ${bet.p6Name}
- Fernando Alonso (Aston Martin): ${aloStr}
- Carlos Sainz (Williams): ${saiStr}

DATOS Y TELEMETRÍA REAL:
${telemetry}

INSTRUCCIONES:
1. Evalúa la viabilidad del pronóstico de ${bet.userName} con realismo técnico y humor F1.
2. Jarvis AI: Estratega analítico. Evalúa con telemetría y ritmo real de libres/mundial (máx 25 palabras).
3. Pitwall AI: Ingeniero de muro pasional y agresivo. Opina con tono de muro de boxes y banderas (máx 25 palabras).
4. Estima un porcentaje de probabilidad creíble (ej: "9%", "22%", etc.).

Responde ÚNICAMENTE un JSON válido con este formato:
{
  "probability": "18%",
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
            probability = data.probability || "15%";
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

  return `📊 *AUDITORÍA TELEMÉTRICA DE APUESTA* 🏎️🔍\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 *Piloto:* ${bet.userName}\n` +
    `🏆 *Gran Premio:* ${raceName}\n` +
    `🎯 *Pronóstico auditado:*\n` +
    `  • P4: *${bet.p4Name}* | P5: *${bet.p5Name}* | P6: *${bet.p6Name}*\n` +
    `  • 🇪🇸 Alonso: *${formatPos(bet.alonsoPos)}* | Sainz: *${formatPos(bet.sainzPos)}*\n\n` +
    `📈 *Probabilidad estimada:* *${probability}*\n\n` +
    `🤖 *Jarvis AI (Telemetría):*\n` +
    `_«${jarvisComment}»_\n\n` +
    `🤖 *Pitwall AI (Muro de Boxes):*\n` +
    `_«${pitwallComment}»_\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 _Puedes afinar o cambiar tu pronóstico antes de la Qualy con *!porra*._`;
}

export interface PostRaceRadioData {
  raceName: string;
  winner: { userName: string; points: number };
  lastPlace?: { userName: string; points: number };
  jarvisPoints?: number;
  pitwallPoints?: number;
  officialP4: string;
  officialP5: string;
  officialP6: string;
  officialAlo: string;
  officialSai: string;
}

/**
 * INTERACCIÓN POSTERIOR: Mensajes de radio de equipo tras la carrera con felicitaciones y pique
 */
export async function generatePostRaceRadioBanter(data: PostRaceRadioData): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;

  let jarvisMsg = `Enhorabuena a ${data.winner.userName}. Los datos no mienten: su modelo predictivo superó hoy al resto de la parrilla.`;
  let pitwallMsg = `¡Qué carrerón! Box, box para ${data.lastPlace?.userName || "el pelotón de cola"}, necesitamos cambio de alerón y estrategia urgente.`;

  if (apiKey) {
    const prompt = `Eres el sistema de radio de equipo (Team Radio) de F1 para Jarvis AI y Pitwall AI tras el "${data.raceName}".
Resultados de la porra en el grupo:
- Ganador de la jornada: ${data.winner.userName} con ${data.winner.points} pts.
${data.lastPlace ? `- Último lugar: ${data.lastPlace.userName} con ${data.lastPlace.points} pts.` : ""}
- Puntos conseguidos por Jarvis AI: ${data.jarvisPoints ?? 0} pts.
- Puntos conseguidos por Pitwall AI: ${data.pitwallPoints ?? 0} pts.
Llegada real oficial: P4: ${data.officialP4}, P5: ${data.officialP5}, P6: ${data.officialP6}, Alonso: ${data.officialAlo}, Sainz: ${data.officialSai}.

Genera dos mensajes de radio cortos estilo F1 (máx 20 palabras cada uno):
1. Jarvis AI: Frase analítica/técnica felicitando al ganador o comentando la telemetría del fin de semana.
2. Pitwall AI: Frase visceral y divertida de radio de boxes vacilando al perdedor o celebrando el espectáculo.

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
