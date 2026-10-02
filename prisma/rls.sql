-- Sprint 1 PostgreSQL RLS baseline.
-- IMPORTANT:
-- 1) Apply after Prisma migration.
-- 2) Runtime application must use a NON-OWNER, non-superuser DB role.
-- 3) Tenant-scoped transactions set app.current_tenant_id.
-- 4) Privileged platform maintenance may set app.is_platform_admin=true only on a server-only path.

CREATE OR REPLACE FUNCTION app_tenant_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_is_platform_admin() RETURNS boolean AS $$
  SELECT COALESCE(NULLIF(current_setting('app.is_platform_admin', true), '')::boolean, false)
$$ LANGUAGE sql STABLE;

-- Direct tenant-keyed tables.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'Tenant','TenantMembership','Batch','Team','Session','Activity','Submission',
    'ThirtyDayPlan','ImpactMetric','EvaluationL1','AuditLog','ParticipantImportJob','AttendanceRecord'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS tenant_isolation ON "Tenant";
CREATE POLICY tenant_isolation ON "Tenant"
  USING (app_is_platform_admin() OR id = app_tenant_id())
  WITH CHECK (app_is_platform_admin() OR id = app_tenant_id());

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'TenantMembership','Batch','Team','Session','Activity','Submission',
    'ThirtyDayPlan','ImpactMetric','EvaluationL1','AuditLog','ParticipantImportJob'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (app_is_platform_admin() OR "tenantId" = app_tenant_id()) WITH CHECK (app_is_platform_admin() OR "tenantId" = app_tenant_id())',
      t
    );
  END LOOP;
END $$;

-- Global-or-tenant master tables. Global rows are readable by tenants but only
-- privileged platform paths may create/update global rows (tenantId IS NULL).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Program','ContentItem','Rubric','Test']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS global_or_tenant_read ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_write ON %I', t);
    EXECUTE format(
      'CREATE POLICY global_or_tenant_read ON %I FOR SELECT USING (app_is_platform_admin() OR "tenantId" IS NULL OR "tenantId" = app_tenant_id())',
      t
    );
    EXECUTE format(
      'CREATE POLICY tenant_write ON %I FOR ALL USING (app_is_platform_admin() OR "tenantId" = app_tenant_id()) WITH CHECK (app_is_platform_admin() OR "tenantId" = app_tenant_id())',
      t
    );
  END LOOP;
END $$;

-- Batch-derived tables.
ALTER TABLE "BatchMembership" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS batch_membership_isolation ON "BatchMembership";
CREATE POLICY batch_membership_isolation ON "BatchMembership"
  USING (app_is_platform_admin() OR EXISTS (
    SELECT 1 FROM "Batch" b WHERE b.id="BatchMembership"."batchId" AND b."tenantId"=app_tenant_id()
  ))
  WITH CHECK (app_is_platform_admin() OR EXISTS (
    SELECT 1 FROM "Batch" b WHERE b.id="BatchMembership"."batchId" AND b."tenantId"=app_tenant_id()
  ));

ALTER TABLE "ParticipantManagerLink" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS manager_link_isolation ON "ParticipantManagerLink";
CREATE POLICY manager_link_isolation ON "ParticipantManagerLink"
  USING (app_is_platform_admin() OR EXISTS (
    SELECT 1 FROM "Batch" b WHERE b.id="ParticipantManagerLink"."batchId" AND b."tenantId"=app_tenant_id()
  ))
  WITH CHECK (app_is_platform_admin() OR EXISTS (
    SELECT 1 FROM "Batch" b WHERE b.id="ParticipantManagerLink"."batchId" AND b."tenantId"=app_tenant_id()
  ));

