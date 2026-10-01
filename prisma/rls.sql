-- Sprint 1 RLS baseline.
-- Apply after Prisma migration when the application uses a non-owner DB role.
-- Request transactions should set app.current_tenant_id. Platform maintenance
-- uses app.is_platform_admin=true through a privileged server-only path.

CREATE OR REPLACE FUNCTION app_tenant_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_is_platform_admin() RETURNS boolean AS $$
  SELECT COALESCE(NULLIF(current_setting('app.is_platform_admin', true), '')::boolean, false)
$$ LANGUAGE sql STABLE;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Tenant','TenantMembership','Batch','Team','Session','Activity','Submission','ContentItem','Rubric','Test','ThirtyDayPlan','ImpactMetric','EvaluationL1','AuditLog','ParticipantImportJob']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS tenant_isolation ON "Tenant";
CREATE POLICY tenant_isolation ON "Tenant" USING (app_is_platform_admin() OR id = app_tenant_id()) WITH CHECK (app_is_platform_admin() OR id = app_tenant_id());

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['TenantMembership','Batch','Team','Session','Activity','Submission','ThirtyDayPlan','ImpactMetric','EvaluationL1','AuditLog','ParticipantImportJob']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (app_is_platform_admin() OR "tenantId" = app_tenant_id()) WITH CHECK (app_is_platform_admin() OR "tenantId" = app_tenant_id())', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS content_tenant_isolation ON "ContentItem";
CREATE POLICY content_tenant_isolation ON "ContentItem" USING (app_is_platform_admin() OR "tenantId" IS NULL OR "tenantId" = app_tenant_id()) WITH CHECK (app_is_platform_admin() OR "tenantId" = app_tenant_id());
DROP POLICY IF EXISTS rubric_tenant_isolation ON "Rubric";
CREATE POLICY rubric_tenant_isolation ON "Rubric" USING (app_is_platform_admin() OR "tenantId" IS NULL OR "tenantId" = app_tenant_id()) WITH CHECK (app_is_platform_admin() OR "tenantId" = app_tenant_id());
DROP POLICY IF EXISTS test_tenant_isolation ON "Test";
CREATE POLICY test_tenant_isolation ON "Test" USING (app_is_platform_admin() OR "tenantId" IS NULL OR "tenantId" = app_tenant_id()) WITH CHECK (app_is_platform_admin() OR "tenantId" = app_tenant_id());

-- Tables without tenantId are constrained through their parent.
ALTER TABLE "BatchMembership" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS batch_membership_isolation ON "BatchMembership";
CREATE POLICY batch_membership_isolation ON "BatchMembership" USING (app_is_platform_admin() OR EXISTS (SELECT 1 FROM "Batch" b WHERE b.id="BatchMembership"."batchId" AND b."tenantId"=app_tenant_id())) WITH CHECK (app_is_platform_admin() OR EXISTS (SELECT 1 FROM "Batch" b WHERE b.id="BatchMembership"."batchId" AND b."tenantId"=app_tenant_id()));

ALTER TABLE "ParticipantManagerLink" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS manager_link_isolation ON "ParticipantManagerLink";
CREATE POLICY manager_link_isolation ON "ParticipantManagerLink" USING (app_is_platform_admin() OR EXISTS (SELECT 1 FROM "Batch" b WHERE b.id="ParticipantManagerLink"."batchId" AND b."tenantId"=app_tenant_id())) WITH CHECK (app_is_platform_admin() OR EXISTS (SELECT 1 FROM "Batch" b WHERE b.id="ParticipantManagerLink"."batchId" AND b."tenantId"=app_tenant_id()));
