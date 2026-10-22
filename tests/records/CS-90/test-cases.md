# CS-90 test cases

Stable case inventory. Current preconditions, steps, data and assertions remain in the [Sprint 4 case sheet](https://docs.google.com/spreadsheets/d/1n7kRH5iPyHaxj5Rs41f53Shbn6TX-KXCdE7JcP9gQB8/edit#gid=1680394087&range=F121:U136). The [execution map](../../../docs/sprint4-venue-test-map.md) links each executable source; the [API contract](../../../docs/api-contract.md) reconciles historical route/status wording. Results belong in dated execution records.

| Case | Acceptance | Scenario |
|---|---|---|
| TC-CS90-01 | AC2, AC3 | Unapproved hold expires |
| TC-CS90-02 | AC5 | Approved before expiry |
| TC-CS90-03 | AC4 | Resubmit an expired request |
| TC-CS90-04 | AC4 | Expired request can't be approved |
| TC-CS90-05 | AC2 | Freed slot is bookable by others |
| TC-CS90-06 | AC1 | Extension after reminder reschedules everything |
| TC-CS90-07 | AC2, AC4 | Approval around the expiry instant |
| TC-CS90-08 | CS-44 AC1 (+W7); 44-09 (New) | Hold extension and expiry logged |
| TC-CS90-09 | CS-34 AC1 (+W7); 34-08 (New) | Expired hold shows as free |
| TC-CS90-10 | AC1, AC6 | 24-hour warning sent once and logged |
| TC-CS90-11 | AC1 | Short hold warns immediately |
| TC-CS90-12 | AC7 | Approval and expiry race have one winner |
| TC-CS90-13 | AC7 | Worker restart doesn't duplicate expiry or notice |
| TC-CS90-14 | AC1 | Warning goes to the current Coordinator after reassignment |
| TC-CS90-15 | AC7 | Expiry doesn't cancel the event or release equipment |
| TC-CS90-16 | AC3,AC4,AC7 | an expired hold resubmits to a distinct freshly checked request and no longer blocks readiness as an unresolved old request |
