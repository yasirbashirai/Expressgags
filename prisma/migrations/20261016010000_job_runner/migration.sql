
-- CreateTable
CREATE TABLE "JobState" (
    "name" TEXT NOT NULL,
    "lockedBy" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "lastStartedAt" TIMESTAMP(3),
    "lastFinishedAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastError" TEXT,
    "lastDurationMs" INTEGER,
    "lastResult" JSONB,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobState_pkey" PRIMARY KEY ("name")
);

