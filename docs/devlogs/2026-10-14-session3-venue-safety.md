# Session 3 venue and Safety reconciliation — 14 October 2026

Branch: `feat/aryan-sprint3-venue-safety`; base `57a713b`. Source: [customer answers](../session3-decisions.md), sheet G8, answer column C. This phase implements the clear independent venue/Safety requirements and updates Jira; it does not close the stories or create a pull request.

## Delivered behavior

- CS-87: current assigned Coordinator chooses an active, suitable primary attendee location in Planning. The independent selection version and booking version prevent stale updates; Event/venue locks serialize concurrent work; durable selection and immutable history commit together. Other room approvals are retained. Expiry is checked again after asynchronous conflict reads. The Coordinator UI uses the real authenticated BFF route and authoritative summary; selection does not publish the Event.
- CS-84: a durable Venue-owned buffer fence is established before Booking commits a confirmation. Version/row locking prevents a concurrent buffer edit from bypassing the fence. Later buffer edits fail; unrelated venue details remain maintainable. Lost acknowledgement leaves the hold unchanged and the Venue conservatively locked; a refreshed retry is idempotent. Legacy rows are frozen by the additive migration until their initial configuration policy is reviewed.
- CS-94: all seven Safety factors must be acknowledged as reviewed. Actionable comments and private internal notes are separate. Reject identifies known venue arrangements and does not represent rejection of the whole Event.
- CS-95: Organiser feedback shows the outcome and actionable comments only. Coordinator resubmission requires review proof bound to the current round/revision and current readiness; approval resets are not automatic.
- CS-76/77/96 and affected peer cards: 45 Jira descriptions received source-row requirements and explicit precedence over contradictory earlier drafts. Existing descriptions/media, assignees and statuses were read back. Two descriptions were normalized by Jira by removing local HTML IDs; their content was preserved.

## Validation and evidence

Behavioral RED runs reproduced missing primary selection, incomplete Safety checklist acceptance, missing Coordinator-review gating, unsuitable primary selection, post-confirmation buffer edits and expiry during a conflict scan. GREEN regressions follow each fix. Source cases and dated execution records are under `tests/records`.

| Check | Result |
| --- | --- |
| Full frontend suite with coverage | 327/327; statement coverage 76.13%, branch 74.55% |
| Frontend and browser TypeScript checks | Passed |
| Venue unit / HTTP / PostgreSQL | 43/43; 11/11; 10/10 |
| Booking unit / HTTP / PostgreSQL | 35/35; 14/14; 16/16 |
| Actual legacy migration probe | Existing values, version and history retained; existing Venue fence established |
| Independent code audit | Three confirmed findings reproduced, fixed and independently rechecked; no remaining P1/P2 in the changed scope |
| Production build / real browser / restart | Production build passed; 68/68 desktop/mobile browser checks, 11/11 live-service checks, 1/1 restart check; no skips or flaky results |

The final full local frontend run used one worker to avoid resource contention with Docker on the development machine. Earlier diagnostics without required test environment values, and an overlapping local stack startup/authentication timeout, are retained outside Git and are not passing evidence. Actual isolated database tests use synthetic fixtures; no shared project database was changed.

CS-36/39/86 regression fixtures were reconciled with the new buffer restriction: explicit historical snapshots test inherited rechecks and old booking windows; they no longer use a prohibited post-confirmation buffer edit as fixture setup. New buffer cases use TC-CS84-31–34; early diagnostic IDs18–21 were provisional and are reconciled to31–34, preserving the original deletion case18. Live CS-87-25 extends the established independent-room workflow with persisted primary selection and locked-buffer denial.

Raw local logs: `/tmp/connectsphere-session3-20261014/`. Final production-stack evidence: `/tmp/connectsphere-s3-session3-verified-live-20261014/evidence/`. Full JSON, coverage trees and browser media stay outside Git; compact test records and this devlog provide traceability.

## Remaining gates

- CS-76: customer rows4/6 disagree on locking at first setting versus confirmation; initial legacy configuration needs a decision. Existing venues are conservatively protected, not declared accepted. Row10 still needs confirmation whether the Coordinator request is the stated confirmation action. Team must ratify numeric limits/hold timing, overall registration/room allocation and cross-Lead scope.
- CS-10/42/77: real Officer authorization, versioned Safety queue/commands, server-side redaction, current technical proof and Event lifecycle are peer integration dependencies. Safety before Confirmed, then separate Preparation, is now confirmed customer policy. Local intents do not persist a Safety decision or change Event state.
- CS-47/48/53 and shared Event projection: expose the eligible primary location to Attendees and every room/status to Organisers using the actual publication/authorization contract.
- CS-50/51/90: notification delivery and production hold expiry/reminder scheduling remain distinct from retained outbox intent and the existing spike.
- Deploy both additive service schemas and compatible Venue/Booking versions together. Do not automatically unlock a Venue after an uncertain confirmation; retry/reconcile it under the agreed policy.
- Team review, final integration, main CI/merge, manual walkthrough and PO acceptance remain separate from this feature-branch verification.
