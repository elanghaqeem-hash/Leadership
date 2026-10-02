-- Two-day attendance tracking for Leadership That Works.
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT','LATE','ABSENT','EXCUSED');

CREATE TABLE "AttendanceRecord" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "batchId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "day" INTEGER NOT NULL,
  "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
  "checkedInAt" TIMESTAMP(3),
  "note" TEXT,
  "markedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AttendanceRecord_batchId_userId_day_key" ON "AttendanceRecord"("batchId","userId","day");
CREATE INDEX "AttendanceRecord_tenantId_batchId_day_status_idx" ON "AttendanceRecord"("tenantId","batchId","day","status");
CREATE INDEX "AttendanceRecord_userId_batchId_idx" ON "AttendanceRecord"("userId","batchId");

ALTER TABLE "AttendanceRecord"
  ADD CONSTRAINT "AttendanceRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord"
  ADD CONSTRAINT "AttendanceRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord"
  ADD CONSTRAINT "AttendanceRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord"
  ADD CONSTRAINT "AttendanceRecord_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AttendanceRecord" ENABLE ROW LEVEL SECURITY;
CREATE POLICY attendance_tenant_isolation ON "AttendanceRecord"
  USING (app_is_platform_admin() OR "tenantId" = app_tenant_id())
  WITH CHECK (app_is_platform_admin() OR "tenantId" = app_tenant_id());
