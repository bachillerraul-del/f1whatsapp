import fs from "fs";
import path from "path";
import { prisma } from "./db.js";

const AUTH_DIR = path.resolve("auth_info_baileys");

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
    }
    console.log("✅ Sesión de WhatsApp restaurada exitosamente desde la nube.");
  } catch (err: any) {
    console.error("⚠️ Error restaurando sesión desde la base de datos:", err?.message);
  }
}

export async function pushSessionToDb() {
  try {
    if (!fs.existsSync(AUTH_DIR)) return;

    const fileNames = fs.readdirSync(AUTH_DIR);
    if (fileNames.length === 0) return;

    for (const fileName of fileNames) {
      const filePath = path.join(AUTH_DIR, fileName);
      if (!fs.statSync(filePath).isFile()) continue;

      const content = fs.readFileSync(filePath, "utf8");
      await prisma.sessionFile.upsert({
        where: { id: fileName },
        update: { content },
        create: { id: fileName, content },
      });
    }
  } catch (err: any) {
    console.error("⚠️ Error sincronizando sesión a Supabase:", err?.message);
  }
}
