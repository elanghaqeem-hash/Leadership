-- Persistent, privacy-preserving rate-limit buckets for authentication and abuse controls.
CREATE TABLE "RateLimitBucket" (
  "key" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");
CREATE INDEX "RateLimitBucket_scope_windowStart_idx" ON "RateLimitBucket"("scope","windowStart");
