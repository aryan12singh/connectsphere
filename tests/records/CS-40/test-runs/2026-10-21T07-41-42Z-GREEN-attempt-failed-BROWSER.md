# CS-40 — GREEN-attempt-failed browser execution

Started UTC: 2026-10-21T07:41:42.693Z

Runner: Automated Playwright, real production Nuxt/BFF/Kong/Keycloak/auth/PostgreSQL; synthetic checked-in accounts only. This is not independent human review or PO acceptance. Authentication setup honours gateway429 backoff; Playwright reruns are disabled.

Source: 8480a3ade7fc5b7785de1932b741dc9f95f39879

Full run: 21 passed, 3 unexpected, 0 flaky, 12 skipped.

| Browser case | Project | Result | Duration ms | Reruns |
|---|---|---|---|---|
| TC-CS40-13: keyboard-accessible browser validation, review and refresh preserve current state | desktop | FAILED | 116589 | 0 |
| TC-CS40-14: physical stock ceiling rejects the entire over-stock request | desktop | PASS | 39488 | 0 |
| TC-CS40-15: field limits and contradictory declarations reject every partial write | desktop | PASS | 42980 | 0 |
| TC-CS40-16: venue can be selected per equipment row | desktop | PASS | 48231 | 0 |
| TC-CS40-17: missing venue is blocked in the browser | desktop | PASS | 39371 | 0 |

Machine-readable results and HTML/failure screenshots are retained with the run's evidence. The normal, failure and boundary expectations in the named browser cases remain explicit. Earlier failed attempts are retained. Main story specifications remain in tests/specs and tests/records/CS-40/test-cases.md.
