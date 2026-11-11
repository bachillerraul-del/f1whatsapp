import axios from "axios";
import { prisma } from "./db.js";
import { generatePodiumImage } from "./podium-image.js";
import {
  type F1DriverDef,
  KNOWN_DRIVERS,
  findDriver,
  collapseCompoundDriverNames,
} from "./f1-drivers.js";
import {
  type MotoGPRiderDef,
  KNOWN_RIDERS,
  findRider,
  collapseCompoundRiderNames,
} from "./motogp-riders.js";
import {
  fetchNextF1RaceData,
  fetchLastF1RaceData,
  fetchLastF1QualifyingData,
} from "./f1.js";
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
      `🎯 *Objetivo:* Acertar el *Top 5 de la carrera del domingo (1º al 5º)*, *1 piloto que sufrirá DNF (abandono / caída)* y el *3º de la Clasificación (QP3)*.\n\n` +
      `📋 *CÓMO JUGAR (Antes de la Qualy):*\n` +
      `Envía tu pronóstico de 7 selecciones con:\n` +
      `👉 *!porra moto [1º] [2º] [3º] [4º] [5º] [DNF] [QP3]*\n` +
      `_(o también con !porramoto ...)_\n\n` +
      `*Ejemplos válidos:*\n` +
      `🔹 *!porra moto marquez martin bagnaia acosta bastianini dnf: binder qp3: vinales*\n` +
      `🔹 *!porramoto marquez martin bagnaia acosta bastianini binder vinales*\n` +
      `🔹 *!porra moto 1º marquez 2º martin 3º bagnaia 4º acosta 5º bastianini dnf mir qp3 aldeguer*\n\n` +
      `🤖 *COMPETIDORES IA (Gemini):*\n` +
      `*Jarvis AI* y *Pitwall AI* compiten en el grupo analizando el rendimiento real de los pilotos.\n\n` +
      `🏆 *SISTEMA DE PUNTUACIÓN (Mismo sistema para Carrera y QP3, máx 21 pts):*\n` +
      `• *+3 pts* : Por cada piloto acertado en su *posición exacta* del Top 5 de la carrera (1º al 5º).\n` +
      `• *+2 pts* : Si el piloto termina en el *Top 5 a solo 1 puesto* de distancia de tu predicción.\n` +
      `• *+1 pt*  : Si el piloto termina en el *Top 5 a 2 o más puestos* de distancia.\n` +
      `• *+3 pts* : Si aciertas el piloto que sufre *DNF (abandono / caída)* en carrera.\n` +
      `• ⏱️ *P3 Clasificación (mismo sistema):*\n` +
      `  - *+3 pts* : Si el piloto clasifica exactamente en *3ª posición (P3)*.\n` +
      `  - *+2 pts* : Si clasifica a *solo 1 puesto de distancia* (2º o 4º en Qualy).\n` +
      `  - *+1 pt*  : Si clasifica dentro del *Top 5 de Qualy* a ±2 puestos (1º o 5º en Qualy).\n` +
      `• 📈 *Clasificación General:* Se ordena por la *suma total de todos los puntos* conseguidos en cada GP.\n` +
      `• ⏱️ *Desempates:* En caso de empate a puntos, gana quien haya sellado antes su pronóstico definitivo.\n\n` +
      `⏳ *Límite:* Las apuestas se cierran al comenzar la Clasificación (Q1) del sábado.\n` +
      `🚫 *Reglas anti-copia (solo aplican a Carrera: Top 5 + DNF):*\n` +
      `• 🚫 *Máximo 3 posiciones exactas en el Top 5* de coincidencia con otro participante (máx 3 de 5).\n` +
      `• 🚫 *Prohibido coincidir en la predicción DNF* (no puedes elegir el mismo piloto DNF que otro jugador).\n` +
      `• ℹ️ _En la predicción de P3 de Clasificación (QP3) no se aplica regla anti-copia._\n\n` +
      `📊 *COMANDOS DE LA PORRA (MOTOGP):*\n` +
      `🔹 *!porramoto [1º..5º] [DNF] [QP3]* : Enviar o editar apuesta\n` +
      `🔹 *!porramoto ver* : Ver apuestas del grupo\n` +
      `🔹 *!porramoto puntos* : Calcular resultados y podio del GP\n` +
      `🔹 *!porramoto tabla* : Clasificación general (suma de puntos)\n` +
      `🔹 *!porramoto historial* : Resumen de GPs de la temporada\n` +
      `🔹 *!porramoto ia* : Pronósticos de las IAs\n` +
      `🔹 *!porramoto analizar* : Auditar tu apuesta con las IAs`;
  }

  return `🏁 *LA PORRA DE F1* 🏎️\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `🎯 *Objetivo:* Acertar el *Top 5 de la carrera del domingo (P1 a P5)*, *1 piloto que sufrirá DNF (abandono)* y el *3º de la Clasificación (QP3)*.\n\n` +
    `📋 *CÓMO JUGAR (Antes de la Qualy):*\n` +
    `Envía tu pronóstico de 7 selecciones con:\n` +
    `👉 *!porra [P1] [P2] [P3] [P4] [P5] [DNF] [QP3]*\n\n` +
    `*Ejemplos válidos:*\n` +
    `🔹 *!porra ver nor lec pia rus dnf: col qp3: alo*\n` +
    `🔹 *!porra verstappen norris leclerc piastri russell colapinto alonso*\n` +
    `🔹 *!porra p1: ver p2: nor p3: lec p4: pia p5: rus dnf colapinto qp3 alonso*\n\n` +
    `🤖 *COMPETIDORES IA (Gemini):*\n` +
    `*Jarvis AI* y *Pitwall AI* compiten en el grupo analizando la telemetría de libres.\n\n` +
    `🏆 *SISTEMA DE PUNTUACIÓN (Mismo sistema para Carrera y QP3, máx 21 pts):*\n` +
    `• *+3 pts* : Por cada posición exacta acertada en el Top 5 de la carrera (P1 a P5).\n` +
    `• *+2 pts* : Si el piloto termina en el Top 5 a *solo 1 puesto* de distancia de tu predicción.\n` +
    `• *+1 pt*  : Si el piloto termina en el Top 5 a *2 o más puestos* de distancia.\n` +
    `• *+3 pts* : Si aciertas el piloto que abandona la carrera (DNF).\n` +
    `• ⏱️ *P3 Clasificación (mismo sistema):*\n` +
    `  - *+3 pts* : Si el piloto clasifica exactamente en *3ª posición (P3)*.\n` +
    `  - *+2 pts* : Si clasifica a *solo 1 puesto de distancia* (P2 o P4 en Qualy).\n` +
    `  - *+1 pt*  : Si clasifica dentro del *Top 5 de Qualy* a ±2 puestos (P1 o 5º en Qualy).\n` +
    `• 📈 *Clasificación General:* Se ordena por la *suma total de todos los puntos* conseguidos en cada GP.\n` +
    `• ⏱️ *Desempates:* En caso de empate a puntos, gana quien haya sellado antes su pronóstico definitivo.\n\n` +
    `⏳ *Límite:* Las apuestas se cierran al comenzar la Clasificación (Q1) del sábado.\n` +
    `🚫 *Reglas anti-copia (solo aplican a Carrera: Top 5 + DNF):*\n` +
    `• 🚫 *Máximo 3 posiciones exactas en el Top 5* de coincidencia con otro participante (máx 3 de 5).\n` +
    `• 🚫 *Prohibido coincidir en la predicción DNF* (no puedes elegir el mismo piloto DNF que otro jugador).\n` +
    `• ℹ️ _En la predicción de P3 de Clasificación (QP3) no se aplica regla anti-copia._\n\n` +
    `📊 *COMANDOS DE LA PORRA (F1):*\n` +
    `🔹 *!porra [1º..5º] [DNF] [QP3]* : Enviar o editar apuesta\n` +
    `🔹 *!porra ver* : Ver apuestas del grupo\n` +
    `🔹 *!porra puntos* : Calcular resultados y podio del GP\n` +
    `🔹 *!porra tabla* : Clasificación general (suma de puntos)\n` +
    `🔹 *!porra historial* : Resumen de GPs de la temporada\n` +
    `🔹 *!porra ia* : Pronósticos de las IAs\n` +
    `🔹 *!porra analizar* : Auditar tu apuesta con las IAs\n\n` +
    `💡 _Para MotoGP usa *!porramoto* (o *!porra moto*)._`;
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
  qualyP3: DriverEntry;
}

/**
 * Interpreta los argumentos de la porra (Top 5 Carrera + DNF + P3 Clasificación) tanto para F1 como para MotoGP
 */
export function parsePorraArgs(
  rawArgs: string[],
  sport: "f1" | "motogp" = "f1"
): { parsed?: ParsedPorra; error?: string } {
  const fullText = rawArgs.join(" ").replace(/[,;]/g, " ").trim();
  if (!fullText) {
    return {
      error: `❓ *Faltan datos en tu pronóstico de ${sport === "motogp" ? "MotoGP" : "F1"}.*\n\n` +
        `Debes indicar los 5 pilotos para el Top 5 de la carrera (1º al 5º), 1 piloto para DNF (abandono) y 1 piloto para P3 en Clasificación (QP3).\n` +
        `👉 *Formato:* \`!porra${sport === "motogp" ? "moto" : ""} [1º] [2º] [3º] [4º] [5º] [DNF] [QP3]\`\n` +
        `👉 *Ejemplo:* ${sport === "motogp" ? "`!porramoto marquez martin bagnaia acosta bastianini dnf: binder qp3: vinales`" : "`!porra ver nor lec pia rus dnf: col qp3: alo`"}`,
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
  let qualyP3Driver: DriverEntry | null = null;
  let textToParse =
    sport === "motogp"
      ? collapseCompoundRiderNames(fullText)
      : collapseCompoundDriverNames(fullText);

  // 1. Detectar etiqueta explícita de DNF (ej: "dnf: ham", "dnf hamilton", "abandono: stroll", "caida binder")
  const dnfRegex = /(?:dnf|abandono|ret|out|caida|caída)[:\s]+([a-zA-Z0-9_\-]+)/i;
  const dnfMatch = textToParse.match(dnfRegex);
  if (dnfMatch) {
    const candidate = finder(dnfMatch[1]);
    if (candidate) {
      dnfDriver = candidate;
      textToParse = textToParse.replace(dnfMatch[0], " ");
    }
  }

  // 2. Detectar etiqueta explícita de P3 en Clasificación (ej: "qp3: alo", "q3 alonso", "qualy: sainz", "p3q: marquez")
  const qualyP3Regex = /(?:qp3|q3|qualy3|qualy|p3q|clasif3|clasificacion|clasif)[:\s]+([a-zA-Z0-9_\-]+)/i;
  const qualyP3Match = textToParse.match(qualyP3Regex);
  if (qualyP3Match) {
    const candidate = finder(qualyP3Match[1]);
    if (candidate) {
      qualyP3Driver = candidate;
      textToParse = textToParse.replace(qualyP3Match[0], " ");
    }
  }

  // 3. Extraer etiquetas posicionales explícitas para carrera (ej: p1: ver, 1º norris, etc.)
  let p1: DriverEntry | null = null;
  let p2: DriverEntry | null = null;
  let p3: DriverEntry | null = null;
  let p4: DriverEntry | null = null;
  let p5: DriverEntry | null = null;

  const posRegex = /(?:p|pos|º|°)?([1-5])[:\sº°]+([a-zA-Z0-9_\-]+)/gi;
  let posMatch: RegExpExecArray | null;
  const matchedPositions = new Set<number>();

  while ((posMatch = posRegex.exec(textToParse)) !== null) {
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
    textToParse = textToParse.replace(posRegex, " ");
  }

  // 4. Obtener tokens restantes
  const tokens = textToParse.split(/\s+/).filter(Boolean);
  const remainingDrivers: DriverEntry[] = [];

  for (const tok of tokens) {
    const cleanTok = tok.replace(/^(p[1-5]|dnf|qp3|q3|qualy|1º|2º|3º|4º|5º)[:.]*/i, "");
    const d = finder(cleanTok || tok);
    if (d) {
      remainingDrivers.push(d);
    }
  }

  // Asignar los puestos vacantes del Top 5
  if (!p1 && remainingDrivers.length > 0) p1 = remainingDrivers.shift()!;
  if (!p2 && remainingDrivers.length > 0) p2 = remainingDrivers.shift()!;
  if (!p3 && remainingDrivers.length > 0) p3 = remainingDrivers.shift()!;
  if (!p4 && remainingDrivers.length > 0) p4 = remainingDrivers.shift()!;
  if (!p5 && remainingDrivers.length > 0) p5 = remainingDrivers.shift()!;

  // Si no había DNF explícito y sobran pilotos, el siguiente es DNF
  if (!dnfDriver && remainingDrivers.length > 0) {
    dnfDriver = remainingDrivers.shift()!;
  }

  // Si no había Qualy P3 explícito y sobran pilotos, el siguiente es QP3
  if (!qualyP3Driver && remainingDrivers.length > 0) {
    qualyP3Driver = remainingDrivers.shift()!;
  }

  // Validar Top 5
  if (!p1 || !p2 || !p3 || !p4 || !p5) {
    return {
      error: `❓ *Faltan posiciones en tu Top 5 de ${sport === "motogp" ? "MotoGP" : "F1"}.*\n\n` +
        `Has indicado: 1º ${p1?.name || "❌"} | 2º ${p2?.name || "❌"} | 3º ${p3?.name || "❌"} | 4º ${p4?.name || "❌"} | 5º ${p5?.name || "❌"}\n` +
        `👉 Debes elegir 5 pilotos distintos para el Top 5.\n` +
        `👉 Ejemplo: ${sport === "motogp" ? "`!porramoto marquez martin bagnaia acosta bastianini dnf: binder qp3: vinales`" : "`!porra ver nor lec pia rus dnf: col qp3: alo`"}`,
    };
  }

  // Validar DNF
  if (!dnfDriver) {
    return {
      error: `❓ *Falta indicar el piloto para DNF (abandono/caída).*\n\n` +
        `Indica quién crees que no terminará la carrera.\n` +
        `👉 Añade \`dnf: [piloto]\` a tu apuesta.\n` +
        `👉 Ejemplo: ${sport === "motogp" ? "`!porramoto marquez martin bagnaia acosta bastianini dnf: binder qp3: vinales`" : "`!porra ver nor lec pia rus dnf: col qp3: alo`"}`,
    };
  }

  // Validar Qualy P3
  if (!qualyP3Driver) {
    return {
      error: `❓ *Falta indicar el piloto para P3 en Clasificación (QP3).*\n\n` +
        `Indica quién crees que clasificará 3º en la sesión de clasificación del sábado.\n` +
        `👉 Añade \`qp3: [piloto]\` al final de tu apuesta (o inclúyelo como 7º piloto).\n` +
        `👉 Ejemplo: ${sport === "motogp" ? "`!porramoto marquez martin bagnaia acosta bastianini dnf: binder qp3: vinales`" : "`!porra ver nor lec pia rus dnf: col qp3: alo`"}`,
    };
  }

  // Validar duplicados en Top 5 de carrera
  const top5Ids = [p1.id, p2.id, p3.id, p4.id, p5.id];
  const uniqueTop5 = new Set(top5Ids);
  if (uniqueTop5.size < 5) {
    return {
      error: `⚠️ *No puedes repetir al mismo piloto en varias posiciones del Top 5.* Cada uno del 1º al 5º debe ser único.`,
    };
  }

  // Validar que el DNF de carrera no esté en el Top 5 de carrera
  if (uniqueTop5.has(dnfDriver.id)) {
    return {
      error: `⚠️ *El piloto elegido como DNF (${dnfDriver.name}) no puede estar en tu Top 5 de carrera.* Si termina en el Top 5 no habrá abandonado.`,
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
      qualyP3: qualyP3Driver,
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

  // 3. Ver clasificación general de la temporada (suma de todos los puntos)
  if (subCommand === "tabla" || subCommand === "ranking" || subCommand === "clasificacion" || subCommand === "general") {
    return showSeasonRanking(groupJid, sport);
  }

  // 3b. Historial de GPs jugados
  if (subCommand === "historial" || subCommand === "historia" || subCommand === "gps" || subCommand === "temporada") {
    return showGPHistorial(groupJid, sport);
  }

  // 4. Calcular puntos/resultados y podio del GP
  if (subCommand === "puntos" || subCommand === "resultados" || subCommand === "resultado" || subCommand === "calcular" || subCommand === "ganador") {
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
        const race = await fetchNextF1RaceData();
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
        const race = await fetchNextF1RaceData();
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
          qualyP3Name: parsed.qualyP3.name,
          qualyP3Driver: parsed.qualyP3.id,
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
            `*!porra${sport === "motogp" ? " moto" : ""} [1º] [2º] [3º] [4º] [5º] [DNF] [QP3]*\n\n` +
            `O analiza una idea escribiendo:\n` +
            `*!porra${sport === "motogp" ? " moto" : ""} analizar [1º] [2º] [3º] [4º] [5º] [DNF] [QP3]*`;
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
      const race = await fetchNextF1RaceData();
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

  // REGLAS ANTI-COPIA (solo compara contra otros participantes humanos, nunca contra las IAs)
  const otherBets = await prisma.porraBet.findMany({
    where: {
      sport,
      groupJid,
      season,
      round,
      userJid: {
        notIn: [userJid, AI_PARTICIPANTS.jarvis.id, AI_PARTICIPANTS.pitwall.id],
      },
    },
  });

  for (const other of otherBets) {
    // Regla 1: Prohibido coincidir en la predicción DNF
    if (other.dnfDriver === parsed.dnf.id) {
      return (
        `⚠️ *¡PRONÓSTICO INVÁLIDO POR DNF REPETIDO!* 🚫\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Por reglamento anti-copia, *está prohibido coincidir en la predicción DNF* con otro participante.\n\n` +
        `• 💥 *${other.userName}* ya ha elegido a *${parsed.dnf.name}* como DNF.\n\n` +
        `👉 Elige a otro piloto distinto para tu predicción de abandono (DNF).`
      );
    }

    // Regla 2: Límite de coincidencias exactas en máximo 3 del Top 5 (en QP3 no aplica regla anti-copia)
    let exactTop5Matches = 0;
    const matchDetails: string[] = [];

    if (other.p1Driver === parsed.p1.id) {
      exactTop5Matches++;
      matchDetails.push(`1º: ${parsed.p1.name}`);
    }
    if (other.p2Driver === parsed.p2.id) {
      exactTop5Matches++;
      matchDetails.push(`2º: ${parsed.p2.name}`);
    }
    if (other.p3Driver === parsed.p3.id) {
      exactTop5Matches++;
      matchDetails.push(`3º: ${parsed.p3.name}`);
    }
    if (other.p4Driver === parsed.p4.id) {
      exactTop5Matches++;
      matchDetails.push(`4º: ${parsed.p4.name}`);
    }
    if (other.p5Driver === parsed.p5.id) {
      exactTop5Matches++;
      matchDetails.push(`5º: ${parsed.p5.name}`);
    }

    if (exactTop5Matches > 3) {
      return (
        `⚠️ *¡PRONÓSTICO INVÁLIDO POR COINCIDENCIAS EXACTAS EN EL TOP 5!* 🚫\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Por reglamento anti-copia, *no puedes coincidir en más de 3 posiciones exactas del Top 5* con otro participante del grupo (máximo 3 de 5).\n\n` +
        `Coincides en *${exactTop5Matches} de 5* posiciones exactas del Top 5 con *${other.userName}*:\n` +
        `• ${matchDetails.join("\n• ")}\n\n` +
        `👉 Modifica al menos ${exactTop5Matches - 3} posición(es) de tu Top 5 para validar tu apuesta.`
      );
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
      qualyP3Driver: parsed.qualyP3.id,
      qualyP3Name: parsed.qualyP3.name,
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
      qualyP3Driver: parsed.qualyP3.id,
      qualyP3Name: parsed.qualyP3.name,
      points: null,
      breakdown: null,
    },
  });

  const sportIcon = sport === "motogp" ? "🏍️" : "🏎️";
  return (
    `✅ *¡PRONÓSTICO REGISTRADO!* 🏁${sportIcon}\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 *Participante:* ${userName}\n` +
    `🏆 *Gran Premio:* ${raceName} (${sport.toUpperCase()})\n\n` +
    `🎯 *Tus predicciones (7 selecciones):*\n` +
    `• *1º:* ${parsed.p1.name}\n` +
    `• *2º:* ${parsed.p2.name}\n` +
    `• *3º:* ${parsed.p3.name}\n` +
    `• *4º:* ${parsed.p4.name}\n` +
    `• *5º:* ${parsed.p5.name}\n` +
    `• 💥 *DNF (Abandono):* ${parsed.dnf.name}\n` +
    `• ⏱️ *P3 Clasificación:* ${parsed.qualyP3.name}\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 _Consulta todas las apuestas del grupo con *!porra${sport === "motogp" ? " moto" : ""} ver*._`
  );
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
      const race = await fetchNextF1RaceData();
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
      `Usa: *!porra${sport === "motogp" ? " moto" : ""} [1º] [2º] [3º] [4º] [5º] [DNF] [QP3]*`;

    if (!windowStatus.isOpen && !windowStatus.isClosed) {
      emptyMsg += `\n\n🤖 _*Jarvis AI* y *Pitwall AI* publicarán sus pronósticos 2h antes de la Qualy tras analizar los entrenamientos._`;
    }
    return emptyMsg;
  }

  let msg = `📋 *PRONÓSTICOS REGISTRADOS - ${raceName.toUpperCase()}* 🏁${sportIcon}\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n`;

  for (const bet of bets) {
    msg += `👤 *${bet.userName}:*\n` +
      `  • Top 5: 1º ${bet.p1Name} | 2º ${bet.p2Name} | 3º ${bet.p3Name} | 4º ${bet.p4Name} | 5º ${bet.p5Name}\n` +
      `  • 💥 DNF: ${bet.dnfName} | ⏱️ P3 Qualy: ${bet.qualyP3Name || "No registrado"}\n\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━\n` +
    `Total: *${bets.length}* participante(s).\n` +
    `🔒 Cierre de apuestas: inicio de la Clasificación (Qualy).`;

  if (!windowStatus.isOpen && !windowStatus.isClosed) {
    msg += `\n🤖 _*Jarvis AI* y *Pitwall AI* publicarán sus pronósticos 2h antes de la Qualy._`;
  }

  return msg;
}

export interface BetHitStats {
  exactHits: number;
  closeHits: number;
  top5PartialHits: number;
  dnfHit: boolean;
  qualyHits: number;
}

export function formatBetBreakdown(
  exactItems: Array<{ pos: number; driverName: string }>,
  closeItems: Array<{ predPos: number; realPos: number; driverName: string }>,
  partialItems: Array<{ driverName: string }>,
  dnfItem: { hit: boolean; driverName: string },
  qualyItem?: { pts: number; text: string } | null
): string {
  const details: string[] = [];
  for (const item of exactItems) {
    details.push(`+3 P${item.pos} exacto (${item.driverName})`);
  }
  for (const item of closeItems) {
    details.push(`+2 Casi exacto P${item.predPos}→P${item.realPos} (${item.driverName})`);
  }
  for (const item of partialItems) {
    details.push(`+1 Top5 (${item.driverName})`);
  }
  if (dnfItem.hit) {
    details.push(`+3 DNF acertado (${dnfItem.driverName})`);
  } else {
    details.push(`+0 DNF (${dnfItem.driverName} terminó)`);
  }
  if (qualyItem) {
    details.push(qualyItem.text);
  }
  return details.length > 0 ? details.join(", ") : "Sin aciertos puntuables";
}

export function extractBetStats(breakdown: string | null | undefined): BetHitStats {
  if (!breakdown) {
    return { exactHits: 0, closeHits: 0, top5PartialHits: 0, dnfHit: false, qualyHits: 0 };
  }
  const exactHits = (breakdown.match(/\+3 P[1-5]/g) || []).length;
  const closeHits = (breakdown.match(/\+2 Casi exacto/g) || []).length;
  const top5PartialHits = (breakdown.match(/\+1 Top5/g) || []).length;
  const dnfHit = breakdown.includes("+3 DNF");
  const qualyHits = breakdown.includes("+3 P3 Qualy exacto") ? 1 : 0;
  return { exactHits: exactHits + qualyHits, closeHits, top5PartialHits, dnfHit, qualyHits };
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
  let qualyTop5Official: DriverEntry[] = [];

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
    qualyTop5Official = motoData.qualyTop5 || [];
  } else {
    try {
      const race = await fetchLastF1RaceData();
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
        const posText = String(r.positionText || "").toUpperCase();
        const status = String(r.status || "").toLowerCase();
        const nonFinishPos = ["R", "D", "W", "F", "N", "E"].includes(posText);
        const finishedNormally = status === "finished" || status.includes("lap");
        return nonFinishPos || !finishedNormally;
      }).map((r: any) => ({
        id: r.Driver.driverId,
        name: `${r.Driver.givenName} ${r.Driver.familyName}`,
      }));

      // Obtener resultados de la sesión de clasificación de F1
      try {
        const qualyRace = await fetchLastF1QualifyingData(season, round);
        const qResults = qualyRace?.QualifyingResults || [];
        qualyTop5Official = qResults.slice(0, 5).map((q: any) => ({
          id: q.Driver.driverId,
          name: `${q.Driver.givenName} ${q.Driver.familyName}`,
        }));
      } catch (err: any) {
        console.error("Error obteniendo resultados de qualy F1:", err?.message);
      }
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
    updatedAt: Date;
  }

  const evaluated: EvaluatedUser[] = [];

  for (const bet of bets) {
    let pts = 0;
    const exactItems: Array<{ pos: number; driverName: string }> = [];
    const closeItems: Array<{ predPos: number; realPos: number; driverName: string }> = [];
    const partialItems: Array<{ driverName: string }> = [];

    const positions = [
      { pos: 1, driverId: bet.p1Driver, driverName: bet.p1Name },
      { pos: 2, driverId: bet.p2Driver, driverName: bet.p2Name },
      { pos: 3, driverId: bet.p3Driver, driverName: bet.p3Name },
      { pos: 4, driverId: bet.p4Driver, driverName: bet.p4Name },
      { pos: 5, driverId: bet.p5Driver, driverName: bet.p5Name },
    ];

    for (const item of positions) {
      const realIndex = top5Ids.indexOf(item.driverId);
      if (realIndex !== -1) {
        const realPos = realIndex + 1;
        const diff = Math.abs(item.pos - realPos);
        if (diff === 0) {
          pts += 3;
          exactItems.push({ pos: item.pos, driverName: item.driverName });
        } else if (diff === 1) {
          pts += 2;
          closeItems.push({ predPos: item.pos, realPos, driverName: item.driverName });
        } else {
          pts += 1;
          partialItems.push({ driverName: item.driverName });
        }
      }
    }

    // DNF en Carrera
    const dnfHit = dnfIds.has(bet.dnfDriver);
    if (dnfHit) {
      pts += 3;
    }

    // P3 en Clasificación (mismo sistema de puntuación: +3 exacto, +2 a ±1 puesto, +1 en Top 5 Qualy)
    let qualyItem: { pts: number; text: string } | null = null;
    if (bet.qualyP3Driver && qualyTop5Official.length > 0) {
      const qualyTop5Ids = qualyTop5Official.map((d) => d.id);
      const qRealIndex = qualyTop5Ids.indexOf(bet.qualyP3Driver);
      if (qRealIndex !== -1) {
        const qRealPos = qRealIndex + 1; // 1..5
        const qDiff = Math.abs(3 - qRealPos); // El objetivo es P3
        if (qDiff === 0) {
          pts += 3;
          qualyItem = { pts: 3, text: `+3 P3 Qualy exacto (${bet.qualyP3Name})` };
        } else if (qDiff === 1) {
          pts += 2;
          qualyItem = { pts: 2, text: `+2 Casi exacto P3 Qualy→P${qRealPos} (${bet.qualyP3Name})` };
        } else {
          pts += 1;
          qualyItem = { pts: 1, text: `+1 Top 5 Qualy P${qRealPos} (${bet.qualyP3Name})` };
        }
      } else {
        qualyItem = { pts: 0, text: `+0 P3 Qualy (${bet.qualyP3Name} fuera Top 5 Qualy)` };
      }
    }

    const breakdownText = formatBetBreakdown(
      exactItems,
      closeItems,
      partialItems,
      { hit: dnfHit, driverName: bet.dnfName },
      qualyItem
    );

    // Preservar updatedAt original del pronóstico para no alterar los desempates al recalcular
    await prisma.porraBet.update({
      where: { id: bet.id },
      data: {
        points: pts,
        breakdown: breakdownText,
        updatedAt: bet.updatedAt,
      },
    });

    evaluated.push({
      id: bet.id,
      userName: bet.userName,
      points: pts,
      breakdown: breakdownText,
      updatedAt: bet.updatedAt,
    });
  }

  // Ordenar clasificación del GP: más puntos primero, desempate por fecha de última modificación (updatedAt)
  evaluated.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return a.updatedAt.getTime() - b.updatedAt.getTime();
  });

  const sportIcon = sport === "motogp" ? "🏍️" : "🏎️";
  const dnfsStr = officialDnfs.length > 0 ? officialDnfs.map((d) => d.name).join(", ") : "Ninguno";
  const qualyP3OfficialName = qualyTop5Official[2] ? qualyTop5Official[2].name : "Pendiente de confirmación";

  let msg = `🏁 *RESULTADOS OFICIALES - ${raceName.toUpperCase()}* ${sportIcon}\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `📊 *Resultados oficiales reales:*\n` +
    `• 1º: *${top5Official[0].name}*\n` +
    `• 2º: *${top5Official[1].name}*\n` +
    `• 3º: *${top5Official[2].name}*\n` +
    `• 4º: *${top5Official[3].name}*\n` +
    `• 5º: *${top5Official[4].name}*\n` +
    `• 💥 Abandonos (DNF): *${dnfsStr}*\n` +
    `• ⏱️ P3 Clasificación: *${qualyP3OfficialName}*\n` +
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

  const aiJids = new Set([AI_PARTICIPANTS.jarvis.id, AI_PARTICIPANTS.pitwall.id]);

  // Victorias de GP por ronda (un ganador por GP desempatado por puntos y luego updatedAt; humanos e IAs evaluados sin que la IA deje desierto el trofeo humano)
  const roundMap = new Map<number, typeof bets>();
  for (const b of bets) {
    const list = roundMap.get(b.round) || [];
    list.push(b);
    roundMap.set(b.round, list);
  }

  const gpWinnersCount = new Map<string, number>();
  for (const [, roundBets] of roundMap.entries()) {
    const humanRoundBets = roundBets.filter((b) => !aiJids.has(b.userJid) && (b.points || 0) > 0);
    const pool = humanRoundBets.length > 0 ? humanRoundBets : roundBets.filter((b) => (b.points || 0) > 0);
    if (pool.length > 0) {
      const sortedPool = [...pool].sort((a, b) => {
        if ((b.points || 0) !== (a.points || 0)) return (b.points || 0) - (a.points || 0);
        return a.updatedAt.getTime() - b.updatedAt.getTime();
      });
      const winnerJid = sortedPool[0].userJid;
      gpWinnersCount.set(winnerJid, (gpWinnersCount.get(winnerJid) || 0) + 1);
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

    const stats = extractBetStats(b.breakdown);
    current.exactHits += stats.exactHits;
    if (stats.dnfHit) {
      current.dnfHits += 1;
    }

    userMap.set(b.userJid, current);
  }

  // La Clasificación General se ordena por la suma total de puntos acumulados en todos los GPs
  const ranking = Array.from(userMap.values());
  ranking.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.exactHits !== a.exactHits) return b.exactHits - a.exactHits;
    return b.gpWins - a.gpWins;
  });

  let msg = `🏆 *CLASIFICACIÓN GENERAL DE LA PORRA (${sport.toUpperCase()} ${currentYear})* 🏁${sportIcon}\n` +
    `📌 _Suma total de puntos acumulados en cada GP_\n` +
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
      return a.updatedAt.getTime() - b.updatedAt.getTime();
    });

    const humansSorted = sorted.filter((b) => !aiJids.has(b.userJid));
    const aisSorted = sorted.filter((b) => aiJids.has(b.userJid));

    const roundMedals = ["🥇", "🥈", "🥉"];
    msg += `${flag} *Ronda ${round}: ${raceName}*\n`;

    for (let i = 0; i < humansSorted.length; i++) {
      const b = humansSorted[i];
      const prefix = i < 3 ? roundMedals[i] : `  ${i + 1}.`;
      msg += `${prefix} ${b.userName} — *${b.points} pts*`;

      const stats = extractBetStats(b.breakdown);
      if (stats.exactHits > 0) msg += ` 🎯×${stats.exactHits}`;
      if (stats.dnfHit) msg += ` 💥`;
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
