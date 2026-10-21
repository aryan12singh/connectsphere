# CS-41 — GREEN-attempt-failed browser execution

Started UTC: 2026-10-21T07:41:42.693Z

Runner: Automated Playwright, real production Nuxt/BFF/Kong/Keycloak/auth/PostgreSQL; synthetic checked-in accounts only. This is not independent human review or PO acceptance. Authentication setup honours gateway429 backoff; Playwright reruns are disabled.

Source: 8480a3ade7fc5b7785de1932b741dc9f95f39879

Full run: 21 passed, 3 unexpected, 0 flaky, 12 skipped.

| Browser case | Project | Result | Duration ms | Reruns |
|---|---|---|---|---|
| TC-CS41-01: every line reports requested, available and shortfall with whole-request fulfilment | desktop | PASS | 29730 | 0 |
| TC-CS41-02: exact stock, one short and zero stock retain bounded availability | desktop | PASS | 17574 | 0 |
| TC-CS41-03: touching occupied windows consume no stock but a one-minute overlap does | desktop | PASS | 50649 | 0 |
| TC-CS41-04: stock five minus two reserved and one operationally unavailable leaves two | desktop | PASS | 45972 | 0 |
| TC-CS41-05: repeat availability checks return live timestamps without snapshots, reservations or outbox writes | desktop | PASS | 17005 | 0 |
| TC-CS41-06: another Event reservation makes an earlier sufficient dated check stale | desktop | PASS | 33768 | 0 |
| TC-CS41-07: two venue allocations count the Event quantity exactly once | desktop | PASS | 25106 | 0 |
| TC-CS41-08: only Support may check supply or change operations; denied calls preserve state | desktop | PASS | 25033 | 0 |
| TC-CS41-09: overlapping operational unavailability retains reservations and invalidates current proof | desktop | PASS | 17387 | 0 |
| TC-CS41-10: invalid operations write nothing and exact command retries create one operation | desktop | PASS | 17205 | 0 |
| TC-CS41-16: staff review detail no longer shows venue allocation portion | desktop | PASS | 50948 | 0 |
| TC-CS41-17: equipment availability table shows venue column with venue name | desktop | PASS | 68046 | 0 |
| TC-CS41-18: venue column also shows when request is reserved | desktop | PASS | 72937 | 0 |
| TC-CS41-11: Support availability UI shows dated line results and survives refresh and service restart | desktop | PASS | 134106 | 0 |
| TC-CS41-15: technical request queue and detail columns scroll independently on desktop | desktop | PASS | 127152 | 0 |
| TC-CS41-12: earliest setup and latest turnaround define the pooled period without a second buffer | desktop | PASS | 25498 | 0 |
| TC-CS41-13: private allocation projection supplies current versions and excludes an expired hold | desktop | PASS | 25045 | 0 |
| TC-CS41-14: stock is read-only in the stock tab and API inventory writes remain versioned | desktop | TIMEDOUT | 184337 | 0 |

Machine-readable results and HTML/failure screenshots are retained with the run's evidence. The normal, failure and boundary expectations in the named browser cases remain explicit. Earlier failed attempts are retained. Main story specifications remain in tests/specs and tests/records/CS-41/test-cases.md.
