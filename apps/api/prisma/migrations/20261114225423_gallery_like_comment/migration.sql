-- CreateTable
CREATE TABLE "GalleryImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "imageUrl" TEXT NOT NULL,
    "title" TEXT,
    "uploaderId" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GalleryImage_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GalleryLike" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "imageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GalleryLike_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "GalleryImage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GalleryLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GalleryComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "imageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GalleryComment_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "GalleryImage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GalleryComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "GalleryImage_published_createdAt_idx" ON "GalleryImage"("published", "createdAt");

-- CreateIndex
CREATE INDEX "GalleryImage_uploaderId_idx" ON "GalleryImage"("uploaderId");

-- CreateIndex
CREATE INDEX "GalleryLike_userId_idx" ON "GalleryLike"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GalleryLike_imageId_userId_key" ON "GalleryLike"("imageId", "userId");

-- CreateIndex
CREATE INDEX "GalleryComment_imageId_createdAt_idx" ON "GalleryComment"("imageId", "createdAt");

-- CreateIndex
CREATE INDEX "GalleryComment_userId_idx" ON "GalleryComment"("userId");
