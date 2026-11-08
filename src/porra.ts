import axios from "axios";
import { prisma } from "./db.js";
import { generatePodiumImage } from "./podium-image.js";
import {
  type F1DriverDef,
  KNOWN_DRIVERS,
  findDriver,
} from "./f1-drivers.js";
import {
  type MotoGPRiderDef,
  KNOWN_RIDERS,
  findRider,
} from "./motogp-riders.js";
import {
  getNextMotoGPEventInfo,
  getLastMotoGPResultsData,
} from "./motogp.js";
import {
  ensureAIParticipants,
  checkAIPredictionWindow,
  getAIPendingMessage,
  AI_PARTICIPANTS,
  auditUserBetWithAI,
  generatePostRaceRadioBanter,
} from "./ai-participants.js";

export {
  type F1DriverDef,
  KNOWN_DRIVERS,
  findDriver,
  type MotoGPRiderDef,
  KNOWN_RIDERS,
  findRider,
};

const JOLPICA_BASE = "https://api.jolpi.ca/ergast/f1";

export interface PorraResultsResponse {
  text: string;
  imageBuffer?: Buffer | null;
}

export function getPorraRulesMessage(sport: "f1" | "motogp" = "f1"): string {
  if (sport === "motogp") {
    return `🏍️ *LA PORRA DE MOTOGP* 🏁\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 *Objetivo:* Acertar el *Top 5 de la carrera del domingo (1º al 5º)* y *1 piloto que sufrirá DNF (abandono / caída)*.\n\n` +
      `📋 *CÓMO JUGAR (Antes de la Qualy):*\n` +
      `Envía tu pronóstico con:\n` +
      `👉 *!porra moto [1º] [2º] [3º] [4º] [5º] [DNF]*\n` +
      `_(o también con !porramoto ...)_\n\n` +
      `*Ejemplos válidos:*\n` +
      `🔹 *!porra moto marquez martin bagnaia acosta bastianini dnf: binder*\n` +
      `🔹 *!porramoto marquez martin bagnaia acosta bastianini binder*\n` +
      `🔹 *!porra moto 1º marquez 2º martin 3º bagnaia 4º acosta 5º bastianini dnf mir*\n\n` +
      `🤖 *COMPETIDORES IA (Gemini):*\n` +
      `*Jarvis AI* y *Pitwall AI* compiten en el grupo analizando el rendimiento real de los pilotos.\n\n` +
      `🏆 *SISTEMA DE PUNTUACIÓN (Máx 18 pts por GP):*\n` +
      `• *+3 pts* : Por cada piloto acertado en su *posición exacta* del Top 5 (1º, 2º, 3º, 4º o 5º).\n` +
      `• *+1 pt*  : Si el piloto termina en el *Top 5*, pero en una posición distinta a la que predijiste.\n` +
      `• *+3 pts* : Si aciertas el piloto que sufre *DNF (abandono / caída)*.\n\n` +
      `⏳ *Límite:* Las apuestas se cierran al comenzar la Clasificación (Q1) del sábado.\n` +
      `🚫 *Reglas anti-copia:*\n` +
      `• Máximo 4 aciertos exactos de coincidencia con otro participante (máx 4 de 6).\n` +
      `• No se permite elegir los mismos 5 pilotos del Top 5 y el mismo DNF que otro jugador.\n\n` +
      `📊 *COMANDOS DISPONIBLES:*\n` +
      `🔹 *!porra moto [apuesta]* : Enviar o modificar tu apuesta\n` +
      `🔹 *!porra moto analizar* : Auditoría de tu apuesta con Jarvis AI y Pitwall AI\n` +
      `🔹 *!porra moto ver* : Ver las apuestas del grupo (incluyendo a las IAs)\n` +
      `🔹 *!porra moto ia* : Ver el estado/pronósticos de Jarvis AI y Pitwall AI\n` +
      `🔹 *!porra moto resultados* : Calcular puntos, podio gráfico y radio tras la carrera\n` +
      `🔹 *!porra moto historial* : Resumen de todos los GPs jugados en la temporada\n` +
      `🔹 *!porra moto tabla* : Clasificación general de MotoGP`;
  }

  return `🏁 *LA PORRA DE F1* 🏎️\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `🎯 *Objetivo:* Acertar el *Top 5 de la carrera del domingo (P1 a P5)* y *1 piloto que sufrirá DNF (abandono)*.\n\n` +
    `📋 *CÓMO JUGAR (Antes de la Qualy):*\n` +
    `Envía tu pronóstico con:\n` +
    `👉 *!porra [P1] [P2] [P3] [P4] [P5] [DNF]*\n\n` +
    `*Ejemplos válidos:*\n` +
    `🔹 *!porra ver nor lec pia rus dnf: ham*\n` +
    `🔹 *!porra verstappen norris leclerc piastri russell hamilton*\n` +
    `🔹 *!porra p1: ver p2: nor p3: lec p4: pia p5: rus dnf colapinto*\n\n` +
    `🤖 *COMPETIDORES IA (Gemini):*\n` +
    `*Jarvis AI* y *Pitwall AI* compiten en el grupo analizando la telemetría de libres.\n\n` +
    `🏆 *SISTEMA DE PUNTUACIÓN (Máx 18 pts por GP):*\n` +
    `• *+3 pts* : Por cada posición exacta acertada en el Top 5 (P1, P2, P3, P4 o P5).\n` +
    `• *+1 pt*  : Si el piloto termina en el Top 5, pero en posición incorrecta.\n` +
    `• *+3 pts* : Si aciertas el piloto que abandona la carrera (DNF).\n\n` +
    `⏳ *Límite:* Las apuestas se cierran al comenzar la Clasificación (Q1) del sábado.\n` +
    `🚫 *Reglas anti-copia:*\n` +
    `• Máximo 4 posiciones exactas de coincidencia con otro participante (máx 4 de 6).\n` +
    `• No se permite elegir los mismos 5 pilotos del Top 5 y el mismo DNF que otro jugador.\n\n` +
    `📊 *COMANDOS DISPONIBLES:*\n` +
    `🔹 *!porra [apuesta]* : Enviar o modificar tu apuesta\n` +
    `🔹 *!porra analizar* : Auditoría de tu apuesta con Jarvis AI y Pitwall AI\n` +
    `🔹 *!porra ver* : Ver las apuestas del grupo (incluyendo a las IAs)\n` +
    `🔹 *!porra ia* : Ver el estado/pronósticos de Jarvis AI y Pitwall AI\n` +
    `🔹 *!porra resultados* : Calcular puntos, podio gráfico y radio tras la carrera\n` +
    `🔹 *!porra historial* : Resumen de todos los GPs jugados en la temporada\n` +
    `🔹 *!porra tabla* : Clasificación general de la temporada\n\n` +
    `💡 _Para MotoGP usa *!porra moto* o *!porramoto*._`;
}

export const PORRA_RULES_MESSAGE = getPorraRulesMessage("f1");

export interface DriverEntry {
  id: string;
  name: string;
}

export interface ParsedPorra {
  p1: DriverEntry;
  p2: DriverEntry;
  p3: DriverEntry;
  p4: DriverEntry;
  p5: DriverEntry;
  dnf: DriverEntry;
}

/**
 * Interpreta los argumentos de la porra (Top 5 + DNF) tanto para F1 como para MotoGP
 */
export function parsePorraArgs(
  rawArgs: string[],
  sport: "f1" | "motogp" = "f1"
): { parsed?: ParsedPorra; error?: string } {
  const fullText = rawArgs.join(" ").replace(/[,;]/g, " ").trim();
  if (!fullText) {
    return {
      error: `❓ *Faltan datos en tu pronóstico de ${sport === "motogp" ? "MotoGP" : "F1"}.*\n\n` +
        `Debes indicar los 5 pilotos para el Top 5 (1º al 5º) y 1 piloto para DNF (abandono).\n` +
        `👉 *Formato:* \`!porra${sport === "motogp" ? " moto" : ""} [1º] [2º] [3º] [4º] [5º] [DNF]\`\n` +
        `👉 *Ejemplo:* ${sport === "motogp" ? "`!porra moto marquez martin bagnaia acosta bastianini dnf: binder`" : "`!porra ver nor lec pia rus dnf: ham`"}`,
    };
  }

  const finder = (q: string): DriverEntry | null => {
    if (sport === "motogp") {
      const r = findRider(q);
      return r ? { id: r.id, name: r.name } : null;
    } else {
      const d = findDriver(q);
      return d ? { id: d.id, name: d.name } : null;
    }
  };

  let dnfDriver: DriverEntry | null = null;
  let textWithoutDnf = fullText;

  // 1. Detectar etiqueta explícita de DNF (ej: "dnf: ham", "dnf hamilton", "abandono: stroll", "caida binder")
  const dnfRegex = /(?:dnf|abandono|ret|out|caida|caída)[:\s]+([a-zA-Z0-9_\-]+)/i;
  const dnfMatch = textWithoutDnf.match(dnfRegex);
  if (dnfMatch) {
    const candidate = finder(dnfMatch[1]);
    if (candidate) {
      dnfDriver = candidate;
      textWithoutDnf = textWithoutDnf.replace(dnfMatch[0], " ");
    }
  }

  // 2. Extraer etiquetas posicionales explícitas (ej: p1: ver, 1º norris, etc.)
  let p1: DriverEntry | null = null;
  let p2: DriverEntry | null = null;
  let p3: DriverEntry | null = null;
  let p4: DriverEntry | null = null;
  let p5: DriverEntry | null = null;

  const posRegex = /(?:p|pos|º|°)?([1-5])[:\sº°]+([a-zA-Z0-9_\-]+)/gi;
  let posMatch: RegExpExecArray | null;
  const matchedPositions = new Set<number>();

  while ((posMatch = posRegex.exec(textWithoutDnf)) !== null) {
    const posNum = parseInt(posMatch[1], 10);
    const candidate = finder(posMatch[2]);
    if (candidate && !matchedPositions.has(posNum)) {
      matchedPositions.add(posNum);
      if (posNum === 1) p1 = candidate;
      else if (posNum === 2) p2 = candidate;
      else if (posNum === 3) p3 = candidate;
      else if (posNum === 4) p4 = candidate;
      else if (posNum === 5) p5 = candidate;
    }
  }

  // Limpiar tokens posicionales ya consumidos
  if (matchedPositions.size > 0) {
    textWithoutDnf = textWithoutDnf.replace(posRegex, " ");
  }

  // 3. Obtener tokens restantes
  const tokens = textWithoutDnf.split(/\s+/).filter(Boolean);
  const remainingDrivers: DriverEntry[] = [];

  for (const tok of tokens) {
    const cleanTok = tok.replace(/^(p[1-5]|dnf|1º|2º|3º|4º|5º)[:.]*/i, "");
    const d = finder(cleanTok || tok);
    if (d) {
      remainingDrivers.push(d);
    }
  }

  // Asignar los puestos vacantes
  if (!p1 && remainingDrivers.length > 0) p1 = remainingDrivers.shift()!;
  if (!p2 && remainingDrivers.length > 0) p2 = remainingDrivers.shift()!;
  if (!p3 && remainingDrivers.length > 0) p3 = remainingDrivers.shift()!;
  if (!p4 && remainingDrivers.length > 0) p4 = remainingDrivers.shift()!;
  if (!p5 && remainingDrivers.length > 0) p5 = remainingDrivers.shift()!;

  // Si no había DNF explícito y sobró un piloto, es el DNF
  if (!dnfDriver && remainingDrivers.length > 0) {
    dnfDriver = remainingDrivers.shift()!;
  }

  // Validar que tengamos los 5 puestos y el DNF
  if (!p1 || !p2 || !p3 || !p4 || !p5) {
    return {
      error: `❓ *Faltan posiciones en tu Top 5 de ${sport === "motogp" ? "MotoGP" : "F1"}.*\n\n` +
        `Has indicado: 1º ${p1?.name || "❌"} | 2º ${p2?.name || "❌"} | 3º ${p3?.name || "❌"} | 4º ${p4?.name || "❌"} | 5º ${p5?.name || "❌"}\n` +
        `👉 Debes elegir 5 pilotos distintos para el Top 5.\n` +
        `👉 Ejemplo: ${sport === "motogp" ? "`!porra moto marquez martin bagnaia acosta bastianini dnf: binder`" : "`!porra ver nor lec pia rus dnf: ham`"}`,
    };
  }

  if (!dnfDriver) {
    return {
      error: `❓ *Falta indicar el piloto para DNF (abandono/caída).*\n\n` +
        `Indica quién crees que no terminará la carrera.\n` +
        `👉 Añade \`dnf: [piloto]\` al final de tu apuesta.\n` +
        `👉 Ejemplo: ${sport === "motogp" ? "`!porra moto marquez martin bagnaia acosta bastianini dnf: binder`" : "`!porra ver nor lec pia rus dnf: ham`"}`,
    };
  }

  // Validar duplicados en Top 5
  const top5Ids = [p1.id, p2.id, p3.id, p4.id, p5.id];
  const uniqueTop5 = new Set(top5Ids);
  if (uniqueTop5.size < 5) {
    return {
      error: `⚠️ *No puedes repetir al mismo piloto en varias posiciones del Top 5.* Cada uno del 1º al 5º debe ser único.`,
    };
  }

  // Validar que el DNF no esté en el Top 5
  if (uniqueTop5.has(dnfDriver.id)) {
    return {
      error: `⚠️ *El piloto elegido como DNF (${dnfDriver.name}) no puede estar en tu Top 5.* Si termina en el Top 5 no habrá abandonado la carrera.`,
    };
  }

  return {
    parsed: {
      p1,
      p2,
      p3,
      p4,
      p5,
      dnf: dnfDriver,
    },
  };
}

