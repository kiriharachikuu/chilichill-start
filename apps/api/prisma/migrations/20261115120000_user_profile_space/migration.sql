-- AlterTable
ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;
ALTER TABLE "User" ADD COLUMN "bio" TEXT;
ALTER TABLE "User" ADD COLUMN "city" TEXT;
ALTER TABLE "User" ADD COLUMN "province" TEXT;
ALTER TABLE "User" ADD COLUMN "uid" INTEGER;

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
    "avatarUrl" TEXT,
    "uploaderId" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Group_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Group" ("city", "createdAt", "description", "groupNumber", "id", "joinUrl", "name", "province", "published", "purpose", "qrcodeUrl", "regionCode", "regionName", "school", "type", "updatedAt") SELECT "city", "createdAt", "description", "groupNumber", "id", "joinUrl", "name", "province", "published", "purpose", "qrcodeUrl", "regionCode", "regionName", "school", "type", "updatedAt" FROM "Group";
DROP TABLE "Group";
ALTER TABLE "new_Group" RENAME TO "Group";
CREATE UNIQUE INDEX "Group_groupNumber_key" ON "Group"("groupNumber");
CREATE INDEX "Group_published_regionCode_idx" ON "Group"("published", "regionCode");
CREATE INDEX "Group_type_idx" ON "Group"("type");
CREATE INDEX "Group_uploaderId_idx" ON "Group"("uploaderId");
CREATE TABLE "new_Site" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "coverUrl" TEXT,
    "uploaderId" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Site_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Site" ("coverUrl", "createdAt", "description", "id", "published", "title", "updatedAt", "url") SELECT "coverUrl", "createdAt", "description", "id", "published", "title", "updatedAt", "url" FROM "Site";
DROP TABLE "Site";
ALTER TABLE "new_Site" RENAME TO "Site";
CREATE UNIQUE INDEX "Site_url_key" ON "Site"("url");
CREATE INDEX "Site_uploaderId_idx" ON "Site"("uploaderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Backfill：为存量用户按创建顺序分配 6 位 uid（100001 起递增）
UPDATE "User" SET "uid" = 100000 + (
  SELECT COUNT(*) FROM "User" AS u2
  WHERE u2."createdAt" < "User"."createdAt"
     OR (u2."createdAt" = "User"."createdAt" AND u2."id" <= "User"."id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_uid_key" ON "User"("uid");

