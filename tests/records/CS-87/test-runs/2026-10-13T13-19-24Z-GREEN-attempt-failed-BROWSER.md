# CS-87 — GREEN-attempt-failed browser execution

Started UTC: 2026-10-13T13:19:24.427Z

Runner: Automated Playwright, real production Nuxt/BFF/Kong/Keycloak/auth/PostgreSQL; synthetic checked-in accounts only. This is not independent human review or PO acceptance. Authentication setup honours gateway429 backoff; Playwright reruns are disabled.

Source: c49541b841fae2459794ac5dce7abf0b87e48c50

Full run: 60 passed, 8 unexpected, 0 flaky, 0 skipped.

| Browser case | Project | Result | Duration ms | Reruns |
|---|---|---|---|---|
| TC-CS87-13 LIVE Coordinator changes only the selected breakout and Staff can extend its hold | desktop | PASS | 64035 | 0 |
| TC-CS87-03 LIVE Coordinator requests independent rooms and Staff decisions update the real Event page | desktop | PASS | 3203 | 0 |
| TC-CS87-13 LIVE Coordinator changes only the selected breakout and Staff can extend its hold | mobile | PASS | 4816 | 0 |
| TC-CS87-03 LIVE Coordinator requests independent rooms and Staff decisions update the real Event page | mobile | PASS | 4023 | 0 |

Machine-readable results and HTML/failure screenshots are retained with the run's evidence. The normal, failure and boundary expectations in the named browser cases remain explicit. Earlier failed attempts are retained. Main story specifications remain in tests/specs and tests/records/CS-87/test-cases.md.
