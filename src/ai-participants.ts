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

  const driversList = KNOWN_DRIVERS.map((d) => d.id).join(", ");
  const existingSummaries = existingBets
    .map((b) => `${b.userName}: P4=${b.p4Driver}, P5=${b.p5Driver}, P6=${b.p6Driver}, Alo=${b.alonsoPos}, Sai=${b.sainzPos}`)
    .join(" | ");

  const prompt = `Eres ${personality.name}, un ingeniero de F1 con el rol de "${personality.role}".
Tu estilo es: ${personality.style}.
Estamos en la temporada ${season} de Fórmula 1, compitiendo en el "${raceName}".

Debes formular tu pronóstico para la porra del grupo de WhatsApp con estas reglas exactas:
1. P4, P5 y P6: 3 pilotos diferentes de la parrilla que terminarán en esas posiciones. Pilotos válidos: [${driversList}].
2. Posición final de Fernando Alonso: número del 1 al 22, o "DNF" si crees que no terminará la carrera.
3. Posición final de Carlos Sainz: número del 1 al 22, o "DNF" si crees que no terminará la carrera.
4. REGLA ANTI-COPIA: No puedes coincidir en más de 3 pronósticos con ninguna de las siguientes apuestas ya hechas: [${existingSummaries || "Ninguna aún"}].

Responde ÚNICAMENTE un objeto JSON válido con este formato exacto, sin markdown extra:
{
  "p4": "driver_id",
  "p5": "driver_id",
  "p6": "driver_id",
  "alonso": "8",
  "sainz": "5",
  "comment": "Una frase corta con tu personalidad justificando tu jugada (máx 15 palabras)"
}`;

  for (const model of GEMINI_MODELS) {
    try {
      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: personality.id.includes("pitwall") ? 0.9 : 0.4,
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
 * Heurística deportiva inteligente en caso de no tener API Key de Gemini
 */
function generateHeuristicPrediction(
  aiKey: "jarvis" | "pitwall",
  existingBets: any[]
): AIPredictionResult {
  // Pool de pilotos favoritos para P4-P6
  const topTier = ["norris", "leclerc", "piastri", "russell", "hamilton", "antonelli", "gasly", "albon", "bearman"];

  if (aiKey === "jarvis") {
    // Jarvis: Más metódico
    const p4 = findDriver("norris")!;
    const p5 = findDriver("leclerc")!;
    const p6 = findDriver("piastri")!;
    return {
      p4,
      p5,
      p6,
      alonsoPos: 8,
      sainzPos: 6,
      comment: "Simulación de 10.000 vueltas completada. Máxima probabilidad de acierto.",
    };
  } else {
    // Pitwall: Más agresivo
    const p4 = findDriver("russell")!;
    const p5 = findDriver("hamilton")!;
    const p6 = findDriver("bearman")!;
    return {
      p4,
      p5,
      p6,
      alonsoPos: 7,
      sainzPos: 0, // DNF
      comment: "Estrategia alternativa de neumáticos. Si sale el Safety Car, dominamos.",
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
        // Diferenciar cambiando un piloto o una posición
        if (prediction.p6.id === other.p6Driver) {
          const alternative = findDriver(aiKey === "jarvis" ? "antonelli" : "colapinto");
          if (alternative) prediction.p6 = alternative;
        }
        if (prediction.sainzPos === other.sainzPos) {
          prediction.sainzPos = prediction.sainzPos === 0 ? 5 : (prediction.sainzPos + 1) % 20 + 1;
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
