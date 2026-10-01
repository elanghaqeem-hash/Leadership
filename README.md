# Leadership That Works

Training Delivery & Impact Platform untuk program **Leadership That Works — Time Management, Critical Thinking & Decision Making for Banking Professionals**.

Tagline: **Lead Yourself. Think Better. Decide Smarter. Execute Stronger.**

## Status pengembangan

Sprint 1 foundation tersedia untuk Auth, server-side RBAC, multi-tenant bank, batch training, participant CSV import, manager mapping, dan content seed dari workbook Excel canonical.

Canonical source:

- `source/Leadership_That_Works_Toolkit.xlsx` — workbook 27 sheet.
- `source/toolkit-manifest.json` — fingerprint dan inventaris sheet/formula.
- `packages/content/seed/toolkit.seed.json` — structured seed hasil workbook.
- `scripts/extract-toolkit.mjs` — reproducible Excel → seed extractor.
- `docs/excel-parity.md` — formula dan parity rule.

Workbook adalah **content/scoring source artifact**, bukan database peserta. PII, reflection, jawaban test, manager feedback, dan hasil batch tidak boleh di-commit ke Git.

## Sprint 1

- Password login + secure server session.
- Account activation token dan consent record.
- Magic-link login untuk Line Manager.
- Server-side authorization memakai `@ltw/authz`.
- Tenant/bank administration.
- Batch creation + frozen BatchScoringConfig.
- Team bootstrap per batch.
- CSV participant import, duplicate validation, participant-manager mapping.
- Content/test/rubric seed dari Excel.
- PostgreSQL RLS baseline untuk deployment dengan non-owner runtime DB role.
- Audit log baseline.

## Menjalankan lokal

```bash
cp .env.example .env
npm install
npm run db:generate
npm run db:migrate:dev -- --name sprint1
npm run db:seed
npm run dev
```

Untuk validasi:

```bash
npm run toolkit:extract
npm run typecheck
npm run test:sprint1
npm run build
```

Lihat `docs/sprint-1-runbook.md` untuk urutan setup dan batasan yang masih terbuka.
