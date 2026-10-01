import { describe, expect, it } from 'vitest';
import {
  actionTrackerSummary,
  closureRateValidOnly,
  evaluatePlannerBuffer,
  evaluatePlannerFocus,
  impactMetric,
  isActionOverdue,
  managerFollowUpStatus,
  managerFollowUpStatusFromRatio,
  rankWarRoomTotals,
  scoreArena,
  scoreArenaEvent,
  scoreBoardroom,
  scoreDecisionAuction,
  scoreDetectiveRoom,
  scorePriority,
  scoreTest,
  scoreTestAnswers,
  scoreWarRoom,
  testGain,
  validateActionItem,
  validateRaciRow,
} from '../src/index.js';

describe('Priority Scorecard — Excel parity', () => {
  it('matches workbook sample: weighted 3.25 but Risk/Compliance override -> P1', () => {
    const r = scorePriority({ urgency: 5, business: 2, customer: 1, risk: 4, compliance: 5, strategic: 2 });
    expect(r.weightedScore).toBeCloseTo(3.25);
    expect(r.level).toBe('P1');
    expect(r.action).toBe('DO / eskalasi hari ini');
  });
  it('uses normalized weights like Excel SUMPRODUCT / total weight', () => {
    const r = scorePriority(
      { urgency: 4, business: 4, customer: 4, risk: 4, compliance: 4, strategic: 4 },
      { urgency: 2, business: 1.5, customer: 2, risk: 2, compliance: 1.5, strategic: 1 },
    );
    expect(r.weightedScore).toBeCloseTo(4);
    expect(r.level).toBe('P1');
  });
  it('maps P2/P3/P4 thresholds exactly', () => {
    expect(scorePriority({ urgency: 3, business: 3, customer: 3, risk: 3, compliance: 3, strategic: 3 }).level).toBe('P2');
    expect(scorePriority({ urgency: 2, business: 2, customer: 2, risk: 2, compliance: 2, strategic: 2 }).level).toBe('P3');
    expect(scorePriority({ urgency: 1, business: 1, customer: 1, risk: 1, compliance: 1, strategic: 1 }).level).toBe('P4');
  });
});

describe('Weekly Planner — Excel parity', () => {
  it('matches workbook sample buffer 1.5 / 8.0 = 18.75% IDEAL', () => {
    const r = evaluatePlannerBuffer(8 * 60, 1.5 * 60);
    expect(r.ratio).toBeCloseTo(0.1875);
    expect(r.label).toBe('IDEAL');
  });
  it('warns below 15%', () => expect(evaluatePlannerBuffer(480, 48).label).toBe('Kurang buffer'));
  it('warns above 20%', () => expect(evaluatePlannerBuffer(480, 120).label).toBe('Buffer berlebih'));
  it('matches Excel focus threshold >=20%', () => expect(evaluatePlannerFocus(480, 96).label).toBe('Focus cukup'));
});

describe('RACI — Excel parity', () => {
  it('requires exactly one A', () => expect(validateRaciRow(['R', 'A', 'C', 'I']).label).toBe('OK (1 A)'));
  it('rejects no A', () => expect(validateRaciRow(['R', 'C', 'I']).label).toBe('Harus tepat 1 A'));
  it('rejects two A', () => expect(validateRaciRow(['A', 'A', 'R']).valid).toBe(false));
});

describe('Action Tracker — Excel parity', () => {
  const valid = { action: 'Follow up', owner: 'Ops Head', deadline: '2026-10-10', evidence: 'Checklist', status: 'On track' };
  it('validity requires Action + Owner + Deadline + Evidence', () => {
    expect(validateActionItem(valid)).toBe('VALID');
    expect(validateActionItem({ ...valid, owner: '' })).toBe('INVALID');
    expect(validateActionItem({ ...valid, action: '' })).toBeNull();
  });
  it('overdue is independent of validity and Done status', () => {
    expect(isActionOverdue({ ...valid, deadline: '2026-10-01' }, '2026-10-02')).toBe(true);
    expect(isActionOverdue({ ...valid, deadline: '2026-10-01', status: 'Done' }, '2026-10-02')).toBe(false);
  });
  it('Excel closure denominator is all actions, not only valid actions', () => {
    const r = actionTrackerSummary([
      { ...valid, status: 'Done' },
      { action: 'Incomplete', owner: '', deadline: '2026-10-10', evidence: '', status: 'On track' },
    ], '2026-10-02');
    expect(r.totalActions).toBe(2);
    expect(r.doneCount).toBe(1);
    expect(r.closureRate).toBe(0.5);
    expect(r.invalidCount).toBe(1);
    expect(closureRateValidOnly([
      { ...valid, status: 'Done' },
      { action: 'Incomplete', owner: '', deadline: '2026-10-10', evidence: '', status: 'On track' },
    ])).toBe(1);
  });
});

