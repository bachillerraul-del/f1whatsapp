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

export async function getActiveChats(): Promise<string[]> {
  // Devuelve los JIDs donde el bot está explícitamente desactivado
  const disabled = await prisma.chatSettings.findMany({
    where: { botActive: false },
    select: { jid: true },
  });
  return disabled.map((c) => c.jid);
}
