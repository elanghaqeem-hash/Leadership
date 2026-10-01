# Excel Parity Specification

Canonical workbook: `Leadership_That_Works_Toolkit.xlsx`  
SHA-256: `0a2565947ade43562f13e74300ef022873aea6ca05e3ed74efd85ca60ebe5205`

The 27-sheet workbook is the initial source of truth for training content and scoring parity.

## Priority Scorecard
Workbook: `3 Priority Scorecard`
- Weighted = SUMPRODUCT(scores, weights) / SUM(weights).
- P1 if weighted >= 4.0 OR Risk = 5 OR Compliance = 5.
- P2 >= 3.0; P3 >= 2.0; otherwise P4.
- P1: DO / eskalasi hari ini; P2: PLAN: time block minggu ini; P3: DELEGATE dengan contract; P4: ELIMINATE / batch.

## Weekly Planner
Workbook: `4 Weekly Planner`
- Slots are 30 minutes; category hours = slot count × 0.5.
- Percent denominator excludes Break.
- Buffer ideal = 15%–20% inclusive.
- Focus cukup when Focus >= 20% of non-Break time.

## RACI
Workbook: `6 Delegation`
- Exactly one Accountable (A) per row.

## Action Tracker
Workbook: `14 Action Tracker`
- Valid only when Action, Owner, Deadline, Evidence are present.
- Overdue when Deadline < today and Status != Done.
- Excel closure rate = COUNTIF(Status,"Done") / COUNTA(Action).
- Product brief conflict: brief says Closed / total valid. Keep this as a configurable parity mode; do not silently change history.

## Banking Leadership Arena
Workbook: `15 Arena Scoring`
- Best +10; Acceptable +5; other 0.
- Minutes: Do = event value; Delegate = 15; Escalate = 10; Defer = 0.
- Defer on Risk event = -10.
- Total minutes > 480 = -15.
- Escalate + Defer > 8 = -10.
- Categories: Business, Customer, Risk, People, Execution.
- Balance Index = MIN(category scores) / MAX(category scores); division error => 0.

## Decision Auction
Workbook: `16 Decision Auction`
- Budget 1,000; max 3 programs; switching 10%.
- Final benefit = base benefit × R1 × R2 × R3.
- Switching cost applies to programs dropped between consecutive rounds.
- Workbook validates budget/program count on R3.
- NET = final benefit - R3 program cost - switching cost; invalid R3 => 0.

## War Room
Workbook: `17 War Room Score`
- Maximums: Self Leadership 10, Priority 15, Time 10, Critical Thinking 20, Decision Quality 15, Risk Awareness 10, Delegation 10, Execution 10.
- Observer records numeric points directly.
- Total = sum.
- Weakest dimension = minimum normalized score (score/max).
- Ranking is descending; ties share rank.

## Boardroom
Workbook: `18 Boardroom Rubric`
- Six criteria × 1–5; max 30.
- >=80% Boardroom-ready; >=60% Berkembang; otherwise Perlu latihan.

## Test
Workbooks: `19 Pre-Post Test`, `19b Test Scoring`
- 20 questions, 5 points each.
- Case-insensitive comparison.
- Fully blank attempt remains blank.
- Gain = Post - Pre.

## Manager Follow-up
Workbook: `21 Manager Follow-up`
- >=80% On track; >=50% Perlu dorongan; otherwise Perlu intervensi.

## Impact Metrics
Workbook: `22 Impact Metrics`
- % change = (Day30 - Baseline) / Baseline.
- Baseline 0 => blank percentage/status.
- Membaik follows metric direction and requires a strict improvement.

## Source governance
Workbook changes require a new SHA-256, regenerated seed, parity-test review, and explicit program version. Existing active/completed batches retain their frozen BatchScoringConfig.
