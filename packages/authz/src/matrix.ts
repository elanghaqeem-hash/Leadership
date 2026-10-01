export type Role =
  | 'SUPER_ADMIN'
  | 'PROGRAM_ADMIN'
  | 'LEAD_TRAINER'
  | 'CO_FACILITATOR'
  | 'PARTICIPANT'
  | 'LINE_MANAGER'
  | 'SPONSOR_VIEWER';

export type Permission =
  | 'TENANT_MANAGE'
  | 'BATCH_MANAGE'
  | 'BATCH_ACTIVITY_READ'
  | 'SESSION_CONTROL'
  | 'GAME_CONFIGURE'
  | 'PRIVATE_REFLECTION_READ'
  | 'PRIVATE_REFLECTION_WRITE'
  | 'RUBRIC_SCORE'
  | 'ANSWER_KEY_READ'
  | 'ANSWER_KEY_REVEAL'
  | 'OWN_SUBMISSION_WRITE'
  | 'SUBORDINATE_PLAN_READ'
  | 'SUBORDINATE_FOLLOWUP_WRITE'
  | 'INDIVIDUAL_DASHBOARD_READ'
  | 'AGGREGATE_DASHBOARD_READ'
  | 'EXPORT_INDIVIDUAL'
  | 'EXPORT_AGGREGATE'
  | 'AUDIT_READ';

export const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  SUPER_ADMIN: new Set([
    'TENANT_MANAGE','BATCH_MANAGE','GAME_CONFIGURE','ANSWER_KEY_READ','AGGREGATE_DASHBOARD_READ','EXPORT_AGGREGATE','AUDIT_READ',
  ]),
  PROGRAM_ADMIN: new Set(['BATCH_MANAGE','BATCH_ACTIVITY_READ','AGGREGATE_DASHBOARD_READ','EXPORT_AGGREGATE','AUDIT_READ']),
  LEAD_TRAINER: new Set([
    'BATCH_ACTIVITY_READ','SESSION_CONTROL','GAME_CONFIGURE','PRIVATE_REFLECTION_READ','RUBRIC_SCORE','ANSWER_KEY_READ','ANSWER_KEY_REVEAL','INDIVIDUAL_DASHBOARD_READ','AGGREGATE_DASHBOARD_READ','EXPORT_INDIVIDUAL','EXPORT_AGGREGATE',
  ]),
  CO_FACILITATOR: new Set(['BATCH_ACTIVITY_READ','RUBRIC_SCORE']),
  PARTICIPANT: new Set(['BATCH_ACTIVITY_READ','PRIVATE_REFLECTION_READ','PRIVATE_REFLECTION_WRITE','OWN_SUBMISSION_WRITE','INDIVIDUAL_DASHBOARD_READ','EXPORT_INDIVIDUAL']),
  LINE_MANAGER: new Set(['SUBORDINATE_PLAN_READ','SUBORDINATE_FOLLOWUP_WRITE']),
  SPONSOR_VIEWER: new Set(['AGGREGATE_DASHBOARD_READ','EXPORT_AGGREGATE']),
};

export interface AuthzContext {
  role: Role;
  actorTenantId?: string;
  resourceTenantId?: string;
  actorBatchId?: string;
  resourceBatchId?: string;
  isOwner?: boolean;
  isAssignedTeam?: boolean;
  isMappedSubordinate?: boolean;
  aggregateSize?: number;
}

export function can(permission: Permission, ctx: AuthzContext): boolean {
  if (!MATRIX[ctx.role].has(permission)) return false;
  if (ctx.role !== 'SUPER_ADMIN') {
    if (!ctx.actorTenantId || !ctx.resourceTenantId || ctx.actorTenantId !== ctx.resourceTenantId) return false;
    if (ctx.actorBatchId && ctx.resourceBatchId && ctx.actorBatchId !== ctx.resourceBatchId) return false;
  }
  if (ctx.role === 'CO_FACILITATOR' && permission === 'RUBRIC_SCORE' && !ctx.isAssignedTeam) return false;
  if (ctx.role === 'LINE_MANAGER' && (permission === 'SUBORDINATE_PLAN_READ' || permission === 'SUBORDINATE_FOLLOWUP_WRITE') && !ctx.isMappedSubordinate) return false;
  if (ctx.role === 'PARTICIPANT' && (permission === 'PRIVATE_REFLECTION_READ' || permission === 'PRIVATE_REFLECTION_WRITE' || permission === 'OWN_SUBMISSION_WRITE') && !ctx.isOwner) return false;
  if (ctx.role === 'SPONSOR_VIEWER' && (permission === 'AGGREGATE_DASHBOARD_READ' || permission === 'EXPORT_AGGREGATE') && (ctx.aggregateSize ?? 0) < 5) return false;
  return true;
}
