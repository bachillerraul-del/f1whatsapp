import fs from "fs";
import path from "path";
import { prisma } from "./db.js";

const AUTH_DIR = path.resolve("auth_info_baileys");
const contentCache = new Map<string, string>();
let pushTimeout: NodeJS.Timeout | null = null;
let isPushing = false;

export async function pullSessionFromDb() {
  try {
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    const files = await prisma.sessionFile.findMany();
    if (files.length === 0) {
      console.log("ℹ️ No hay sesión guardada en la base de datos.");
      return;
    }

    console.log(`📥 Restaurando ${files.length} archivos de sesión desde Supabase...`);
    for (const file of files) {
      const filePath = path.join(AUTH_DIR, file.id);
      fs.writeFileSync(filePath, file.content, "utf8");
      contentCache.set(file.id, file.content);
    }
    console.log("✅ Sesión de WhatsApp restaurada exitosamente desde la nube.");
  } catch (err: any) {
    console.error("⚠️ Error restaurando sesión desde la base de datos:", err?.message);
  }
}

export function schedulePushSessionToDb(delayMs = 2500) {
  if (pushTimeout) clearTimeout(pushTimeout);
  pushTimeout = setTimeout(async () => {
    if (isPushing) return;
    isPushing = true;
    try {
      await pushSessionToDb();
    } finally {
      isPushing = false;
    }
  }, delayMs);
}

export function clearSessionCache() {
  contentCache.clear();
}

export async function pushSessionToDb() {
  try {
    if (!fs.existsSync(AUTH_DIR)) return;

    const fileNames = fs.readdirSync(AUTH_DIR).filter((fileName) => {
      const filePath = path.join(AUTH_DIR, fileName);
      return fs.statSync(filePath).isFile();
    });

    if (fileNames.length === 0) return;

    const currentFilesSet = new Set(fileNames);

    const pendingUpserts: Array<{ fileName: string; content: string }> = [];

    for (const fileName of fileNames) {
      const filePath = path.join(AUTH_DIR, fileName);
      const content = fs.readFileSync(filePath, "utf8");
      // Evitar consultas innecesarias si el archivo no ha cambiado
      if (contentCache.get(fileName) === content) {
        continue;
      }
      pendingUpserts.push({ fileName, content });
    }

    if (pendingUpserts.length > 0) {
      await prisma.$transaction(
        pendingUpserts.map(({ fileName, content }) =>
          prisma.sessionFile.upsert({
            where: { id: fileName },
            update: { content },
            create: { id: fileName, content },
          })
        )
      );
      for (const { fileName, content } of pendingUpserts) {
        contentCache.set(fileName, content);
      }
    }

    // Limpiar de la caché y de la base de datos los archivos obsoletos que Baileys ya eliminó en disco
    let hasDeletedFiles = false;
    for (const cachedKey of contentCache.keys()) {
      if (!currentFilesSet.has(cachedKey)) {
        contentCache.delete(cachedKey);
        hasDeletedFiles = true;
      }
    }

    if (hasDeletedFiles) {
      await prisma.sessionFile.deleteMany({
        where: {
          id: { notIn: fileNames },
        },
      });
    }
  } catch (err: any) {
    console.error("⚠️ Error sincronizando sesión a Supabase:", err?.message);
  }
}

