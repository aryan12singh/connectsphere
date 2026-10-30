---
name: test-add-to-spreadsheet
description: Use when explicitly asked to add or update test cases, iteration records, execution evidence, or screenshots in the project spreadsheet.
---

# Add Test Records to the Spreadsheet

Use this skill for explicitly authorized workbook writes. For read-only comparison or alignment work, use `test-alignment` and leave the workbook unchanged. When both skills apply, this skill governs the spreadsheet mutation; `test-alignment` remains the guide for repository reconciliation. Honor the user's current request and earlier explicit scope, but do not extend a story- or case-limited authorization to other rows. Ask only when the intended write scope is unclear.

## Inspect before editing

1. Open the exact workbook and tab with the connected Sheets tool. Read metadata, current headers, the requested cases, their acceptance-criteria/story rows, adjacent rows, and the example row the user identifies as the formatting standard. Row numbers and tab names can change; do not rely on remembered coordinates.
2. Record the case IDs, AC mappings, case-definition fields, iteration statuses and remarks, existing formatting, and merge ranges in the authorized scope. Check both the target story block and nearby rows so insertions do not overwrite or split another story.
3. Separate the requested workbook edits from Jira or repository work. Jira remains read-only unless the user explicitly requests a Jira change. Do not change acceptance criteria, test IDs, or test behavior while adding evidence unless explicitly requested.

If the workbook, target tab, affected cases, or requested write scope cannot be identified, stop before writing and ask only for the missing detail. If the Sheets connector is unavailable, provide the proposed cell edits instead of claiming to have changed the workbook.

## Add or update a case

- Follow the live workbook's headers and the user's referenced standard row. In the current ConnectSphere Sprint 4 layout, columns F:O hold the test-case definition through Intent; P is the iteration Status, Q is Remarks, R is Test Evidence for non-UI artifacts, and S is Supplementary UI / database proof used here for UI screenshots. Keep non-UI database outputs in R. Columns A:E carry sprint/story/acceptance-criteria context. Re-read the headers before using these coordinates.
- Add a repository-only case inside its existing story block and in test-case ID order. Preserve the story's merged cells, AC mappings, adjacent cases, and row formatting. If several rows must be inserted, insert from the bottom upward so earlier row coordinates remain valid.
- Write only the authorized cells and formatting. Prefer precise ranges over replacing a whole row or story block. Use the example row for formats and evidence structure; do not copy unrelated seed data, credentials, or case content.
- Do not add or remove cases, alter AC text, or retest already-passed cases unless the request authorizes that work.

## Record iterations under one Intent

Keep one case definition and Intent for the case, with one Status/Remarks/Test Evidence/Supplementary UI entry per execution iteration. Do not duplicate the case ID, scenario, AC, or Intent on later iteration rows. Keep the earlier iteration's status, remarks, and evidence unchanged when adding a later run. Put the new iteration's outcome and evidence on its own row; retain any whole-case limitation (such as blocked, partial, or deferred scope) in Remarks so a targeted pass is not presented as a full-case pass.

In the current ConnectSphere layout, visually group a multi-iteration case by vertically merging each definition column in F:O across the case's iteration rows. Keep P:S unmerged so every iteration has its own Status, Remarks, Test Evidence, and Supplementary UI / database proof. For the Google Sheets API, use `mergeType: "MERGE_COLUMNS"` on the F:O block: it merges each column vertically. `MERGE_ROWS` merges cells horizontally within each row and is the wrong direction for this layout. Do not merge the story context in A:E or the iteration cells in P:S as part of this operation.

Example for a two-iteration case:

| Definition and Intent (F:O) | Status (P) | Remarks (Q) | Test Evidence (R) | Supplementary UI (S) |
| --- | --- | --- | --- | --- |
| One canonical case definition, visually spanning both iteration rows | Partial (date; Iteration 1) | Outcome of Iteration 1 and any remaining scope limitation | Links to non-UI artifacts such as JSON output, logs, or HTTP/database results | Link to a relevant UI screenshot, if one exists |
| *(same vertically merged definition; no duplicate ID or Intent)* | Passed (date; Iteration 2) | Outcome of Iteration 2 and any remaining whole-case limitation | Links to non-UI artifacts such as JSON output, logs, or HTTP/database results | Link to a relevant UI screenshot, if one exists |

