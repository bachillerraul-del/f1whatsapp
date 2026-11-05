import axios from "axios";
import { prisma } from "./db.js";
import { generatePodiumImage } from "./podium-image.js";
import {
  type F1DriverDef,
  KNOWN_DRIVERS,
  findDriver,
  parsePosOrDNF,
  formatPos,
} from "./f1-drivers.js";
import { ensureAIParticipants } from "./ai-participants.js";

export {
  type F1DriverDef,
  KNOWN_DRIVERS,
  findDriver,
  parsePosOrDNF,
  formatPos,
};

const JOLPICA_BASE = "https://api.jolpi.ca/ergast/f1";

export interface PorraResultsResponse {
  text: string;
  imageBuffer?: Buffer | null;
}

export const PORRA_RULES_MESSAGE = `🏁 *LA PORRA DE F1* 🏎️🇪🇸\n` +
  `━━━━━━━━━━━━━━━━━━━━━\n` +
  `🎯 *Objetivo:* Acertar los pilotos que terminarán en *P4, P5 y P6*, además de las posiciones exactas de *Fernando Alonso* y *Carlos Sainz*.\n\n` +
  `📋 *CÓMO JUGAR (Antes de la Qualy):*\n` +
  `Envía tu pronóstico con el comando:\n` +
  `👉 *!porra [P4] [P5] [P6] [Alonso] [Sainz]*\n\n` +
  `*Ejemplos válidos:*\n` +
  `🔹 *!porra norris leclerc piastri P8 P5*\n` +
  `🔹 *!porra russell hamilton bearman DNF 7* _(¡Puedes apostar DNF si crees que abandona!)_\n` +
  `🔹 *!porra alonso norris leclerc 4 7* _(¡Alonso/Sainz pueden estar en el Top 6!)_\n\n` +
  `🤖 *COMPETIDORES IA (Gemini):*\n` +
  `*Jarvis AI* y *Pitwall AI* compiten en el grupo con pronósticos calculados por IA.\n\n` +
  `🏆 *SISTEMA DE PUNTUACIÓN (Máx 15 pts por GP):*\n` +
  `🏎️ *P4, P5 y P6:*\n` +
  `• *+3 pts* por cada piloto que aciertes en su posición exacta.\n\n` +
  `🇪🇸 *Fernando Alonso y Carlos Sainz:*\n` +
  `• *+3 pts* : Acierto exacto del puesto o acierto de *DNF* si abandona.\n` +
  `• *+2 pts* : Si fallas por solo 1 puesto (ej: dijiste P8 y acaba P7 o P9).\n` +
  `• *+1 pt*  : Si fallas por 2 puestos (ej: dijiste P8 y acaba P6 o P10).\n` +
  `• *0 pts*  : Si la diferencia es de 3 puestos o más (o apostaste DNF y terminó).\n\n` +
  `⏳ *Límite:* Las apuestas se cierran al comenzar la Clasificación (Q1) del sábado.\n` +
  `🚫 *Regla anti-copia:* No puedes coincidir en más de 3 pronósticos con otro participante del grupo (máximo 3 coincidencias de 5).\n\n` +
  `📊 *COMANDOS DISPONIBLES:*\n` +
  `🔹 *!porra [apuesta]* : Enviar o modificar tu apuesta\n` +
  `🔹 *!porra ver* : Ver las apuestas del grupo (incluyendo a las IAs)\n` +
  `🔹 *!porra ia* : Ver/desafiar los pronósticos de Jarvis AI y Pitwall AI\n` +
  `🔹 *!porra resultados* : Calcular puntos y podio gráfico del GP\n` +
  `🔹 *!porra tabla* : Clasificación general de la temporada`;

interface ParsedPorra {
  p4: F1DriverDef;
  p5: F1DriverDef;
  p6: F1DriverDef;
  alonsoPos: number;
  sainzPos: number;
}

