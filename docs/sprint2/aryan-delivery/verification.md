# Verified branch delivery

**CS-11, CS-27, CS-29 and CS-44 have implemented workflows and passing automated end-to-end evidence on this branch.** The verified application revision is `25dd084548d29648aa3079ade62697c93f84e040`. [GitHub run 37515969069](https://github.com/aryan12singh/connectsphere/actions/runs/37515969069) completed successfully on 7 October 2026 at 03:14 SGT, with both regression and live-stack jobs green.

| Check | Verified result | Scope |
|---|---|---|
| Frontend | 109/109, no pending/skipped tests; typecheck and production build pass | Main story component/API specifications, including preserved login and venue regressions |
| Event service | 122/122 | 107 unit/domain/harness plus 15 real PostgreSQL integration tests; build and fresh migrations |
| Venue service | 52/52 | 42 unit plus 10 HTTP contracts |
| Booking service | 48/48 | 34 unit plus 14 HTTP contracts, including ordinary-create denial and staff operational windows |
| Production browser | 22/22, zero failures, skips, flaky cases or reruns | 11 desktop and 11 mobile Chromium cases; real Keycloak/Kong/BFF/PostgreSQL |
| Live API smoke | 10/10 | Actual authentication, sealed sessions, privacy, Draft/submit/return/resubmit/approval and venue/booking integration |
| Restart persistence | 1/1 | Same saved Draft/request/Event link and history after six application services restart; new session; no reseed |

Measured service coverage (lines / branches / functions): Event **98.84 / 93.44 / 96.08%**, Venue **82.42 / 90.04 / 78.67%**, Booking **79.57 / 90.64 / 78.29%**. These Node aggregate percentages include test files and startup-imported routes; the Python HTTP coverage is not combined. No frontend coverage percentage is claimed. Previous measurements retain their original scope in the historical evidence.

The fresh GitHub browser job captured a clean checkout of that revision, Node **22.23.3** and an empty source diff. A separate earlier local committed-revision run at b9e1760 also passed all 22 browser cases, live 10/10 and restart 1/1; it predates the subsequent startup and smoke-setup repairs. Local browser driving used Node 26.8.2; local builds/tests used Node 22. Database-reset API suites finished before the final local browser/restart run. The GitHub jobs use separate databases.

Raw JSON/HTML/logs are available in the run's **request-regression-evidence** and **live-browser-evidence** artifacts and the local overnight evidence folder. [Portable CI summary](evidence/ci-37515969069.json) preserves the result and source identity; dated main and browser records are committed under `tests/records`. Earlier RED failures, failed GREEN attempts and CI setup/restart failures remain retained, rather than being counted as successes. The [startup and rate-limit repairs](ci-startup-repair.md) retain the failed publication runs and their RED/GREEN evidence. The startup callbacks no longer hide bind failures, HTTP tests use actual OS-assigned ports, and smoke login handles only429 with a bounded setup backoff. Business/workflow failures and writes are not retried. The earlier [b9e1760 successful summary](evidence/ci-37510266839.json) remains historical evidence for that revision. The final publication adds documentation and execution records to this tested application/CI source; [latest branch checks](https://github.com/aryan12singh/connectsphere/actions?query=branch%3Afeat%2Faryan-sprint2-event-workflows) identify its publication revision.


| Story/AC | Observable implemented behavior | Remaining acceptance gate |
|---|---|---|
| CS-11 AC1–2 | Full request/registration fields; one server validator; field errors and no failed persistence; required cues and unique label targets | Confirm exact C02 venue/layout interpretation against G8 answers |
| CS-11 AC3–5 | Persisted unique ID, owner, Submitted timestamp/receipt; owner reopens; foreign reads denied; Submitted inputs/API read-only | Independent manual/PO review |
| CS-11 AC6–7 | Concurrent replay yields one request; transactional activity, assignment and pending notification outbox | Independent review; actual notification delivery is separate CS-50 work |
| CS-29 AC1–3 | Purpose-only incomplete private Draft; saved values resume; no pre-submission assignment; same ID submits | Independent review |
| CS-29 AC4–5 | Unsaved Stay/Leave; failed validation or actual service outage retains saved version and typed input; recovered retry saves once | Independent browser/manual review |
| CS-27 AC1–3 | Return comments displayed/escaped; unchanged or invalid resubmit denied; shared validation; old/new amendments recorded | Independent review |
| CS-27 AC4–6 | Same ID/Coordinator and revision time on resubmit; eligible Coordinator queue; rejected/foreign edits denied; replay adds one action | Independent review/PO |
| CS-44 AC1–3 | Readable actor/time/old-new entries; immutable authorised Request and distinct Event history | Agree granularity of the example count; independent review |
| CS-44 AC4–6 | Closed-state retention fixtures; 20/21 pagination; no secrets or foreign/Attendee access; hydration-safe arrows/Home/End and retained input | Human accessibility/PO acceptance; closed-state transition endpoints belong to later work |

The booking permission repair is a supporting regression fix. Staff retain BLOCKED/UNAVAILABLE creation and existing decisions; ordinary booking creation requires the canonical create permission. Both live UI cases additionally recreate the booking container and require the same booking values and unchanged history through the BFF. The local Compose gateway bounds DNS cache/stale windows to five seconds after observed stale-address routing. Tabs remain disabled in server HTML until client keyboard handlers are ready. These fixes follow the observed failing cases; passing expectations were not removed.

Fresh migrations, exact-main upgrade preservation and application restart persistence are separate evidence. The earlier exact-main upgrade digest proof remains applicable because this pass does not alter migrations; the new fresh-stack and restart checks prove their own scopes. Completed/Cancelled retention is tested with persisted closed-state fixtures, rather than claiming new cancellation/completion endpoints.

**Jira remains In Progress.** Automated agent-run evidence does not fulfil independent developer approval, required human manual cases, merged-increment CI, Aryan's code understanding or PO acceptance. C02 and activity granularity remain explicit review decisions. CS-67/70's remaining evidence is in the [finish plan](finish-plan.md). Inherited dependency advisories remain in the [dependency audit](dependency-audit.md); green functional CI does not mean zero advisories. Week 7 requirements remain future scope.


A later [effective-permission amendment](permission-hardening.md) fixes the standing-rule gap demonstrated by new RED tests. Local checks now pass frontend111, Event129 and live11; the source above and its counts remain the historical pre-amendment CI result until the new source is verified remotely.
