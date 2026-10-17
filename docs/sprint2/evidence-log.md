# Sprint 2 evidence log

Collected 7–8 October 2026, Asia/Singapore. Tested **main `46a2bf305c68273149ee60d43cf2d11ef5f95941`**, application tree `7826f251e2623a1a1fcf1cf2c91ffe4fdc8095fc`. [PR #7](https://github.com/aryan12singh/connectsphere/pull/7) is merged. The original evidence checkpoint changed documentation and records only; this historical index is preserved on the Sprint 3 branch.

This is the dated Sprint 2 verification record, not a current Sprint 3 backlog
snapshot. Later consolidation/readiness is linked on [CS-96, comment 10177](https://spmg8.atlassian.net/browse/CS-96?focusedCommentId=10177).
CS-28/72 are superseded by CS-12/69, CS-89 by CS-37, CS-82 by CS-30 and CS-80 by
CS-10. The newest [DEVLOG entry](../devlogs/DEVLOG.md) records the actual active
Sprint 3 state. Earlier figures/statuses below remain historical evidence.

## Shared artifacts

[CS-96 artifact comment](https://spmg8.atlassian.net/browse/CS-96?focusedCommentId=10157) holds the consolidated evidence Word document, editable two-week Scrum meeting template, complete evidence ZIP and both case indexes. The ZIP contains 177 named images (35 actual UI, 142 labelled test/SQL/CI report views), 127 baseline case records, 310 prospective Week 7 specifications, read-only query/CSV results and clean source logs. The Word document copies every Sprint 2 story's Jira AC/test tables and maps the rows to evidence by scenario.

Extract the ZIP and open `evidence/index.html`; its static result pages work without the application. `ScreenshotIndex.csv` gives image names/capture times and `JiraEvidenceLinks.csv` gives the 16 evidence comments and 30 embedded images. `SHA256SUMS.txt` checks the shared files. Archive SHA-256: `ba4660113f1bb44959ad2e48f9f517bdfcb423f5b5fcb2a18039b7e0c35b08ce`.

Application screenshots, controlled test assertions, generated views of actual SQL/results and human acceptance are labelled separately. Short Jira table IDs (such as 11-02) and repository IDs (such as TC-CS11-02) are separate catalogues. Numeric suffixes do not establish equivalence. Outbox persistence does not prove notification delivery. No production data was used.

## Verification summary

| Layer | Result | Evidence and limit |
|---|---|---|
| Fresh frontend | 130/130 | Component/BFF tests; deterministic identity/forwarding fixtures, real Event PostgreSQL |
| Fresh Event | 132/132 | Unit/domain/harness plus PostgreSQL HTTP suite |
| Fresh Auth/User/Venue/Booking | 124/124 Node tests | Auth 27, User 11, Venue 46, Booking 40; includes service PostgreSQL suites |
| Fresh Venue/Booking HTTP contracts | 25/25 | Venue 11, Booking 14 controlled HTTP checks |
| Fresh built full-stack smoke | 11/11 | Nuxt, Kong, Keycloak, services and PostgreSQL |
| Fresh retained-ID restart | 1/1 | Same draft/request/Event and history, without reseeding; operational block survives booking restart |
| Supplemental real HTTP/DB probes | 15 Pass, 1 Fail | Missing CS-30 reassignment command; separate UI inspection fails CS-28 Planning Reject entry point |
| Hosted main CI | 8 successful jobs; 46 expected browser cases | [Run 37605379263](https://github.com/aryan12singh/connectsphere/actions/runs/37605379263), same main SHA, 7 October desktop/mobile, zero skipped/flaky cases |
| Production builds and frontend typecheck | Pass | Preserved logs and main CI; no application changes in this branch |

The fresh automated total is **411 passed** before the separate live smoke/restart/probes. Frontend coverage: statements 70.13%, branches 65.67%, functions 66.76%, lines 73.93%. These measured values do not invent an agreed coverage gate. Individual tests retain the named assertion/layer; the historical complete TC-CS11-22 case remains Not Executed, with related hosted coverage labelled separately.

## Story evidence and remaining gates

| Story | Main behavior and evidence | Remaining scope or acceptance |
|---|---|---|
| [CS-10](https://spmg8.atlassian.net/browse/CS-10?focusedCommentId=10141) | Five role homes, sealed session, generic denial, logout/expiry and multi-role UI | Marc retains manual/PO/reviewer gates; board In Progress |
| [CS-11](https://spmg8.atlassian.net/browse/CS-11?focusedCommentId=10142) | Same-ID save/submit, required fields, distinct Event, read-only view; DB01 | Done with previously confirmed manual/PO/reviewer and venue/layout wording acceptance |
| [CS-12](https://spmg8.atlassian.net/browse/CS-12?focusedCommentId=10143) | Assigned review and approval, private denial, idempotency/outbox; DB01/03 | Javier must reconcile draft modal expectation and human gates; board To Do |
| [CS-26](https://spmg8.atlassian.net/browse/CS-26?focusedCommentId=10144) | Public signup, separate login, staff-role denial and permissions; DB07 | Marc retains manual/PO gates; Week 7 roles are future scope |
| [CS-27](https://spmg8.atlassian.net/browse/CS-27?focusedCommentId=10145) | Returned comments, unchanged guard, attendance 150→175, same-ID resubmit/history; DB02 | Done with previously confirmed human acceptance |
| [CS-28](https://spmg8.atlassian.net/browse/CS-28?focusedCommentId=10146) | Return/submitted rejection and Planning rejection API, notes/history/outbox; DB03 | Planning Reject UI action is absent; keep incomplete |
| [CS-29](https://spmg8.atlassian.net/browse/CS-29?focusedCommentId=10147) | Private incomplete Draft, same-ID submit and retained-ID restart; DB01 | Done with previously confirmed human acceptance |
| [CS-30](https://spmg8.atlassian.net/browse/CS-30?focusedCommentId=10148) | Persisted fair automatic assignment, queue and contact; DB04 | Change coordinator disabled; no reassignment route/effects; current-access/concurrency behavior still required |
| [CS-32](https://spmg8.atlassian.net/browse/CS-32?focusedCommentId=10149) | Current request guard, distinct Request APPROVED/Event ARRANGEMENT_PENDING and Planning label | Full later lifecycle and CS-31 confirmation/readiness consumers remain future integrated work |
| [CS-33](https://spmg8.atlassian.net/browse/CS-33?focusedCommentId=10150) | Created venue, capacity 150→175, catalogue/hours validation; DB05 | Existing Done preserved; this evidence does not invent new peer PO acceptance |
| [CS-34](https://spmg8.atlassian.net/browse/CS-34?focusedCommentId=10151) | Week/day calendar, block visibility, read-only Support, controlled range checks; DB06 | Existing Done preserved; screenshot scope differs from controlled fixtures |
| [CS-35](https://spmg8.atlassian.net/browse/CS-35?focusedCommentId=10152) | Create/reopen/end operational block with actor/time/reason; DB06 | Existing Done preserved; conflict guarantee is limited to the exercised layer |
| [CS-44](https://spmg8.atlassian.net/browse/CS-44?focusedCommentId=10153) | Newest-first immutable history with actor/time and old/new values; DB02 | Done with previously confirmed acceptance of legitimate system/edit actions; no fixed total of three |

CS-15/68/73 retain Done with fresh CI/testing evidence comments. CS-71 is the **database seed task**, not an acceptance-report task. CS-17/22/69/72/74 keep their owners/statuses and require artifact/checklist review; design foundations in the retro are not card-by-card acceptance. CS-70 instructor access remains a final-submission gate.

## Week 7 reconciliation and next sprint inputs

The latest `New Stories AC  Test Cases.docx` appends 205 rows: 199 active cases imported to 23 actual Jira story owners plus six CS-30 retirement proposals. The earlier 111 cases remain, giving 310 unique prospective IDs, all Not Executed. `Week7CaseMapping.csv` preserves source IDs, actual owners, AC, scenario, data, assertions and limitations. The other three supplied documents match their previous versions. All 20 new clarification answers remain blank.

The refresh corrects owner/alias collisions, unsupported venue override, mandatory-email and exact-payload assumptions, inclusive deadline and Safety boundary expectations. CS-12/26/30/32/44 baseline table expectations now reflect the accepted Planning label, atomic staff-signup rejection, assignment-history tie rule, future CS-31 confirmation coverage and legitimate history granularity. CS-28's omitted baseline table is covered by actual rejection/return evidence. Configured numeric fixture limits remain assumptions until an approved decision exists.

Six future stories (CS-93/94/95/31/47/51), 26 proposed points, moved from Sprint 4 to Sprint 3. Current forecast: Sprint 3 **23 stories/102 points + 5 tasks**; Sprint 4 **11 stories/52 points + 3 tasks**. Future sprint goals were updated; dates, estimates, existing owners and workflow states were preserved. This is a forecast, not a commitment or capacity calculation. Before starting, record owners, commitment versus stretch, prerequisite order, clarification answers, coverage policy and the same-day Sprint 2 end/Sprint 3 start cutover.

## Ongoing progress routine

Follow [DEVLOG](../devlogs/DEVLOG.md) every 2–3 days: story/AC/test, revision/PR, actual result and evidence, blocker, owner and next check. CS-96 tracks artifact publication and actual team adoption. CS-77 tracks PO-approved Figma annotations for requirements, UI edits and displayed data. The Word meeting template records ten actual daily updates plus planning, refinement, review, retro and transition. Attendance, PO decisions and adoption are blank until the team supplies them.

Use the [isolated replay recipe](../event-review-run.md) and the matching CI environment. Full logs/JSON/images stay in the shared archive or CI artifacts; only lean dated records are committed. Local runtime configuration and preserved synthetic database volumes remain outside the shareable archive. No reset/reseed was used in the retained-ID verification.