export function parsePorraArgs(rawArgs: string[]): { parsed?: ParsedPorra; error?: string } {
  // Unificar texto y quitar separadores comunes
  const fullText = rawArgs.join(" ").replace(/[,;:]/g, " ").trim();
  const tokens = fullText.split(/\s+/).filter(Boolean);

  if (tokens.length < 5) {
    return {
      error: `❓ *Faltan datos en tu pronóstico.*\n\n` +
        `Debes indicar los pilotos de P4, P5, P6 y los puestos de Alonso y Sainz (puesto 1-22 o DNF).\n` +
        `👉 *Formato:* \`!porra [P4] [P5] [P6] [Alonso] [Sainz]\`\n` +
        `👉 *Ejemplo:* \`!porra norris leclerc piastri P8 P5\` o \`!porra norris leclerc piastri DNF P7\``,
    };
  }

  // Caso 1: Exactamente 5 elementos posicionales (el formato más habitual)
  if (tokens.length === 5) {
    const d1 = findDriver(tokens[0]);
    const d2 = findDriver(tokens[1]);
    const d3 = findDriver(tokens[2]);
    const n1 = parsePosOrDNF(tokens[3]);
    const n2 = parsePosOrDNF(tokens[4]);

    if (d1 && d2 && d3 && n1 !== null && n2 !== null) {
      if (d1.id === d2.id || d1.id === d3.id || d2.id === d3.id) {
        return { error: `⚠️ No puedes repetir al mismo piloto en varias posiciones de P4, P5 o P6.` };
      }
      return {
        parsed: {
          p4: d1,
          p5: d2,
          p6: d3,
          alonsoPos: n1,
          sainzPos: n2,
        },
      };
    }
  }

  // Caso 2: Con etiquetas explícitas (alo, sainz, p4, p5, p6) o tokens desordenados
  let p4: F1DriverDef | null = null;
  let p5: F1DriverDef | null = null;
  let p6: F1DriverDef | null = null;
  let alonsoPos: number | null = null;
  let sainzPos: number | null = null;

  const remainingTokens: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].toLowerCase();
    const next = tokens[i + 1];

    if ((t === "alo" || t === "alonso") && next && parsePosOrDNF(next) !== null) {
      alonsoPos = parsePosOrDNF(next);
      i++;
      continue;
    }
    if ((t === "sai" || t === "sainz") && next && parsePosOrDNF(next) !== null) {
      sainzPos = parsePosOrDNF(next);
      i++;
      continue;
    }
    if (t === "p4" && next && findDriver(next)) {
      p4 = findDriver(next);
      i++;
      continue;
    }
    if (t === "p5" && next && findDriver(next)) {
      p5 = findDriver(next);
      i++;
      continue;
    }
    if (t === "p6" && next && findDriver(next)) {
      p6 = findDriver(next);
      i++;
      continue;
    }

    remainingTokens.push(tokens[i]);
  }

  // Completar los que falten con los tokens restantes
  const driversFound: F1DriverDef[] = [];
  const numbersFound: number[] = [];

  for (const tok of remainingTokens) {
    const num = parsePosOrDNF(tok);
    const drv = findDriver(tok);
    if (drv) {
      driversFound.push(drv);
    } else if (num !== null) {
      numbersFound.push(num);
    }
  }

  if (!p4 && driversFound.length > 0) p4 = driversFound.shift()!;
  if (!p5 && driversFound.length > 0) p5 = driversFound.shift()!;
  if (!p6 && driversFound.length > 0) p6 = driversFound.shift()!;
  if (alonsoPos === null && numbersFound.length > 0) alonsoPos = numbersFound.shift()!;
  if (sainzPos === null && numbersFound.length > 0) sainzPos = numbersFound.shift()!;

  if (!p4 || !p5 || !p6) {
    return {
      error: `❓ No se han podido identificar los 3 pilotos para P4, P5 y P6.\n\n` +
        `Usa los apellidos o apodos comunes (ej: *norris*, *leclerc*, *piastri*, *russell*, *hamilton*, *verstappen*, etc.).`,
    };
  }

  if (alonsoPos === null || sainzPos === null) {
    return {
      error: `❓ Debes indicar dos puestos para Alonso y Sainz (número del 1 al 22, o *DNF* si crees que abandonará).\n\n` +
        `Ejemplo: *P8 P5* o *DNF P7*.`,
    };
  }

  if (p4.id === p5.id || p4.id === p6.id || p5.id === p6.id) {
    return { error: `⚠️ No puedes repetir al mismo piloto en varias posiciones de P4, P5 o P6.` };
  }

  return {
    parsed: {
      p4,
      p5,
      p6,
      alonsoPos,
      sainzPos,
    },
  };
}

