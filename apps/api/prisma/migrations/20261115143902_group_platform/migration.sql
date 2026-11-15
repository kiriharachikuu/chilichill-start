-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'QQ',
    "groupNumber" TEXT,
    "type" TEXT NOT NULL,
    "city" TEXT,
    "province" TEXT,
    "school" TEXT,
    "regionCode" TEXT,
    "regionName" TEXT,
    "description" TEXT NOT NULL,
    "purpose" TEXT,
    "joinUrl" TEXT,
    "qrcodeUrl" TEXT,
    "avatarUrl" TEXT,
    "uploaderId" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Group_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Group" ("avatarUrl", "city", "createdAt", "description", "groupNumber", "id", "joinUrl", "name", "province", "published", "purpose", "qrcodeUrl", "regionCode", "regionName", "school", "type", "updatedAt", "uploaderId") SELECT "avatarUrl", "city", "createdAt", "description", "groupNumber", "id", "joinUrl", "name", "province", "published", "purpose", "qrcodeUrl", "regionCode", "regionName", "school", "type", "updatedAt", "uploaderId" FROM "Group";
DROP TABLE "Group";
ALTER TABLE "new_Group" RENAME TO "Group";
CREATE UNIQUE INDEX "Group_groupNumber_key" ON "Group"("groupNumber");
CREATE INDEX "Group_published_regionCode_idx" ON "Group"("published", "regionCode");
CREATE INDEX "Group_published_createdAt_idx" ON "Group"("published", "createdAt");
CREATE INDEX "Group_type_idx" ON "Group"("type");
CREATE INDEX "Group_uploaderId_idx" ON "Group"("uploaderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
