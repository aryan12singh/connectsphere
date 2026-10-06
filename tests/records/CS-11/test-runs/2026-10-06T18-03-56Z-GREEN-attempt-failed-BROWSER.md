# CS-11 — GREEN-attempt-failed browser execution

Started UTC: 2026-10-06T18:03:56.471Z

Runner: Codex automated Playwright, real production Nuxt/BFF/Kong/Keycloak/auth/PostgreSQL; synthetic checked-in accounts only. This is not independent human review or PO acceptance. Authentication setup honours gateway429 backoff; Playwright reruns are disabled.

Source: c9a2e79deadea78eecd9a5f77fa994d14d6e3a8d

Full run: 19 passed, 3 unexpected, 0 flaky, 0 skipped.

| Browser case | Project | Result | Duration ms | Reruns |
|---|---|---|---|---|
| CS-11 AC01-05: validated form, registration, receipt, assignment and submitted read-only | desktop | PASS | 876 | 0 |
| CS-11 AC04/06: concurrent replay creates one ID and private reads reject another Organiser | desktop | PASS | 160 | 0 |
| CS-11 accessibility: mandatory name and purpose are announced to assistive technology | desktop | PASS | 372 | 0 |
| CS-11 AC01-05: validated form, registration, receipt, assignment and submitted read-only | mobile | PASS | 798 | 0 |
| CS-11 AC04/06: concurrent replay creates one ID and private reads reject another Organiser | mobile | PASS | 147 | 0 |
| CS-11 accessibility: mandatory name and purpose are announced to assistive technology | mobile | PASS | 425 | 0 |

Machine-readable results and HTML/failure screenshots are retained with the run's evidence. The normal, failure and boundary expectations in the named browser cases remain explicit. Earlier failed attempts are retained. Main story specifications remain in tests/specs and tests/records/CS-11/test-cases.md.
