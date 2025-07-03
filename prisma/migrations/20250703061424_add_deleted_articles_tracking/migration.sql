-- CreateTable
CREATE TABLE "DeletedArticle" (
    "id" TEXT NOT NULL,
    "articleLink" TEXT NOT NULL,
    "articleGuid" TEXT,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedBy" TEXT,
    "reason" TEXT,

    CONSTRAINT "DeletedArticle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeletedArticle_articleLink_key" ON "DeletedArticle"("articleLink");

-- CreateIndex
CREATE INDEX "DeletedArticle_articleLink_idx" ON "DeletedArticle"("articleLink");

-- CreateIndex
CREATE INDEX "DeletedArticle_articleGuid_idx" ON "DeletedArticle"("articleGuid");

-- CreateIndex
CREATE INDEX "DeletedArticle_deletedAt_idx" ON "DeletedArticle"("deletedAt");