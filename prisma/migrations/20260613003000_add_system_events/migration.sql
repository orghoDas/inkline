-- Create a small operational diagnostics table for production failures.
CREATE TABLE "SystemEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "context" JSONB,

    CONSTRAINT "SystemEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SystemEvent_createdAt_idx" ON "SystemEvent"("createdAt");
CREATE INDEX "SystemEvent_type_createdAt_idx" ON "SystemEvent"("type", "createdAt");
CREATE INDEX "SystemEvent_severity_createdAt_idx" ON "SystemEvent"("severity", "createdAt");
