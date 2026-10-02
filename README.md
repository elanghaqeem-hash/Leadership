# Leadership That Works

Training Delivery & Impact Platform untuk program **Leadership That Works — Time Management, Critical Thinking & Decision Making for Banking Professionals**.

Tagline: **Lead Yourself. Think Better. Decide Smarter. Execute Stronger.**

## Status pengembangan

Platform sudah melewati foundation awal dan mencakup **classroom delivery, live/team games, follow-up, impact measurement, readiness, dan export**. Setiap perubahan tetap harus melewati CI sebelum dinyatakan siap release.

Canonical source:

- `source/Leadership_That_Works_Toolkit.xlsx` — workbook 27 sheet.
- `source/toolkit-manifest.json` — fingerprint dan inventaris sheet/formula.
- `packages/content/seed/toolkit.seed.json` — structured seed hasil workbook.
- `scripts/extract-toolkit.mjs` — reproducible Excel → seed extractor.
- `docs/excel-parity.md` — formula dan parity rule.

Workbook adalah **content/scoring source artifact**, bukan database peserta. PII, reflection, jawaban test, manager feedback, dan hasil batch tidak boleh di-commit ke Git.

## Implemented scope

### Platform & security

- Password login, account activation, secure server session, consent record.
- Magic-link login untuk Line Manager.
- MFA enrollment / login verification.
- Server-side RBAC melalui `@ltw/authz`.
- Multi-tenant bank, tenant isolation, PostgreSQL RLS baseline, audit log.
- Owner-only participant read/export dan sponsor aggregate privacy threshold.
- Database + canonical LTW seed readiness health check.

### Batch & classroom operation

- Batch creation dari published LTW program blueprint.
- Frozen `BatchScoringConfig`.
- CSV participant import dan participant-manager mapping.
- Team bootstrap, manual assignment, dan balanced-random assignment.
- Secure 6-digit join flow untuk user yang memang sudah terdaftar pada batch.
- Batch Readiness diagnostics dan guarded lifecycle:
  `DRAFT → PRE_TRAINING → ACTIVE → FOLLOW_UP → CLOSED → ARCHIVED`.
- Trainer Console, Projector Mode, Observer Rubric.
- Authenticated SSE realtime dengan polling fallback.
- IndexedDB offline outbox untuk structured individual submissions.
- 30-participant classroom latency acceptance smoke pada CI.

### Tools & games

Structured tools mencakup 480-Minute Audit, Priority Scorecard, Weekly Planner, Daily Big 3, Meeting Go/No-Go, Delegation Contract, RACI, GROW, SBI, Fact–Assumption–Opinion–Unknown, 5 Whys, Fishbone, Issue Tree, Bias Checklist, Decision Matrix, Pre-Mortem, Decision Log, Action Tracker, reflection, dan AAR/Stop-Start-Continue.

Live/team simulations mencakup:

- G1 Leadership Mirror
- G2 480-Minute Challenge
- G3 Priority Poker
- G4 Calendar Tetris
- G5 Delegation Relay
- G6 Fact or Fiction
- G7 Detective Room
- G8 Root Cause Race
- G9 Bias Trap
- G10 Decision Auction
- G11 60-Second Boardroom
- Banking Leadership Arena
- Leadership War Room

Answer keys, future round factors, observer keys, dan hidden evidence dipisahkan dari public participant payload.

### Learning, follow-up & impact

- Self-Diagnostic Pre/Post.
- 20-question Pre/Post Test dari workbook.
- Evaluation L1.
- 30-Day Action Plan dengan 3 behavioral targets.
- Participant D+7 self-review.
- Line Manager D+14 dan D+30 follow-up.
- D+30 impact metrics dengan direction-aware improvement calculation.
- Reminder webhook engine untuk D+7/D+14/D+30.
- Aggregate Kirkpatrick-style impact dashboard.
- Aggregate impact XLSX export.
- Full batch XLSX result export dengan 27-sheet structure dan role-based privacy mode.

## Menjalankan lokal

```bash
cp .env.example .env
npm install
npm run db:generate
npm run db:migrate:dev -- --name local
npm run db:seed
npm run dev
```

## Validasi

Minimum developer validation:

```bash
npm run toolkit:extract
npm run typecheck
npm run test:sprint2
npm run build
npm run test:classroom:load
```

CI repository menambahkan PostgreSQL migration/seed smoke, RLS smoke dengan non-owner runtime role, HTTP login/session smoke, production build, classroom latency smoke, dan dependency audit.

## Dokumentasi

- `docs/excel-parity.md` — Excel formula parity.
- `docs/sprint-1-runbook.md` — foundation/bootstrap historical runbook.
- `docs/production-runbook.md` — production prerequisites, release gate, readiness, lifecycle, reminder, privacy, dan post-deploy smoke.

