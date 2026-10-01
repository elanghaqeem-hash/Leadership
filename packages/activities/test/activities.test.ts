import { describe, expect, it } from 'vitest';
import {
  buildSbiFeedback,
  rankDecisionMatrix,
  scoreMeetingChecklist,
  summarizeMinuteAudit,
  summarizePreMortem,
} from '../src/index.js';

describe('480-Minute Audit', () => {
  it('totals exactly 480 and groups categories', () => {
    const r = summarizeMinuteAudit([
      { activity:'Focus', durationMin:300, category:'Focus' },
      { activity:'Meeting', durationMin:120, category:'Meeting' },
      { activity:'Buffer', durationMin:60, category:'Buffer' },
    ]);
    expect(r.totalMinutes).toBe(480);
    expect(r.status).toBe('BALANCED_480');
    expect(r.byCategory.Buffer).toBe(60);
  });
  it('flags over 480', () => {
    const r = summarizeMinuteAudit([
      { activity:'A', durationMin:300, category:'Focus' },
      { activity:'B', durationMin:240, category:'Meeting' },
    ]);
    expect(r.status).toBe('OVER_480');
    expect(r.remainingMinutes).toBe(-60);
  });
  it('shows remaining minutes under 480', () => {
    expect(summarizeMinuteAudit([{activity:'A',durationMin:420,category:'Focus'}]).remainingMinutes).toBe(60);
  });
});

describe('Meeting Go/No-Go', () => {
  it('GO when four of five quality signals are positive', () => {
    expect(scoreMeetingChecklist({decisionRequired:true,rightParticipants:true,preReadReady:true,timeboxed:true,canBeAsync:true}).recommendation).toBe('GO');
  });
  it('redesigns a weak meeting', () => {
    expect(scoreMeetingChecklist({decisionRequired:false,rightParticipants:true,preReadReady:false,timeboxed:false,canBeAsync:true}).recommendation).toBe('NO_GO_OR_REDESIGN');
  });
});

describe('SBI feedback', () => {
  it('builds the four-part sentence', () => {
    expect(buildSbiFeedback({situation:'rapat pagi',behavior:'Anda memotong pembicaraan',impact:'tim kehilangan konteks',nextStep:'beri ruang sampai selesai'}))
      .toContain('tim kehilangan konteks');
  });
});

describe('Decision Matrix', () => {
  const criteria=Array.from({length:9},(_,i)=>({name:`C${i+1}`,weight:i===0?20:10}));
  it('ranks the higher weighted option first', () => {
    const r=rankDecisionMatrix(criteria,[
      {name:'A',scores:[5,3,3,3,3,3,3,3,3]},
      {name:'B',scores:[2,4,4,4,4,4,4,4,4]},
    ]);
    expect(r).toHaveLength(2);
    expect(r[0].weightedScore).toBeGreaterThan(r[1].weightedScore);
  });
  it('requires exactly nine criteria', () => {
    expect(()=>rankDecisionMatrix(criteria.slice(0,8),[])).toThrow();
  });
});

describe('Pre-Mortem', () => {
  it('calculates likelihood × impact and sorts high risk first', () => {
    expect(summarizePreMortem([
      {failure:'A',likelihood:2,impact:2},
      {failure:'B',likelihood:5,impact:4},
    ])[0]).toEqual({failure:'B',riskScore:20});
  });
});
