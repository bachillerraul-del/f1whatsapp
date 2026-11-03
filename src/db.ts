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
