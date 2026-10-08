// Real PostgreSQL proof of CS-78's design; synthetic rows stay in a guarded schema.
const assert = require('node:assert/strict');
const { writeFileSync } = require('node:fs');
const { Prisma } = require('@prisma/client');
const { createHoldSpike } = require('./hold-expiry-store.cjs');
const startTime = Date.now();
const results = [];
let store;
const deadline = '2030-01-01T10:00:00Z';
const policy = { allowExpiryAtOccupiedStart: false };
const fixture = (id, overrides = {}) => ({ id, createdAt: '2030-01-01T07:00:00Z', expiresAt: deadline, occupiedStartAt: '2030-01-01T11:00:00Z', warningLeadMs: 3_600_000, ...overrides });
const clock = at => () => at;
const before = '2030-01-01T09:59:59.999Z';
const leaseEnd = '2030-01-01T10:00:01Z';
const claimOptions = (workerId, at = deadline) => ({ workerId, clock: clock(at), batchSize: 1, leaseMs: 1000 });
const requireMethod = name => assert.equal(typeof store[name], 'function', `${name} must be implemented`);
async function row(id) { return (await store.db.$queryRaw(Prisma.sql`SELECT * FROM ${store.table('holds')} WHERE id=${id}`))[0]; }
async function actions(id) { return store.db.$queryRaw(Prisma.sql`SELECT * FROM ${store.table('actions')} WHERE hold_id=${id} ORDER BY kind`); }
function gate() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
async function bounded(promise, message) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), 2500); })]); }
  finally { clearTimeout(timer); }
}

async function check(title, run) {
  try {
    await store.db.$executeRaw(Prisma.sql`TRUNCATE ${store.table('actions')}, ${store.table('holds')}`);
    await run(); results.push({ title, status: 'passed', failureMessages: [] }); console.log(`PASS ${title}`);
  }
  catch (error) { results.push({ title, status: 'failed', failureMessages: [error.stack] }); console.error(`FAIL ${title}: ${error.message}`); }
}

