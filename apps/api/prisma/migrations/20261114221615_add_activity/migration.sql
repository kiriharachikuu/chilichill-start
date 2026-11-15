-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "coverUrl" TEXT,
    "description" TEXT,
    "linkUrl" TEXT,
    "contentHtml" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Activity_published_sortOrder_startDate_idx" ON "Activity"("published", "sortOrder", "startDate");
