# CS-84 — GREEN-attempt-failed browser execution

Started UTC: 2026-10-14T08:30:17.098Z

Runner: Automated Playwright, real production Nuxt/BFF/Kong/Keycloak/auth/PostgreSQL; synthetic checked-in accounts only. This is not independent human review or PO acceptance. Authentication setup honours gateway429 backoff; Playwright reruns are disabled.

Source: 10e4e91e58b68954326ba943cb5307ef5a9dbf90

Full run: 6 passed, 2 unexpected, 0 flaky, 0 skipped.

| Browser case | Project | Result | Duration ms | Reruns |
|---|---|---|---|---|
| TC-CS84-39 LIVE coordinated legacy buffers retain both approved bookings and flag inherited conflicts | desktop | FAILED | 1115 | 0 |
| TC-CS84-30 LIVE Staff buffer form persists an audited version without altering venue hours | desktop | PASS | 2123 | 0 |
| TC-CS84-39 LIVE coordinated legacy buffers retain both approved bookings and flag inherited conflicts | mobile | FAILED | 61516 | 0 |
| TC-CS84-30 LIVE Staff buffer form persists an audited version without altering venue hours | mobile | PASS | 1600 | 0 |

Machine-readable results and HTML/failure screenshots are retained with the run's evidence. The normal, failure and boundary expectations in the named browser cases remain explicit. Earlier failed attempts are retained. Main story specifications remain in tests/specs and tests/records/CS-84/test-cases.md.

Local source was a dirty checkout at the phase base; the adjacent source.json retains status and diff metadata. New files are included in the complete published commit verified by hosted CI; local source.revision alone is not the final delivery SHA.
