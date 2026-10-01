-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('SUPER_ADMIN', 'STANDARD');

-- CreateEnum
CREATE TYPE "MagicLinkPurpose" AS ENUM ('MANAGER_LOGIN', 'ACCOUNT_ACTIVATION');

-- CreateEnum
CREATE TYPE "MfaChallengePurpose" AS ENUM ('LOGIN', 'ENROLLMENT');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

-- CreateEnum
CREATE TYPE "TenantRole" AS ENUM ('PROGRAM_ADMIN', 'SPONSOR_VIEWER', 'MEMBER');

-- CreateEnum
CREATE TYPE "BatchRole" AS ENUM ('PROGRAM_ADMIN', 'LEAD_TRAINER', 'CO_FACILITATOR', 'PARTICIPANT', 'LINE_MANAGER', 'SPONSOR_VIEWER');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('DRAFT', 'PRE_TRAINING', 'ACTIVE', 'FOLLOW_UP', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('DRAFT', 'OPEN', 'LOCKED', 'REVEALED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('SELF_DIAGNOSTIC', 'MINUTE_AUDIT', 'PRE_TEST', 'POST_TEST', 'PRIORITY_SCORECARD', 'WEEKLY_PLANNER', 'DAILY_BIG_3', 'MEETING_CHECKLIST', 'DELEGATION_CONTRACT', 'RACI_BUILDER', 'GROW_COACHING', 'SBI_FEEDBACK', 'FACT_ASSUMPTION_OPINION_UNKNOWN', 'FIVE_WHYS', 'FISHBONE', 'ISSUE_TREE', 'BIAS_CHECKLIST', 'DECISION_MATRIX', 'PRE_MORTEM', 'DECISION_LOG', 'ACTION_TRACKER', 'LEADERSHIP_MIRROR', 'PRIORITY_POKER', 'CALENDAR_TETRIS', 'DELEGATION_RELAY', 'FACT_OR_FICTION', 'DETECTIVE_ROOM', 'ROOT_CAUSE_RACE', 'BIAS_TRAP', 'DECISION_AUCTION', 'BOARDROOM', 'ARENA', 'WAR_ROOM', 'REFLECTION', 'AAR_STOP_START_CONTINUE', 'EVALUATION_L1', 'THIRTY_DAY_PLAN');

-- CreateEnum
CREATE TYPE "SubmissionOwnerType" AS ENUM ('USER', 'TEAM');

-- CreateEnum
CREATE TYPE "AttemptKind" AS ENUM ('PRE', 'POST');

-- CreateEnum
CREATE TYPE "FollowUpKind" AS ENUM ('D7', 'D14', 'D30');

-- CreateEnum
CREATE TYPE "MetricDirection" AS ENUM ('UP_IS_BETTER', 'DOWN_IS_BETTER');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'OPEN_ACTIVITY', 'LOCK_ACTIVITY', 'REVEAL_KEY', 'SEND_EVENT', 'CHANGE_SCORE', 'EXPORT_DATA', 'DELETE_DATA_REQUEST', 'CONSENT_ACCEPTED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platformRole" "PlatformRole" NOT NULL DEFAULT 'STANDARD',
    "passwordHash" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "emailVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "retentionDays" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantMembership" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "TenantRole" NOT NULL DEFAULT 'MEMBER',
    "displayName" TEXT,
    "employeeNo" TEXT,
    "unit" TEXT,
    "title" TEXT,
    "invitedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Program" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramVersion" (
    "id" UUID NOT NULL,
    "programId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "contentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "ProgramVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramScoringConfig" (
    "id" UUID NOT NULL,
    "programVersionId" UUID NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "config" JSONB NOT NULL,
    "configHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramScoringConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "programVersionId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "joinCode" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "status" "BatchStatus" NOT NULL DEFAULT 'DRAFT',
    "teamCount" INTEGER NOT NULL DEFAULT 4,
    "participantTarget" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchScoringConfig" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "config" JSONB NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "frozenAt" TIMESTAMP(3),

    CONSTRAINT "BatchScoringConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchMembership" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "BatchRole" NOT NULL,
    "teamId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatchMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticipantManagerLink" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "participantUserId" UUID NOT NULL,
    "managerUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParticipantManagerLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObserverTeamAssignment" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "observerUserId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObserverTeamAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "sessionId" UUID,
    "type" "ActivityType" NOT NULL,
    "title" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" "ActivityStatus" NOT NULL DEFAULT 'DRAFT',
    "config" JSONB NOT NULL,
    "contentVersion" TEXT,
    "openedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "revealedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "activityId" UUID NOT NULL,
    "ownerType" "SubmissionOwnerType" NOT NULL,
    "userId" UUID,
    "teamId" UUID,
    "submissionKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "score" DECIMAL(10,4),
    "scoreDetail" JSONB,
    "isPrivateReflection" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameRound" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "activityId" UUID NOT NULL,
    "teamId" UUID,
    "roundNo" INTEGER NOT NULL,
    "state" JSONB NOT NULL,
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "GameRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentItem" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "type" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "answerKey" JSONB,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramContentLink" (
    "id" UUID NOT NULL,
    "programVersionId" UUID NOT NULL,
    "contentItemId" UUID NOT NULL,
    "sequence" INTEGER,

    CONSTRAINT "ProgramContentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rubric" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "dimensions" JSONB NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Rubric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RubricScore" (
    "id" UUID NOT NULL,
    "activityId" UUID NOT NULL,
    "rubricId" UUID NOT NULL,
    "observerUserId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "dimensionCode" TEXT NOT NULL,
    "rawValue" DECIMAL(10,4) NOT NULL,
    "weightedValue" DECIMAL(10,4),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RubricScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Test" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "durationSec" INTEGER,

    CONSTRAINT "Test_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" UUID NOT NULL,
    "testId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "answerKey" TEXT NOT NULL,
    "explanation" TEXT,
    "points" INTEGER NOT NULL DEFAULT 5,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestAttempt" (
    "id" UUID NOT NULL,
    "testId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "kind" "AttemptKind" NOT NULL,
    "answers" JSONB NOT NULL,
    "score" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "TestAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThirtyDayPlan" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "participantUserId" UUID NOT NULL,
    "managerUserId" UUID,
    "startDate" TIMESTAMP(3) NOT NULL,
    "reviewD7" TIMESTAMP(3) NOT NULL,
    "reviewD14" TIMESTAMP(3) NOT NULL,
    "reviewD30" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThirtyDayPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanTarget" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "behavior" TEXT NOT NULL,
    "elements" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUp" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "kind" "FollowUpKind" NOT NULL,
    "authorUserId" UUID NOT NULL,
    "answers" JSONB NOT NULL,
    "progressPct" DECIMAL(5,2) NOT NULL,
    "statusLabel" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImpactMetric" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "participantUserId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "direction" "MetricDirection" NOT NULL,
    "baseline" DECIMAL(18,4),
    "day30" DECIMAL(18,4),
    "percentChange" DECIMAL(12,6),
    "improved" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImpactMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationL1" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "participantUserId" UUID NOT NULL,
    "answers" JSONB NOT NULL,
    "averageScore" DECIMAL(10,4),
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "EvaluationL1_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "batchId" UUID,
    "actorUserId" UUID,
    "action" "AuditAction" NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "beforeHash" TEXT,
    "afterHash" TEXT,
    "metadata" JSONB,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MagicLinkToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" "MagicLinkPurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MagicLinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MfaCredential" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "encryptedSecret" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "enabledAt" TIMESTAMP(3),
    "lastUsedCounter" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MfaCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MfaChallenge" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" "MfaChallengePurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfaChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tenantId" UUID,
    "version" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipHash" TEXT,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticipantImportJob" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'PENDING',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "successRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "warnings" JSONB,
    "errors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ParticipantImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "TenantMembership_userId_role_idx" ON "TenantMembership"("userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "TenantMembership_tenantId_userId_key" ON "TenantMembership"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Program_tenantId_code_key" ON "Program"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramVersion_programId_version_key" ON "ProgramVersion"("programId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramScoringConfig_programVersionId_key" ON "ProgramScoringConfig"("programVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "Batch_joinCode_key" ON "Batch"("joinCode");

-- CreateIndex
CREATE INDEX "Batch_tenantId_status_startDate_idx" ON "Batch"("tenantId", "status", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "Batch_tenantId_code_key" ON "Batch"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "BatchScoringConfig_batchId_key" ON "BatchScoringConfig"("batchId");

-- CreateIndex
CREATE INDEX "BatchMembership_batchId_role_idx" ON "BatchMembership"("batchId", "role");

-- CreateIndex
CREATE INDEX "BatchMembership_teamId_idx" ON "BatchMembership"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "BatchMembership_batchId_userId_key" ON "BatchMembership"("batchId", "userId");

-- CreateIndex
CREATE INDEX "ParticipantManagerLink_batchId_managerUserId_idx" ON "ParticipantManagerLink"("batchId", "managerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ParticipantManagerLink_batchId_participantUserId_key" ON "ParticipantManagerLink"("batchId", "participantUserId");

-- CreateIndex
CREATE INDEX "Team_tenantId_batchId_idx" ON "Team"("tenantId", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_batchId_number_key" ON "Team"("batchId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "ObserverTeamAssignment_batchId_observerUserId_teamId_key" ON "ObserverTeamAssignment"("batchId", "observerUserId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_batchId_sequence_key" ON "Session"("batchId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Session_batchId_code_key" ON "Session"("batchId", "code");

-- CreateIndex
CREATE INDEX "Activity_tenantId_batchId_status_idx" ON "Activity"("tenantId", "batchId", "status");

-- CreateIndex
CREATE INDEX "Activity_batchId_sequence_idx" ON "Activity"("batchId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_submissionKey_key" ON "Submission"("submissionKey");

-- CreateIndex
CREATE INDEX "Submission_tenantId_batchId_activityId_idx" ON "Submission"("tenantId", "batchId", "activityId");

-- CreateIndex
CREATE INDEX "Submission_userId_activityId_idx" ON "Submission"("userId", "activityId");

-- CreateIndex
CREATE INDEX "Submission_teamId_activityId_idx" ON "Submission"("teamId", "activityId");

-- CreateIndex
CREATE UNIQUE INDEX "GameRound_activityId_teamId_roundNo_key" ON "GameRound"("activityId", "teamId", "roundNo");

-- CreateIndex
CREATE INDEX "ContentItem_type_isPublished_idx" ON "ContentItem"("type", "isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "ContentItem_tenantId_code_version_key" ON "ContentItem"("tenantId", "code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramContentLink_programVersionId_contentItemId_key" ON "ProgramContentLink"("programVersionId", "contentItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Rubric_tenantId_code_version_key" ON "Rubric"("tenantId", "code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "RubricScore_activityId_observerUserId_teamId_dimensionCode_key" ON "RubricScore"("activityId", "observerUserId", "teamId", "dimensionCode");

-- CreateIndex
CREATE UNIQUE INDEX "Test_tenantId_code_version_key" ON "Test"("tenantId", "code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Question_testId_code_key" ON "Question"("testId", "code");

-- CreateIndex
CREATE INDEX "TestAttempt_batchId_kind_idx" ON "TestAttempt"("batchId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "TestAttempt_testId_userId_batchId_kind_key" ON "TestAttempt"("testId", "userId", "batchId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ThirtyDayPlan_batchId_participantUserId_key" ON "ThirtyDayPlan"("batchId", "participantUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanTarget_planId_sequence_key" ON "PlanTarget"("planId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "FollowUp_planId_kind_key" ON "FollowUp"("planId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ImpactMetric_batchId_participantUserId_code_key" ON "ImpactMetric"("batchId", "participantUserId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationL1_batchId_participantUserId_key" ON "EvaluationL1"("batchId", "participantUserId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_batchId_createdAt_idx" ON "AuditLog"("batchId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_userId_expiresAt_idx" ON "AuthSession"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MagicLinkToken_tokenHash_key" ON "MagicLinkToken"("tokenHash");

-- CreateIndex
CREATE INDEX "MagicLinkToken_userId_purpose_expiresAt_idx" ON "MagicLinkToken"("userId", "purpose", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MfaCredential_userId_key" ON "MfaCredential"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MfaChallenge_tokenHash_key" ON "MfaChallenge"("tokenHash");

-- CreateIndex
CREATE INDEX "MfaChallenge_userId_purpose_expiresAt_idx" ON "MfaChallenge"("userId", "purpose", "expiresAt");

-- CreateIndex
CREATE INDEX "ConsentRecord_userId_acceptedAt_idx" ON "ConsentRecord"("userId", "acceptedAt");

-- CreateIndex
CREATE INDEX "ConsentRecord_tenantId_acceptedAt_idx" ON "ConsentRecord"("tenantId", "acceptedAt");

-- CreateIndex
CREATE INDEX "ParticipantImportJob_tenantId_batchId_createdAt_idx" ON "ParticipantImportJob"("tenantId", "batchId", "createdAt");

-- AddForeignKey
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramVersion" ADD CONSTRAINT "ProgramVersion_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramScoringConfig" ADD CONSTRAINT "ProgramScoringConfig_programVersionId_fkey" FOREIGN KEY ("programVersionId") REFERENCES "ProgramVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_programVersionId_fkey" FOREIGN KEY ("programVersionId") REFERENCES "ProgramVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchScoringConfig" ADD CONSTRAINT "BatchScoringConfig_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchMembership" ADD CONSTRAINT "BatchMembership_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchMembership" ADD CONSTRAINT "BatchMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchMembership" ADD CONSTRAINT "BatchMembership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantManagerLink" ADD CONSTRAINT "ParticipantManagerLink_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantManagerLink" ADD CONSTRAINT "ParticipantManagerLink_participantUserId_fkey" FOREIGN KEY ("participantUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantManagerLink" ADD CONSTRAINT "ParticipantManagerLink_managerUserId_fkey" FOREIGN KEY ("managerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObserverTeamAssignment" ADD CONSTRAINT "ObserverTeamAssignment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObserverTeamAssignment" ADD CONSTRAINT "ObserverTeamAssignment_observerUserId_fkey" FOREIGN KEY ("observerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObserverTeamAssignment" ADD CONSTRAINT "ObserverTeamAssignment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRound" ADD CONSTRAINT "GameRound_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRound" ADD CONSTRAINT "GameRound_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRound" ADD CONSTRAINT "GameRound_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramContentLink" ADD CONSTRAINT "ProgramContentLink_programVersionId_fkey" FOREIGN KEY ("programVersionId") REFERENCES "ProgramVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramContentLink" ADD CONSTRAINT "ProgramContentLink_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rubric" ADD CONSTRAINT "Rubric_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RubricScore" ADD CONSTRAINT "RubricScore_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RubricScore" ADD CONSTRAINT "RubricScore_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "Rubric"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RubricScore" ADD CONSTRAINT "RubricScore_observerUserId_fkey" FOREIGN KEY ("observerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RubricScore" ADD CONSTRAINT "RubricScore_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Test" ADD CONSTRAINT "Test_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestAttempt" ADD CONSTRAINT "TestAttempt_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestAttempt" ADD CONSTRAINT "TestAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThirtyDayPlan" ADD CONSTRAINT "ThirtyDayPlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThirtyDayPlan" ADD CONSTRAINT "ThirtyDayPlan_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThirtyDayPlan" ADD CONSTRAINT "ThirtyDayPlan_participantUserId_fkey" FOREIGN KEY ("participantUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThirtyDayPlan" ADD CONSTRAINT "ThirtyDayPlan_managerUserId_fkey" FOREIGN KEY ("managerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanTarget" ADD CONSTRAINT "PlanTarget_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ThirtyDayPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ThirtyDayPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpactMetric" ADD CONSTRAINT "ImpactMetric_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpactMetric" ADD CONSTRAINT "ImpactMetric_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationL1" ADD CONSTRAINT "EvaluationL1_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationL1" ADD CONSTRAINT "EvaluationL1_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationL1" ADD CONSTRAINT "EvaluationL1_participantUserId_fkey" FOREIGN KEY ("participantUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MagicLinkToken" ADD CONSTRAINT "MagicLinkToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MfaCredential" ADD CONSTRAINT "MfaCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MfaChallenge" ADD CONSTRAINT "MfaChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantImportJob" ADD CONSTRAINT "ParticipantImportJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantImportJob" ADD CONSTRAINT "ParticipantImportJob_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantImportJob" ADD CONSTRAINT "ParticipantImportJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

