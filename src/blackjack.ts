import axios from "axios";
import { prisma } from "./db.js";

const JOLPICA_BASE = "https://api.jolpi.ca/ergast/f1";

export interface F1DriverDef {
  id: string;
  name: string;
  isSpanish: boolean;
  aliases: string[];
}

export const KNOWN_DRIVERS: F1DriverDef[] = [
  // Pilotos españoles (Obligatorio elegir uno)
  { id: "alonso", name: "Fernando Alonso", isSpanish: true, aliases: ["alonso", "fernando", "alo", "14", "magic"] },
  { id: "sainz", name: "Carlos Sainz", isSpanish: true, aliases: ["sainz", "carlos", "sai", "55", "chili"] },

  // Resto de la parrilla (Socio extranjero)
  { id: "max_verstappen", name: "Max Verstappen", isSpanish: false, aliases: ["verstappen", "max", "ver", "1", "3"] },
  { id: "norris", name: "Lando Norris", isSpanish: false, aliases: ["norris", "lando", "nor", "4"] },
  { id: "leclerc", name: "Charles Leclerc", isSpanish: false, aliases: ["leclerc", "charles", "lec", "16"] },
  { id: "piastri", name: "Oscar Piastri", isSpanish: false, aliases: ["piastri", "oscar", "pia", "81"] },
  { id: "russell", name: "George Russell", isSpanish: false, aliases: ["russell", "george", "rus", "63"] },
  { id: "hamilton", name: "Lewis Hamilton", isSpanish: false, aliases: ["hamilton", "lewis", "ham", "44"] },
  { id: "antonelli", name: "Andrea Kimi Antonelli", isSpanish: false, aliases: ["antonelli", "kimi", "ant", "12"] },
  { id: "gasly", name: "Pierre Gasly", isSpanish: false, aliases: ["gasly", "pierre", "gas", "10"] },
  { id: "ocon", name: "Esteban Ocon", isSpanish: false, aliases: ["ocon", "esteban", "oco", "31"] },
  { id: "albon", name: "Alexander Albon", isSpanish: false, aliases: ["albon", "alex", "alb", "23"] },
  { id: "colapinto", name: "Franco Colapinto", isSpanish: false, aliases: ["colapinto", "franco", "col", "43"] },
  { id: "bearman", name: "Oliver Bearman", isSpanish: false, aliases: ["bearman", "ollie", "bea", "87"] },
  { id: "lawson", name: "Liam Lawson", isSpanish: false, aliases: ["lawson", "liam", "law", "30"] },
  { id: "tsunoda", name: "Yuki Tsunoda", isSpanish: false, aliases: ["tsunoda", "yuki", "tsu", "22"] },
  { id: "hulkenberg", name: "Nico Hülkenberg", isSpanish: false, aliases: ["hulkenberg", "hulk", "nico", "hul", "27"] },
  { id: "bortoleto", name: "Gabriel Bortoleto", isSpanish: false, aliases: ["bortoleto", "gabriel", "bor", "5"] },
  { id: "hadjar", name: "Isack Hadjar", isSpanish: false, aliases: ["hadjar", "isack", "had", "6"] },
  { id: "lindblad", name: "Arvid Lindblad", isSpanish: false, aliases: ["lindblad", "arvid", "lin", "41"] },
  { id: "perez", name: "Sergio Pérez", isSpanish: false, aliases: ["perez", "checo", "per", "11"] },
  { id: "stroll", name: "Lance Stroll", isSpanish: false, aliases: ["stroll", "lance", "str", "18"] },
  { id: "bottas", name: "Valtteri Bottas", isSpanish: false, aliases: ["bottas", "valtteri", "bot", "77"] },
  { id: "doohan", name: "Jack Doohan", isSpanish: false, aliases: ["doohan", "jack", "doo"] },
];

