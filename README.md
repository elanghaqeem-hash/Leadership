# Leadership That Works

Training Delivery & Impact Platform for the two-day program **Leadership That Works — Time Management, Critical Thinking & Decision Making for Banking Professionals**.

Tagline: **Lead Yourself. Think Better. Decide Smarter. Execute Stronger.**

## Current foundation

This repository now uses the original Excel toolkit as a checked-in canonical source for initial content and scoring parity:

- `source/Leadership_That_Works_Toolkit.xlsx` — canonical 27-sheet toolkit.
- `source/toolkit-manifest.json` — source fingerprint and sheet inventory.
- `packages/content/seed/toolkit.seed.json` — initial structured seed extracted from the workbook.
- `scripts/extract-toolkit.mjs` — reproducible Excel → seed extractor.
- `docs/excel-parity.md` — exact workbook formulas and known source conflicts.
- `packages/scoring/` — pure TypeScript scoring engine aligned to workbook formulas.
- `packages/authz/` — RBAC matrix starter and access tests.
- `prisma/schema.prisma` — multi-tenant PostgreSQL/Prisma starter schema.

## Canonical source policy

The Excel workbook is a **content/scoring source artifact**, not a production database. Participant answers, PII, reflection text, manager feedback, and batch results must not be committed to Git.

After an approved Excel change:

```bash
npm install
npm run toolkit:extract
npm run typecheck
npm test
```

Any generated seed change must be reviewed together with the workbook change and scoring parity tests.

## Design baseline

- UI language: Bahasa Indonesia; framework names remain English.
- Mobile-first, minimum target width 375px without horizontal scrolling.
- Executive banking visual system: Navy `#10243E`, Gold `#E39B2D`, Teal `#1E7F86`.
- Source Serif 4 for headings, Inter for body text.
- Next.js App Router + TypeScript + Tailwind.
- PostgreSQL/Prisma with tenant isolation and server-side RBAC.
- Realtime classroom session state via WebSocket/Supabase Realtime or equivalent.
- Container-ready for cloud or bank on-premise deployment.

## Build order

1. Auth, tenant, batch, membership/RBAC, participant import, content seed.
2. Individual tools Day 1/Day 2, Pre/Post Test, Self-Diagnostic.
3. Trainer Console, realtime games G1–G11, Arena, War Room, observer rubrics.
4. 30-Day Plan, Manager Follow-up, Impact Metrics, reminders.
5. Role dashboards, Kirkpatrick L1–L4, exports, audit log, security hardening.

UI implementation should only consume scoring/config services; formulas must not be duplicated in React components.
