# CS-85 — operating-hours regression GREEN — 17 October 2026

Runtime: Node22.23.3; disposable PostgreSQL16. Source: the CS-85 operating-hours
follow-up in [PR #13](https://github.com/aryan12singh/connectsphere/pull/13).

| Check | Actual result |
|---|---|
| TC-CS85-16 native repeated-hour/boundary controls | **8/8 passed** after the recorded4/8 RED |
| Full Booking unit suite and unchanged coverage floors | **43/43 passed** |
| TC-CS85-17, search/request/approval and unchanged effects | **Passed** within CS-85 **39/39** |
| Actual Booking PostgreSQL, including TC-CS85-18 | **19/19 passed**, floors unchanged |
| Booking HTTP contracts | **14/14 passed** |
| Full frontend and global coverage floors | **387/387 passed**, zero pending |
| Application/E2E typechecks and production build | **Passed** |

TC-CS85-17 uses actual HTTP services backed by isolated memory repositories.
TC-CS85-18 uses actual PostgreSQL with explicitly isolated upstream Event/Venue
fixtures: closed-hour requests add no booking/activity/outbox; the open-hours
control saves exactly one of each with05:20Z–06:10Z instants.

TC-CS85-31 covers the real authenticated desktop/mobile workflow and database
readback. Its execution is recorded separately in the live/hosted artifacts;
the local rows above do not stand in for that result. Original full-suite
timeout and typecheck diagnostics remain separate from the passing evidence.
No retries, skips, reduced floors or changed timeouts were added.

Case specification: [current CS-85 cases](../test-cases.md). Raw reports,
screenshots and SHA256 manifest stay in the agreed external evidence location.
Human acceptance and CI on the resulting merged `main` remain separate gates.
