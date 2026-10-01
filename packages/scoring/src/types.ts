export type PriorityLevel = 'P1' | 'P2' | 'P3' | 'P4';
export type PlannerBufferStatus = 'LOW' | 'IDEAL' | 'HIGH';
export type ActionValidity = 'VALID' | 'INVALID';
export type ActionItemState = 'OPEN' | 'DONE';
export type BoardroomCategory = 'BOARDROOM_READY' | 'BERKEMBANG' | 'PERLU_LATIHAN';
export type FollowUpStatus = 'ON_TRACK' | 'PERLU_DORONGAN' | 'PERLU_INTERVENSI';
export type MetricDirection = 'UP_IS_BETTER' | 'DOWN_IS_BETTER';

export interface PriorityWeights {
  urgency: number;
  business: number;
  customer: number;
  risk: number;
  compliance: number;
  strategic: number;
}

export interface PriorityInput {
  urgency: number;
  business: number;
  customer: number;
  risk: number;
  compliance: number;
  strategic: number;
}

export interface AuctionProgram {
  id: string;
  cost: number;
  benefit: number;
  risk: number;
  uncertainty: number;
  factors: { r1: number; r2: number; r3: number };
}

export interface AuctionRound {
  round: 'R0' | 'R1' | 'R2' | 'R3';
  activeProgramIds: string[];
}
