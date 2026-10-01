# Database Design

## Design principles

PostgreSQL is the system of record. Every tenant-scoped business row carries `tenantId`, and batch-scoped rows also carry `batchId` either directly or through a mandatory parent relation. Application authorization and PostgreSQL RLS are both required; neither replaces the other.

A batch must point to an immutable `ProgramVersion` and a copied `BatchScoringConfig`. This prevents later edits to master content or formulas from silently changing historical training results.

JSONB is used only where the shape is genuinely activity-specific (`Activity.config`, `Submission.payload`, content payload). Core identity, authorization, score, dates, ownership, and reporting fields remain relational/indexed.

## Core relationship map

`Tenant -> Program -> ProgramVersion -> Batch -> Session -> Activity -> Submission`

`User <-> TenantMembership`; `User <-> BatchMembership -> Team`; `ParticipantManagerLink` binds participant and Line Manager inside a batch; `ObserverTeamAssignment` restricts Co-Facilitators to assigned teams.

Content is versioned through `ContentItem` and referenced/snapshotted into activities. Scoring parameters are stored in `ProgramScoringConfig` and frozen to `BatchScoringConfig` at batch launch.

Follow-up chain: `ThirtyDayPlan -> PlanTarget -> FollowUp` plus `ImpactMetric`. Evaluation and audit records are append-oriented.

## RLS policy shape

Production migrations should create PostgreSQL policies equivalent to: `tenant_id = current_setting('app.tenant_id')::uuid`, with service/admin exceptions isolated to a dedicated backend role. Requests set tenant context inside a transaction before data access. Batch and ownership checks remain in the authorization service because RLS alone does not encode all role/state semantics cleanly.

## Integrity rules that should become DB constraints/triggers where practical

`BatchMembership` is unique by `(batchId,userId)`. `ParticipantManagerLink` is unique by `(batchId,participantUserId)`. `ObserverTeamAssignment` is unique by `(batchId,observerUserId,teamId)`. Score/config versions are immutable once a batch status becomes `ACTIVE`. Audit logs are append-only to the application role. A response cannot reference a team or activity from another tenant/batch.

The starter Prisma schema is in `prisma/schema.prisma`. Raw SQL migrations should add RLS policies, append-only audit protections, and JSON schema/check constraints that Prisma cannot fully express.
