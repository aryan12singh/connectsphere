# Venue confirmation clarification — CS-37/38/76

17 October 2026. Aryan. Follow-up in [PR #13](https://github.com/aryan12singh/connectsphere/pull/13)
on `chore/cs79-coverage-gates`, after coverage checkpoint `091190c`.

## Decision and effect

The PO/team reply relayed by Aryan at 17:39 SGT describes a tentative/soft-hold
request followed by Venue Staff review on “S3-13a Review booking request —
approve / reject with reason.” Aryan explicitly confirmed that no additional
Coordinator Confirm button is required. This resolves Q2 and supersedes earlier
pending wording. The original Session 3 row10 transcript remains unchanged.

The existing flow matches: Coordinator request creates `TENTATIVELY_HELD` v1;
Staff approval confirms that venue booking as `CONFIRMED` v2. No new booking
state, endpoint, migration or Coordinator acknowledgement is introduced.
Whole-Event confirmation remains a separate Safety/readiness-gated action.
Booking's summary no longer advertises `COORDINATOR_CONFIRMATION_ACTION` as
pending. The timing defaults retain their separate team-agreed provenance.

## Actual local verification

Node 22.23.3 and fresh migrated PostgreSQL 16 databases. The focused regression
first failed only on the obsolete pending-policy metadata (18/19 passed); the
corrected full frontend run passes 386/386, including CS-37 25/25 and CS-38 19/19.
Booking unit 35/35, actual PostgreSQL 18/18 and HTTP contracts 14/14 pass with
coverage floors unchanged. Both typechecks and production build pass.

TC-CS38-01 proves held versus approved readiness and an unchanged Planning
Event. New TC-CS38-23 checks actual saved rows, exactly Coordinator creation +
Staff decision activity and one approval intent. Upstream assignment/venue
fixtures in that database test are explicit. TC-CS38-30 is strengthened to show
the tentative and approved Coordinator room, no extra confirmation control,
Staff reason/decision, delivered inbox item and unchanged Event database state
on desktop/mobile. Its hosted execution is recorded by the current PR checks;
the local results above do not claim that browser execution.

Source-linked [CS-37](../../tests/records/CS-37/test-runs/2026-10-17-Q2-GREEN.md)
and [CS-38](../../tests/records/CS-38/test-runs/2026-10-17-Q2-GREEN.md) records
retain execution layers. Raw reports and the initial metadata RED stay outside
Git in `sprint3-evidence/2026-10-17-q2-confirmation`. An initial disposable-DB
startup probe reached PostgreSQL's temporary initialization server; waiting for
TCP readiness fixed the external setup harness. It did not require a product
change, test skip, coverage reduction or database reset.

## Remaining

Independent review, squash merge and green CI on the resulting main commit
remain required. Q2 is resolved; CS-37/38 still need their actual manual/PO/
author-walkthrough acceptance records. The nine previously accepted stories
retain their recorded acceptance. Model review, spike timebox/review, planning
records and team adoption remain separate unconfirmed tasks.
