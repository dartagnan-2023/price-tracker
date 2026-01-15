-- CreateTable
CREATE TABLE "Month" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "monthId" INTEGER,
    "fileAssetId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED' CHECK ("status" IN ('PENDING_REVIEW', 'COMPLETED', 'FAILED')),
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "totalLines" INTEGER NOT NULL DEFAULT 0,
    "validLines" INTEGER NOT NULL DEFAULT 0,
    "errorLog" TEXT,
    "pendingReason" TEXT,
    "ocrConfidenceAvg" REAL,
    "mappingConfidence" REAL,
    "competenceSource" TEXT,
    "mappingProfileId" INTEGER,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImportBatch_monthId_fkey" FOREIGN KEY ("monthId") REFERENCES "Month" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImportBatch_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ImportBatch_mappingProfileId_fkey" FOREIGN KEY ("mappingProfileId") REFERENCES "MappingProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "importBatchId" INTEGER NOT NULL,
    "partNumber" TEXT NOT NULL,
    "rawPartNumber" TEXT NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "lineNumber" INTEGER,
    "rawData" TEXT,
    "correctionStatus" TEXT NOT NULL DEFAULT 'NONE' CHECK ("correctionStatus" IN ('NONE', 'AUTO_CORRECTED', 'NEEDS_REVIEW', 'RESOLVED')),
    "suggestedPartNumber" TEXT,
    "correctionConfidence" REAL,
    "resolvedAt" DATETIME,
    "resolvedBy" TEXT,
    "resolutionNote" TEXT,
    CONSTRAINT "ProductLine_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FileAsset" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "originalFilename" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileType" TEXT NOT NULL CHECK ("fileType" IN ('CSV', 'XLSX', 'XLS', 'PNG', 'JPG', 'JPEG')),
    "fileSize" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MappingProfile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "mappingJson" TEXT NOT NULL,
    "autoDetected" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Month_label_key" ON "Month"("label");

-- CreateIndex
CREATE UNIQUE INDEX "Month_year_month_key" ON "Month"("year", "month");

-- CreateIndex
CREATE INDEX "ImportBatch_monthId_idx" ON "ImportBatch"("monthId");

-- CreateIndex
CREATE INDEX "ImportBatch_isActive_monthId_idx" ON "ImportBatch"("isActive", "monthId");

-- CreateIndex
CREATE INDEX "ProductLine_importBatchId_partNumber_idx" ON "ProductLine"("importBatchId", "partNumber");

-- CreateIndex
CREATE INDEX "ProductLine_partNumber_idx" ON "ProductLine"("partNumber");

-- CreateIndex
CREATE UNIQUE INDEX "FileAsset_hash_key" ON "FileAsset"("hash");

-- CreateIndex
CREATE UNIQUE INDEX "MappingProfile_name_key" ON "MappingProfile"("name");