export async function handlePorraCommand(
  groupJid: string,
  userJid: string,
  userName: string,
  commandText: string
): Promise<string | PorraResultsResponse> {
  const parts = commandText.trim().split(/\s+/);
  const subCommand = parts[1]?.toLowerCase();

  // 1. Ayuda / Reglas
  if (!subCommand || subCommand === "ayuda" || subCommand === "help" || subCommand === "reglas") {
    return PORRA_RULES_MESSAGE;
  }

  // 2. Ver apuestas registradas del grupo
  if (subCommand === "ver" || subCommand === "apuestas" || subCommand === "lista" || subCommand === "apuesta") {
    return showGroupBets(groupJid);
  }

  // 3. Ver clasificación general de la temporada
  if (subCommand === "tabla" || subCommand === "ranking" || subCommand === "clasificacion" || subCommand === "puntos") {
    return showSeasonRanking(groupJid);
  }

  // 4. Calcular resultados y podio del GP
  if (subCommand === "resultados" || subCommand === "resultado" || subCommand === "calcular" || subCommand === "ganador") {
    return calculatePorraResults(groupJid);
  }

  // 5. Invocar o forzar apuestas de la IA (Jarvis AI & Pitwall AI)
  if (subCommand === "ia" || subCommand === "ai" || subCommand === "jarvis" || subCommand === "pitwall") {
    try {
      const nextRes = await axios.get(`${JOLPICA_BASE}/current/next.json`, { timeout: 8000 });
      const race = nextRes.data.MRData?.RaceTable?.Races?.[0];
      if (!race) return "⚠️ No hay información de la próxima carrera disponible.";
      const season = parseInt(race.season, 10);
      const round = parseInt(race.round, 10);
      const raceName = race.raceName || `GP Ronda ${round}`;
      const aiRes = await ensureAIParticipants(groupJid, season, round, raceName);
      return aiRes.text;
    } catch (err: any) {
      return "⚠️ Error al generar pronósticos de la IA.";
    }
  }

  // 6. Registrar apuesta humana
  const betArgs = parts.slice(1);
  return registerPorraBet(groupJid, userJid, userName, betArgs);
}

