export interface F1DriverDef {
  id: string;
  name: string;
  isSpanish: boolean;
  aliases: string[];
}

export const KNOWN_DRIVERS: F1DriverDef[] = [
  // Pilotos españoles
  { id: "alonso", name: "Fernando Alonso", isSpanish: true, aliases: ["alonso", "fernando", "alo", "14", "magic"] },
  { id: "sainz", name: "Carlos Sainz", isSpanish: true, aliases: ["sainz", "carlos", "sai", "55", "chili"] },

  // Resto de la parrilla 2026
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

export function normalizeWord(str: string): string {
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

export function parsePosOrDNF(w: string): number | null {
  const clean = w.toLowerCase().trim();
  if (clean === "dnf" || clean === "ret" || clean === "out" || clean === "abandono") {
    return 0; // 0 representa DNF (Abandono)
  }
  const m = clean.match(/^[pP]?([0-9]{1,2})$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 1 && n <= 22 ? n : null;
}

export function formatPos(pos: number): string {
  return pos === 0 ? "DNF (Abandono)" : `P${pos}`;
}
