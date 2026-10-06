# Verification state

Candidate source has108/108 frontend tests,117/117 event domain/real-PostgreSQL tests,50/50 venue unit/HTTP tests and46/46 booking unit/HTTP tests passing. Final whole browser and remote CI verification is in progress; no release-ready result is inferred from an earlier partial browser attempt. Automated results are agent-run, and independent review/manual acceptance remains separate.

The dated main story records preserve RED failures and failed GREEN attempts. Browser records add actual production desktop/mobile integration. Authentication setup follows the unchanged Kong login rate limit; no Playwright retries or skipped cases are permitted. Only disposable synthetic credentials, sessions and isolated database rows are used.

| Story/AC | Observable behavior and evidence | Remaining acceptance gate |
|---|---|---|
| CS-11 AC1–2 | All request categories/registration; shared validator with field errors and no failed persistence; corrected required cues and unique label targets | Confirm exact C02 matrix against G8 answers |
| CS-11 AC3–5 | Unique persisted ID/owner/timestamp/receipt; same owner reopens; foreign denied; Submitted inputs/API read-only | Independent manual/PO review |
| CS-11 AC6–7 | Concurrent replay yields one request; transactional assignment and pending notification outbox | Independent review; actual CS-50 delivery is separate |
| CS-29 AC1–3 | Purpose-only private Draft; saved values resume; no assignment before publish; same ID submits | Independent review |
| CS-29 AC4–5 | Unsaved Stay/Leave; failed validation/outage preserves stored version and typed input; recovered save once | Independent browser/manual review |
| CS-27 AC1–3 | Return comments shown/escaped; unchanged/invalid denied; shared validator; old/new edits captured | Independent review |
| CS-27 AC4–6 | Saved Returned amendment then same-ID/Coordinator resubmit; queue eligibility; rejected/foreign denied; one revision action | Independent review/PO |
| CS-44 AC1–3 | Readable actor/time/old-new entries, immutable authorized Request and distinct Event history | Agree granularity example; independent review |
| CS-44 AC4–6 | Closed-state history retention fixtures;20/21 pagination; secrets/foreign/Attendee denied; keyboard tabs retain input | Human accessibility/PO acceptance; closed-state transition endpoints later |

Fresh migrations, upgrade preservation and restart proof belong to different checks; a seed/build alone proves none of them. The earlier exact-main upgrade digest proof applies to unchanged migrations, and the new full-stack restart run must retrieve the same saved IDs without reseeding.