(async () => {
  try {
    store = await createHoldSpike();
    await check('TC-CS78-06 availability excludes an expired active row before worker processing', async () => {
      await store.createFixture(fixture('late-worker'), policy);
      assert.deepEqual(await store.effectiveOccupancy?.(() => deadline), []);
      const [row] = await store.db.$queryRaw(Prisma.sql`SELECT state FROM ${store.table('holds')} WHERE id='late-worker'`);
      assert.equal(row.state, 'ACTIVE');
      const [{ count }] = await store.db.$queryRaw(Prisma.sql`SELECT count(*)::int AS count FROM ${store.table('actions')}`);
      assert.equal(count, 0);
    });
    await check('TC-CS78-07 approval and expiry serialize to one terminal outcome', async () => {
      requireMethod('approve'); requireMethod('claimDue'); requireMethod('processClaim');
      await store.createFixture(fixture('approved-before'), policy);
      assert.equal(await store.approve('approved-before', clock(before)), true);
      assert.equal(await store.approve('approved-before', clock(before)), false);
      assert.equal((await row('approved-before')).state, 'APPROVED');
      assert.deepEqual(await store.effectiveOccupancy(clock(deadline)), ['approved-before']);
      await store.createFixture(fixture('approval-at'), policy);
      assert.equal(await store.approve('approval-at', clock(deadline)), false);
      for (let i = 0; i < 12; i++) {
        const id = `race-${i}`;
        await store.createFixture(fixture(id), policy);
        const claims = await store.claimDue({ ...claimOptions('expiry'), batchSize: 100 });
        const claim = claims.find(c => c.id === id);
        assert.ok(claim);
        const [approved, result] = await Promise.all([store.approve(id, clock(deadline)), store.processClaim(claim, clock(deadline))]);
        assert.equal(approved, false);
        assert.equal(result, 'HOLD_EXPIRED');
        assert.equal((await row(id)).state, 'EXPIRED');
        assert.equal((await actions(id)).length, 1);
      }
      // The actions straddle the boundary: whichever takes the row lock first wins.
      for (let i = 0; i < 6; i++) {
        const id = `boundary-race-${i}`;
        await store.createFixture(fixture(id), policy);
        const claims = await store.claimDue({ ...claimOptions('boundary', before), batchSize: 100 });
        const claim = claims.find(c => c.id === id);
        assert.ok(claim);
        const approval = () => store.approve(id, clock(before));
        const expiry = () => store.processClaim(claim, clock(deadline));
        const pair = i % 2 ? await Promise.all([expiry(), approval()]) : await Promise.all([approval(), expiry()]);
        const [approved, action] = i % 2 ? [pair[1], pair[0]] : pair;
        assert.equal((await row(id)).state, approved ? 'APPROVED' : 'EXPIRED');
        assert.equal(action, approved ? null : 'HOLD_EXPIRED');
        assert.equal((await actions(id)).length, approved ? 0 : 1);
      }
      // Exercise the default PostgreSQL clock as well as the controlled fixture clocks.
      const [{ at }] = await store.db.$queryRaw(Prisma.sql`SELECT clock_timestamp() AS at`);
      await store.createFixture(fixture('database-clock', {
        createdAt: new Date(at.getTime() - 3_600_000).toISOString(),
        expiresAt: new Date(at.getTime() - 600_000).toISOString(),
        occupiedStartAt: new Date(at.getTime() + 3_600_000).toISOString(),
      }), policy);
      assert.equal(await store.approve('database-clock'), false);
      assert.ok(!(await store.effectiveOccupancy()).includes('database-clock'));
      const [liveClockClaim] = await store.claimDue({ workerId: 'database-clock', batchSize: 1, leaseMs: 60_000 });
      assert.equal(liveClockClaim.id, 'database-clock');
      assert.equal(await store.processClaim(liveClockClaim), 'HOLD_EXPIRED');
    });
    await check('TC-CS78-08 retries deduplicate warnings and expiry with expiry taking priority', async () => {
      requireMethod('claimDue'); requireMethod('processClaim');
      await store.createFixture(fixture('warn-then-expire'), policy);
      const [warning] = await store.claimDue(claimOptions('warning', '2030-01-01T09:00:00Z'));
      assert.ok(warning);
      assert.equal(await store.processClaim(warning, clock('2030-01-01T09:00:00Z')), 'HOLD_WARNING');
      assert.equal(await store.processClaim(warning, clock('2030-01-01T09:00:00Z')), null);
      assert.deepEqual(await store.claimDue(claimOptions('retry', before)), []);
      const [expiry] = await store.claimDue(claimOptions('expiry'));
      assert.equal(await store.processClaim(expiry, clock(deadline)), 'HOLD_EXPIRED');
      assert.equal(await store.processClaim(expiry, clock(deadline)), null);
      assert.deepEqual((await actions('warn-then-expire')).map(a => a.kind), ['HOLD_EXPIRED', 'HOLD_WARNING']);
      await store.createFixture(fixture('late-catchup'), policy);
      const [late] = await store.claimDue(claimOptions('late', '2030-01-01T10:05:00Z'));
      assert.equal(await store.processClaim(late, clock('2030-01-01T10:05:00Z')), 'HOLD_EXPIRED');
      assert.deepEqual((await actions('late-catchup')).map(a => a.kind), ['HOLD_EXPIRED']);
    });
    await check('TC-CS78-09 concurrent workers claim disjoint bounded batches and skip locked rows', async () => {
      requireMethod('claimDue'); requireMethod('processClaim');
      await store.createFixture(fixture('a'), policy); await store.createFixture(fixture('b'), policy);
      const [a, b] = await Promise.all([store.claimDue(claimOptions('one')), store.claimDue(claimOptions('two'))]);
      assert.equal(a.length, 1); assert.equal(b.length, 1); assert.notEqual(a[0].id, b[0].id);
      assert.notEqual(a[0].leaseToken, b[0].leaseToken);
      assert.deepEqual(await store.claimDue(claimOptions('third')), []);
      assert.deepEqual(await Promise.all([store.processClaim(a[0], clock(deadline)), store.processClaim(b[0], clock(deadline))]), ['HOLD_EXPIRED', 'HOLD_EXPIRED']);
      await store.createFixture(fixture('locked'), policy); await store.createFixture(fixture('unlocked'), policy);
      const acquired = gate(), release = gate();
      const locked = store.db.$transaction(async tx => {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM ${store.table('holds')} WHERE id='locked' FOR UPDATE`);
        acquired.resolve(); await release.promise;
      });
      try {
        await bounded(acquired.promise, 'row lock not acquired');
        const skipped = await bounded(store.claimDue(claimOptions('skip')), 'claim waited on a locked row');
        assert.deepEqual(skipped.map(c => c.id), ['unlocked']);
      } finally { release.resolve(); await locked; }
    });
    await check('TC-CS78-10 lease reclamation rejects stale tokens from the same worker identity', async () => {
      requireMethod('claimDue'); requireMethod('processClaim');
      await store.createFixture(fixture('lease'), policy);
      const [old] = await store.claimDue(claimOptions('same-worker'));
      assert.deepEqual(await store.claimDue(claimOptions('same-worker', '2030-01-01T10:00:00.999Z')), []);
      const [current] = await store.claimDue(claimOptions('same-worker', leaseEnd));
      assert.ok(current); assert.notEqual(old.leaseToken, current.leaseToken);
      assert.equal(await store.processClaim(old, clock(leaseEnd)), null);
      assert.equal((await row('lease')).state, 'ACTIVE');
      assert.equal(await store.processClaim(current, clock(leaseEnd)), 'HOLD_EXPIRED');
      assert.equal((await actions('lease')).length, 1);
    });
    await check('TC-CS78-11 version change fences a stale deadline claim', async () => {
      requireMethod('claimDue'); requireMethod('processClaim');
      await store.createFixture(fixture('revised'), policy);
      const [old] = await store.claimDue(claimOptions('old'));
      await store.db.$executeRaw(Prisma.sql`UPDATE ${store.table('holds')} SET version=version+1,
        expires_at=${new Date('2030-01-01T10:30:00Z')}, warning_lead_ms=0,
        lease_owner=NULL,lease_token=NULL,lease_until=NULL WHERE id='revised'`);
      assert.equal(await store.processClaim(old, clock(deadline)), null);
      assert.equal((await row('revised')).state, 'ACTIVE');
      assert.deepEqual(await actions('revised'), []);
      assert.deepEqual(await store.effectiveOccupancy(clock(deadline)), ['revised']);
    });
    await check('TC-CS78-12 rejected outbox insert rolls back state and permits one successful retry', async () => {
      requireMethod('claimDue'); requireMethod('processClaim');
      await store.createFixture(fixture('rollback'), policy);
      const [claim] = await store.claimDue(claimOptions('rollback'));
      await store.db.$executeRaw(Prisma.sql`ALTER TABLE ${store.table('actions')} ADD CONSTRAINT forced_failure CHECK (kind <> 'HOLD_EXPIRED')`);
      try {
        await assert.rejects(store.processClaim(claim, clock(deadline)), /forced_failure/);
        assert.equal((await row('rollback')).state, 'ACTIVE');
        assert.equal((await row('rollback')).lease_token, claim.leaseToken);
        assert.deepEqual(await actions('rollback'), []);
      } finally { await store.db.$executeRaw(Prisma.sql`ALTER TABLE ${store.table('actions')} DROP CONSTRAINT forced_failure`); }
      assert.equal(await store.processClaim(claim, clock(deadline)), 'HOLD_EXPIRED');
      assert.equal((await actions('rollback')).length, 1);
    });
    await check('TC-CS78-13 restart retains deadline and catches up after the persisted lease expires', async () => {
      requireMethod('claimDue'); requireMethod('processClaim');
      await store.createFixture(fixture('restart'), policy);
      await store.claimDue(claimOptions('stopped'));
      const schemaName = store.schemaName;
      await store.close({ drop: false });
      store = await createHoldSpike({ schemaName, initialize: false });
      assert.equal((await row('restart')).expires_at.toISOString(), new Date(deadline).toISOString());
      assert.deepEqual(await store.effectiveOccupancy(clock(leaseEnd)), []);
      const [claim] = await store.claimDue(claimOptions('restarted', leaseEnd));
      assert.equal(await store.processClaim(claim, clock(leaseEnd)), 'HOLD_EXPIRED');
      assert.equal((await actions('restart')).length, 1);
    });
    await check('TC-CS78-14 approval reads the clock after waiting for the row lock', async () => {
      requireMethod('approve');
      await store.createFixture(fixture('wait-clock'), policy);
      const acquired = gate(), release = gate(); let at = before, clockCalls = 0;
      const locked = store.db.$transaction(async tx => {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM ${store.table('holds')} WHERE id='wait-clock' FOR UPDATE`);
        acquired.resolve(); await release.promise;
      });
      let approval;
      try {
        await bounded(acquired.promise, 'row lock not acquired');
        approval = store.approve('wait-clock', () => { clockCalls++; return at; });
        // Check pg_stat_activity rather than an arbitrary sleep: prove approval is waiting.
        const end = Date.now() + 2000;
        let waiting = false;
        while (Date.now() < end) {
          const active = await store.db.$queryRaw(Prisma.sql`SELECT 1 FROM pg_stat_activity
            WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock'
              AND query LIKE ${`%${store.schemaName}%`}`);
          if (active.length) { waiting = true; break; }
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.equal(waiting, true, 'approval never waited on the row lock');
        assert.equal(clockCalls, 0, 'clock was read before the row lock');
        at = deadline;
      } finally { release.resolve(); await locked; }
      assert.equal(await bounded(approval, 'approval did not resume'), false);
      assert.equal(clockCalls, 1);
      assert.equal((await row('wait-clock')).state, 'ACTIVE');
    });
    await check('TC-CS78-15 prototype rejects production database and unsafe schema targets', async () => {
      for (const databaseUrl of ['postgresql://u:p@remote.example/booking_test', 'postgresql://u:p@127.0.0.1/booking', 'postgresql://u:p@127.0.0.1/venue_test', 'https://localhost/booking_test']) {
        await assert.rejects(createHoldSpike({ databaseUrl }), /local, disposable booking_test/);
      }
      for (const schemaName of ['public', 'cs78_valid;DROP TABLE holds', 'cs78_zzzz']) {
        await assert.rejects(createHoldSpike({ schemaName }), /Invalid isolated spike schema/);
      }
    });
  } catch (error) { results.push({ title: 'Spike infrastructure', status: 'failed', failureMessages: [error.stack] }); console.error(error.message); }
  finally {
    if (store) {
      try { await store.close(); }
      catch (error) { results.push({ title: 'Spike cleanup', status: 'failed', failureMessages: [error.stack] }); console.error(error.message); }
    }
    const failed = results.filter(r => r.status === 'failed').length;
    const jsonPath = process.env.CS_HOLD_SPIKE_RESULTS || '/tmp/connectsphere-cs78-hold-proof.json';
    writeFileSync(jsonPath, JSON.stringify({ startTime, success: failed === 0, numTotalTests: results.length, numPassedTests: results.length - failed, numFailedTests: failed, runner: 'PostgreSQL prototype assertions', evidenceLayer: 'CS-78 isolated PostgreSQL technical spike with actual row locks, transactions and persisted synthetic data. No business HTTP/UI integration, scheduler deployment or notification delivery is claimed.', testResults: [{ assertionResults: results }] }, null, 2));
    process.exitCode = failed ? 1 : 0;
  }
})();
