import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export async function addSubscriber(jid: string, name?: string) {
  return prisma.subscriber.upsert({
    where: { jid },
    update: { active: true, name: name || undefined },
    create: { jid, name, active: true },
  });
}

export async function removeSubscriber(jid: string) {
  return prisma.subscriber.updateMany({
    where: { jid },
    data: { active: false },
  });
}

export async function getActiveSubscribers() {
  return prisma.subscriber.findMany({
    where: { active: true },
  });
}

export async function isSubscribed(jid: string) {
  const sub = await prisma.subscriber.findUnique({
    where: { jid },
  });
  return sub?.active ?? false;
}

const sentAlertsCache = new Set<string>();
const chatActiveCache = new Map<string, boolean>();

export async function markAlertSent(sessionKey: string) {
  sentAlertsCache.add(sessionKey);
  return prisma.sentAlert.upsert({
    where: { sessionKey },
    update: { sentAt: new Date() },
    create: { sessionKey },
  });
}

export async function wasAlertSent(sessionKey: string) {
  if (sentAlertsCache.has(sessionKey)) {
    return true;
  }
  const alert = await prisma.sentAlert.findUnique({
    where: { sessionKey },
  });
  if (alert) {
    sentAlertsCache.add(sessionKey);
  }
  return !!alert;
}

// =============================
// Chat Settings (bot on/off)
// =============================

let migrationCompleted = false;

/**
 * Limpia por única vez cualquier grupo personal que se haya registrado automáticamente
 * en ChatSettings sin haber tenido nunca actividad en PorraBet ni en Subscriber,
 * y asegura que los chats legítimos (con apuestas o suscripción previa) estén en ChatSettings.
 */
export async function ensureAuthorizedChatsMigrated(): Promise<void> {
  if (migrationCompleted) return;
  try {
    const migrationKey = "system-cleanup-chatsettings-v1";
    if (await wasAlertSent(migrationKey)) {
      migrationCompleted = true;
      return;
    }

    const [settings, subscribers, betGroups] = await Promise.all([
      prisma.chatSettings.findMany({ select: { jid: true, botActive: true } }),
      prisma.subscriber.findMany({ select: { jid: true } }),
      prisma.porraBet.findMany({ select: { groupJid: true }, distinct: ["groupJid"] }),
    ]);

    const legitimateJids = new Set<string>();
    for (const sub of subscribers) {
      if (sub.jid && sub.jid !== "status@broadcast") legitimateJids.add(sub.jid);
    }
    for (const bg of betGroups) {
      if (bg.groupJid && bg.groupJid !== "status@broadcast") legitimateJids.add(bg.groupJid);
    }

    const existingSettingsMap = new Map<string, boolean>();
    const spuriousJidsToDelete: string[] = [];

    for (const s of settings) {
      existingSettingsMap.set(s.jid, s.botActive);
      // Si estaba marcado como activo pero nunca tuvo apuestas ni suscripción, fue auto-insertado por error
      if (s.botActive && !legitimateJids.has(s.jid)) {
        spuriousJidsToDelete.push(s.jid);
      }
    }

    if (spuriousJidsToDelete.length > 0) {
      await prisma.chatSettings.deleteMany({
        where: { jid: { in: spuriousJidsToDelete } },
      });
      console.log(
        `🧹 [Limpieza ChatSettings] Eliminados ${spuriousJidsToDelete.length} grupos donde nunca se activó el bot.`
      );
    }

    // Asegurar que los grupos legítimos (con porra o suscripción previa) tengan registro en ChatSettings
    for (const jid of legitimateJids) {
      if (!existingSettingsMap.has(jid)) {
        await prisma.chatSettings.upsert({
          where: { jid },
          update: {},
          create: { jid, botActive: true },
        });
      }
    }

    chatActiveCache.clear();
    await markAlertSent(migrationKey);
    migrationCompleted = true;
  } catch (err: any) {
    console.error("[Migración ChatSettings Error]:", err?.message);
  }
}

export async function isBotActiveInChat(jid: string): Promise<boolean> {
  await ensureAuthorizedChatsMigrated();

  if (chatActiveCache.has(jid)) {
    return chatActiveCache.get(jid)!;
  }
  const settings = await prisma.chatSettings.findUnique({
    where: { jid },
  });
  // Por defecto el bot está DESACTIVADO en chats donde nunca se ha activado con !bot on
  const active = settings?.botActive ?? false;
  chatActiveCache.set(jid, active);

  return active;
}

export async function setBotActiveInChat(jid: string, active: boolean) {
  await ensureAuthorizedChatsMigrated();
  chatActiveCache.set(jid, active);
  return prisma.chatSettings.upsert({
    where: { jid },
    update: { botActive: active },
    create: { jid, botActive: active },
  });
}

/**
 * Obtiene únicamente los JIDs de chats/grupos donde el bot ha sido activado (!bot on)
 * o tiene actividad legítima registrada y botActive === true.
 */
export async function getAllKnownActiveChatJids(): Promise<string[]> {
  await ensureAuthorizedChatsMigrated();

  const activeSettings = await prisma.chatSettings.findMany({
    where: { botActive: true },
    select: { jid: true },
  });

  for (const s of activeSettings) {
    chatActiveCache.set(s.jid, true);
  }

  return activeSettings
    .map((s) => s.jid)
    .filter((jid) => Boolean(jid && jid !== "status@broadcast"));
}

export async function getActiveChats(): Promise<string[]> {
  // Devuelve los JIDs donde el bot está explícitamente activado
  return getAllKnownActiveChatJids();
}
