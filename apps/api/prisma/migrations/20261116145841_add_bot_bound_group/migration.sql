-- CreateTable
CREATE TABLE "BotBoundGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupOpenId" TEXT NOT NULL,
    "name" TEXT,
    "source" TEXT NOT NULL DEFAULT 'GROUP_ADD_ROBOT',
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "BotBoundGroup_groupOpenId_key" ON "BotBoundGroup"("groupOpenId");
