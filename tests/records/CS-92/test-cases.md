# CS-92 test cases

Stable case inventory. Current preconditions, steps, data and assertions remain in the [Sprint 4 case sheet](https://docs.google.com/spreadsheets/d/1n7kRH5iPyHaxj5Rs41f53Shbn6TX-KXCdE7JcP9gQB8/edit#gid=1680394087&range=F163:U179). The [execution map](../../../docs/sprint4-venue-test-map.md) links each executable source; the [API contract](../../../docs/api-contract.md) reconciles historical route/status wording. Results belong in dated execution records.

| Case | Acceptance | Scenario |
|---|---|---|
| TC-CS92-01 | AC3, AC4 | Replacement approved |
| TC-CS92-02 | AC6 | Confirmed event: Organiser and Attendees told |
| TC-CS92-03 | AC1, AC2 | From notification to pre-filled search |
| TC-CS92-04 | AC1 | Only the assigned Coordinator rebooks |
| TC-CS92-05 | AC5 | Replacement rejected |
| TC-CS92-06 | AC2 | Too-small replacement |
| TC-CS92-07 | AC2 | Replacement window touching vs 1-min overlap |
| TC-CS92-08 | AC3 | Requesting a replacement keeps the original visible and the event unchanged |
| TC-CS92-09 | AC6 | Approved replacement invalidates Safety approval |
| TC-CS92-10 | AC7 | Restore and replacement approval race give one effective arrangement |
| TC-CS92-11 | AC7 | Original restored, pending replacement withdrawn with audit |
| TC-CS92-12 | AC1 | Pre-fill carries layout, accessibility and facilities |
| TC-CS92-13 | AC3,AC4,AC5,AC6 | rejected alternatives retain the affected original; fresh approval atomically replaces only it and transfers primary location |
| TC-CS92-14 | AC7 | restoration requires explicit Coordinator withdrawal and Staff confirmation; no block-only restoration or duplicate history |
| TC-CS92-15 | AC4,AC6 | Reconfirmation compares the last confirmed venue round through unpublished approvals and a reverted alternative |
| TC-CS92-16 | AC3,AC4,AC5,AC7 | Expired replacement preserves lineage and cannot approve beside a restored original |
| TC-CS92-17 | AC4,AC6,AC7 | Completed replacement supports a later reviewed time change and Staff reapproval |
