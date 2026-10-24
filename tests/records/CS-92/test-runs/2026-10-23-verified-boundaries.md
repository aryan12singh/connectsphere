# CS-92 verified execution — 23 October 2026

Source: clean `1c87348696b104adf911ecdde3214bcb4cf49b17`, Node 22.19.0. The production source is unchanged in `ea1cc7ab9e34f72a16c1bf2f472575299e062d71`; that commit updates one legacy browser fixture.

| Case | Executed proof | Result |
| --- | --- | --- |
| TC-CS92-13 | Production Booking HTTP handlers over memory stores: rejected-link retention, atomic replacement and primary-location transfer | Passed |
| TC-CS92-14 | Production Booking HTTP handlers over memory stores: explicit Coordinator withdrawal before Staff restoration, no duplicate history | Passed |
| TC-CS92-15 | Event HTTP and real PostgreSQL: final venue notices compare the last actually confirmed publication through unpublished approvals and a reverted alternative | Passed |

These observations were captured at 19:58 UTC on 22 October (03:58 Singapore time on 23 October). Booking passed 104/104 tests; Event PostgreSQL passed 33/33; Notification passed 26/26 unit and 6/6 PostgreSQL tests. Existing coverage thresholds were unchanged.

The [case ledger, rows 163–179](https://docs.google.com/spreadsheets/d/1n7kRH5iPyHaxj5Rs41f53Shbn6TX-KXCdE7JcP9gQB8/edit#gid=1680394087&range=F163:U179) records final browser/HTTP/PostgreSQL outcomes, pending/stale/final stages and source identity. [Required CI](https://github.com/aryan12singh/connectsphere/actions/workflows/event-workflows.yml) records committed full-stack runs; the [source map](../../../../docs/sprint4-venue-test-map.md) identifies executable tests.

The exact 21-recipient case uses 20 Confirmed registrations plus the Organiser; waiting-list filtering has a separate fixture. Pending replacement expiry remains fenced to its source; a completed replacement can later follow the ordinary reviewed-change/resubmission path without reviving its retired original. Generated results remain outside Git. Developer review and Product Owner acceptance remain separate gates.

Follow-up UTC regression, on the candidate based on `f49d80a`: TC-CS92-02/CS52-02 passed 2/2 desktop/mobile with both server and browser in UTC. The 03:00–05:00 UTC booking renders 11 am–1 pm in the Event's Asia/Singapore timezone for Attendees and the owning Organiser. The actual child route denies Attendees and unrelated Organisers, with no venue table and authenticated API 403; existing waiting-list delivery and registration preservation still pass. Production build and application/browser type checks passed. Raw candidate provenance and outputs remain outside Git; required CI records the committed complete run.
