import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(process.cwd());
const blueprint = JSON.parse(fs.readFileSync(path.join(root,'packages/content/seed/program.blueprint.json'),'utf8'));

describe('Leadership program blueprint', () => {
  it('contains exactly 18 numbered sessions plus Arena and War Room', () => {
    const numbered = blueprint.sessions.filter((s:any) => /^S\d{2}$/.test(s.code));
    expect(numbered).toHaveLength(18);
    expect(blueprint.sessions.some((s:any) => s.code === 'ARENA')).toBe(true);
    expect(blueprint.sessions.some((s:any) => s.code === 'WAR_ROOM')).toBe(true);
  });

  it('uses unique session sequences and codes', () => {
    const sequences = blueprint.sessions.map((s:any) => s.sequence);
    const codes = blueprint.sessions.map((s:any) => s.code);
    expect(new Set(sequences).size).toBe(sequences.length);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('contains all G1-G11 game activity types plus Arena and War Room', () => {
    const types = blueprint.sessions.flatMap((s:any) => s.activities.map((a:any) => a.type));
    const expected = [
      'LEADERSHIP_MIRROR','MINUTE_AUDIT','PRIORITY_POKER','CALENDAR_TETRIS','DELEGATION_RELAY',
      'FACT_OR_FICTION','DETECTIVE_ROOM','ROOT_CAUSE_RACE','BIAS_TRAP','DECISION_AUCTION','BOARDROOM',
      'ARENA','WAR_ROOM',
    ];
    for (const type of expected) expect(types).toContain(type);
  });

  it('opens only pre-training activities by default', () => {
    const pre = blueprint.sessions.find((s:any) => s.code === 'PRE');
    expect(pre.activities.every((a:any) => a.initialStatus === 'OPEN')).toBe(true);
    const classActivities = blueprint.sessions.filter((s:any) => s.code !== 'PRE').flatMap((s:any) => s.activities);
    expect(classActivities.every((a:any) => a.initialStatus === 'DRAFT')).toBe(true);
  });
});
