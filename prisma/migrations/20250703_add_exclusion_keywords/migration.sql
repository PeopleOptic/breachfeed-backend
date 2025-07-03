-- CreateTable
CREATE TABLE "ExclusionKeyword" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "feedId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExclusionKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExclusionKeyword_keyword_idx" ON "ExclusionKeyword"("keyword");

-- CreateIndex
CREATE INDEX "ExclusionKeyword_feedId_idx" ON "ExclusionKeyword"("feedId");

-- CreateIndex
CREATE INDEX "ExclusionKeyword_isActive_idx" ON "ExclusionKeyword"("isActive");

-- AddForeignKey
ALTER TABLE "ExclusionKeyword" ADD CONSTRAINT "ExclusionKeyword_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "RssFeed"("id") ON DELETE CASCADE ON UPDATE CASCADE;