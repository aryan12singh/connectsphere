# Venue and Safety review preparation — 14 October 2026

Branch: `feat/aryan-sprint3-venue-safety`; phase base `d4c40a9`. This phase
finishes the independently actionable review/evidence preparation. It does
not supply teammate signatures, PO acceptance or the pending Coordinator
confirmation decision (Q2).

## Delivered and corrected

- Reconciled the current CS-93/94/95 acceptance tables with Session 3:
  Safety before Confirmed, separate Preparation, seven reviewed factors,
  actionable Organiser comments versus private notes, scoped Coordinator
  rework without automatic sign-off resets, and rejection of the venue
  arrangement while the Event remains Planning. Original source proposals
  and dated execution records remain historical.
- Added the eight-story venue walkthrough, CS-74 model review and CS-78
  clock/spike review agenda in [the reviewer packet](../sprint3/reviewer-walkthrough.md).
  Human reviewer, timebox and acceptance fields remain blank.
- Added [nine screen annotation packs and the async routine](../sprint3/progress-and-design-handoff.md).
  The open native Figma file permits viewing and comments; its connector
  account cannot edit. Published and read back four requirements comments
  on pages 11, 12, 13 and 15. Existing canvas frames/spec notes are intact;
  PO/design acceptance and team adoption are still pending.
- Established private progress/evidence checks for 17 and 20 October at
  18:00 Singapore time. These check stale evidence and actionable changes;
  they do not send teammate reminders or establish team adoption.
- Independent review reproduced an invalid-timezone defect: Venue accepted
  `Asia/Singapor`, after which valid bookings failed the hours check. Create
  and full-replace now reject unsupported identifiers before any mutation.
  Real browser verification also exposed the Nuxt BFF's nested error envelope;
  both edit/create pages now display its field guidance and preserve inputs.
  Swagger documents the supported-timezone requirement and 422 response.
- Venue listing now pages actual six-card slices, resets/clamps on search
  and catalogue changes, and preserves selection. History expands/collapses
  actual records, resets by venue, exposes accessible state and remains
  disabled before hydration. These replace previously inert controls.
- The first full hosted run at `f79eb6a` passed73/74 browser cases but exposed
  a mobile retry defect: the previous validation toast covered Continue in
  the reason popover. Both Venue save handlers now keep usable422 field
  validation in the form, with a visible alert for uncovered/indexed keys,
  closed-popover reason errors and additional messages. Network, permission,
  conflict, service and malformed validation failures retain generic alerts.
  The strengthened browser case uses normal immediate corrective clicks,
  requires no validation toast and retains the actual SQL assertions.

## Verification

| Layer | Final observed result |
| --- | --- |
| Full frontend suite, Node 22.23.3 | 353/353; zero pending, failures or skips |
| Frontend coverage | Statements 77.65%, branches 75.88%, functions 76.5%, lines 78.81% |
| Frontend/browser TypeScript and production build | Passed |
| Changed-controls real production browser | 8/8 desktop/mobile; zero failed, skipped or flaky |
| Other venue production workflows | 22/22 in the broader local run |
| Live-service / restart | 11/11 and 1/1 |
| Independent Venue / Booking unit checks | 43/43 and 35/35 |
| Independent CS-78/85 domain / real PostgreSQL spike | 54/54 and 10/10 |
| Prisma schemas / scratch-schema cleanup | Both validate; no CS-78 scratch schemas remain |
| Final independent review | No remaining confirmed issue in this changed scope |
| Retry correction / independent re-review | TC-CS33-16 focused6/6 and full CS-33 independently21/21; real production8/8 |

The new browser assertions require successful BFF combined-history responses
and check actual PostgreSQL versions/history counts. Invalid edits leave both
unchanged; correction succeeds and persists. Blue cases TC-CS33-12–15 and
their observed RED/GREEN records preserve the behavioral checks. Browser
evidence is automated verification, not a human acceptance signature.

Earlier local attempts with incomplete harness environment, a wrong history
fixture and overlapping service restarts/builds are retained as diagnostics.
The corrected standalone controls run passes all eight cases; the other 22
venue cases passed. This is not represented as a single clean local 30/30 run.
The first hosted run's73/74 result is retained as a real defect reproduction,
not called green. One local retry-suite launch inherited the development
authentication profile and failed three isolated CS-10 fixture checks; the
correct CI test profile (`NUXT_AUTH_MODE=mock`) passes353/353 while the real
browser stack separately uses live authentication. No production assertion
was weakened. The new TC-CS33-16 RED records expose the toast decision and
hidden field messages before the correction.

Hosted CI must run the full unfiltered 74-case browser suite against the pushed
commit; the exact run/SHA and final outcome are recorded on Jira and in the
external evidence package.

Raw logs, browser results, coverage and screenshots stay outside Git under
`PROJECT/sprint3-evidence/2026-10-14-review-preparation/`; compact test records,
review instructions and this report remain in the repository. Local sources
were verified with the phase-base SHA plus the captured worktree diff; hosted
verification identifies the final immutable revision.

## Remaining gates

- Q2: whether the Coordinator booking request itself counts as confirmation.
- Marc CS-10, Alan CS-42 and Javier CS-77: live Safety authorization, technical
  proof, current rounds/commands/privacy and Event lifecycle integration.
- Marc CS-50/51: actual notice delivery; CS-90: expiry/reminder deployment and
  scheduler/recovery. Venue expiry correctness is verified independently.
- Actual teammate model/spike review, agreed spike timebox, PO/design adoption,
  human venue acceptance, reviewed main merge/CI and story acceptance.

The branch is prepared for those reviews. No PR is opened by this phase and
no ticket is marked Done on the basis of automation alone.
