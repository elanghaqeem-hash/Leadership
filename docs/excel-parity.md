# Excel Parity Specification

Canonical workbook: `source/Leadership_That_Works_Toolkit.xlsx`

SHA-256: `0a2565947ade43562f13e74300ef022873aea6ca05e3ed74efd85ca60ebe5205`

This document records the formulas that the application must match for the same inputs. The workbook is the parity reference; application code must not silently change these calculations.

## Priority Scorecard

Workbook: `3 Priority Scorecard`

- Weighted score = `SUMPRODUCT(scores, weights) / SUM(weights)`.
- P1 when weighted score >= 4.0 OR Risk = 5 OR Compliance = 5.
- P2 when score >= 3.0.
- P3 when score >= 2.0.
- Otherwise P4.
- Action labels: P1 `DO / eskalasi hari ini`; P2 `PLAN: time block minggu ini`; P3 `DELEGATE dengan contract`; P4 `ELIMINATE / batch`.

## Weekly Planner

Workbook: `4 Weekly Planner`

- 30-minute slots.
- Category hours = count of category slots × 0.5 hour.
- Denominator for category percentages excludes `Break`.
- Buffer ideal when 15%–20% inclusive.
- Focus is `Focus cukup` when Focus >= 20% of non-Break time.

## RACI

Workbook: `6 Delegation`

- Every RACI row must contain exactly one Accountable (A).

## Action Tracker

Workbook: `14 Action Tracker`

- An action is valid when Action is nonblank and Owner, Deadline, and Evidence are all present.
- Overdue when Action and Deadline exist, Status is not `Done`, and Deadline < today.
- Workbook closure rate = `COUNTIF(Status,"Done") / COUNTA(Action)`.

Important source conflict: the written product brief says closure rate should be `Closed / total valid`. The application keeps a separate `closureRateValidOnly()` function, but Excel-parity mode uses the workbook formula above. This conflict should be resolved explicitly before production lock if the business wants the written rule instead of workbook parity.

## Banking Leadership Arena

Workbook: `15 Arena Scoring`

- Best decision: +10.
- Acceptable decision: +5.
- Other decision: 0.
- Minutes: Do = event-specific minutes; Delegate = 15; Escalate = 10; Defer = 0.
- Risk + Defer = -10 per event.
- Total minutes > 480 = -15.
- Escalate + Defer count > 8 = -10.
- Category scores: Business, Customer, Risk, People, Execution.
- Total score = sum(category scores) + risk penalty + execution penalty.
- Balance Index = `MIN(category scores) / MAX(category scores)`; Excel returns 0 on division error.

## Decision Auction

Workbook: `16 Decision Auction`

- Budget = 1,000.
- Max programs = 3.
- Switching rate = 10%.
- Final program benefit = base benefit × R1 × R2 × R3.
- Switching cost charges 10% of each program cost when that program is dropped between consecutive rounds.
- Workbook validates budget/program-count on R3.
- NET = final benefit - R3 program cost - total switching cost.
- If R3 violates budget or max programs, NET = 0.

## War Room

Workbook: `17 War Room Score`

Maximum points by dimension:

- Self Leadership 10
- Priority 15
- Time Management 10
- Critical Thinking 20
- Decision Quality 15
- Risk Awareness 10
- Delegation 10
- Execution 10

Observer enters numeric points directly from 0 to the dimension maximum. Total is the direct sum. Lowest dimension is based on the minimum normalized score `score / max`. Ranking uses descending Excel `RANK`, with ties sharing the same rank.

## Boardroom

Workbook: `18 Boardroom Rubric`

- Six criteria, each 1–5.
- Total = sum, max 30.
- Ratio = total / 30.
- >= 80%: `Boardroom-ready`.
- >= 60% and < 80%: `Berkembang`.
- < 60%: `Perlu latihan`.

## Pre/Post Test

Workbook: `19 Pre-Post Test` and `19b Test Scoring`

- 20 questions.
- Case-insensitive answer matching using Excel `UPPER()`.
- 5 points per correct answer.
- Blank attempt returns blank.
- Gain = Post - Pre.

## Manager Follow-up

Workbook: `21 Manager Follow-up`

- >= 80%: `On track`.
- >= 50%: `Perlu dorongan`.
- < 50%: `Perlu intervensi`.

Workbook cells compare decimal ratios (0.8 / 0.5); UI may accept 0–100% and convert to a ratio before scoring.

## Impact Metrics

Workbook: `22 Impact Metrics`

- Percent change = `(Day30 - Baseline) / Baseline`.
- If Baseline = 0, percent change and improvement status remain blank.
- `Turun` improves when Day30 < Baseline.
- `Naik` improves when Day30 > Baseline.
- Equal values are `Belum`.

## Content seed

The initial content seed is generated from the workbook and includes:

- 10 Self-Diagnostic dimensions.
- 20 Arena events.
- 7 Decision Auction programs.
- 8 War Room dimensions and rubrics.
- 20 Pre/Post test questions and answer key.
- 9 impact metrics.
- Game-card source rows from `24 Kartu Game`.

Run `npm run toolkit:extract` after any approved workbook update.
