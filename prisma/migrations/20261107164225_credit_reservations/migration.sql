-- CreateTable
CREATE TABLE "CreditReservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "op" TEXT NOT NULL,
    "engine" TEXT,
    "estimated" INTEGER NOT NULL,
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CreditReservation_userId_idx" ON "CreditReservation"("userId");

-- CreateIndex
CREATE INDEX "CreditReservation_createdAt_idx" ON "CreditReservation"("createdAt");