describe('Arena — Excel parity', () => {
  it('best decision = 10 and Do uses event-specific minutes', () => {
    const r = scoreArenaEvent({ dimension: 'Customer', best: 'Do', acceptable: 'Delegate', doMinutes: 30, selected: 'Do' });
    expect(r).toEqual({ points: 10, minutes: 30, riskPenalty: 0 });
  });
  it('acceptable decision = 5 and Delegate uses 15 minutes', () => {
    const r = scoreArenaEvent({ dimension: 'Customer', best: 'Do', acceptable: 'Delegate', doMinutes: 30, selected: 'Delegate' });
    expect(r.points).toBe(5);
    expect(r.minutes).toBe(15);
  });
  it('Risk + Defer adds -10; balance index=min/max', () => {
    const r = scoreArena([
      { dimension: 'Business', best: 'Do', acceptable: 'Delegate', doMinutes: 10, selected: 'Do' },
      { dimension: 'Customer', best: 'Do', acceptable: 'Delegate', doMinutes: 10, selected: 'Delegate' },
      { dimension: 'Risk', best: 'Escalate', acceptable: 'Do', doMinutes: 10, selected: 'Defer' },
      { dimension: 'People', best: 'Do', acceptable: 'Delegate', doMinutes: 10, selected: 'Do' },
      { dimension: 'Execution', best: 'Do', acceptable: 'Delegate', doMinutes: 10, selected: 'Delegate' },
    ]);
    expect(r.riskPenalty).toBe(-10);
    expect(r.balanceIndex).toBe(0);
    expect(r.total).toBe(20);
  });
  it('applies Excel execution penalties >480 and Escalate+Defer >8', () => {
    const events = Array.from({ length: 9 }, () => ({
      dimension: 'Execution' as const,
      best: 'Do' as const,
      acceptable: 'Delegate' as const,
      doMinutes: 60,
      selected: 'Escalate' as const,
    }));
    const r = scoreArena(events);
    expect(r.totalMinutes).toBe(90); // Escalate = 10 minutes, not Do minutes.
    expect(r.executionPenalty).toBe(-10);
  });
});

describe('Decision Auction — Excel parity', () => {
  it('matches workbook sample Training + Process redesign + Collection improvement = 718', () => {
    const ids = ['training', 'process_redesign', 'collection_improvement'];
    const rounds = ['R0', 'R1', 'R2', 'R3'].map((round) => ({ round: round as 'R0'|'R1'|'R2'|'R3', activeProgramIds: ids }));
    const r = scoreDecisionAuction(rounds);
    expect(r.r3Cost).toBe(600);
    expect(r.finalBenefit).toBeCloseTo(1318);
    expect(r.switchingCost).toBe(0);
    expect(r.net).toBeCloseTo(718);
  });
  it('charges 10% only for a dropped program at each transition', () => {
    const r = scoreDecisionAuction([
      { round: 'R0', activeProgramIds: ['hire_staff'] },
      { round: 'R1', activeProgramIds: ['training'] },
      { round: 'R2', activeProgramIds: ['training'] },
      { round: 'R3', activeProgramIds: ['training'] },
    ]);
    expect(r.switchingCost).toBe(30);
    expect(r.net).toBeCloseTo(106);
  });
  it('Excel rule check is R3 only and invalid R3 makes NET zero', () => {
    const r = scoreDecisionAuction([
      { round: 'R0', activeProgramIds: ['automation', 'system_upgrade', 'hire_staff'] },
      { round: 'R1', activeProgramIds: [] },
      { round: 'R2', activeProgramIds: [] },
      { round: 'R3', activeProgramIds: ['automation', 'system_upgrade', 'hire_staff'] },
    ]);
    expect(r.validR3).toBe(false);
    expect(r.net).toBe(0);
  });
});