async function registerPorraBet(
  groupJid: string,
  userJid: string,
  userName: string,
  args: string[]
): Promise<string> {
  const { parsed, error } = parsePorraArgs(args);
  if (error || !parsed) {
    return error || "⚠️ Error al interpretar la apuesta.";
  }

  // Consultar próximo GP
  let race: any = null;
  try {
    const nextRes = await axios.get(`${JOLPICA_BASE}/current/next.json`, { timeout: 8000 });
    race = nextRes.data.MRData?.RaceTable?.Races?.[0];
  } catch (err: any) {
    console.error("Error consultando próximo GP:", err?.message);
    return "⚠️ Error al conectar con la API de F1. Por favor intenta de nuevo en unos instantes.";
  }

  if (!race) {
    return "⚠️ No hay información de la próxima carrera disponible en este momento.";
  }

  const season = parseInt(race.season, 10);
  const round = parseInt(race.round, 10);
  const raceName = race.raceName || `GP Ronda ${round}`;

  // Verificar límite de tiempo: Debe ser ANTES de la Clasificación (Qualifying / Q1)
  const now = new Date();
  if (race.Qualifying?.date) {
    const qualyTime = race.Qualifying.time || "14:00:00Z";
    const qualyDate = new Date(`${race.Qualifying.date}T${qualyTime}`);
    if (now >= qualyDate) {
      return `🔒 *¡APUESTAS CERRADAS!* La Clasificación del *${raceName}* ya ha comenzado. Ya no se pueden enviar ni modificar pronósticos para este Gran Premio.`;
    }
  }

  // Comprobar regla anti-copia: no coincidir en más de 3 pronósticos con otro jugador del grupo
  const otherBets = await prisma.porraBet.findMany({
    where: {
      groupJid,
      season,
      round,
      userJid: { not: userJid },
    },
  });

  for (const other of otherBets) {
    let matches = 0;
    const matchDetails: string[] = [];

    if (other.p4Driver === parsed.p4.id) {
      matches++;
      matchDetails.push(`P4: ${parsed.p4.name}`);
    }
    if (other.p5Driver === parsed.p5.id) {
      matches++;
      matchDetails.push(`P5: ${parsed.p5.name}`);
    }
    if (other.p6Driver === parsed.p6.id) {
      matches++;
      matchDetails.push(`P6: ${parsed.p6.name}`);
    }
    if (other.alonsoPos === parsed.alonsoPos) {
      matches++;
      matchDetails.push(`Alonso: ${formatPos(parsed.alonsoPos)}`);
    }
    if (other.sainzPos === parsed.sainzPos) {
      matches++;
      matchDetails.push(`Sainz: ${formatPos(parsed.sainzPos)}`);
    }

    if (matches > 3) {
      return `⚠️ *¡PRONÓSTICO INVÁLIDO POR COINCIDENCIA!* 🚫\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Por reglamento, *no puedes copiar más de 3 pronósticos* de otro participante.\n\n` +
        `Coincides en *${matches} de 5* predicciones con *${other.userName}*:\n` +
        `• ${matchDetails.join("\n• ")}\n\n` +
        `👉 Modifica al menos ${matches - 3} predicción(es) para diferenciar tu apuesta.`;
    }
  }

  // Guardar o actualizar apuesta en la BD
  await prisma.porraBet.upsert({
    where: {
      groupJid_season_round_userJid: {
        groupJid,
        season,
        round,
        userJid,
      },
    },
    create: {
      groupJid,
      userJid,
      userName,
      season,
      round,
      raceName,
      p4Driver: parsed.p4.id,
      p4Name: parsed.p4.name,
      p5Driver: parsed.p5.id,
      p5Name: parsed.p5.name,
      p6Driver: parsed.p6.id,
      p6Name: parsed.p6.name,
      alonsoPos: parsed.alonsoPos,
      sainzPos: parsed.sainzPos,
    },
    update: {
      userName,
      raceName,
      p4Driver: parsed.p4.id,
      p4Name: parsed.p4.name,
      p5Driver: parsed.p5.id,
      p5Name: parsed.p5.name,
      p6Driver: parsed.p6.id,
      p6Name: parsed.p6.name,
      alonsoPos: parsed.alonsoPos,
      sainzPos: parsed.sainzPos,
      points: null,
      breakdown: null,
    },
  });

  return `✅ *¡PRONÓSTICO REGISTRADO!* 🏁🏎️\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 *Participante:* ${userName}\n` +
    `🏆 *Gran Premio:* ${raceName}\n\n` +
    `🎯 *Tus predicciones:*\n` +
    `• *P4:* ${parsed.p4.name}\n` +
    `• *P5:* ${parsed.p5.name}\n` +
    `• *P6:* ${parsed.p6.name}\n` +
    `• 🇪🇸 *Fernando Alonso:* ${formatPos(parsed.alonsoPos)}\n` +
    `• 🇪🇸 *Carlos Sainz:* ${formatPos(parsed.sainzPos)}\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 _Puedes consultar todas las apuestas del grupo con *!porra ver*._`;
}

