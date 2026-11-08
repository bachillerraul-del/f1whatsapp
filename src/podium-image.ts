import { Resvg } from "@resvg/resvg-js";

export interface PodiumParticipant {
  name: string;
  points: number;
}

export interface PodiumImageData {
  raceName: string;
  season: number;
  podium: PodiumParticipant[];
  sport?: "f1" | "motogp";
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case '"': return "&quot;";
      default: return c;
    }
  });
}

function truncate(text: string, maxLen = 14): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

export function generatePodiumImage(data: PodiumImageData): Buffer | null {
  try {
    const p1 = data.podium[0];
    const p2 = data.podium[1];
    const p3 = data.podium[2];

    const title = escapeXml(data.raceName.toUpperCase());
    const seasonText = `TEMPORADA ${data.season}`;

    const p1Name = p1 ? escapeXml(truncate(p1.name)) : "—";
    const p1Pts = p1 ? `${p1.points} PTS` : "0 PTS";

    const p2Name = p2 ? escapeXml(truncate(p2.name)) : "—";
    const p2Pts = p2 ? `${p2.points} PTS` : "0 PTS";

    const p3Name = p3 ? escapeXml(truncate(p3.name)) : "—";
    const p3Pts = p3 ? `${p3.points} PTS` : "0 PTS";

    const sportLabel = data.sport === "motogp" ? "LA PORRA DE MOTOGP" : "LA PORRA DE F1";
    const accentColor = data.sport === "motogp" ? "#0284c7" : "#e10600";

    const svg = `
<svg width="1000" height="650" viewBox="0 0 1000 650" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b0f19"/>
      <stop offset="50%" stop-color="#111827"/>
      <stop offset="100%" stop-color="#1e1b4b"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fef08a"/>
      <stop offset="50%" stop-color="#eab308"/>
      <stop offset="100%" stop-color="#ca8a04"/>
    </linearGradient>
    <linearGradient id="silver" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="50%" stop-color="#cbd5e1"/>
      <stop offset="100%" stop-color="#64748b"/>
    </linearGradient>
    <linearGradient id="bronze" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fed7aa"/>
      <stop offset="50%" stop-color="#f97316"/>
      <stop offset="100%" stop-color="#c2410c"/>
    </linearGradient>
    <linearGradient id="p1card" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1f2937"/>
      <stop offset="100%" stop-color="#111827"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1000" height="650" fill="url(#bg)"/>

  <!-- Top Accent Bar -->
  <rect x="0" y="0" width="1000" height="8" fill="${accentColor}"/>

  <!-- Category Badge -->
  <rect x="390" y="30" width="220" height="32" rx="16" fill="${accentColor}"/>
  <text x="500" y="52" fill="#ffffff" font-size="14" font-family="Arial, Helvetica, sans-serif" font-weight="900" text-anchor="middle" letter-spacing="3">PODIO OFICIAL</text>

  <!-- Title & Subtitle -->
  <text x="500" y="105" fill="#ffffff" font-size="30" font-family="Arial, Helvetica, sans-serif" font-weight="bold" text-anchor="middle">${title}</text>
  <text x="500" y="135" fill="#94a3b8" font-size="16" font-family="Arial, Helvetica, sans-serif" text-anchor="middle" letter-spacing="1">${sportLabel} • ${seasonText}</text>

  <!-- ================= 2ND PLACE (SILVER) ================= -->
  <g opacity="${p2 ? '1' : '0.4'}">
    <rect x="150" y="320" width="210" height="210" rx="16" fill="#1e293b" stroke="#64748b" stroke-width="2"/>
    <rect x="150" y="520" width="210" height="10" fill="url(#silver)"/>
    <circle cx="255" cy="290" r="32" fill="url(#silver)" stroke="#475569" stroke-width="2"/>
    <text x="255" y="300" fill="#0f172a" font-size="24" font-family="Arial, Helvetica, sans-serif" font-weight="900" text-anchor="middle">2º</text>
    <text x="255" y="380" fill="#ffffff" font-size="22" font-family="Arial, Helvetica, sans-serif" font-weight="bold" text-anchor="middle">${p2Name}</text>
    <rect x="195" y="420" width="120" height="38" rx="19" fill="#334155"/>
    <text x="255" y="445" fill="#38bdf8" font-size="18" font-family="Arial, Helvetica, sans-serif" font-weight="bold" text-anchor="middle">${p2Pts}</text>
  </g>

  <!-- ================= 1ST PLACE (GOLD) ================= -->
  <g opacity="${p1 ? '1' : '0.4'}">
    <rect x="395" y="240" width="210" height="290" rx="18" fill="url(#p1card)" stroke="#eab308" stroke-width="3"/>
    <rect x="395" y="520" width="210" height="10" fill="url(#gold)"/>
    <circle cx="500" cy="205" r="38" fill="url(#gold)" stroke="#ca8a04" stroke-width="2"/>
    <text x="500" y="217" fill="#0f172a" font-size="30" font-family="Arial, Helvetica, sans-serif" font-weight="900" text-anchor="middle">1º</text>
    <text x="500" y="160" fill="#fbbf24" font-size="20" font-family="Arial, Helvetica, sans-serif" font-weight="bold" text-anchor="middle" letter-spacing="2">★ GANADOR ★</text>
    <text x="500" y="315" fill="#ffffff" font-size="24" font-family="Arial, Helvetica, sans-serif" font-weight="bold" text-anchor="middle">${p1Name}</text>
    <rect x="430" y="360" width="140" height="44" rx="22" fill="#e10600"/>
    <text x="500" y="388" fill="#ffffff" font-size="20" font-family="Arial, Helvetica, sans-serif" font-weight="bold" text-anchor="middle">${p1Pts}</text>
  </g>

  <!-- ================= 3RD PLACE (BRONZE) ================= -->
  <g opacity="${p3 ? '1' : '0.4'}">
    <rect x="640" y="370" width="210" height="160" rx="16" fill="#1e293b" stroke="#9a3412" stroke-width="2"/>
    <rect x="640" y="520" width="210" height="10" fill="url(#bronze)"/>
    <circle cx="745" cy="340" r="30" fill="url(#bronze)" stroke="#7c2d12" stroke-width="2"/>
    <text x="745" y="350" fill="#0f172a" font-size="22" font-family="Arial, Helvetica, sans-serif" font-weight="900" text-anchor="middle">3º</text>
    <text x="745" y="425" fill="#ffffff" font-size="22" font-family="Arial, Helvetica, sans-serif" font-weight="bold" text-anchor="middle">${p3Name}</text>
    <rect x="685" y="460" width="120" height="38" rx="19" fill="#334155"/>
    <text x="745" y="485" fill="#fb923c" font-size="18" font-family="Arial, Helvetica, sans-serif" font-weight="bold" text-anchor="middle">${p3Pts}</text>
  </g>

  <!-- Footer Watermark -->
  <text x="500" y="595" fill="#475569" font-size="14" font-family="Arial, Helvetica, sans-serif" text-anchor="middle">🏁 Motorsport WhatsApp Bot • Clasificación Oficial de la Porra</text>
</svg>
    `;

    const resvg = new Resvg(svg, {
      font: {
        loadSystemFonts: true,
        defaultFontFamily: "Arial",
      },
    });
    const pngData = resvg.render();
    return pngData.asPng();
  } catch (err: any) {
    console.error("Error generating podium image:", err?.message);
    return null;
  }
}