Only apply the vertical merge after confirming the exact case rows and that later-row definition cells contain no unique content. If a merge direction or existing merge is uncertain, inspect the API merge metadata and resolve that uncertainty before mutating cells.

## Evidence and formatting

- Record only tests actually run. Keep the iteration, run date, tested layer, paths, result, and source provenance in the appropriate record or linked artifact. Distinguish local/unpublished work from a remotely available commit or CI run; never invent evidence links.
- Preserve the prior execution record. A targeted run may pass its tested subset while the full intent stays partial or deferred; state the actual outcome and limitation in Remarks rather than overstating the case status.
- Link a screenshot only when it exists, is relevant to the case, and the user requested or authorized its inclusion. Verify the link resolves to the intended synthetic UI evidence. Do not claim evidence was uploaded or verified when it was not.
- Apply bold or highlight conventions only when requested or required by the workbook's current standard. Keep existing formatting for historical rows and preserve links, notes, formulas, validation, and merged cells outside the authorized edit.
- In the ConnectSphere layout, column P is status only: no evidence blocks or links.
- Column Q (Remarks) is the test outcome in concise prose. Say what passed, failed, or was not exercised, and any relevant limitation. Do not put evidence links or artifact inventories here.
- Column R (Test Evidence) is for non-UI evidence artifacts: JSON output, logs, HTTP/API results, database/PostgreSQL or broker outputs, migration/build reports, and similar machine-readable or textual evidence. Link the actual artifact with a concise label. Do not put screenshots or UI screenshots here. Do not paste a narrative evidence block into R when the workbook's purpose is to link the artifact.
- Column S (Supplementary UI) is for UI-related screenshot evidence. Prefer placing the screenshot itself in the cell when the Sheets connector supports safe image insertion from the available file. Otherwise, link the verified screenshot with a concise label and report that direct embedding was unavailable. Do not change file sharing to make an image formula work. Do not place non-UI artifacts, E2E narrative blocks, database output, or other test summaries here.
- For an iteration with both UI and non-UI evidence, put the outcome once in Q, non-UI artifact links in R, and relevant UI screenshot links in S. Leave R or S blank when no corresponding artifact exists; do not substitute an unrelated link.
- Link a screenshot only when it exists, is relevant to the case, and the user requested or authorized its inclusion. Verify the link resolves to the intended synthetic UI evidence. Do not claim evidence was uploaded or verified when it was not.
- Do not add workbook self-links such as a link back to the case row. Link only to actual, relevant evidence artifacts or authorized screenshots. Verify each destination before describing it as available.
- Apply bold or highlight conventions only when requested or required by the workbook's current standard. Keep existing formatting for historical rows and preserve links, notes, formulas, validation, and merged cells outside the authorized edit.

### Example for columns P:S

```text
P (Status): Passed (29 Oct 2026; Iteration 2)
Q (Remarks): The duplicate request was ignored and only one active registration remained.
R (Test Evidence): attendance-postgres.json  [link to verified non-UI artifact]
S (Supplementary UI): registration-confirmed.png  [link to relevant UI screenshot]
```

The example case, date, outcome, artifact names, and links are illustrative only. For deferred or not-rerun coverage, state that accurately in Remarks and leave evidence columns blank unless a relevant artifact exists.

## Write and verify

Before the batch write, check the proposed ranges against the authorized case IDs and confirm that no range touches an unrelated story or AC. Apply row insertion, cell updates, and merges only to those ranges. For multiple insertions, insert bottom-up; do not blindly retry a write after a timeout—read the target range first to check whether it already applied.

After writing, re-read the affected rows and verify:

- each case ID, scenario, AC, Intent, expected result, and assertion remains correct and appears once;
- iteration rows are ordered, each has its own Status, Remarks, Test Evidence, and Supplementary UI / database proof, and earlier evidence is preserved;
- F:O is vertically grouped for multi-iteration cases while P:S remain separate, with no unintended horizontal merge;
- P contains status only and no hyperlinks; Q states the test outcome without links; R links only non-UI evidence artifacts; S links only relevant UI screenshots;
- row ordering, formatting, evidence links, and story/AC context are intact;
- no cells outside the authorized story/case ranges were changed.

Report the exact story and case IDs changed, workbook tab and rows, what was verified, and any write or evidence verification that remains incomplete. Do not describe a partial/deferred full intent as passed merely because a narrower iteration passed.