function normalizeWord(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function findDriver(word: string): F1DriverDef | null {
  const clean = normalizeWord(word);
  if (!clean) return null;

  for (const driver of KNOWN_DRIVERS) {
    if (driver.id === clean) return driver;
    if (driver.aliases.some((a) => normalizeWord(a) === clean)) return driver;
    const normName = normalizeWord(driver.name);
    if (normName.includes(clean) || clean.includes(normName)) return driver;
  }
  return null;
}

export const BLACKJACK_RULES_MESSAGE = `🏎️ *F1 BLACKJACK 21* 🃏🇪🇸\n` +
  `━━━━━━━━━━━━━━━━━━━━━\n` +
  `🎯 *Objetivo:* Elegir 2 pilotos cuyas posiciones finales el domingo sumen *21* (o lo más cercano por debajo sin pasarse).\n\n` +
  `📋 *CÓMO JUGAR (Antes de la Q1):*\n` +
  `Envía tu mano con este formato:\n` +
  `👉 *!21 [español] [socio] [PuestoEspañol]*\n\n` +
  `*Ejemplos válidos:*\n` +
  `🔹 *!21 alonso norris P9* (o *!21 alonso norris 9*)\n` +
  `🔹 *!21 sainz colapinto P7*\n\n` +
  `📌 *Reglas de tu mano:*\n` +
  `1️⃣ *Español obligatorio:* Alonso o Sainz.\n` +
  `2️⃣ *Socio extranjero:* Cualquier piloto del resto de la parrilla.\n` +
  `3️⃣ *Desempate:* En qué puesto (P1 a P22) crees que termina tu piloto español.\n` +
  `⚠️ _(Prohibido copiar la pareja exacta de otro amigo del grupo)_.\n\n` +
  `🔄 *La jugada del sábado (Post-Qualy):*\n` +
  `Tras la clasificación y hasta 1h antes de la carrera, puedes cambiar a tu socio extranjero con *!21 cambiar [piloto]*, asumiendo una penalización de *+1* posición a tu suma final.\n\n` +
  `📊 *Otros comandos:*\n` +
  `🔹 *!21 manos* : Ver las cartas de todos en el grupo\n` +
  `🔹 *!21 resultados* : Calcular el podio del Blackjack tras la carrera`;

export async function handleBlackjackCommand(
  groupJid: string,
  userJid: string,
  userName: string,
  commandText: string
): Promise<string> {
  const parts = commandText.trim().split(/\s+/);
  const subCommand = parts[1]?.toLowerCase();

  // 1. Ayuda / Explicación
  if (!subCommand || subCommand === "ayuda" || subCommand === "help" || subCommand === "reglas") {
    return BLACKJACK_RULES_MESSAGE;
  }

  // 2. Ver manos del grupo
  if (subCommand === "manos" || subCommand === "mesa" || subCommand === "apuestas") {
    return showGroupHands(groupJid);
  }

  // 3. Resultados
  if (subCommand === "resultados" || subCommand === "resultado" || subCommand === "ganador") {
    return calculateBlackjackResults(groupJid);
  }

  // 4. Cambiar socio (Jugada del sábado)
  if (subCommand === "cambiar" || subCommand === "cambio" || subCommand === "swap") {
    const newPartnerInput = parts.slice(2).join(" ");
    return swapPartner(groupJid, userJid, userName, newPartnerInput);
  }

  // 5. Registro de apuesta inicial: !21 [español] [socio] [P#]
  const betArgs = parts.slice(1);
  return registerInitialBet(groupJid, userJid, userName, betArgs);
}

async function registerInitialBet(
  groupJid: string,
  userJid: string,
  userName: string,
  args: string[]
): Promise<string> {
  if (args.length < 3) {
    return `❓ Formato incompleto.\n\nUsa: *!21 [español] [socio] [PuestoEspañol]*\nEjemplo: *!21 alonso norris P9*`;
  }

  // Consultar próximo GP
  const nextRes = await axios.get(`${JOLPICA_BASE}/current/next.json`, { timeout: 8000 });
  const race = nextRes.data.MRData?.RaceTable?.Races?.[0];
  if (!race) {
    return "⚠️ No hay información de la próxima carrera disponible en este momento.";
  }

  const season = parseInt(race.season, 10);
  const round = parseInt(race.round, 10);

  // Verificar límite de tiempo: Debe ser ANTES de la Q1 (Qualifying)
  const now = new Date();
  if (race.Qualifying?.date) {
    const qualyTime = race.Qualifying.time || "14:00:00Z";
    const qualyDate = new Date(`${race.Qualifying.date}T${qualyTime}`);
    if (now >= qualyDate) {
      return `🔒 *¡APUESTAS CERRADAS!* La Clasificación (Q1) ya ha comenzado. Solo se permitirá el cambio de socio tras la Qualy con *!21 cambiar [socio]*.`;
    }
  }

  // Parsear argumentos: buscar 1 español, 1 extranjero, y 1 número (desempate)
  let spanishDriver: F1DriverDef | null = null;
  let partnerDriver: F1DriverDef | null = null;
  let tieBreaker: number | null = null;

  for (const arg of args) {
    // Check if it's a tie breaker like "P9" or "9"
    const numMatch = arg.match(/^[pP]?([0-9]{1,2})$/);
    if (numMatch && tieBreaker === null) {
      const val = parseInt(numMatch[1], 10);
      if (val >= 1 && val <= 22) {
        tieBreaker = val;
        continue;
      }
    }

    const driver = findDriver(arg);
    if (driver) {
      if (driver.isSpanish && !spanishDriver) {
        spanishDriver = driver;
      } else if (!driver.isSpanish && !partnerDriver) {
        partnerDriver = driver;
      }
    }
  }

  if (!spanishDriver) {
    return `⚠️ *Falta tu piloto español obligatorio*.\nDebes elegir a *Alonso* o a *Sainz*.\nEj: *!21 alonso norris P9*`;
  }

  if (!partnerDriver) {
    return `⚠️ *Falta tu socio extranjero*.\nElige un piloto del resto de la parrilla (ej. Norris, Verstappen, Leclerc, Colapinto...).\nEj: *!21 ${spanishDriver.aliases[0]} norris P9*`;
  }

  if (tieBreaker === null) {
    return `⚠️ *Falta la posición de desempate*.\nIndica en qué puesto crees que terminará ${spanishDriver.name} (ej. P9 o 9).\nEj: *!21 ${spanishDriver.aliases[0]} ${partnerDriver.aliases[0]} P9*`;
  }

  // Verificar regla anti-copia: Nadie en el grupo puede tener la misma pareja exacta
  const existingPair = await prisma.blackjackBet.findFirst({
    where: {
      groupJid,
      season,
      round,
      spanishDriver: spanishDriver.id,
      partnerDriver: partnerDriver.id,
      NOT: { userJid },
    },
  });

  if (existingPair) {
    return `🚫 *¡Combinación repetida!*\n` +
      `La pareja *${spanishDriver.name} + ${partnerDriver.name}* ya la tiene registrada *${existingPair.userName}*.\n` +
      `Elige otro socio extranjero para tu mano.`;
  }

  // Guardar / Actualizar apuesta del usuario
  await prisma.blackjackBet.upsert({
    where: {
      groupJid_season_round_userJid: {
        groupJid,
        season,
        round,
        userJid,
      },
    },
    update: {
      userName,
      spanishDriver: spanishDriver.id,
      partnerDriver: partnerDriver.id,
      partnerDriverName: partnerDriver.name,
      spanishTieBreaker: tieBreaker,
      changedPartner: false,
      originalPartner: null,
      updatedAt: new Date(),
    },
    create: {
      groupJid,
      userJid,
      userName,
      season,
      round,
      spanishDriver: spanishDriver.id,
      partnerDriver: partnerDriver.id,
      partnerDriverName: partnerDriver.name,
      spanishTieBreaker: tieBreaker,
    },
  });

  let msg = `🃏 *¡MANO REGISTRADA EN EL BLACKJACK F1!* 🃏\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `👤 *Jugador:* ${userName}\n`;
  msg += `🏆 *Gran Premio:* ${race.raceName}\n`;
  msg += `🇪🇸 *Carta Española:* ${spanishDriver.name}\n`;
  msg += `🌍 *Carta Socio:* ${partnerDriver.name}\n`;
  msg += `⏱️ *Desempate:* ${spanishDriver.name} en P${tieBreaker}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🎯 *Objetivo:* Que la suma de sus posiciones el domingo dé *21* (o lo más cercano por debajo).\n`;
  msg += `🔄 *Jugada del Sábado:* Tras la Qualy podrás cambiar a tu socio extranjero si lo deseas (+1 penalización).`;

  return msg;
}

async function swapPartner(
  groupJid: string,
  userJid: string,
  userName: string,
  newPartnerInput: string
): Promise<string> {
  const nextRes = await axios.get(`${JOLPICA_BASE}/current/next.json`, { timeout: 8000 });
  const race = nextRes.data.MRData?.RaceTable?.Races?.[0];
  if (!race) return "⚠️ Error al consultar el próximo Gran Premio.";

  const season = parseInt(race.season, 10);
  const round = parseInt(race.round, 10);
  const now = new Date();

  // Buscar apuesta existente del usuario
  const bet = await prisma.blackjackBet.findUnique({
    where: {
      groupJid_season_round_userJid: {
        groupJid,
        season,
        round,
        userJid,
      },
    },
  });

  if (!bet) {
    return `⚠️ No tienes ninguna mano registrada para el ${race.raceName}. Primero debes enviar tu mano antes de la Q1 con *!21 [español] [socio] [Puesto]*.`;
  }

  if (bet.changedPartner) {
    return `⚠️ Ya utilizaste tu único cambio permitido para este Gran Premio (${bet.originalPartner} ➔ ${bet.partnerDriverName}).`;
  }

  // Verificar plazos temporales:
  // 1. Debe ser DESPUÉS de comenzar la Qualy
  if (race.Qualifying?.date) {
    const qualyTime = race.Qualifying.time || "14:00:00Z";
    const qualyDate = new Date(`${race.Qualifying.date}T${qualyTime}`);
    if (now < qualyDate) {
      return `⏳ *El cambio de carta solo se activa tras la Clasificación del sábado*.\nAntes de la Qualy puedes cambiar tu mano completa volviendo a enviar *!21 [español] [socio] [Puesto]*.`;
    }
  }

  // 2. Debe ser al menos 1 HORA ANTES de la Carrera
  if (race.date) {
    const raceTime = race.time || "14:00:00Z";
    const raceDate = new Date(`${race.date}T${raceTime}`);
    const deadline = new Date(raceDate.getTime() - 60 * 60 * 1000);
    if (now > deadline) {
      return `🔒 *¡Plazo cerrado!* El cambio de carta solo se permitía hasta 1 hora antes del inicio de la carrera.`;
    }
  }

  // Validar nuevo socio
  const newDriver = findDriver(newPartnerInput);
  if (!newDriver) {
    return `❓ Piloto no reconocido: "${newPartnerInput}".\nIndica el apellido del nuevo piloto extranjero (ej: *!21 cambiar colapinto*).`;
  }

  if (newDriver.isSpanish) {
    return `⚠️ No puedes cambiar tu socio extranjero por un piloto español. Tu español sigue siendo *${bet.spanishDriver === "alonso" ? "Fernando Alonso" : "Carlos Sainz"}*.`;
  }

  if (newDriver.id === bet.partnerDriver) {
    return `⚠️ Ya tienes a ${newDriver.name} como tu socio actual.`;
  }

  // Verificar regla anti-copia con el nuevo socio
  const existingPair = await prisma.blackjackBet.findFirst({
    where: {
      groupJid,
      season,
      round,
      spanishDriver: bet.spanishDriver,
      partnerDriver: newDriver.id,
      NOT: { userJid },
    },
  });

  if (existingPair) {
    return `🚫 La pareja *${bet.spanishDriver === "alonso" ? "Alonso" : "Sainz"} + ${newDriver.name}* ya la tiene *${existingPair.userName}*. Elige otro piloto.`;
  }

  // Aplicar cambio
  await prisma.blackjackBet.update({
    where: { id: bet.id },
    data: {
      changedPartner: true,
      originalPartner: bet.partnerDriverName,
      partnerDriver: newDriver.id,
      partnerDriverName: newDriver.name,
      updatedAt: new Date(),
    },
  });

  let msg = `🔄 *¡CAMBIO DE CARTA APLICADO!* 🃏\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `👤 *Jugador:* ${userName}\n`;
  msg += `❌ *Sale:* ${bet.partnerDriverName}\n`;
  msg += `✅ *Entra:* ${newDriver.name}\n`;
  msg += `⚠️ *Penalización:* +1 posición añadida a tu suma final del domingo.\n`;
  msg += `🃏 *Tu mano final:* ${bet.spanishDriver === "alonso" ? "Alonso" : "Sainz"} + ${newDriver.name} (+1)`;

  return msg;
}

async function showGroupHands(groupJid: string): Promise<string> {
  const nextRes = await axios.get(`${JOLPICA_BASE}/current/next.json`, { timeout: 8000 });
  const race = nextRes.data.MRData?.RaceTable?.Races?.[0];
  if (!race) return "⚠️ No hay información de la próxima carrera.";

  const season = parseInt(race.season, 10);
  const round = parseInt(race.round, 10);

  const bets = await prisma.blackjackBet.findMany({
    where: { groupJid, season, round },
    orderBy: { createdAt: "asc" },
  });

  if (bets.length === 0) {
    return `🃏 *F1 BLACKJACK 21* - ${race.raceName}\n\n` +
      `No hay ninguna mano registrada en este grupo todavía.\n` +
      `Sé el primero en jugar enviando:\n` +
      `👉 *!21 [español] [socio] [Puesto]* (ej: *!21 alonso norris P9*)`;
  }

  let msg = `🃏 *MANOS JUGADAS: F1 BLACKJACK 21* 🏁\n`;
  msg += `🏆 *${race.raceName}* (Total: ${bets.length} jugadores)\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

  bets.forEach((bet, idx) => {
    const spanishName = bet.spanishDriver === "alonso" ? "Alonso" : "Sainz";
    const changeTag = bet.changedPartner ? " 🔄 *(+1 cambio)*" : "";
    msg += `${idx + 1}. *${bet.userName}*\n`;
    msg += `   Cartas: ${spanishName} + ${bet.partnerDriverName}${changeTag}\n`;
    msg += `   ⏱️ Desempate: ${spanishName} P${bet.spanishTieBreaker}\n\n`;
  });

  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🎯 _Gana quien sume 21 (o lo más cercano por debajo sin pasarse)._`;
  return msg;
}

export async function calculateBlackjackResults(groupJid: string): Promise<string> {
  const lastRes = await axios.get(`${JOLPICA_BASE}/current/last/results.json`, { timeout: 10000 });
  const race = lastRes.data.MRData?.RaceTable?.Races?.[0];

  if (!race || !race.Results?.length) {
    return "🏁 No hay resultados oficiales recientes de carrera disponibles para calcular el Blackjack.";
  }

  const season = parseInt(race.season, 10);
  const round = parseInt(race.round, 10);

  const bets = await prisma.blackjackBet.findMany({
    where: { groupJid, season, round },
  });

  if (bets.length === 0) {
    return `🃏 No hay manos registradas en este grupo para el *${race.raceName}*.`;
  }

  const results: any[] = race.Results;

  // Helper para buscar posición oficial de un piloto
  function getDriverPosition(driverIdOrKey: string): { pos: number; name: string } {
    const found = results.find((r) => {
      const d = r.Driver;
      if (d.driverId === driverIdOrKey) return true;
      const parsed = findDriver(d.familyName) || findDriver(d.driverId);
      return parsed && parsed.id === driverIdOrKey;
    });

    if (found) {
      return {
        pos: parseInt(found.position, 10),
        name: `${found.Driver.givenName} ${found.Driver.familyName}`,
      };
    }
    // Si no aparece o no largó (DNS), cuenta como 22
    return { pos: 22, name: driverIdOrKey };
  }

  // Evaluar cada mano
  const evaluatedPlayers = bets.map((bet) => {
    const spanish = getDriverPosition(bet.spanishDriver);
    const partner = getDriverPosition(bet.partnerDriver);
    const penalty = bet.changedPartner ? 1 : 0;
    const total = spanish.pos + partner.pos + penalty;

    const tieBreakerError = Math.abs(spanish.pos - bet.spanishTieBreaker);
    const isBlackjack = total === 21;
    const isBust = total > 21;
    const distanceTo21 = Math.abs(21 - total);

    return {
      bet,
      spanishPos: spanish.pos,
      partnerPos: partner.pos,
      partnerName: partner.name,
      penalty,
      total,
      isBlackjack,
      isBust,
      distanceTo21,
      tieBreakerError,
    };
  });

  // Separar en Válidos (<= 21) y Pasados / Bust (> 21)
  const validPlayers = evaluatedPlayers.filter((p) => !p.isBust);
  const bustPlayers = evaluatedPlayers.filter((p) => p.isBust);

  let finalRanking: typeof evaluatedPlayers = [];

  if (validPlayers.length > 0) {
    // Ordenar válidos:
    // 1º Más cercano a 21 por debajo (21 gana a 20, 20 gana a 19...)
    // 2º Menor error en desempate del español
    // 3º Quien envió antes su apuesta (createdAt)
    validPlayers.sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      if (a.tieBreakerError !== b.tieBreakerError) return a.tieBreakerError - b.tieBreakerError;
      return a.bet.createdAt.getTime() - b.bet.createdAt.getTime();
    });

    // Ordenar los eliminados (Bust) por quien se pasó por menos
    bustPlayers.sort((a, b) => {
      if (a.total !== b.total) return a.total - b.total;
      if (a.tieBreakerError !== b.tieBreakerError) return a.tieBreakerError - b.tieBreakerError;
      return a.bet.createdAt.getTime() - b.bet.createdAt.getTime();
    });

    finalRanking = [...validPlayers, ...bustPlayers];
  } else {
    // Si TODOS se pasaron de 21: gana el que se haya pasado por menos (22 gana a 23)
    bustPlayers.sort((a, b) => {
      if (a.total !== b.total) return a.total - b.total;
      if (a.tieBreakerError !== b.tieBreakerError) return a.tieBreakerError - b.tieBreakerError;
      return a.bet.createdAt.getTime() - b.bet.createdAt.getTime();
    });
    finalRanking = bustPlayers;
  }

  const winner = finalRanking[0];

  let msg = `🃏🏁 *RESULTADOS: F1 BLACKJACK 21* 🏁🃏\n`;
  msg += `🏆 *${race.raceName}*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (winner.isBlackjack) {
    msg += `🎉💥 *¡¡TENEMOS UN BLACKJACK EXACTO DE 21!!* 💥🎉\n`;
  } else if (!winner.isBust) {
    msg += `🏆 *¡GANADOR DEL BLACKJACK!* (Suma: ${winner.total})\n`;
  } else {
    msg += `⚠️ *¡TODOS SE HAN PASADO!* Gana el que se pasó por menos.\n`;
  }

  msg += `👑 *1º PUESTO:* *${winner.bet.userName}*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  msg += `📊 *CLASIFICACIÓN DE LA MESA:*\n`;
  const medals = ["🥇", "🥈", "🥉"];

  finalRanking.forEach((p, idx) => {
    const icon = medals[idx] || `${idx + 1}º`;
    const spanishLabel = p.bet.spanishDriver === "alonso" ? "Alonso" : "Sainz";
    const changeStr = p.penalty > 0 ? ` + 1 cambio` : "";

    let statusHeader = "";
    if (p.isBlackjack) {
      statusHeader = `🃏 *¡BLACKJACK! (21)*`;
    } else if (p.isBust) {
      statusHeader = `💥 *BUST (${p.total})* _(Se pasó por +${p.total - 21})_`;
    } else {
      statusHeader = `✨ *Suma: ${p.total}* _(A ${21 - p.total} del 21)_`;
    }

    msg += `${icon} *${p.bet.userName}* ➔ ${statusHeader}\n`;
    msg += `   Cartas: ${spanishLabel} (P${p.spanishPos}) + ${p.partnerName} (P${p.partnerPos})${changeStr} = *${p.total}*\n`;
    msg += `   ⏱️ Desempate: Predijo P${p.bet.spanishTieBreaker} (Diferencia: ${p.tieBreakerError} puestos)\n\n`;
  });

  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `💡 _¡Gracias por jugar al F1 Blackjack 21! En el próximo GP abriremos mesa de nuevo._`;

  return msg;
}
