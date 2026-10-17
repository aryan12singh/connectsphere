# CS-39 — GREEN-attempt-failed browser execution

Started UTC: 2026-10-13T14:33:23.602Z

Runner: Automated Playwright, real production Nuxt/BFF/Kong/Keycloak/auth/PostgreSQL; synthetic checked-in accounts only. This is not independent human review or PO acceptance. Authentication setup honours gateway429 backoff; Playwright reruns are disabled.

Source: c49541b841fae2459794ac5dce7abf0b87e48c50

Full run: 4 passed, 10 unexpected, 0 flaky, 0 skipped.

| Browser case | Project | Result | Duration ms | Reruns |
|---|---|---|---|---|
| TC-CS39-30 LIVE simultaneous room requests commit one winner with no orphan | desktop | FAILED | 147 | 0 |
| TC-CS39-30 LIVE simultaneous room requests commit one winner with no orphan | mobile | FAILED | 174 | 0 |

Machine-readable results and HTML/failure screenshots are retained with the run's evidence. The normal, failure and boundary expectations in the named browser cases remain explicit. Earlier failed attempts are retained. Main story specifications remain in tests/specs and tests/records/CS-39/test-cases.md.
