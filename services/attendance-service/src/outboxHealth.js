const DEFAULT_BACKLOG_LIMIT = 100;
const DEFAULT_MAX_AGE_MS = 60_000;

function isOutboxUnhealthy({ count, oldestCreatedAt, now = new Date(), backlogLimit = DEFAULT_BACKLOG_LIMIT, maxAgeMs = DEFAULT_MAX_AGE_MS }) {
  if (count >= backlogLimit) return true;
  return Boolean(count > 0 && oldestCreatedAt && now.getTime() - new Date(oldestCreatedAt).getTime() >= maxAgeMs);
}

function start({ prisma, intervalMs = 60_000, backlogLimit = DEFAULT_BACKLOG_LIMIT, maxAgeMs = DEFAULT_MAX_AGE_MS, now = () => new Date(), log = console.warn } = {}) {
  if (!prisma) return null;
  let stopped = false;
  let timer;
  let running;

  async function check() {
    const where = { deliveredAt: null, suppressedAt: null };
    const count = await prisma.attendanceOutbox.count({ where });
    if (!count) return;
    const oldest = await prisma.attendanceOutbox.findFirst({ where, orderBy: { createdAt: 'asc' }, select: { createdAt: true } });
    if (isOutboxUnhealthy({ count, oldestCreatedAt: oldest?.createdAt, now: now(), backlogLimit, maxAgeMs })) {
      log('Attendance outbox backlog is growing or aging', { count, oldestCreatedAt: oldest?.createdAt || null });
    }
  }

  async function tick() {
    try { await check(); }
    catch (error) { log('Attendance outbox health check unavailable', error.code || error.name); }
    if (!stopped) {
      timer = setTimeout(() => { running = tick(); }, intervalMs);
      timer.unref?.();
    }
  }

  running = tick();
  return { stop: async () => { stopped = true; clearTimeout(timer); await running; } };
}

module.exports = { isOutboxUnhealthy, start };
