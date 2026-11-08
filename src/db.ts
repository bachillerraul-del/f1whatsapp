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

export async function markAlertSent(sessionKey: string) {
  return prisma.sentAlert.upsert({
    where: { sessionKey },
    update: { sentAt: new Date() },
    create: { sessionKey },
  });
}

export async function wasAlertSent(sessionKey: string) {
  const alert = await prisma.sentAlert.findUnique({
    where: { sessionKey },
  });
  return !!alert;
}

// =============================
// Chat Settings (bot on/off)
// =============================

export async function isBotActiveInChat(jid: string): Promise<boolean> {
  const settings = await prisma.chatSettings.findUnique({
    where: { jid },
  });
  // Por defecto el bot está activo si no hay registro
  return settings?.botActive ?? true;
}

export async function setBotActiveInChat(jid: string, active: boolean) {
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
