PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Unit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "floor" INTEGER NOT NULL,
    "propertyId" TEXT NOT NULL,
    "residentId" TEXT,
    "publicToken" TEXT NOT NULL,
    CONSTRAINT "Unit_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Unit_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Unit" ("id", "number", "floor", "propertyId", "residentId", "publicToken")
SELECT "id", "number", "floor", "propertyId", "residentId", 'unit_' || lower(hex(randomblob(16)))
FROM "Unit";

DROP TABLE "Unit";
ALTER TABLE "new_Unit" RENAME TO "Unit";

CREATE UNIQUE INDEX "Unit_residentId_key" ON "Unit"("residentId");
CREATE UNIQUE INDEX "Unit_publicToken_key" ON "Unit"("publicToken");

ALTER TABLE "MaintenanceRequest" ADD COLUMN "reporterName" TEXT;
ALTER TABLE "MaintenanceRequest" ADD COLUMN "reporterPhone" TEXT;
ALTER TABLE "MaintenanceRequest" ADD COLUMN "laborCostHalalas" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MaintenanceRequest" ADD COLUMN "partsCostHalalas" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MaintenanceRequest" ADD COLUMN "rating" INTEGER;
ALTER TABLE "MaintenanceRequest" ADD COLUMN "ratingComment" TEXT;
ALTER TABLE "MaintenanceRequest" ADD COLUMN "ratedAt" DATETIME;

CREATE TABLE "PreventivePlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT,
    "assignedTechnicianId" TEXT,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "frequencyDays" INTEGER NOT NULL,
    "nextDueAt" DATETIME NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastCompletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PreventivePlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PreventivePlan_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PreventivePlan_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PreventivePlan_assignedTechnicianId_fkey" FOREIGN KEY ("assignedTechnicianId") REFERENCES "TechnicianProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "PreventivePlan_organizationId_nextDueAt_idx" ON "PreventivePlan"("organizationId", "nextDueAt");
CREATE INDEX "PreventivePlan_propertyId_idx" ON "PreventivePlan"("propertyId");
CREATE INDEX "PreventivePlan_unitId_idx" ON "PreventivePlan"("unitId");
CREATE INDEX "PreventivePlan_assignedTechnicianId_idx" ON "PreventivePlan"("assignedTechnicianId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
