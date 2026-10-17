// Data access for notification_db. Memory mode is only for unit/contract
// tests (DATA_MODE=memory); production uses Prisma.
const { randomUUID } = require('node:crypto');
const config = require('./config');

const isMemory = config.dataMode === 'memory';
const prisma = isMemory ? null : require('./db');
const state = { notifications: [], receipts: new Map() };

function reset() {
  state.notifications.length = 0;
  state.receipts.clear();
}

const iso = (value) => (value ? new Date(value).toISOString() : null);
const toApi = (n) => ({ ...n, createdAt: iso(n.createdAt), readAt: iso(n.readAt) });

// Read notices older than this are no longer shown (kept 30 days after read).
function retentionCutoff(now = new Date()) {
  return new Date(now.getTime() - config.readRetentionDays * 24 * 60 * 60 * 1000);
}

async function getReceipt(messageId) {
  if (isMemory) return state.receipts.get(messageId) || null;
  return prisma.messageReceipt.findUnique({ where: { messageId } });
}

/** Records a failed attempt. Returns the new attempt count. */
async function recordAttempt(message, status, error) {
  const lastError = String(error?.message || error || '').slice(0, 500) || null;
  if (isMemory) {
    const current = state.receipts.get(message.id) || { messageId: message.id, messageType: message.type, aggregateId: message.aggregateId || null, attempts: 0, createdAt: new Date() };
    const next = { ...current, status, attempts: current.attempts + 1, lastError, updatedAt: new Date() };
    state.receipts.set(message.id, next);
    return next.attempts;
  }
  const saved = await prisma.messageReceipt.upsert({
    where: { messageId: message.id },
    create: { messageId: message.id, messageType: message.type, aggregateId: message.aggregateId || null, status, attempts: 1, lastError },
    update: { status, attempts: { increment: 1 }, lastError },
  });
  return saved.attempts;
}

/**
 * Saves the notices and marks the message done, together. A notice that
 * already exists (same message + recipient + type) is skipped.
 */
async function saveDelivered(message, notices, status = 'PROCESSED') {
  if (isMemory) {
    for (const notice of notices) {
      const exists = state.notifications.some((n) => n.sourceMessageId === message.id && n.recipientId === notice.recipientId && n.type === notice.type);
      if (!exists) state.notifications.push({ id: randomUUID(), ...notice, sourceMessageId: message.id, createdAt: new Date(), readAt: null });
    }
    const current = state.receipts.get(message.id) || { attempts: 0, createdAt: new Date() };
    state.receipts.set(message.id, { ...current, messageId: message.id, messageType: message.type, aggregateId: message.aggregateId || null, status, attempts: current.attempts + 1, lastError: null, updatedAt: new Date() });
    return;
  }
  await prisma.$transaction(async (tx) => {
    if (notices.length) {
      await tx.notification.createMany({
        data: notices.map((notice) => ({ ...notice, sourceMessageId: message.id })),
        skipDuplicates: true,
      });
    }
    await tx.messageReceipt.upsert({
      where: { messageId: message.id },
      create: { messageId: message.id, messageType: message.type, aggregateId: message.aggregateId || null, status, attempts: 1 },
      update: { status, attempts: { increment: 1 }, lastError: null },
    });
  });
}

/** A user's own visible notices, newest first, plus the unread count. */
async function listFor(recipientId, { limit = 50, now = new Date() } = {}) {
  const cutoff = retentionCutoff(now);
  if (isMemory) {
    const mine = state.notifications.filter((n) => n.recipientId === recipientId && (!n.readAt || n.readAt >= cutoff));
    const items = mine.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, limit).map(toApi);
    return { items, unread: mine.filter((n) => !n.readAt).length };
  }
  const where = { recipientId, OR: [{ readAt: null }, { readAt: { gte: cutoff } }] };
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit }),
    prisma.notification.count({ where: { recipientId, readAt: null } }),
  ]);
  return { items: rows.map(toApi), unread };
}

async function unreadCount(recipientId) {
  if (isMemory) return state.notifications.filter((n) => n.recipientId === recipientId && !n.readAt).length;
  return prisma.notification.count({ where: { recipientId, readAt: null } });
}

/** One notice, only if it belongs to the reader (otherwise null -> 404). */
async function getOwn(id, recipientId) {
  if (isMemory) {
    const notice = state.notifications.find((n) => n.id === id && n.recipientId === recipientId);
    return notice ? toApi(notice) : null;
  }
  const row = await prisma.notification.findFirst({ where: { id, recipientId } });
  return row ? toApi(row) : null;
}

/** Marks the reader's own notice as read. Returns false if it is not theirs. */
async function markRead(id, recipientId) {
  if (isMemory) {
    const notice = state.notifications.find((n) => n.id === id && n.recipientId === recipientId);
    if (!notice) return false;
    notice.readAt = notice.readAt || new Date();
    return true;
  }
  await prisma.notification.updateMany({ where: { id, recipientId, readAt: null }, data: { readAt: new Date() } });
  return Boolean(await prisma.notification.findFirst({ where: { id, recipientId }, select: { id: true } }));
}

/** Messages that failed after all retries (Technical Support view). */
async function listFailed(limit = 100) {
  const fields = (r) => ({ messageId: r.messageId, messageType: r.messageType, aggregateId: r.aggregateId, attempts: r.attempts, lastError: r.lastError, failedAt: iso(r.updatedAt) });
  if (isMemory) {
    return [...state.receipts.values()].filter((r) => r.status === 'FAILED')
      .sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit).map(fields);
  }
  const rows = await prisma.messageReceipt.findMany({ where: { status: 'FAILED' }, orderBy: { updatedAt: 'desc' }, take: limit });
  return rows.map(fields);
}

module.exports = {
  state, reset, isMemory, getReceipt, recordAttempt, saveDelivered,
  listFor, unreadCount, getOwn, markRead, listFailed, retentionCutoff,
};
