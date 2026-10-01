export type MinuteAuditCategory =
  | 'Focus'
  | 'Meeting'
  | 'Customer'
  | 'People/Coaching'
  | 'Admin/Batch'
  | 'Buffer'
  | 'Break'
  | 'Other';

export interface MinuteAuditItem {
  activity: string;
  durationMin: number;
  category: MinuteAuditCategory;
}

export function summarizeMinuteAudit(items: MinuteAuditItem[]) {
  if (!items.length) throw new Error('Minute audit requires at least one item');
  for (const item of items) {
    if (!Number.isInteger(item.durationMin) || item.durationMin < 1 || item.durationMin > 480) {
      throw new Error('durationMin must be an integer between 1 and 480');
    }
  }
  const totalMinutes = items.reduce((sum, item) => sum + item.durationMin, 0);
  const byCategory = Object.fromEntries(
    [...new Set(items.map((x) => x.category))].map((category) => [
      category,
      items.filter((x) => x.category === category).reduce((sum, x) => sum + x.durationMin, 0),
    ]),
  ) as Partial<Record<MinuteAuditCategory, number>>;

  return {
    totalMinutes,
    remainingMinutes: 480 - totalMinutes,
    status: totalMinutes > 480 ? 'OVER_480' as const : totalMinutes === 480 ? 'BALANCED_480' as const : 'UNDER_480' as const,
    byCategory,
  };
}

export interface MeetingChecklistInput {
  decisionRequired: boolean;
  rightParticipants: boolean;
  preReadReady: boolean;
  timeboxed: boolean;
  canBeAsync: boolean;
}

export function scoreMeetingChecklist(input: MeetingChecklistInput) {
  const signals = [
    input.decisionRequired,
    input.rightParticipants,
    input.preReadReady,
    input.timeboxed,
    !input.canBeAsync,
  ];
  const goScore = signals.filter(Boolean).length;
  return {
    goScore,
    recommendation: goScore >= 4 ? 'GO' as const : 'NO_GO_OR_REDESIGN' as const,
  };
}

export interface SbiInput {
  situation: string;
  behavior: string;
  impact: string;
  nextStep: string;
}

export function buildSbiFeedback(input: SbiInput) {
  return `Pada ${input.situation}, ketika ${input.behavior}, dampaknya ${input.impact}. Ke depan, ${input.nextStep}.`;
}

export interface DecisionCriterion { name: string; weight: number }
export interface DecisionOption { name: string; scores: number[] }

export function rankDecisionMatrix(criteria: DecisionCriterion[], options: DecisionOption[]) {
  if (criteria.length !== 9) throw new Error('Decision Matrix requires exactly 9 criteria');
  const totalWeight = criteria.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) throw new Error('Decision Matrix total weight must be > 0');
  for (const option of options) {
    if (option.scores.length !== criteria.length) throw new Error('Option score count must match criteria');
  }
  return options
    .map((option) => ({
      name: option.name,
      weightedScore: option.scores.reduce((sum, value, idx) => sum + value * criteria[idx].weight, 0) / totalWeight,
    }))
    .sort((a, b) => b.weightedScore - a.weightedScore)
    .map((item, idx) => ({ rank: idx + 1, ...item }));
}

export interface PreMortemItem {
  failure: string;
  likelihood: number;
  impact: number;
}

export function summarizePreMortem(items: PreMortemItem[]) {
  return items
    .map((item) => ({ failure: item.failure, riskScore: item.likelihood * item.impact }))
    .sort((a, b) => b.riskScore - a.riskScore);
}
