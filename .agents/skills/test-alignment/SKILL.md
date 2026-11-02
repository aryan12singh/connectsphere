---
name: test-alignment
description: Use when ConnectSphere spreadsheet test cases, tests/records test-cases.md, and unit, integration, or E2E test implementation need to be reconciled or verified.
---

# Test alignment

Keep each test case consistent from the spreadsheet through the repository specification to the executable test at its required layer. A matching case ID or test-file link alone is not proof that the behaviour is covered or has passed.

## Sources and scope

- Work from the `connectsphere` Git root. The project [test-case spreadsheet](https://docs.google.com/spreadsheets/d/1n7kRH5iPyHaxj5Rs41f53Shbn6TX-KXCdE7JcP9gQB8/edit) is a workbook with multiple tabs. Search its tabs for the requested work-item key and case IDs, then read the current rows and merged requirement/AC cells through the connected spreadsheet tool when available. Do not assume a sprint tab, fixed row range, or fixed cell coordinates.
- **The spreadsheet is reference-only and strictly read-only in this workflow.** You may open, search, filter, and inspect workbook contents. Never make a workbook change, even when asked to align or update it: do not edit cell values or formulas, formatting, comments, notes, links, protections, sharing, or sheet/row/column structure. This applies through every access method, including spreadsheet connectors, browser UI, APIs, and CLI tools. If asked to change the workbook, leave it untouched and provide the exact proposed changes in your response; edit repository records only when requested.
- The repository specification is `tests/records/CS-<number>/test-cases.md`. For records created or aligned by this skill, use the seven-column case table: ID, scenario, preconditions, **Test Layers**, expected result, automated evidence, and creation date. Keep historical mappings and dated execution checkpoints distinguishable from the current specification.
- In **Test Layers**, give each required layer its own bold label (`**Unit**`, `**Integration**`, `**E2E**`) and put a `File:` line immediately below it. Use the exact repository-relative test file path when implemented; use `File: TBD` as the placeholder until a file exists. Keep the layer's key actions, data, and assertions below that line so the record remains a behavioural specification. Separate lines and layers with `<br>` inside the table cell. A file placeholder is an outstanding obligation, not implemented or passed evidence.
- Search executable tests by case ID and behaviour, not just work-item-named files. Likely locations are `services/*/tests/unit`, `services/*/tests/integration`, `tests/specs`, and `frontend/e2e`. Ignore `frontend/tests`; it is not a test location for this workflow. Read each relevant package's scripts and the repo test guidance before choosing a runner.
- Jira requirements and accepted ACs govern product behaviour. Jira is **read only** for this skill: inspect issues and ACs, but never create, edit, comment on, or transition Jira work items. Treat spreadsheet additions labelled proposed as proposed until accepted; do not silently promote them to Jira ACs. If sources disagree on a material rule, record the exact conflict and seek a decision rather than changing an expected result by guesswork.

## Example record

This row is illustrative; it is not a case to implement. Replace each `File: TBD` with the exact file handling that layer for the actual case, and use the real case ID, actions, evidence, and creation date.

| Test Case ID | Scenario | Pre-conditions | Test Layers | Expected Result | Automated evidence | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-SAMPLE-01 | Authorized record details | Eligible persisted record; authorized user signed in | **Unit**<br>File: TBD (`services/{service}/tests/unit/{file}.test.js`)<br>Check permitted-field selection.<br><br>**Integration**<br>File: TBD (`services/{service}/tests/integration/{file}.test.js`)<br>Read the real detail endpoint; assert HTTP 200 and permitted fields.<br><br>**E2E**<br>File: TBD (`frontend/e2e/{file}.spec.ts`)<br>Open the detail page as the user and verify those fields. | The authorized user sees the permitted details through the domain logic, API, and UI. | Unit, Integration, E2E — Not Executed | YYYY-MM-DDTHH:mm:ss+08:00 |

## Reconcile one case at a time

Build a working traceability matrix for every requested case:

| Spreadsheet tab, row, and case ID | AC and required layer(s) | Preconditions, action, data, and expected result | Markdown case | Test path and assertion | State |
| --- | --- | --- | --- | --- | --- |

Compare in both directions: spreadsheet cases missing from Markdown, Markdown cases absent from the sheet, and implemented tests with no valid case mapping. Match the meaningful details, especially actors/permissions, initial state, boundaries, cardinality, side effects, failure handling, and version or retry behaviour. Keep one stable `TC-CS<number>-NN` identifier across sources; if one case needs several tests or layers, map every test back to that ID without implying that one assertion proves the whole case.

Check each listed file against its layer's actions and assertions. Track a `File: TBD` layer as pending until its test is implemented and run. Report layer states separately, even if the row has one shared expected-result cell.

When alignment changes are requested, make the smallest edits needed to reconcile the specified cases. Carry over exact agreed expectations and mark unresolved or proposed rules visibly. Do not rewrite unrelated rows, renumber historical IDs, invent original creation dates, or erase prior execution evidence. If the spreadsheet cannot be read, do not claim it is aligned; complete the repository-side review and report which comparison remains unavailable.

## Implement at the specified layer

- **Unit:** test production logic in isolation with controlled inputs and time. Assert the rule and boundary cases, not merely that a helper was called. A unit test does not satisfy an Integration or E2E requirement.
- **Integration:** cross the real service/API/persistence boundary named by the case. When the case requires outbox, broker delivery, database state, authorization, concurrency, or replay, exercise those boundaries with a disposable test environment and inspect the resulting state. A mocked consumer or an in-memory projection alone is narrower evidence; label it accordingly.
- **E2E:** exercise the specified user workflow through the real browser and connected application stack. Assert visible outcome and, where the case requires it, the persisted or downstream result. A UI-only stub or direct API setup cannot stand in for a required action through the UI.

Keep the case ID in the test name or an adjacent explicit mapping. Set up the stated preconditions, perform the stated action, and assert *all* material expected outcomes, including prohibited side effects. A unit check of a projection helper can supplement a messaging case but cannot complete its integration requirement.

If a required dependency or product behaviour is absent, leave the case visibly pending or blocked with the exact missing boundary. Do not replace a required layer with an easier one or mark a skipped test as passing. Do not write a test that simply mirrors the implementation without checking the specified behaviour.

## Verify and report

Run the relevant targeted tests and required layer commands when the environment is available. Use the repo's disposable test databases and documented runners; preserve existing data and unrelated working-tree changes. Inspect assertions and actual results before adding an automation link or changing a status. Distinguish **specified**, **implemented**, **executed/passed**, **failed**, and **blocked/not executed**. A source file, test title, or green unrelated suite is not execution evidence for a case.

Report the alignment by case ID with spreadsheet tab and row, Markdown row, unit/integration/E2E test path as applicable, result, and any remaining mismatch or dependency. Give the exact commands and observed outcomes for tests run. When the workbook differs from the repository, report the exact proposed workbook changes for the user to apply; do not write to the workbook or attempt to verify a write.
