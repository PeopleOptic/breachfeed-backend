-- CreateTable
CREATE TABLE "Regulator" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "acronym" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "description" TEXT,
    "website" TEXT,
    "establishedDate" TIMESTAMP(3),
    "jurisdiction" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Regulator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Regulation" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT,
    "category" TEXT NOT NULL,
    "regulatorId" TEXT NOT NULL,
    "enactedDate" TIMESTAMP(3),
    "effectiveDate" TIMESTAMP(3),
    "description" TEXT,
    "scope" TEXT,
    "relatedRegulations" TEXT[],
    "pdfUrl" TEXT,
    "rssFeedUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Regulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Amendment" (
    "id" TEXT NOT NULL,
    "regulationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "changes" TEXT,
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Amendment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulationArticle" (
    "id" TEXT NOT NULL,
    "regulationId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "relevanceScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegulationArticle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Regulator_slug_key" ON "Regulator"("slug");

-- CreateIndex
CREATE INDEX "Regulator_slug_idx" ON "Regulator"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Regulation_slug_key" ON "Regulation"("slug");

-- CreateIndex
CREATE INDEX "Regulation_category_idx" ON "Regulation"("category");

-- CreateIndex
CREATE INDEX "Regulation_slug_idx" ON "Regulation"("slug");

-- CreateIndex
CREATE INDEX "Amendment_regulationId_idx" ON "Amendment"("regulationId");

-- CreateIndex
CREATE INDEX "Amendment_effectiveDate_idx" ON "Amendment"("effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "RegulationArticle_regulationId_articleId_key" ON "RegulationArticle"("regulationId", "articleId");

-- CreateIndex
CREATE INDEX "RegulationArticle_regulationId_idx" ON "RegulationArticle"("regulationId");

-- AddForeignKey
ALTER TABLE "Regulation" ADD CONSTRAINT "Regulation_regulatorId_fkey" FOREIGN KEY ("regulatorId") REFERENCES "Regulator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Amendment" ADD CONSTRAINT "Amendment_regulationId_fkey" FOREIGN KEY ("regulationId") REFERENCES "Regulation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulationArticle" ADD CONSTRAINT "RegulationArticle_regulationId_fkey" FOREIGN KEY ("regulationId") REFERENCES "Regulation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulationArticle" ADD CONSTRAINT "RegulationArticle_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;