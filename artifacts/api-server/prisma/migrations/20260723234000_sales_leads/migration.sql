CREATE TABLE "SalesLead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "unitsCount" INTEGER,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'جديد',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesLead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "SalesLead_createdAt_idx" ON "SalesLead"("createdAt");
