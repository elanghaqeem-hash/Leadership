# Canonical Excel source

`Leadership_That_Works_Toolkit.xlsx` is the canonical source for the initial program content and Excel-parity formulas.

Rules:

1. Do not hand-edit `packages/content/seed/toolkit.seed.json` as the primary source. Update the workbook, then regenerate the seed.
2. Run `npm run toolkit:extract` after an approved workbook change.
3. Scoring functions in `packages/scoring/` must remain covered by parity tests against the formulas documented in `docs/excel-parity.md`.
4. The workbook is a seed/reference artifact, not a runtime participant-data database.
5. Never export participant PII or private reflection data back into this canonical workbook in source control.

Current source SHA-256:

`0a2565947ade43562f13e74300ef022873aea6ca05e3ed74efd85ca60ebe5205`
