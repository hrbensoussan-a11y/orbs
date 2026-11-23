-- AlterTable
ALTER TABLE "User" ADD COLUMN "emailVerified" DATETIME;

-- Les comptes créés AVANT la vérification par e-mail sont considérés comme
-- vérifiés (on ne verrouille personne rétroactivement). Les nouveaux comptes
-- devront vérifier leur e-mail à l'inscription.
UPDATE "User" SET "emailVerified" = "createdAt" WHERE "emailVerified" IS NULL;

-- CreateTable
CREATE TABLE "EmailCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "payload" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "EmailCode_email_purpose_idx" ON "EmailCode"("email", "purpose");

-- CreateIndex
CREATE INDEX "EmailCode_expiresAt_idx" ON "EmailCode"("expiresAt");