export async function handlePorraCommand(
  groupJid: string,
  userJid: string,
  userName: string,
  commandText: string,
  defaultSport?: "f1" | "motogp"
): Promise<string | PorraResultsResponse> {
  const parts = commandText.trim().split(/\s+/);
  let sport: "f1" | "motogp" = defaultSport || "f1";
  let argIndex = 1;

  if (parts[0]?.toLowerCase().startsWith("!porramoto")) {
    sport = "motogp";
    argIndex = 1;
  } else if (parts[1]?.toLowerCase() === "moto" || parts[1]?.toLowerCase() === "motogp") {
    sport = "motogp";
    argIndex = 2;
  }

  const subCommand = parts[argIndex]?.toLowerCase();

  // 1. Ayuda / Reglas
  if (!subCommand || subCommand === "ayuda" || subCommand === "help" || subCommand === "reglas") {
    return getPorraRulesMessage(sport);
  }

  // 2. Ver apuestas registradas del grupo
  if (subCommand === "ver" || subCommand === "apuestas" || subCommand === "lista" || subCommand === "apuesta") {
    return showGroupBets(groupJid, sport);
  }

  // 3. Ver clasificación general de la temporada
  if (subCommand === "tabla" || subCommand === "ranking" || subCommand === "clasificacion" || subCommand === "puntos") {
    return showSeasonRanking(groupJid, sport);
  }

  // 3b. Historial de GPs jugados
  if (subCommand === "historial" || subCommand === "historia" || subCommand === "gps" || subCommand === "temporada") {
    return showGPHistorial(groupJid, sport);
  }

  // 4. Calcular resultados y podio del GP
  if (subCommand === "resultados" || subCommand === "resultado" || subCommand === "calcular" || subCommand === "ganador") {
    return calculatePorraResults(groupJid, sport);
  }

  // 5. Invocar o consultar pronósticos de la IA (Jarvis AI & Pitwall AI)
  if (subCommand === "ia" || subCommand === "ai" || subCommand === "jarvis" || subCommand === "pitwall") {
    try {
      let season = new Date().getFullYear();
      let round = 1;
      let raceName = "Próximo Gran Premio";
      let qualyDate: Date | undefined;
      let raceDateStr: string | undefined;

      if (sport === "motogp") {
        const info = await getNextMotoGPEventInfo();
        if (!info) return "⚠️ No hay información del próximo evento de MotoGP disponible.";
        season = info.season;
        round = info.round;
        raceName = info.raceName;
        qualyDate = info.qualyDate;
        raceDateStr = info.raceDate?.toISOString();
      } else {
        const nextRes = await axios.get(`${JOLPICA_BASE}/current/next.json`, { timeout: 8000 });
        const race = nextRes.data.MRData?.RaceTable?.Races?.[0];
        if (!race) return "⚠️ No hay información de la próxima carrera de F1 disponible.";
        season = parseInt(race.season, 10);
        round = parseInt(race.round, 10);
        raceName = race.raceName || `GP Ronda ${round}`;
        if (race.Qualifying?.date) {
          qualyDate = new Date(`${race.Qualifying.date}T${race.Qualifying.time || "14:00:00Z"}`);
        }
        raceDateStr = race.date ? `${race.date}T${race.time || "12:00:00Z"}` : undefined;
      }

      const windowStatus = checkAIPredictionWindow({ qualyDate, raceName });
      const isForced = parts.some((p) => ["forzar", "force", "test", "simular"].includes(p.toLowerCase()));

      if (windowStatus.isClosed) {
        return `🔒 *APUESTAS DE LA IA CERRADAS* 🏁\n` +
          `La Clasificación del *${raceName}* ya ha comenzado. Consulta las apuestas registradas con *!porra${sport === "motogp" ? " moto" : ""} ver*.`;
      }

      if (!windowStatus.isOpen && !isForced) {
        return getAIPendingMessage({ raceName, qualyDate }, windowStatus.diffMinutes, sport);
      }

      // Dentro de las 2h o forzado
      const aiRes = await ensureAIParticipants(sport, groupJid, season, round, raceName, {
        force: isForced,
        raceDateStr,
      });

      if (isForced) {
        return `⚠️ *[MODO SIMULACIÓN / TEST PREVIO ACTIVADO (${sport.toUpperCase()})]*\n` +
          `_Nota: Pronóstico generado en modo prueba:_\n\n${aiRes.text}`;
      }
      return aiRes.text;
    } catch (err: any) {
      console.error("Error en comando IA:", err?.message);
      return "⚠️ Error al consultar el estado de la IA.";
    }
  }

  // 6. INTERACCIÓN PREVIA: Analizar o auditar una apuesta con Jarvis AI y Pitwall AI
  if (subCommand === "analizar" || subCommand === "auditar" || subCommand === "opinar" || subCommand === "roast") {
    try {
      let season = new Date().getFullYear();
      let round = 1;
      let raceName = "Gran Premio";
      let raceDateStr: string | undefined;

      if (sport === "motogp") {
        const info = await getNextMotoGPEventInfo();
        if (!info) return "⚠️ No hay información del próximo evento de MotoGP disponible.";
        season = info.season;
        round = info.round;
        raceName = info.raceName;
        raceDateStr = info.raceDate?.toISOString();
      } else {
        const nextRes = await axios.get(`${JOLPICA_BASE}/current/next.json`, { timeout: 8000 });
        const race = nextRes.data.MRData?.RaceTable?.Races?.[0];
        if (!race) return "⚠️ No hay información de la próxima carrera de F1 disponible.";
        season = parseInt(race.season, 10);
        round = parseInt(race.round, 10);
        raceName = race.raceName || `GP Ronda ${round}`;
        raceDateStr = race.date ? `${race.date}T${race.time || "12:00:00Z"}` : undefined;
      }

      const analyzeArgs = parts.slice(argIndex + 1);
      let betToAnalyze: any = null;

      if (analyzeArgs.length > 0) {
        const { parsed, error } = parsePorraArgs(analyzeArgs, sport);
        if (error || !parsed) {
          return error || "⚠️ No se pudo interpretar la apuesta a analizar.";
        }
        betToAnalyze = {
          userName,
          sport,
          p1Name: parsed.p1.name,
          p1Driver: parsed.p1.id,
          p2Name: parsed.p2.name,
          p2Driver: parsed.p2.id,
          p3Name: parsed.p3.name,
          p3Driver: parsed.p3.id,
          p4Name: parsed.p4.name,
          p4Driver: parsed.p4.id,
          p5Name: parsed.p5.name,
          p5Driver: parsed.p5.id,
          dnfName: parsed.dnf.name,
          dnfDriver: parsed.dnf.id,
        };
      } else {
        const userBet = await prisma.porraBet.findUnique({
          where: {
            sport_groupJid_season_round_userJid: {
              sport,
              groupJid,
              season,
              round,
              userJid,
            },
          },
        });

        if (!userBet) {
          return `❓ *No tienes ninguna apuesta registrada aún para el ${raceName} (${sport.toUpperCase()})*.\n\n` +
            `👉 Envía primero tu apuesta con:\n` +
            `*!porra${sport === "motogp" ? " moto" : ""} [1º] [2º] [3º] [4º] [5º] [DNF]*\n\n` +
            `O analiza una idea escribiendo:\n` +
            `*!porra${sport === "motogp" ? " moto" : ""} analizar [1º] [2º] [3º] [4º] [5º] [DNF]*`;
        }
        betToAnalyze = userBet;
      }

      return await auditUserBetWithAI(betToAnalyze, raceName, season, raceDateStr);
    } catch (err: any) {
      console.error("Error en auditoría IA:", err?.message);
      return "⚠️ Error al conectar con los ingenieros de IA.";
    }
  }

  // 7. Registrar apuesta de usuario
  const betArgs = parts.slice(argIndex);
  return registerPorraBet(sport, groupJid, userJid, userName, betArgs);
}

