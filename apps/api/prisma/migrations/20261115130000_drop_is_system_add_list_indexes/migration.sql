-- DropColumn
ALTER TABLE "Tag" DROP COLUMN "isSystem";

-- CreateIndex
CREATE INDEX "Group_published_createdAt_idx" ON "Group"("published", "createdAt");

-- CreateIndex
CREATE INDEX "Site_published_createdAt_idx" ON "Site"("published", "createdAt");
