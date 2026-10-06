# CS-29 — GREEN-attempt-failed browser execution

Started UTC: 2026-10-06T18:03:56.471Z

Runner: Codex automated Playwright, real production Nuxt/BFF/Kong/Keycloak/auth/PostgreSQL; synthetic checked-in accounts only. This is not independent human review or PO acceptance. Authentication setup honours gateway429 backoff; Playwright reruns are disabled.

Source: c9a2e79deadea78eecd9a5f77fa994d14d6e3a8d

Full run: 19 passed, 3 unexpected, 0 flaky, 0 skipped.

| Browser case | Project | Result | Duration ms | Reruns |
|---|---|---|---|---|
| CS-29 AC01-04: purpose-only private Draft, unsaved Stay, failed submission and same-ID submit | desktop | PASS | 865 | 0 |
| CS-29 AC05: actual service outage retains saved Draft and typed input; retry saves once | desktop | PASS | 74299 | 0 |
| CS-29 AC01-04: purpose-only private Draft, unsaved Stay, failed submission and same-ID submit | mobile | PASS | 808 | 0 |
| CS-29 AC05: actual service outage retains saved Draft and typed input; retry saves once | mobile | PASS | 74254 | 0 |

Machine-readable results and HTML/failure screenshots are retained with the run's evidence. The normal, failure and boundary expectations in the named browser cases remain explicit. Earlier failed attempts are retained. Main story specifications remain in tests/specs and tests/records/CS-29/test-cases.md.
