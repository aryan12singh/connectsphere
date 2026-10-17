// CS-78 research fixture only. No application routes import this prototype.
const { randomUUID } = require('node:crypto');
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { validateHoldDeadline } = require('../../src/holdClock');
const { instant } = require('../../src/time');

async function createHoldSpike({ databaseUrl = process.env.DATABASE_URL, schemaName = `cs78_${randomUUID().replaceAll('-', '')}`, initialize = true } = {}) {
  const url = new URL(databaseUrl || 'postgresql://invalid/');
  if (!['postgresql:', 'postgres:'].includes(url.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || url.pathname !== '/booking_test') {
    throw new Error('The hold spike requires a local, disposable booking_test database');
  }
  if (!/^cs78_[a-f0-9]{32}$/.test(schemaName)) throw new Error('Invalid isolated spike schema name');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  const table = name => Prisma.raw(`"${schemaName}"."${name}"`);
  if (initialize) {
    let created = false;
    try {
      await db.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
      created = true;
      await db.$executeRawUnsafe(`CREATE TABLE "${schemaName}".holds (
        id text PRIMARY KEY, state text NOT NULL CHECK (state IN ('ACTIVE','APPROVED','EXPIRED')),
        created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
        occupied_start_at timestamptz NOT NULL, version integer NOT NULL DEFAULT 1,
        warning_lead_ms bigint NOT NULL CHECK (warning_lead_ms >= 0), warned_version integer,
        lease_owner text, lease_token text, lease_until timestamptz,
        CHECK (expires_at > created_at))`);
      await db.$executeRawUnsafe(`CREATE TABLE "${schemaName}".actions (
        id text PRIMARY KEY, hold_id text NOT NULL REFERENCES "${schemaName}".holds(id),
        version integer NOT NULL, kind text NOT NULL CHECK (kind IN ('HOLD_WARNING','HOLD_EXPIRED')))`);
    } catch (error) {
      try { if (created) await db.$executeRawUnsafe(`DROP SCHEMA "${schemaName}" CASCADE`); }
      finally { await db.$disconnect(); }
      throw error;
    }
  }

  async function createFixture(hold, policy) {
    validateHoldDeadline(hold, policy);
    if (!Number.isSafeInteger(hold.warningLeadMs) || hold.warningLeadMs < 0) throw new RangeError('Invalid warningLeadMs');
    await db.$executeRaw(Prisma.sql`INSERT INTO ${table('holds')}
      (id,state,created_at,expires_at,occupied_start_at,warning_lead_ms)
      VALUES (${hold.id},'ACTIVE',${new Date(hold.createdAt)},${new Date(hold.expiresAt)},${new Date(hold.occupiedStartAt)},${hold.warningLeadMs})`);
  }

  async function clockExpression(clock) {
    if (!clock) return Prisma.sql`clock_timestamp()`;
    return Prisma.sql`${new Date(instant(await clock(), 'clock'))}::timestamptz`;
  }

  async function effectiveOccupancy(clock) {
    const at = await clockExpression(clock);
    const rows = await db.$queryRaw(Prisma.sql`SELECT id FROM ${table('holds')}
      WHERE state='APPROVED' OR (state='ACTIVE' AND expires_at > ${at}) ORDER BY id`);
    return rows.map(row => row.id);
  }

  async function approve(id, clock) {
    return db.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM ${table('holds')} WHERE id=${id} FOR UPDATE`);
      // Read the actual database clock after acquiring the lock, not transaction NOW().
      const at = await clockExpression(clock);
      const updated = await tx.$queryRaw(Prisma.sql`WITH at AS MATERIALIZED (SELECT ${at} AS value)
        UPDATE ${table('holds')} AS h SET state='APPROVED',lease_owner=NULL,lease_token=NULL,lease_until=NULL
        FROM at WHERE h.id=${id} AND h.state='ACTIVE' AND h.expires_at > at.value RETURNING h.id`);
      return updated.length === 1;
    });
  }

  async function claimDue({ workerId, clock, batchSize, leaseMs }) {
    if (typeof workerId !== 'string' || !workerId.trim()) throw new TypeError('workerId is required');
    if (!Number.isSafeInteger(batchSize) || batchSize <= 0) throw new RangeError('Positive batchSize is required');
    if (!Number.isSafeInteger(leaseMs) || leaseMs <= 0) throw new RangeError('Positive leaseMs is required');
    const at = await clockExpression(clock);
    const token = randomUUID();
    return db.$queryRaw(Prisma.sql`WITH at AS MATERIALIZED (SELECT ${at} AS value),
      due AS MATERIALIZED (
        SELECT h.id FROM ${table('holds')} AS h CROSS JOIN at
        WHERE h.state='ACTIVE' AND (h.lease_until IS NULL OR h.lease_until <= at.value)
          AND (h.expires_at <= at.value OR
            (h.warned_version IS DISTINCT FROM h.version AND h.warning_lead_ms > 0
              AND h.expires_at - h.warning_lead_ms * interval '1 millisecond' <= at.value))
        ORDER BY h.expires_at,h.id LIMIT ${batchSize} FOR UPDATE OF h SKIP LOCKED)
      UPDATE ${table('holds')} AS h SET lease_owner=${workerId},lease_token=${token},
        lease_until=at.value + ${leaseMs} * interval '1 millisecond'
      FROM due CROSS JOIN at WHERE h.id=due.id
      RETURNING h.id,h.version,h.lease_token AS "leaseToken"`);
  }

  async function processClaim(claim, clock) {
    return db.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM ${table('holds')} WHERE id=${claim.id} FOR UPDATE`);
      const at = await clockExpression(clock);
      const changed = await tx.$queryRaw(Prisma.sql`WITH at AS MATERIALIZED (SELECT ${at} AS value)
        UPDATE ${table('holds')} AS h
        SET state=CASE WHEN h.expires_at <= at.value THEN 'EXPIRED' ELSE 'ACTIVE' END,
          warned_version=CASE WHEN h.expires_at > at.value THEN h.version ELSE h.warned_version END,
          lease_owner=NULL,lease_token=NULL,lease_until=NULL
        FROM at WHERE h.id=${claim.id} AND h.state='ACTIVE' AND h.version=${claim.version}
          AND h.lease_token=${claim.leaseToken} AND h.lease_until > at.value
          AND (h.expires_at <= at.value OR
            (h.warned_version IS DISTINCT FROM h.version AND h.warning_lead_ms > 0
              AND h.expires_at - h.warning_lead_ms * interval '1 millisecond' <= at.value))
        RETURNING h.id,h.version,h.state`);
      if (!changed.length) return null;
      const row = changed[0], kind = row.state === 'EXPIRED' ? 'HOLD_EXPIRED' : 'HOLD_WARNING';
      const actionId = `${row.id}:${row.version}:${kind}`;
      // State and durable action intent share this transaction. A failed insert rolls back both.
      await tx.$executeRaw(Prisma.sql`INSERT INTO ${table('actions')} (id,hold_id,version,kind)
        VALUES (${actionId},${row.id},${row.version},${kind}) ON CONFLICT (id) DO NOTHING`);
      return kind;
    });
  }

  async function close({ drop = true } = {}) {
    try { if (drop) await db.$executeRawUnsafe(`DROP SCHEMA "${schemaName}" CASCADE`); }
    finally { await db.$disconnect(); }
  }
  return { db, table, schemaName, createFixture, effectiveOccupancy, approve, claimDue, processClaim, close };
}

module.exports = { createHoldSpike };
