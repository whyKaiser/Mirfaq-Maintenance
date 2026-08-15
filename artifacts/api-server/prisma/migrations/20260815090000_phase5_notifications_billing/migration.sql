-- Phase 5: notifications, subscription plans and billing.

ALTER TABLE "Organization" ADD COLUMN "planCode" TEXT NOT NULL DEFAULT 'tajribi';
ALTER TABLE "Organization" ADD COLUMN "planStatus" TEXT NOT NULL DEFAULT 'نشط';
ALTER TABLE "Organization" ADD COLUMN "planRenewsAt" DATETIME;
ALTER TABLE "Organization" ADD COLUMN "planStartedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "User" ADD COLUMN "notifyInApp" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "notifyEmail" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");
CREATE INDEX "Notification_organizationId_createdAt_idx" ON "Notification"("organizationId", "createdAt");

CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "planCode" TEXT NOT NULL,
    "subscriptionHalalas" INTEGER NOT NULL DEFAULT 0,
    "maintenanceHalalas" INTEGER NOT NULL DEFAULT 0,
    "vatHalalas" INTEGER NOT NULL DEFAULT 0,
    "totalHalalas" INTEGER NOT NULL DEFAULT 0,
    "requestsCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'مسودة',
    "issuedAt" DATETIME,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Invoice_organizationId_periodStart_key" ON "Invoice"("organizationId", "periodStart");
CREATE INDEX "Invoice_organizationId_periodStart_idx" ON "Invoice"("organizationId", "periodStart");
