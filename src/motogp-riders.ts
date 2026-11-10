export interface MotoGPRiderDef {
  id: string;
  name: string;
  number: number;
  isSpanish: boolean;
  aliases: string[];
}

export const KNOWN_RIDERS: MotoGPRiderDef[] = [
  // Pilotos españoles
  { id: "marquez", name: "Marc Márquez", number: 93, isSpanish: true, aliases: ["marquez", "marc", "93", "mm93"] },
  { id: "martin", name: "Jorge Martín", number: 89, isSpanish: true, aliases: ["martin", "jorge", "89", "martinator", "jm89"] },
  { id: "acosta", name: "Pedro Acosta", number: 37, isSpanish: true, aliases: ["acosta", "pedro", "37", "tiburon"] },
  { id: "alex_marquez", name: "Álex Márquez", number: 73, isSpanish: true, aliases: ["alex marquez", "amarquez", "alex", "73"] },
  { id: "vinales", name: "Maverick Viñales", number: 12, isSpanish: true, aliases: ["vinales", "viñales", "maverick", "12", "topgun"] },
  { id: "aldeguer", name: "Fermín Aldeguer", number: 54, isSpanish: true, aliases: ["aldeguer", "fermin", "54"] },
  { id: "raul_fernandez", name: "Raúl Fernández", number: 25, isSpanish: true, aliases: ["raul", "raul fernandez", "25"] },
  { id: "mir", name: "Joan Mir", number: 36, isSpanish: true, aliases: ["mir", "joan", "36"] },
  { id: "rins", name: "Álex Rins", number: 42, isSpanish: true, aliases: ["rins", "alex rins", "42"] },
  { id: "augusto_fernandez", name: "Augusto Fernández", number: 47, isSpanish: true, aliases: ["augusto", "augusto fernandez", "47"] },
  { id: "pol_espargaro", name: "Pol Espargaró", number: 44, isSpanish: true, aliases: ["pol", "pol espargaro", "44"] },
  { id: "aleix_espargaro", name: "Aleix Espargaró", number: 41, isSpanish: true, aliases: ["aleix", "aleix espargaro", "41"] },

  // Resto de la parrilla
  { id: "bagnaia", name: "Francesco Bagnaia", number: 63, isSpanish: false, aliases: ["bagnaia", "pecco", "63"] },
  { id: "bezzecchi", name: "Marco Bezzecchi", number: 72, isSpanish: false, aliases: ["bezzecchi", "bez", "72"] },
  { id: "bastianini", name: "Enea Bastianini", number: 23, isSpanish: false, aliases: ["bastianini", "bestia", "23"] },
  { id: "quartararo", name: "Fabio Quartararo", number: 20, isSpanish: false, aliases: ["quartararo", "fabio", "20", "eldiablo"] },
  { id: "binder", name: "Brad Binder", number: 33, isSpanish: false, aliases: ["binder", "brad", "33"] },
  { id: "diggia", name: "Fabio Di Giannantonio", number: 49, isSpanish: false, aliases: ["diggia", "di giannantonio", "giannantonio", "49"] },
  { id: "morbidelli", name: "Franco Morbidelli", number: 21, isSpanish: false, aliases: ["morbidelli", "franco", "21"] },
  { id: "ogura", name: "Ai Ogura", number: 79, isSpanish: false, aliases: ["ogura", "ai", "79"] },
  { id: "zarco", name: "Johann Zarco", number: 5, isSpanish: false, aliases: ["zarco", "johann", "5"] },
  { id: "marini", name: "Luca Marini", number: 10, isSpanish: false, aliases: ["marini", "luca", "10"] },
  { id: "miller", name: "Jack Miller", number: 43, isSpanish: false, aliases: ["miller", "jack", "43"] },
  { id: "moreira", name: "Diogo Moreira", number: 11, isSpanish: false, aliases: ["moreira", "diogo", "11"] },
  { id: "chantra", name: "Somkiat Chantra", number: 15, isSpanish: false, aliases: ["chantra", "somkiat", "15"] },
  { id: "oliveira", name: "Miguel Oliveira", number: 88, isSpanish: false, aliases: ["oliveira", "miguel", "88"] },
  { id: "nakagami", name: "Takaaki Nakagami", number: 30, isSpanish: false, aliases: ["nakagami", "taka", "30"] },
  { id: "toprak", name: "Toprak Razgatlioğlu", number: 7, isSpanish: false, aliases: ["toprak", "razgatlioglu", "7"] },
];

export function normalizeWord(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const STOPWORDS = new Set([
  "y", "e", "o", "u", "de", "del", "la", "el", "los", "las", "con", "sin",
  "por", "para", "en", "a", "al", "mi", "tu", "su", "es", "son", "un", "una",
  "dnf", "abandono", "ret", "out", "caida", "porra", "f1", "moto", "motogp",
]);

/**
 * Convierte nombres compuestos ("alex marquez", "raul fernandez", "di giannantonio", etc.)
 * en su identificador único antes de separar los tokens por espacios.
 */
export function collapseCompoundRiderNames(text: string): string {
  let result = text;
  const allPhrases: Array<{ phrase: string; id: string }> = [];

  for (const r of KNOWN_RIDERS) {
    allPhrases.push({ phrase: r.name, id: r.id });
    for (const alias of r.aliases) {
      if (alias.includes(" ")) {
        allPhrases.push({ phrase: alias, id: r.id });
      }
    }
  }

  allPhrases.push(
    { phrase: "pecco bagnaia", id: "bagnaia" },
    { phrase: "marc marquez", id: "marquez" },
    { phrase: "alex marquez", id: "alex_marquez" },
    { phrase: "raul fernandez", id: "raul_fernandez" },
    { phrase: "augusto fernandez", id: "augusto_fernandez" },
    { phrase: "pol espargaro", id: "pol_espargaro" },
    { phrase: "aleix espargaro", id: "aleix_espargaro" },
    { phrase: "di giannantonio", id: "diggia" },
    { phrase: "fabio di giannantonio", id: "diggia" }
  );

  allPhrases.sort((a, b) => b.phrase.length - a.phrase.length);

  for (const { phrase, id } of allPhrases) {
    const pattern = phrase
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/\s+/)
      .map((w) =>
        w
          .replace(/a/gi, "[aáàäâ]")
          .replace(/e/gi, "[eéèëê]")
          .replace(/i/gi, "[iíìïî]")
          .replace(/o/gi, "[oóòöô]")
          .replace(/u/gi, "[uúùüû]")
          .replace(/n/gi, "[nñ]")
          .replace(/g/gi, "[gğ]")
      )
      .join("\\s+");
    const regex = new RegExp(`\\b${pattern}\\b`, "gi");
    result = result.replace(regex, id);
  }

  return result;
}

export function findRider(word: string): MotoGPRiderDef | null {
  const clean = normalizeWord(word);
  if (!clean || STOPWORDS.has(clean)) return null;

  // 1. Coincidencia exacta por ID, dorsal o alias
  for (const rider of KNOWN_RIDERS) {
    if (normalizeWord(rider.id) === clean) return rider;
    if (String(rider.number) === clean) return rider;
    if (rider.aliases.some((a) => normalizeWord(a) === clean)) return rider;
  }

  // 2. Coincidencia parcial solo para tokens de al menos 3 caracteres
  if (clean.length < 3) return null;

  for (const rider of KNOWN_RIDERS) {
    const normName = normalizeWord(rider.name);
    if (normName.includes(clean) || clean.includes(normName)) return rider;
  }
  return null;
}