ALTER TABLE "ObserverTeamAssignment" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS observer_assignment_isolation ON "ObserverTeamAssignment";
CREATE POLICY observer_assignment_isolation ON "ObserverTeamAssignment"
  USING (app_is_platform_admin() OR EXISTS (
    SELECT 1 FROM "Batch" b WHERE b.id="ObserverTeamAssignment"."batchId" AND b."tenantId"=app_tenant_id()
  ))
  WITH CHECK (app_is_platform_admin() OR EXISTS (
    SELECT 1 FROM "Batch" b WHERE b.id="ObserverTeamAssignment"."batchId" AND b."tenantId"=app_tenant_id()
  ));

ALTER TABLE "BatchScoringConfig" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS batch_scoring_isolation ON "BatchScoringConfig";
CREATE POLICY batch_scoring_isolation ON "BatchScoringConfig"
  USING (app_is_platform_admin() OR EXISTS (
    SELECT 1 FROM "Batch" b WHERE b.id="BatchScoringConfig"."batchId" AND b."tenantId"=app_tenant_id()
  ))
  WITH CHECK (app_is_platform_admin() OR EXISTS (
    SELECT 1 FROM "Batch" b WHERE b.id="BatchScoringConfig"."batchId" AND b."tenantId"=app_tenant_id()
  ));

ALTER TABLE "GameRound" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS game_round_isolation ON "GameRound";
CREATE POLICY game_round_isolation ON "GameRound"
  USING (app_is_platform_admin() OR EXISTS (
    SELECT 1 FROM "Batch" b WHERE b.id="GameRound"."batchId" AND b."tenantId"=app_tenant_id()
  ))
  WITH CHECK (app_is_platform_admin() OR EXISTS (
    SELECT 1 FROM "Batch" b WHERE b.id="GameRound"."batchId" AND b."tenantId"=app_tenant_id()
  ));

ALTER TABLE "TestAttempt" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS test_attempt_isolation ON "TestAttempt";
CREATE POLICY test_attempt_isolation ON "TestAttempt"
  USING (app_is_platform_admin() OR EXISTS (
    SELECT 1 FROM "Batch" b WHERE b.id="TestAttempt"."batchId" AND b."tenantId"=app_tenant_id()
  ))
  WITH CHECK (app_is_platform_admin() OR EXISTS (
    SELECT 1 FROM "Batch" b WHERE b.id="TestAttempt"."batchId" AND b."tenantId"=app_tenant_id()
  ));

-- Activity-derived table.
ALTER TABLE "RubricScore" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rubric_score_isolation ON "RubricScore";
CREATE POLICY rubric_score_isolation ON "RubricScore"
  USING (app_is_platform_admin() OR EXISTS (
    SELECT 1 FROM "Activity" a WHERE a.id="RubricScore"."activityId" AND a."tenantId"=app_tenant_id()
  ))
  WITH CHECK (app_is_platform_admin() OR EXISTS (
    SELECT 1 FROM "Activity" a WHERE a.id="RubricScore"."activityId" AND a."tenantId"=app_tenant_id()
  ));

-- Program-derived master tables. Global program rows are readable to tenant
-- context, tenant-specific programs only to their own tenant.
ALTER TABLE "ProgramVersion" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS program_version_isolation ON "ProgramVersion";
CREATE POLICY program_version_isolation ON "ProgramVersion"
  USING (app_is_platform_admin() OR EXISTS (
    SELECT 1 FROM "Program" p WHERE p.id="ProgramVersion"."programId" AND (p."tenantId" IS NULL OR p."tenantId"=app_tenant_id())
  ))
  WITH CHECK (app_is_platform_admin() OR EXISTS (
    SELECT 1 FROM "Program" p WHERE p.id="ProgramVersion"."programId" AND p."tenantId"=app_tenant_id()
  ));