async function showGroupBets(groupJid: string): Promise<string> {
  let race: any = null;
  try {
    const nextRes = await axios.get(`${JOLPICA_BASE}/current/next.json`, { timeout: 8000 });
    race = nextRes.data.MRData?.RaceTable?.Races?.[0];
  } catch (err: any) {
    console.error("Error consultando próximo GP:", err?.message);
    return "⚠️ Error al conectar con la API de F1.";
  }

  if (!race) {
    return "⚠️ No hay información de la próxima carrera disponible.";
  }

  const season = parseInt(race.season, 10);
  const round = parseInt(race.round, 10);
  const raceName = race.raceName || `GP Ronda ${round}`;

  // Asegurar que las IAs participan en este grupo
  try {
    await ensureAIParticipants(groupJid, season, round, raceName);
  } catch (err: any) {
    console.error("Error asegurando IAs en showGroupBets:", err?.message);
  }

  const bets = await prisma.porraBet.findMany({
    where: {
      groupJid,
      season,
      round,
    },
    orderBy: { createdAt: "asc" },
  });

  if (bets.length === 0) {
    return `📋 *PRONÓSTICOS REGISTRADOS - ${raceName.toUpperCase()}* 🏁\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `_Aún no hay apuestas registradas en este grupo._\n\n` +
      `👉 ¡Sé el primero en enviar tu pronóstico!\n` +
      `Usa: *!porra [P4] [P5] [P6] [Alonso] [Sainz]*\n` +
      `Ejemplo: *!porra norris leclerc piastri P8 P5*`;
  }

  let msg = `📋 *PRONÓSTICOS REGISTRADOS - ${raceName.toUpperCase()}* 🏁\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n`;

  for (const bet of bets) {
    msg += `👤 *${bet.userName}:*\n` +
      `  • P4: ${bet.p4Name} | P5: ${bet.p5Name} | P6: ${bet.p6Name}\n` +
      `  • 🇪🇸 Alo: ${formatPos(bet.alonsoPos)} | Sai: ${formatPos(bet.sainzPos)}\n\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━\n` +
    `Total: *${bets.length}* participante(s).\n` +
    `🔒 Cierre de apuestas: inicio de la Qualy.`;

  return msg;
}

export async function calculatePorraResults(groupJid: string): Promise<PorraResultsResponse> {
  let race: any = null;
  try {
    const lastRes = await axios.get(`${JOLPICA_BASE}/current/last/results.json`, { timeout: 8000 });
    race = lastRes.data.MRData?.RaceTable?.Races?.[0];
  } catch (err: any) {
    console.error("Error consultando resultados del último GP:", err?.message);
    return { text: "⚠️ Error al obtener los resultados oficiales de la carrera." };
  }

  if (!race || !race.Results || race.Results.length < 6) {
    return { text: "⚠️ No se encontraron resultados oficiales completos para la última carrera." };
  }

  const season = parseInt(race.season, 10);
  const round = parseInt(race.round, 10);
  const raceName = race.raceName || `GP Ronda ${round}`;

  // Asegurar que las IAs participan en este grupo
  try {
    await ensureAIParticipants(groupJid, season, round, raceName);
  } catch (err: any) {
    console.error("Error asegurando IAs en showGroupBets:", err?.message);
  }

  const bets = await prisma.porraBet.findMany({
    where: {
      groupJid,
      season,
      round,
    },
  });

  if (bets.length === 0) {
    return { text: `ℹ️ No se registraron apuestas en este grupo para el *${raceName}*.` };
  }

  // Resultados oficiales reales
  const results = race.Results;
  const p4Official = {
    id: results[3].Driver.driverId,
    name: `${results[3].Driver.givenName} ${results[3].Driver.familyName}`,
  };
  const p5Official = {
    id: results[4].Driver.driverId,
    name: `${results[4].Driver.givenName} ${results[4].Driver.familyName}`,
  };
  const p6Official = {
    id: results[5].Driver.driverId,
    name: `${results[5].Driver.givenName} ${results[5].Driver.familyName}`,
  };

  const aloDriver = results.find((d: any) => d.Driver.driverId === "alonso");
  const saiDriver = results.find((d: any) => d.Driver.driverId === "sainz");

  const isAloDnf = aloDriver ? (aloDriver.positionText === "R" || (aloDriver.status !== "Finished" && !aloDriver.status.toLowerCase().includes("lap"))) : true;
  const isSaiDnf = saiDriver ? (saiDriver.positionText === "R" || (saiDriver.status !== "Finished" && !saiDriver.status.toLowerCase().includes("lap"))) : true;

  const aloOfficialPos = aloDriver ? parseInt(aloDriver.position, 10) : 22;
  const saiOfficialPos = saiDriver ? parseInt(saiDriver.position, 10) : 22;

  // Evaluar a cada usuario
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

    // P4
    if (bet.p4Driver === p4Official.id) {
      pts += 3;
      details.push(`+3 P4 (${bet.p4Name})`);
    }

    // P5
    if (bet.p5Driver === p5Official.id) {
      pts += 3;
      details.push(`+3 P5 (${bet.p5Name})`);
    }

    // P6
    if (bet.p6Driver === p6Official.id) {
      pts += 3;
      details.push(`+3 P6 (${bet.p6Name})`);
    }

    // Alonso
    if (bet.alonsoPos === 0) {
      if (isAloDnf) {
        pts += 3;
        details.push(`+3 Alo DNF acertado`);
      } else {
        details.push(`+0 Alo (pusiste DNF pero acabó P${aloOfficialPos})`);
      }
    } else {
      const diffAlo = Math.abs(bet.alonsoPos - aloOfficialPos);
      if (diffAlo === 0) {
        pts += 3;
        details.push(`+3 Alo exacto (P${bet.alonsoPos})`);
      } else if (diffAlo === 1) {
        pts += 2;
        details.push(`+2 Alo dif 1 (pusiste P${bet.alonsoPos}, fue P${aloOfficialPos})`);
      } else if (diffAlo === 2) {
        pts += 1;
        details.push(`+1 Alo dif 2 (pusiste P${bet.alonsoPos}, fue P${aloOfficialPos})`);
      }
    }

    // Sainz
    if (bet.sainzPos === 0) {
      if (isSaiDnf) {
        pts += 3;
        details.push(`+3 Sai DNF acertado`);
      } else {
        details.push(`+0 Sai (pusiste DNF pero acabó P${saiOfficialPos})`);
      }
    } else {
      const diffSai = Math.abs(bet.sainzPos - saiOfficialPos);
      if (diffSai === 0) {
        pts += 3;
        details.push(`+3 Sai exacto (P${bet.sainzPos})`);
      } else if (diffSai === 1) {
        pts += 2;
        details.push(`+2 Sai dif 1 (pusiste P${bet.sainzPos}, fue P${saiOfficialPos})`);
      } else if (diffSai === 2) {
        pts += 1;
        details.push(`+1 Sai dif 2 (pusiste P${bet.sainzPos}, fue P${saiOfficialPos})`);
      }
    }

    const breakdownText = details.length > 0 ? details.join(", ") : "Sin aciertos puntuables";

    // Actualizar puntos en la BD
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

  // Ordenar clasificación de la jornada: más puntos primero, en empate por fecha más temprana
  evaluated.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const aloDisplay = aloDriver ? (isAloDnf ? `P${aloOfficialPos} (DNF)` : `P${aloOfficialPos}`) : "No participó";
  const saiDisplay = saiDriver ? (isSaiDnf ? `P${saiOfficialPos} (DNF)` : `P${saiOfficialPos}`) : "No participó";

  let msg = `🏁 *RESULTADOS OFICIALES - ${raceName.toUpperCase()}* 🏁\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `📊 *Llegada oficial real:*\n` +
    `• P4: *${p4Official.name}*\n` +
    `• P5: *${p5Official.name}*\n` +
    `• P6: *${p6Official.name}*\n` +
    `• 🇪🇸 Alonso: *${aloDisplay}*\n` +
    `• 🇪🇸 Sainz: *${saiDisplay}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `🏆 *PODIO DE LA JORNADA:*\n\n`;

  const medals = ["🥇", "🥈", "🥉"];
  for (let i = 0; i < evaluated.length; i++) {
    const item = evaluated[i];
    const prefix = i < 3 ? medals[i] : `▫️ ${i + 1}º`;
    msg += `${prefix} *${item.userName}* — *${item.points} pts*\n` +
      `   _${item.breakdown}_\n\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 _Consulta la clasificación general acumulada con *!porra tabla*._`;

  // Generar imagen gráfica del podio
  const podiumData = evaluated.slice(0, 3).map((u) => ({
    name: u.userName,
    points: u.points,
  }));

  const imageBuffer = generatePodiumImage({
    raceName,
    season,
    podium: podiumData,
  });

  return {
    text: msg,
    imageBuffer,
  };
}

export async function showSeasonRanking(groupJid: string): Promise<string> {
  const currentYear = new Date().getFullYear();

  // Obtener todas las apuestas puntuadas de este grupo para la temporada actual
  const bets = await prisma.porraBet.findMany({
    where: {
      groupJid,
      season: currentYear,
      points: { not: null },
    },
    orderBy: { round: "asc" },
  });

  if (bets.length === 0) {
    return `🏆 *CLASIFICACIÓN GENERAL DE LA PORRA (${currentYear})* 🏁\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `_Aún no hay puntos acumulados en esta temporada._\n\n` +
      `Los puntos se sumarán automáticamente al disputarse cada carrera con *!porra resultados*.`;
  }

  // 1. Calcular victorias de GP por cada ronda disputada
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

  // 2. Agrupar estadísticas por usuario
  interface UserStat {
    userJid: string;
    userName: string;
    totalPoints: number;
    racesCount: number;
    gpWins: number;
    exactHits: number;
    spanishPoints: number;
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
      spanishPoints: 0,
    };

    current.userName = b.userName;
    current.totalPoints += pts;
    current.racesCount += 1;

    // Conteo de aciertos exactos (+3)
    const exactMatches = (b.breakdown?.match(/\+3 /g) || []).length;
    current.exactHits += exactMatches;

    // Conteo de puntos con Alonso y Sainz
    const aloMatch = b.breakdown?.match(/\+([0-9]) Alo/);
    const saiMatch = b.breakdown?.match(/\+([0-9]) Sai/);
    if (aloMatch) current.spanishPoints += parseInt(aloMatch[1], 10);
    if (saiMatch) current.spanishPoints += parseInt(saiMatch[1], 10);

    userMap.set(b.userJid, current);
  }

  const ranking = Array.from(userMap.values());
  ranking.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.gpWins !== a.gpWins) return b.gpWins - a.gpWins;
    return b.exactHits - a.exactHits;
  });

  let msg = `🏆 *CLASIFICACIÓN GENERAL DE LA PORRA (${currentYear})* 🏁\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n`;

  const medals = ["🥇", "🥈", "🥉"];
  for (let i = 0; i < ranking.length; i++) {
    const u = ranking[i];
    const prefix = i < 3 ? medals[i] : ` ${i + 1}.`;
    const leaderCrown = i === 0 ? " 👑" : "";

    msg += `${prefix} *${u.userName}* — *${u.totalPoints} pts* (${u.racesCount} GP)${leaderCrown}\n` +
      `   ↳ 🏆 ${u.gpWins} vic | 🎯 ${u.exactHits} plenos | 🇪🇸 ${u.spanishPoints} pts ESP\n`;
  }

  // Cuadro de honor
  const topWinner = [...ranking].sort((a, b) => b.gpWins - a.gpWins)[0];
  const topNostradamus = [...ranking].sort((a, b) => b.exactHits - a.exactHits)[0];
  const topSpanish = [...ranking].sort((a, b) => b.spanishPoints - a.spanishPoints)[0];

  msg += `━━━━━━━━━━━━━━━━━━━━━\n` +
    `🎖️ *CUADRO DE HONOR:*\n`;

  if (topWinner && topWinner.gpWins > 0) {
    msg += `• 🏆 *Rey de Grandes Premios:* *${topWinner.userName}* (${topWinner.gpWins} victoria${topWinner.gpWins > 1 ? "s" : ""})\n`;
  }
  if (topNostradamus && topNostradamus.exactHits > 0) {
    msg += `• 🎯 *El Nostradamus:* *${topNostradamus.userName}* (${topNostradamus.exactHits} acierto${topNostradamus.exactHits > 1 ? "s" : ""} exacto${topNostradamus.exactHits > 1 ? "s" : ""})\n`;
  }
  if (topSpanish && topSpanish.spanishPoints > 0) {
    msg += `• 🇪🇸 *Especialista Español:* *${topSpanish.userName}* (${topSpanish.spanishPoints} pts en Alonso/Sainz)\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 _Envía tu predicción para la próxima carrera con *!porra*._`;

  return msg;
}
