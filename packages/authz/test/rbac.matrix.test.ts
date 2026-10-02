import { describe, expect, it } from 'vitest';
import { can } from '../src/matrix.js';

const sameScope = { actorTenantId: 't1', resourceTenantId: 't1', actorBatchId: 'b1', resourceBatchId: 'b1' };

describe('critical RBAC rules', () => {
  it('Program Admin cannot read private reflections', () => {
    expect(can('PRIVATE_REFLECTION_READ', { role: 'PROGRAM_ADMIN', ...sameScope })).toBe(false);
  });

  it('Lead Trainer can read private reflections in assigned scope', () => {
    expect(can('PRIVATE_REFLECTION_READ', { role: 'LEAD_TRAINER', ...sameScope })).toBe(true);
  });

  it('Super Admin is not implicitly granted private reflection payload', () => {
    expect(can('PRIVATE_REFLECTION_READ', { role: 'SUPER_ADMIN' })).toBe(false);
  });

  it('Observer can score only assigned team', () => {
    expect(can('RUBRIC_SCORE', { role: 'CO_FACILITATOR', ...sameScope, isAssignedTeam: true })).toBe(true);
    expect(can('RUBRIC_SCORE', { role: 'CO_FACILITATOR', ...sameScope, isAssignedTeam: false })).toBe(false);
  });

  it('Participant can write only own submission', () => {
    expect(can('OWN_SUBMISSION_WRITE', { role: 'PARTICIPANT', ...sameScope, isOwner: true })).toBe(true);
    expect(can('OWN_SUBMISSION_WRITE', { role: 'PARTICIPANT', ...sameScope, isOwner: false })).toBe(false);
  });

  it('Manager needs explicit subordinate mapping', () => {
    expect(can('SUBORDINATE_FOLLOWUP_WRITE', { role: 'LINE_MANAGER', ...sameScope, isMappedSubordinate: true })).toBe(true);
    expect(can('SUBORDINATE_FOLLOWUP_WRITE', { role: 'LINE_MANAGER', ...sameScope, isMappedSubordinate: false })).toBe(false);
  });

  it('Sponsor aggregate is suppressed below 5 people', () => {
    expect(can('AGGREGATE_DASHBOARD_READ', { role: 'SPONSOR_VIEWER', ...sameScope, aggregateSize: 4 })).toBe(false);
    expect(can('AGGREGATE_DASHBOARD_READ', { role: 'SPONSOR_VIEWER', ...sameScope, aggregateSize: 5 })).toBe(true);
  });

  it('cross-tenant access is denied for non-superadmin', () => {
    expect(can('AGGREGATE_DASHBOARD_READ', {
      role: 'PROGRAM_ADMIN', actorTenantId: 't1', resourceTenantId: 't2', actorBatchId: 'b1', resourceBatchId: 'b1',
    })).toBe(false);
  });

  it('Lead Trainer and Program Admin can manage teams, participant cannot', () => {
    expect(can('TEAM_MANAGE', { role: 'LEAD_TRAINER', ...sameScope })).toBe(true);
    expect(can('TEAM_MANAGE', { role: 'PROGRAM_ADMIN', ...sameScope })).toBe(true);
    expect(can('TEAM_MANAGE', { role: 'PARTICIPANT', ...sameScope })).toBe(false);
  });

  it('Participant individual export is owner-only', () => {
    expect(can('EXPORT_INDIVIDUAL', { role:'PARTICIPANT', ...sameScope, isOwner:true })).toBe(true);
    expect(can('EXPORT_INDIVIDUAL', { role:'PARTICIPANT', ...sameScope, isOwner:false })).toBe(false);
    expect(can('INDIVIDUAL_DASHBOARD_READ', { role:'PARTICIPANT', ...sameScope, isOwner:false })).toBe(false);
  });

  it('Participant cannot reveal keys or control sessions', () => {
    expect(can('ANSWER_KEY_REVEAL', { role: 'PARTICIPANT', ...sameScope })).toBe(false);
    expect(can('SESSION_CONTROL', { role: 'PARTICIPANT', ...sameScope })).toBe(false);
  });
  it('Content management is Super Admin only', () => {
    expect(can('CONTENT_MANAGE', { role:'SUPER_ADMIN' })).toBe(true);
    expect(can('CONTENT_MANAGE', { role:'PROGRAM_ADMIN', ...sameScope })).toBe(false);
    expect(can('CONTENT_MANAGE', { role:'LEAD_TRAINER', ...sameScope })).toBe(false);
  });

});