ALTER TABLE "ProgramScoringConfig" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS program_scoring_isolation ON "ProgramScoringConfig";
CREATE POLICY program_scoring_isolation ON "ProgramScoringConfig"
  USING (app_is_platform_admin() OR EXISTS (
    SELECT 1 FROM "ProgramVersion" v JOIN "Program" p ON p.id=v."programId"
    WHERE v.id="ProgramScoringConfig"."programVersionId" AND (p."tenantId" IS NULL OR p."tenantId"=app_tenant_id())
  ))
  WITH CHECK (app_is_platform_admin() OR EXISTS (
    SELECT 1 FROM "ProgramVersion" v JOIN "Program" p ON p.id=v."programId"
    WHERE v.id="ProgramScoringConfig"."programVersionId" AND p."tenantId"=app_tenant_id()
  ));

ALTER TABLE "ProgramContentLink" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS program_content_isolation ON "ProgramContentLink";
CREATE POLICY program_content_isolation ON "ProgramContentLink"
  USING (app_is_platform_admin() OR EXISTS (
    SELECT 1 FROM "ProgramVersion" v JOIN "Program" p ON p.id=v."programId"
    WHERE v.id="ProgramContentLink"."programVersionId" AND (p."tenantId" IS NULL OR p."tenantId"=app_tenant_id())
  ))
  WITH CHECK (app_is_platform_admin() OR EXISTS (
    SELECT 1 FROM "ProgramVersion" v JOIN "Program" p ON p.id=v."programId"
    WHERE v.id="ProgramContentLink"."programVersionId" AND p."tenantId"=app_tenant_id()
  ));

-- Test question inherits test visibility.
ALTER TABLE "Question" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS question_isolation ON "Question";
CREATE POLICY question_isolation ON "Question"
  USING (app_is_platform_admin() OR EXISTS (
    SELECT 1 FROM "Test" t WHERE t.id="Question"."testId" AND (t."tenantId" IS NULL OR t."tenantId"=app_tenant_id())
  ))
  WITH CHECK (app_is_platform_admin() OR EXISTS (
    SELECT 1 FROM "Test" t WHERE t.id="Question"."testId" AND t."tenantId"=app_tenant_id()
  ));

-- 30-day-plan children inherit the plan tenant.
ALTER TABLE "PlanTarget" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plan_target_isolation ON "PlanTarget";
CREATE POLICY plan_target_isolation ON "PlanTarget"
  USING (app_is_platform_admin() OR EXISTS (
    SELECT 1 FROM "ThirtyDayPlan" p WHERE p.id="PlanTarget"."planId" AND p."tenantId"=app_tenant_id()
  ))
  WITH CHECK (app_is_platform_admin() OR EXISTS (
    SELECT 1 FROM "ThirtyDayPlan" p WHERE p.id="PlanTarget"."planId" AND p."tenantId"=app_tenant_id()
  ));

ALTER TABLE "FollowUp" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS follow_up_isolation ON "FollowUp";
CREATE POLICY follow_up_isolation ON "FollowUp"
  USING (app_is_platform_admin() OR EXISTS (
    SELECT 1 FROM "ThirtyDayPlan" p WHERE p.id="FollowUp"."planId" AND p."tenantId"=app_tenant_id()
  ))
  WITH CHECK (app_is_platform_admin() OR EXISTS (
    SELECT 1 FROM "ThirtyDayPlan" p WHERE p.id="FollowUp"."planId" AND p."tenantId"=app_tenant_id()
  ));

-- Consent records with tenantId are tenant-scoped. Global consent remains
-- platform-readable; user-specific access is enforced by application RBAC.
ALTER TABLE "ConsentRecord" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS consent_isolation ON "ConsentRecord";
CREATE POLICY consent_isolation ON "ConsentRecord"
  USING (app_is_platform_admin() OR "tenantId"=app_tenant_id())
  WITH CHECK (app_is_platform_admin() OR "tenantId"=app_tenant_id());

-- Identity tables (User/AuthSession/MagicLinkToken) intentionally remain outside
-- tenant RLS because one identity can participate in multiple tenants. Access to
-- them must only occur through authenticated server-side services.
