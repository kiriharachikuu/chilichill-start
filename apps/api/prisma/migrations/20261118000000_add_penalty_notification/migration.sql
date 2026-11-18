-- AlterTable
ALTER TABLE "User" ADD COLUMN "warningCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "muteCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "bannedAt" DATETIME;

-- CreateTable
CREATE TABLE "Penalty" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "durationDays" INTEGER,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" DATETIME,
    "reason" TEXT NOT NULL,
    "evidenceReportIds" TEXT NOT NULL DEFAULT '[]',
    "operatorId" TEXT,
    "revokedAt" DATETIME,
    "revokedById" TEXT,
    "revokeReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Penalty_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Penalty_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Penalty_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Penalty_userId_type_idx" ON "Penalty"("userId", "type");
CREATE INDEX "Penalty_userId_createdAt_idx" ON "Penalty"("userId", "createdAt");
CREATE INDEX "Penalty_revokedAt_startedAt_idx" ON "Penalty"("revokedAt", "startedAt");
CREATE INDEX "Penalty_type_endsAt_idx" ON "Penalty"("type", "endsAt");
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");