describe('War Room — Excel parity', () => {
  const max = [10, 15, 10, 20, 15, 10, 10, 10];
  const codes = ['self','priority','time','critical','decision','risk','delegation','execution'];
  it('total is direct sum of observer points', () => {
    const r = scoreWarRoom(codes.map((code, i) => ({ code, max: max[i], score: max[i] })));
    expect(r.total).toBe(100);
  });
  it('weakest dimension is lowest score/max percentage', () => {
    const r = scoreWarRoom(codes.map((code, i) => ({ code, max: max[i], score: code === 'risk' ? 2 : max[i] * 0.8 })));
    expect(r.weakestDimension).toBe('risk');
    expect(r.weakestPercent).toBeCloseTo(20);
  });
  it('RANK is descending with ties sharing rank', () => {
    expect(rankWarRoomTotals([90, 80, 80, 70])).toEqual([1, 2, 2, 4]);
  });
});

describe('Boardroom — Excel parity', () => {
  it('24/30 = 80% Boardroom-ready', () => expect(scoreBoardroom([4,4,4,4,4,4]).category).toBe('BOARDROOM_READY'));
  it('18/30 = 60% Berkembang', () => expect(scoreBoardroom([3,3,3,3,3,3]).category).toBe('BERKEMBANG'));
  it('12/30 = 40% Perlu latihan', () => expect(scoreBoardroom([2,2,2,2,2,2]).category).toBe('PERLU_LATIHAN'));
});

describe('Pre/Post Test — Excel parity', () => {
  const key = ['B','D','B','A','C','D','A','B','C','D','A','C','B','C','D','A','B','C','D','B'];
  it('20 correct = 100', () => expect(scoreTestAnswers(key, key)).toBe(100));
  it('answers are case-insensitive like UPPER()', () => expect(scoreTestAnswers(key.map((x) => x.toLowerCase()), key)).toBe(100));
  it('all blank answers return blank/null', () => expect(scoreTestAnswers(Array(20).fill(''), key)).toBeNull());
  it('gain = post - pre', () => expect(testGain(scoreTest(14), scoreTest(18))).toBe(20));
});

describe('Manager Follow-up — Excel parity', () => {
  it('0.80 is On track', () => expect(managerFollowUpStatusFromRatio(0.8)).toBe('ON_TRACK'));
  it('0.50 is Perlu dorongan', () => expect(managerFollowUpStatusFromRatio(0.5)).toBe('PERLU_DORONGAN'));
  it('UI percentage adapter 49.99% is Perlu intervensi', () => expect(managerFollowUpStatus(49.99)).toBe('PERLU_INTERVENSI'));
});

describe('Impact Metrics — Excel parity', () => {
  it('Naik improves only when Day30 > Baseline', () => expect(impactMetric(100, 110, 'UP_IS_BETTER').status).toBe('MEMBAIK'));
  it('Turun improves only when Day30 < Baseline', () => expect(impactMetric(100, 90, 'DOWN_IS_BETTER').status).toBe('MEMBAIK'));
  it('baseline zero leaves percent and status blank', () => {
    expect(impactMetric(0, 10, 'UP_IS_BETTER')).toEqual({ percentChange: null, status: null, reason: 'BASELINE_ZERO' });
  });
});

describe('Detective Room', () => {
  it('awards 40 for correct diagnosis', () => expect(scoreDetectiveRoom(true, 0, 0).total).toBe(40));
  it('awards 5 per relevant evidence', () => expect(scoreDetectiveRoom(false, 3, 0).total).toBe(15));
  it('awards 2 per remaining token', () => expect(scoreDetectiveRoom(false, 0, 4).total).toBe(8));
});
