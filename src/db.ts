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

export async function isBotActiveInChat(jid: string): Promise<boolean> {
  if (chatActiveCache.has(jid)) {
    return chatActiveCache.get(jid)!;
  }
  const settings = await prisma.chatSettings.findUnique({
    where: { jid },
  });
  // Por defecto el bot está activo si no hay registro
  const active = settings?.botActive ?? true;
  chatActiveCache.set(jid, active);

  // Registrar el chat en segundo plano si aún no existía en ChatSettings
  if (!settings) {
    prisma.chatSettings
      .upsert({
        where: { jid },
        update: {},
        create: { jid, botActive: true },
      })
      .catch(() => {});
  }

  return active;
}

export async function setBotActiveInChat(jid: string, active: boolean) {
  chatActiveCache.set(jid, active);
  return prisma.chatSettings.upsert({
    where: { jid },
    update: { botActive: active },
    create: { jid, botActive: active },
  });
}

/**
 * Obtiene todos los JIDs de chats/grupos conocidos en la base de datos
 * (ChatSettings, PorraBet y Subscriber) donde el bot no esté desactivado (!bot off).
 */
export async function getAllKnownActiveChatJids(extraJids: string[] = []): Promise<string[]> {
  const [settings, subscribers, betGroups] = await Promise.all([
    prisma.chatSettings.findMany({ select: { jid: true, botActive: true } }),
    prisma.subscriber.findMany({ select: { jid: true } }),
    prisma.porraBet.findMany({ select: { groupJid: true }, distinct: ["groupJid"] }),
  ]);

  const disabledSet = new Set<string>();
  const allCandidates = new Set<string>(extraJids);

  for (const s of settings) {
    chatActiveCache.set(s.jid, s.botActive);
    if (!s.botActive) {
      disabledSet.add(s.jid);
    } else {
      allCandidates.add(s.jid);
    }
  }

  for (const sub of subscribers) {
    if (!disabledSet.has(sub.jid)) {
      allCandidates.add(sub.jid);
    }
  }

  for (const bg of betGroups) {
    if (!disabledSet.has(bg.groupJid)) {
      allCandidates.add(bg.groupJid);
    }
  }

  // Filtrar chats inválidos o de broadcast de estado
  return Array.from(allCandidates).filter(
    (jid) => jid && jid !== "status@broadcast" && !disabledSet.has(jid)
  );
}

export async function getActiveChats(): Promise<string[]> {
  // Devuelve los JIDs donde el bot está explícitamente desactivado
  const disabled = await prisma.chatSettings.findMany({
    where: { botActive: false },
    select: { jid: true },
  });
  return disabled.map((c) => c.jid);
}
