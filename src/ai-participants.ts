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
async function fetchF1RealTimeTelemetry(): Promise<string> {
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

  // 2. Tiempos y posiciones en Entrenamientos Libres (OpenF1)
  try {
    const sessRes = await axios.get("https://api.openf1.org/v1/sessions?meeting_key=latest", { timeout: 6000 });
    const practices = (sessRes.data || []).filter((s: any) => s.session_name?.includes("Practice"));
    if (practices.length > 0) {
      const latestFP = practices[practices.length - 1];
      const resultsRes = await axios.get(`https://api.openf1.org/v1/session_result?session_key=${latestFP.session_key}`, { timeout: 6000 });
      const driversRes = await axios.get(`https://api.openf1.org/v1/drivers?session_key=${latestFP.session_key}`, { timeout: 6000 });
      const driverMap = new Map((driversRes.data || []).map((d: any) => [d.driver_number, d]));

      const sorted = (resultsRes.data || []).sort((a: any, b: any) => a.position - b.position);
      if (sorted.length > 0) {
        context += `\nTELEMETRÍA DE ENTRENAMIENTOS LIBRES (${latestFP.session_name} - ${latestFP.circuit_short_name || "Circuito"}):\n`;
        const top6 = sorted.slice(0, 6).map((r: any) => {
          const d: any = driverMap.get(r.driver_number);
          return `P${r.position}: ${d?.broadcast_name || r.driver_number} (${d?.team_name || ""})`;
        }).join(", ");
        context += `- Top 6 en Libres: ${top6}\n`;

        const alofp = sorted.find((r: any) => r.driver_number === 14);
        const saifp = sorted.find((r: any) => r.driver_number === 55);
        if (alofp) context += `- Alonso en Libres: P${alofp.position}\n`;
        if (saifp) context += `- Sainz en Libres: P${saifp.position}\n`;
      }
    }
  } catch (e: any) {
    // OpenF1 no disponible o aún no hay libres disputados
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
  existingBets: any[]
): Promise<AIPredictionResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const telemetry = await fetchF1RealTimeTelemetry();
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

/**
 * Registra o actualiza la apuesta de los dos participantes IA (Jarvis y Pitwall) en un grupo
 */
export async function ensureAIParticipants(
  groupJid: string,
  season: number,
  round: number,
  raceName: string
): Promise<{ text: string; registeredCount: number }> {
  const existingBets: any[] = await prisma.porraBet.findMany({
    where: { groupJid, season, round },
  });

  const aiList: Array<"jarvis" | "pitwall"> = ["jarvis", "pitwall"];
  const announcements: string[] = [];
  let registeredCount = 0;

  for (const aiKey of aiList) {
    const personality = AI_PARTICIPANTS[aiKey];
    const alreadyBet = existingBets.find((b) => b.userJid === personality.id);

    if (alreadyBet) continue; // Ya tiene apuesta registrada para este GP

    // 1. Intentar con Gemini AI
    let prediction = await askGeminiForPrediction(personality, raceName, season, existingBets);

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
    return {
      text: `ℹ️ *Jarvis AI* y *Pitwall AI* ya tienen sus pronósticos registrados para el *${raceName}*. Puedes verlos con *!porra ver*.`,
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
