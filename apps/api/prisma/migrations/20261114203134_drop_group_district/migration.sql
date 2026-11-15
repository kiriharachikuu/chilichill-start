/*
  Warnings:

  - You are about to drop the column `district` on the `Group` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "groupNumber" TEXT NOT NULL,
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
    "memberCount" INTEGER,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Group" ("city", "createdAt", "description", "groupNumber", "id", "joinUrl", "memberCount", "name", "province", "published", "purpose", "qrcodeUrl", "regionCode", "regionName", "school", "type", "updatedAt") SELECT "city", "createdAt", "description", "groupNumber", "id", "joinUrl", "memberCount", "name", "province", "published", "purpose", "qrcodeUrl", "regionCode", "regionName", "school", "type", "updatedAt" FROM "Group";
DROP TABLE "Group";
ALTER TABLE "new_Group" RENAME TO "Group";
CREATE UNIQUE INDEX "Group_groupNumber_key" ON "Group"("groupNumber");
CREATE INDEX "Group_published_regionCode_idx" ON "Group"("published", "regionCode");
CREATE INDEX "Group_type_idx" ON "Group"("type");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
