# CS-44 — GREEN-attempt-failed browser execution

Started UTC: 2026-10-06T18:03:56.471Z

Runner: Codex automated Playwright, real production Nuxt/BFF/Kong/Keycloak/auth/PostgreSQL; synthetic checked-in accounts only. This is not independent human review or PO acceptance. Authentication setup honours gateway429 backoff; Playwright reruns are disabled.

Source: c9a2e79deadea78eecd9a5f77fa994d14d6e3a8d

Full run: 19 passed, 3 unexpected, 0 flaky, 0 skipped.

| Browser case | Project | Result | Duration ms | Reruns |
|---|---|---|---|---|
| CS-44 AC01-03/05: 20/21 history boundary displays every immutable entry once | desktop | PASS | 998 | 0 |
| CS-44 AC02/03/06: distinct Event history is accessible to same organisation and denies foreign/Attendee | desktop | PASS | 865 | 0 |
| CS-44 accessibility: keyboard arrows switch and focus request tabs without losing Draft input | desktop | PASS | 60783 | 0 |
| CS-44 AC01-03/05: 20/21 history boundary displays every immutable entry once | mobile | PASS | 1051 | 0 |
| CS-44 AC02/03/06: distinct Event history is accessible to same organisation and denies foreign/Attendee | mobile | PASS | 787 | 0 |
| CS-44 accessibility: keyboard arrows switch and focus request tabs without losing Draft input | mobile | FAILED | 70926 | 0 |

Machine-readable results and HTML/failure screenshots are retained with the run's evidence. The normal, failure and boundary expectations in the named browser cases remain explicit. Earlier failed attempts are retained. Main story specifications remain in tests/specs and tests/records/CS-44/test-cases.md.