async function registerPorraBet(
  sport: "f1" | "motogp",
  groupJid: string,
  userJid: string,
  userName: string,
  args: string[]
): Promise<string> {
  const { parsed, error } = parsePorraArgs(args, sport);
  if (error || !parsed) {
    return error || "⚠️ Error al interpretar la apuesta.";
  }

  let season = new Date().getFullYear();
  let round = 1;
  let raceName = "Gran Premio";
  let qualyDate: Date | undefined;

  if (sport === "motogp") {
    const info = await getNextMotoGPEventInfo();
    if (!info) {
      return "⚠️ No hay información del próximo evento de MotoGP disponible.";
    }
    season = info.season;
    round = info.round;
    raceName = info.raceName;
    qualyDate = info.qualyDate;
  } else {
    try {
      const nextRes = await axios.get(`${JOLPICA_BASE}/current/next.json`, { timeout: 8000 });
      const race = nextRes.data.MRData?.RaceTable?.Races?.[0];
      if (!race) {
        return "⚠️ No hay información de la próxima carrera de F1 disponible.";
      }
      season = parseInt(race.season, 10);
      round = parseInt(race.round, 10);
      raceName = race.raceName || `GP Ronda ${round}`;
      if (race.Qualifying?.date) {
        const qualyTime = race.Qualifying.time || "14:00:00Z";
        qualyDate = new Date(`${race.Qualifying.date}T${qualyTime}`);
      }
    } catch (err: any) {
      console.error("Error consultando próximo GP F1:", err?.message);
      return "⚠️ Error al conectar con la API de F1. Intenta de nuevo en unos momentos.";
    }
  }

  // Comprobar límite de tiempo: Debe ser ANTES de la Clasificación (Qualy)
  const now = new Date();
  if (qualyDate && now >= qualyDate) {
    return `🔒 *¡APUESTAS CERRADAS!* La Clasificación del *${raceName}* ya ha comenzado. Ya no se pueden enviar ni modificar pronósticos para este Gran Premio.`;
  }

  // REGLAS ANTI-COPIA
  const otherBets = await prisma.porraBet.findMany({
    where: {
      sport,
      groupJid,
      season,
      round,
      userJid: { not: userJid },
    },
  });

  const currentTop5Set = new Set([parsed.p1.id, parsed.p2.id, parsed.p3.id, parsed.p4.id, parsed.p5.id]);

  for (const other of otherBets) {
    let exactMatches = 0;
    const matchDetails: string[] = [];

    if (other.p1Driver === parsed.p1.id) {
      exactMatches++;
      matchDetails.push(`1º: ${parsed.p1.name}`);
    }
    if (other.p2Driver === parsed.p2.id) {
      exactMatches++;
      matchDetails.push(`2º: ${parsed.p2.name}`);
    }
    if (other.p3Driver === parsed.p3.id) {
      exactMatches++;
      matchDetails.push(`3º: ${parsed.p3.name}`);
    }
    if (other.p4Driver === parsed.p4.id) {
      exactMatches++;
      matchDetails.push(`4º: ${parsed.p4.name}`);
    }
    if (other.p5Driver === parsed.p5.id) {
      exactMatches++;
      matchDetails.push(`5º: ${parsed.p5.name}`);
    }
    if (other.dnfDriver === parsed.dnf.id) {
      exactMatches++;
      matchDetails.push(`DNF: ${parsed.dnf.name}`);
    }

    // Regla 1: Máximo 4 aciertos exactos de 6 (si tiene 5 o 6 coincidencias exactas, se rechaza)
    if (exactMatches > 4) {
      return `⚠️ *¡PRONÓSTICO INVÁLIDO POR COINCIDENCIA!* 🚫\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Por reglamento anti-copia, *no puedes coincidir en más de 4 pronósticos exactos* con otro participante del grupo (máximo 4 de 6).\n\n` +
        `Coincides en *${exactMatches} de 6* predicciones con *${other.userName}*:\n` +
        `• ${matchDetails.join("\n• ")}\n\n` +
        `👉 Modifica al menos ${exactMatches - 4} predicción(es) para diferenciar tu apuesta.`;
    }

    // Regla 2: Mismo Top 5 en cualquier orden + mismo DNF
    const otherTop5Set = new Set([other.p1Driver, other.p2Driver, other.p3Driver, other.p4Driver, other.p5Driver]);
    const sameTop5Members = [...currentTop5Set].every((id) => otherTop5Set.has(id));

    if (sameTop5Members && other.dnfDriver === parsed.dnf.id) {
      return `⚠️ *¡PRONÓSTICO INVÁLIDO POR COINCIDENCIA!* 🚫\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `No puedes seleccionar exactamente los *mismos 5 pilotos del Top 5* y el *mismo DNF* que *${other.userName}*, incluso si alteras su orden.\n\n` +
        `👉 Cambia al menos un piloto de tu Top 5 o tu piloto de DNF para crear un pronóstico diferenciado.`;
    }
  }

  // Guardar en Base de Datos
  await prisma.porraBet.upsert({
    where: {
      sport_groupJid_season_round_userJid: {
        sport,
        groupJid,
        season,
        round,
        userJid,
      },
    },
    create: {
      sport,
      groupJid,
      userJid,
      userName,
      season,
      round,
      raceName,
      p1Driver: parsed.p1.id,
      p1Name: parsed.p1.name,
      p2Driver: parsed.p2.id,
      p2Name: parsed.p2.name,
      p3Driver: parsed.p3.id,
      p3Name: parsed.p3.name,
      p4Driver: parsed.p4.id,
      p4Name: parsed.p4.name,
      p5Driver: parsed.p5.id,
      p5Name: parsed.p5.name,
      dnfDriver: parsed.dnf.id,
      dnfName: parsed.dnf.name,
    },
    update: {
      userName,
      raceName,
      p1Driver: parsed.p1.id,
      p1Name: parsed.p1.name,
      p2Driver: parsed.p2.id,
      p2Name: parsed.p2.name,
      p3Driver: parsed.p3.id,
      p3Name: parsed.p3.name,
      p4Driver: parsed.p4.id,
      p4Name: parsed.p4.name,
      p5Driver: parsed.p5.id,
      p5Name: parsed.p5.name,
      dnfDriver: parsed.dnf.id,
      dnfName: parsed.dnf.name,
      points: null,
      breakdown: null,
    },
  });

  const sportIcon = sport === "motogp" ? "🏍️" : "🏎️";
  return `✅ *¡PRONÓSTICO REGISTRADO!* 🏁${sportIcon}\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 *Participante:* ${userName}\n` +
    `🏆 *Gran Premio:* ${raceName} (${sport.toUpperCase()})\n\n` +
    `🎯 *Tus predicciones:*\n` +
    `• *1º:* ${parsed.p1.name}\n` +
    `• *2º:* ${parsed.p2.name}\n` +
    `• *3º:* ${parsed.p3.name}\n` +
    `• *4:* ${parsed.p4.name}\n` +
    `• *5º:* ${parsed.p5.name}\n` +
    `• 💥 *DNF (Abandono):* ${parsed.dnf.name}\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 _Consulta todas las apuestas del grupo con *!porra${sport === "motogp" ? " moto" : ""} ver*._`;
}

export async function showGroupBets(groupJid: string, sport: "f1" | "motogp" = "f1"): Promise<string> {
  let season = new Date().getFullYear();
  let round = 1;
  let raceName = "Gran Premio";
  let qualyDate: Date | undefined;
  let raceDateStr: string | undefined;

  if (sport === "motogp") {
    const info = await getNextMotoGPEventInfo();
    if (!info) return "⚠️ No hay información del próximo Gran Premio de MotoGP disponible.";
    season = info.season;
    round = info.round;
    raceName = info.raceName;
    qualyDate = info.qualyDate;
    raceDateStr = info.raceDate?.toISOString();
  } else {
    try {
      const nextRes = await axios.get(`${JOLPICA_BASE}/current/next.json`, { timeout: 8000 });
      const race = nextRes.data.MRData?.RaceTable?.Races?.[0];
      if (!race) return "⚠️ No hay información de la próxima carrera de F1 disponible.";
      season = parseInt(race.season, 10);
      round = parseInt(race.round, 10);
      raceName = race.raceName || `GP Ronda ${round}`;
      if (race.Qualifying?.date) {
        qualyDate = new Date(`${race.Qualifying.date}T${race.Qualifying.time || "14:00:00Z"}`);
      }
      raceDateStr = race.date ? `${race.date}T${race.time || "12:00:00Z"}` : undefined;
    } catch (err: any) {
      console.error("Error consultando próximo GP F1:", err?.message);
      return "⚠️ Error al conectar con la API de F1.";
    }
  }

  const windowStatus = checkAIPredictionWindow({ qualyDate, raceName });

  if (windowStatus.isOpen) {
    try {
      await ensureAIParticipants(sport, groupJid, season, round, raceName, { raceDateStr });
    } catch (err: any) {
      console.error("Error asegurando IAs en showGroupBets:", err?.message);
    }
  } else if (!windowStatus.isClosed) {
    try {
      await prisma.porraBet.deleteMany({
        where: {
          sport,
          groupJid,
          season,
          round,
          userJid: { in: [AI_PARTICIPANTS.jarvis.id, AI_PARTICIPANTS.pitwall.id] },
        },
      });
    } catch {
      // omit
    }
  }

  const bets = await prisma.porraBet.findMany({
    where: {
      sport,
      groupJid,
      season,
      round,
    },
    orderBy: { createdAt: "asc" },
  });

  const sportIcon = sport === "motogp" ? "🏍️" : "🏎️";

  if (bets.length === 0) {
    let emptyMsg = `📋 *PRONÓSTICOS REGISTRADOS - ${raceName.toUpperCase()}* 🏁${sportIcon}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `_Aún no hay apuestas registradas en este grupo para ${sport.toUpperCase()}._\n\n` +
      `👉 ¡Sé el primero en enviar tu pronóstico!\n` +
      `Usa: *!porra${sport === "motogp" ? " moto" : ""} [1º] [2º] [3º] [4º] [5º] [DNF]*`;

    if (!windowStatus.isOpen && !windowStatus.isClosed) {
      emptyMsg += `\n\n🤖 _*Jarvis AI* y *Pitwall AI* publicarán sus pronósticos 2h antes de la Qualy tras analizar los entrenamientos._`;
    }
    return emptyMsg;
  }

  let msg = `📋 *PRONÓSTICOS REGISTRADOS - ${raceName.toUpperCase()}* 🏁${sportIcon}\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n`;

  for (const bet of bets) {
    msg += `👤 *${bet.userName}:*\n` +
      `  • 1º: ${bet.p1Name} | 2º: ${bet.p2Name} | 3º: ${bet.p3Name}\n` +
      `  • 4º: ${bet.p4Name} | 5º: ${bet.p5Name}\n` +
      `  • 💥 DNF: ${bet.dnfName}\n\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━\n` +
    `Total: *${bets.length}* participante(s).\n` +
    `🔒 Cierre de apuestas: inicio de la Clasificación (Qualy).`;

  if (!windowStatus.isOpen && !windowStatus.isClosed) {
    msg += `\n🤖 _*Jarvis AI* y *Pitwall AI* publicarán sus pronósticos 2h antes de la Qualy._`;
  }

  return msg;
}

export async function calculatePorraResults(
  groupJid: string,
  sport: "f1" | "motogp" = "f1"
): Promise<PorraResultsResponse> {
  let season = new Date().getFullYear();
  let round = 1;
  let raceName = "Gran Premio";
  let top5Official: DriverEntry[] = [];
  let officialDnfs: DriverEntry[] = [];

  if (sport === "motogp") {
    const motoData = await getLastMotoGPResultsData();
    if (!motoData || motoData.top5.length < 5) {
      return { text: "⚠️ No se encontraron resultados oficiales completos para la última carrera de MotoGP." };
    }
    season = motoData.season;
    round = motoData.round;
    raceName = motoData.raceName;
    top5Official = motoData.top5;
    officialDnfs = motoData.dnfs;
  } else {
    try {
      const lastRes = await axios.get(`${JOLPICA_BASE}/current/last/results.json`, { timeout: 8000 });
      const race = lastRes.data.MRData?.RaceTable?.Races?.[0];
      if (!race || !race.Results || race.Results.length < 5) {
        return { text: "⚠️ No se encontraron resultados oficiales completos para la última carrera de F1." };
      }
      season = parseInt(race.season, 10);
      round = parseInt(race.round, 10);
      raceName = race.raceName || `GP Ronda ${round}`;

      const results = race.Results;
      top5Official = results.slice(0, 5).map((r: any) => ({
        id: r.Driver.driverId,
        name: `${r.Driver.givenName} ${r.Driver.familyName}`,
      }));

      officialDnfs = results.filter((r: any) => {
        const posText = r.positionText;
        const status = (r.status || "").toLowerCase();
        return posText === "R" || (!status.includes("lap") && status !== "finished");
      }).map((r: any) => ({
        id: r.Driver.driverId,
        name: `${r.Driver.givenName} ${r.Driver.familyName}`,
      }));
    } catch (err: any) {
      console.error("Error consultando resultados oficiales F1:", err?.message);
      return { text: "⚠️ Error al obtener los resultados oficiales de la carrera de F1." };
    }
  }

  // Asegurar que las IAs participan en este grupo si no lo habían hecho
  try {
    await ensureAIParticipants(sport, groupJid, season, round, raceName);
  } catch (err: any) {
    console.error("Error asegurando IAs en calculatePorraResults:", err?.message);
  }

  const bets = await prisma.porraBet.findMany({
    where: {
      sport,
      groupJid,
      season,
      round,
    },
  });

  if (bets.length === 0) {
    return { text: `ℹ️ No se registraron apuestas en este grupo para el *${raceName}* (${sport.toUpperCase()}).` };
  }

  const top5Ids = top5Official.map((d) => d.id);
  const dnfIds = new Set(officialDnfs.map((d) => d.id));

  interface EvaluatedUser {
    id: string;
    userName: string;
    points: number;
    breakdown: string;
    createdAt: Date;
  }

  const evaluated: EvaluatedUser[] = [];

  for (const bet of bets) {
    let pts = 0;
    const details: string[] = [];

    const positions = [
      { pos: 1, driverId: bet.p1Driver, driverName: bet.p1Name, official: top5Official[0] },
      { pos: 2, driverId: bet.p2Driver, driverName: bet.p2Name, official: top5Official[1] },
      { pos: 3, driverId: bet.p3Driver, driverName: bet.p3Name, official: top5Official[2] },
      { pos: 4, driverId: bet.p4Driver, driverName: bet.p4Name, official: top5Official[3] },
      { pos: 5, driverId: bet.p5Driver, driverName: bet.p5Name, official: top5Official[4] },
    ];

    for (const item of positions) {
      if (item.driverId === item.official.id) {
        pts += 3;
        details.push(`+3 P${item.pos} exacto (${item.driverName})`);
      } else if (top5Ids.includes(item.driverId)) {
        pts += 1;
        details.push(`+1 Top5 (${item.driverName})`);
      }
    }

    // DNF
    if (dnfIds.has(bet.dnfDriver)) {
      pts += 3;
      details.push(`+3 DNF acertado (${bet.dnfName})`);
    } else {
      details.push(`+0 DNF (${bet.dnfName} terminó)`);
    }

    const breakdownText = details.length > 0 ? details.join(", ") : "Sin aciertos puntuables";

    await prisma.porraBet.update({
      where: { id: bet.id },
      data: {
        points: pts,
        breakdown: breakdownText,
      },
    });

    evaluated.push({
      id: bet.id,
      userName: bet.userName,
      points: pts,
      breakdown: breakdownText,
      createdAt: bet.createdAt,
    });
  }

  // Ordenar clasificación: más puntos primero, desempate por fecha de registro
  evaluated.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const sportIcon = sport === "motogp" ? "🏍️" : "🏎️";
  const dnfsStr = officialDnfs.length > 0 ? officialDnfs.map((d) => d.name).join(", ") : "Ninguno";

  let msg = `🏁 *RESULTADOS OFICIALES - ${raceName.toUpperCase()}* ${sportIcon}\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `📊 *Llegada oficial real:*\n` +
    `• 1º: *${top5Official[0].name}*\n` +
    `• 2º: *${top5Official[1].name}*\n` +
    `• 3º: *${top5Official[2].name}*\n` +
    `• 4º: *${top5Official[3].name}*\n` +
    `• 5º: *${top5Official[4].name}*\n` +
    `• 💥 Abandonos (DNF): *${dnfsStr}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `🏆 *PODIO DE LA JORNADA:*\n\n`;

  const medals = ["🥇", "🥈", "🥉"];
  for (let i = 0; i < evaluated.length; i++) {
    const item = evaluated[i];
    const prefix = i < 3 ? medals[i] : `▫️ ${i + 1}º`;
    msg += `${prefix} *${item.userName}* — *${item.points} pts*\n` +
      `   _${item.breakdown}_\n\n`;
  }

  // Team Radio Banter con IAs
  try {
    const winner = evaluated[0];
    const lastPlace = evaluated.length > 1 ? evaluated[evaluated.length - 1] : undefined;
    const jarvisEvaluated = evaluated.find((u) => u.userName.includes("Jarvis"));
    const pitwallEvaluated = evaluated.find((u) => u.userName.includes("Pitwall"));

    const radioBanter = await generatePostRaceRadioBanter({
      raceName,
      sport,
      winner: { userName: winner.userName, points: winner.points },
      lastPlace: lastPlace ? { userName: lastPlace.userName, points: lastPlace.points } : undefined,
      jarvisPoints: jarvisEvaluated?.points,
      pitwallPoints: pitwallEvaluated?.points,
      officialP1: top5Official[0].name,
      officialP2: top5Official[1].name,
      officialP3: top5Official[2].name,
      officialP4: top5Official[3].name,
      officialP5: top5Official[4].name,
      officialDnfs: dnfsStr,
    });

    msg += `${radioBanter}\n\n` +
      `💡 _Consulta la clasificación general acumulada con *!porra${sport === "motogp" ? " moto" : ""} tabla*._`;
  } catch (err: any) {
    console.error("Error generando team radio banter:", err?.message);
    msg += `━━━━━━━━━━━━━━━━━━━━━\n` +
      `💡 _Consulta la clasificación general acumulada con *!porra${sport === "motogp" ? " moto" : ""} tabla*._`;
  }

  const podiumData = evaluated.slice(0, 3).map((u) => ({
    name: u.userName,
    points: u.points,
  }));

  const imageBuffer = generatePodiumImage({
    raceName,
    season,
    podium: podiumData,
    sport,
  });

  return {
    text: msg,
    imageBuffer,
  };
}

export async function showSeasonRanking(groupJid: string, sport: "f1" | "motogp" = "f1"): Promise<string> {
  const currentYear = new Date().getFullYear();

  const bets = await prisma.porraBet.findMany({
    where: {
      sport,
      groupJid,
      season: currentYear,
      points: { not: null },
    },
    orderBy: { round: "asc" },
  });

  const sportIcon = sport === "motogp" ? "🏍️" : "🏎️";

  if (bets.length === 0) {
    return `🏆 *CLASIFICACIÓN GENERAL DE LA PORRA (${sport.toUpperCase()} ${currentYear})* 🏁${sportIcon}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `_Aún no hay puntos acumulados en esta temporada._\n\n` +
      `Los puntos se sumarán automáticamente tras cada carrera con *!porra${sport === "motogp" ? " moto" : ""} resultados*.`;
  }

  // Victorias de GP por ronda
  const roundMap = new Map<number, typeof bets>();
  for (const b of bets) {
    const list = roundMap.get(b.round) || [];
    list.push(b);
    roundMap.set(b.round, list);
  }

  const gpWinnersCount = new Map<string, number>();
  for (const [, roundBets] of roundMap.entries()) {
    const maxPts = Math.max(...roundBets.map((b) => b.points || 0));
    if (maxPts > 0) {
      for (const b of roundBets) {
        if (b.points === maxPts) {
          gpWinnersCount.set(b.userJid, (gpWinnersCount.get(b.userJid) || 0) + 1);
        }
      }
    }
  }

  interface UserStat {
    userJid: string;
    userName: string;
    totalPoints: number;
    racesCount: number;
    gpWins: number;
    exactHits: number;
    dnfHits: number;
  }

  const userMap = new Map<string, UserStat>();

  for (const b of bets) {
    const pts = b.points || 0;
    const current = userMap.get(b.userJid) || {
      userJid: b.userJid,
      userName: b.userName,
      totalPoints: 0,
      racesCount: 0,
      gpWins: gpWinnersCount.get(b.userJid) || 0,
      exactHits: 0,
      dnfHits: 0,
    };

    current.userName = b.userName;
    current.totalPoints += pts;
    current.racesCount += 1;

    // Aciertos exactos en Top 5 (+3 P[1-5])
    const exactMatches = (b.breakdown?.match(/\+3 P[1-5]/g) || []).length;
    current.exactHits += exactMatches;

    // Aciertos de DNF (+3 DNF)
    if (b.breakdown?.includes("+3 DNF")) {
      current.dnfHits += 1;
    }

    userMap.set(b.userJid, current);
  }

  const ranking = Array.from(userMap.values());
  ranking.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.gpWins !== a.gpWins) return b.gpWins - a.gpWins;
    return b.exactHits - a.exactHits;
  });

  let msg = `🏆 *CLASIFICACIÓN GENERAL DE LA PORRA (${sport.toUpperCase()} ${currentYear})* 🏁${sportIcon}\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n`;

  const medals = ["🥇", "🥈", "🥉"];
  for (let i = 0; i < ranking.length; i++) {
    const u = ranking[i];
    const prefix = i < 3 ? medals[i] : ` ${i + 1}.`;
    const leaderCrown = i === 0 ? " 👑" : "";

    msg += `${prefix} *${u.userName}* — *${u.totalPoints} pts* (${u.racesCount} GP)${leaderCrown}\n` +
      `   ↳ 🏆 ${u.gpWins} vic | 🎯 ${u.exactHits} plenos Top 5 | 💥 ${u.dnfHits} DNF\n`;
  }

  // Cuadro de honor
  const topWinner = [...ranking].sort((a, b) => b.gpWins - a.gpWins)[0];
  const topNostradamus = [...ranking].sort((a, b) => b.exactHits - a.exactHits)[0];
  const topDnfHunter = [...ranking].sort((a, b) => b.dnfHits - a.dnfHits)[0];

  msg += `━━━━━━━━━━━━━━━━━━━━━\n` +
    `🎖️ *CUADRO DE HONOR:*\n`;

  if (topWinner && topWinner.gpWins > 0) {
    msg += `• 🏆 *Rey de Grandes Premios:* *${topWinner.userName}* (${topWinner.gpWins} victoria${topWinner.gpWins > 1 ? "s" : ""})\n`;
  }
  if (topNostradamus && topNostradamus.exactHits > 0) {
    msg += `• 🎯 *El Nostradamus:* *${topNostradamus.userName}* (${topNostradamus.exactHits} posición${topNostradamus.exactHits > 1 ? "es exactas" : " exacta"})\n`;
  }
  if (topDnfHunter && topDnfHunter.dnfHits > 0) {
    msg += `• 💥 *Cazador de Abandonos:* *${topDnfHunter.userName}* (${topDnfHunter.dnfHits} DNF acertado${topDnfHunter.dnfHits > 1 ? "s" : ""})\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 _Envía tu predicción para la próxima carrera con *!porra${sport === "motogp" ? " moto" : ""}*._`;

  return msg;
}

export async function showGPHistorial(groupJid: string, sport: "f1" | "motogp" = "f1"): Promise<string> {
  const currentYear = new Date().getFullYear();

  const bets = await prisma.porraBet.findMany({
    where: {
      sport,
      groupJid,
      season: currentYear,
      points: { not: null },
    },
    orderBy: { round: "asc" },
  });

  const sportIcon = sport === "motogp" ? "🏍️" : "🏎️";

  if (bets.length === 0) {
    return `📅 *HISTORIAL DE LA TEMPORADA ${sport.toUpperCase()} ${currentYear}* 🏁${sportIcon}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `_Aún no se ha calculado ningún resultado en este grupo para ${sport.toUpperCase()}._\n\n` +
      `💡 _Tras cada carrera usa *!porra${sport === "motogp" ? " moto" : ""} resultados* para registrar los puntos._`;
  }

  const rounds = new Map<number, typeof bets>();
  for (const b of bets) {
    if (!rounds.has(b.round)) rounds.set(b.round, []);
    rounds.get(b.round)!.push(b);
  }

  function getFlagForRace(name: string): string {
    const n = name.toLowerCase();
    if (n.includes("qatar") || n.includes("lusail")) return "🇶🇦";
    if (n.includes("portugal") || n.includes("portimao") || n.includes("algarve")) return "🇵🇹";
    if (n.includes("argentina") || n.includes("termas")) return "🇦🇷";
    if (n.includes("australia") || n.includes("melbourne") || n.includes("phillip island")) return "🇦🇺";
    if (n.includes("china") || n.includes("shanghai")) return "🇨🇳";
    if (n.includes("japan") || n.includes("japanese") || n.includes("motegi") || n.includes("suzuka")) return "🇯🇵";
    if (n.includes("bahrain") || n.includes("bahréin")) return "🇧🇭";
    if (n.includes("saudi") || n.includes("arabia") || n.includes("jeddah")) return "🇸🇦";
    if (n.includes("monaco")) return "🇲🇨";
    if (n.includes("jerez") || n.includes("catalunya") || n.includes("spain") || n.includes("spanish") || n.includes("españa") || n.includes("aragon") || n.includes("valencia")) return "🇪🇸";
    if (n.includes("france") || n.includes("le mans")) return "🇫🇷";
    if (n.includes("italy") || n.includes("italian") || n.includes("mugello") || n.includes("misano") || n.includes("monza") || n.includes("imola")) return "🇮🇹";
    if (n.includes("germany") || n.includes("sachsenring")) return "🇩🇪";
    if (n.includes("netherlands") || n.includes("assen") || n.includes("zandvoort")) return "🇳🇱";
    if (n.includes("britain") || n.includes("british") || n.includes("silverstone")) return "🇬🇧";
    if (n.includes("austria") || n.includes("spielberg") || n.includes("red bull ring")) return "🇦🇹";
    if (n.includes("hungary") || n.includes("hungarian") || n.includes("hungaroring") || n.includes("balaton")) return "🇭🇺";
    if (n.includes("belgium") || n.includes("spa")) return "🇧🇪";
    if (n.includes("indonesia") || n.includes("mandalika")) return "🇮🇩";
    if (n.includes("thailand") || n.includes("buriram")) return "🇹🇭";
    if (n.includes("malaysia") || n.includes("sepang")) return "🇲🇾";
    if (n.includes("cota") || n.includes("austin") || n.includes("americas") || n.includes("las vegas") || n.includes("miami") || n.includes("united states")) return "🇺🇸";
    if (n.includes("mexico") || n.includes("méxico")) return "🇲🇽";
    if (n.includes("brazil") || n.includes("brasil") || n.includes("interlagos")) return "🇧🇷";
    if (n.includes("azerbaijan") || n.includes("baku")) return "🇦🇿";
    if (n.includes("singapore") || n.includes("singapur")) return "🇸🇬";
    if (n.includes("abu dhabi") || n.includes("abu dabi")) return "🇦🇪";
    return "🏁";
  }

  const sortedRounds = Array.from(rounds.entries()).sort((a, b) => a[0] - b[0]);
  const aiJids = new Set([AI_PARTICIPANTS.jarvis.id, AI_PARTICIPANTS.pitwall.id]);

  const totalPts = new Map<string, { name: string; pts: number }>();
  for (const b of bets) {
    if (!totalPts.has(b.userJid)) totalPts.set(b.userJid, { name: b.userName, pts: 0 });
    totalPts.get(b.userJid)!.pts += b.points || 0;
  }

  let msg = `📅 *HISTORIAL DE LA TEMPORADA ${sport.toUpperCase()} ${currentYear}* 🏁${sportIcon}\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n`;

  for (const [round, roundBets] of sortedRounds) {
    const raceName = roundBets[0].raceName || `GP Ronda ${round}`;
    const flag = getFlagForRace(raceName);

    const sorted = [...roundBets].sort((a, b) => {
      if ((b.points || 0) !== (a.points || 0)) return (b.points || 0) - (a.points || 0);
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    const humansSorted = sorted.filter((b) => !aiJids.has(b.userJid));
    const aisSorted = sorted.filter((b) => aiJids.has(b.userJid));

    const roundMedals = ["🥇", "🥈", "🥉"];
    msg += `${flag} *Ronda ${round}: ${raceName}*\n`;

    for (let i = 0; i < humansSorted.length; i++) {
      const b = humansSorted[i];
      const prefix = i < 3 ? roundMedals[i] : `  ${i + 1}.`;
      msg += `${prefix} ${b.userName} — *${b.points} pts*`;

      const exactCount = (b.breakdown?.match(/\+3 P[1-5]/g) || []).length;
      if (exactCount > 0) msg += ` 🎯×${exactCount}`;
      if (b.breakdown?.includes("+3 DNF")) msg += ` 💥`;
      msg += `\n`;
    }

    if (aisSorted.length > 0) {
      const aiLine = aisSorted.map((b) => {
        const shortName = b.userName.includes("Jarvis") ? "Jarvis" : "Pitwall";
        return `🤖 ${shortName} ${b.points}pts`;
      }).join(" · ");
      msg += `  _(${aiLine})_\n`;
    }

    msg += `\n`;
  }

  const topHumans = Array.from(totalPts.entries())
    .filter(([jid]) => !aiJids.has(jid))
    .sort((a, b) => b[1].pts - a[1].pts)
    .slice(0, 3);

  const totalGPs = sortedRounds.length;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n` +
    `📊 *${totalGPs} GP${totalGPs !== 1 ? "s" : ""} disputado${totalGPs !== 1 ? "s" : ""}* en esta temporada\n`;

  if (topHumans.length > 0) {
    const podiumMedals = ["🥇", "🥈", "🥉"];
    msg += `🏆 *Líderes:* ` +
      topHumans.map(([_, v], i) => `${podiumMedals[i]} ${v.name} ${v.pts}pts`).join(" · ") + `\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 _Consulta la clasificación completa con *!porra${sport === "motogp" ? " moto" : ""} tabla*._`;

  return msg;
}
