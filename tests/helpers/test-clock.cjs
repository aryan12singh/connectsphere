// Test-only calendar pin. Many unit and component tests use literal future
// dates (for example Events on 21 Dec 2026). Against the real clock those dates
// eventually fall into the past and the suite goes red with no code change; a
// probe run as of 15 Jan 2027 failed 15 service unit tests that pass today.
//
// Until the real date passes the pin, nothing changes. After it, each test
// process starts its clock at the pin and lets it tick normally, so elapsed-time
// behaviour (hold expiry, timeouts, ordering) is unchanged. The pin sits before
// the earliest literal fixture date (20 Nov 2026). Production code never loads this.
//
// Service PostgreSQL integration suites and the live browser stack do not load
// it: they use real database time and dates far enough ahead (2028+) or
// relative to now. Set TEST_REAL_CLOCK=1 to use the machine clock.
if (process.env.TEST_REAL_CLOCK !== "1" && process.env.TEST_REAL_CLOCK !== "true" && !globalThis.__connectsphereTestClock) {
  const RealDate = Date
  const base = Date.parse(process.env.TEST_CLOCK_BASE || '2026-11-12T00:00:00.000Z')
  const offset = RealDate.now() > base ? base - RealDate.now() : 0
  class TestDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(RealDate.now() + offset)
      else super(...args)
    }
    static now() { return RealDate.now() + offset }
  }
  globalThis.Date = TestDate
  globalThis.__connectsphereTestClock = { base, offset }
}
