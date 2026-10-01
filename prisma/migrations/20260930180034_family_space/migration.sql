-- CreateTable
CREATE TABLE "FamilyLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FamilyLink_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FamilyLink_childId_fkey" FOREIGN KEY ("childId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Cheer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "sticker" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenAt" DATETIME,
    CONSTRAINT "Cheer_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Cheer_toId_fkey" FOREIGN KEY ("toId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Challenge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "target" INTEGER NOT NULL,
    "baseline" INTEGER NOT NULL DEFAULT 0,
    "reward" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Challenge_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Challenge_toId_fkey" FOREIGN KEY ("toId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "schoolClass" TEXT,
    "school" TEXT,
    "avatar" TEXT,
    "role" TEXT NOT NULL DEFAULT 'student',
    "familyCode" TEXT,
    "familyCodeExpires" DATETIME,
    "shareMood" BOOLEAN NOT NULL DEFAULT false,
    "learnSnapshot" TEXT,
    "learnSyncedAt" DATETIME
);
INSERT INTO "new_User" ("avatar", "createdAt", "email", "firstName", "id", "lastName", "name", "passwordHash", "school", "schoolClass", "updatedAt") SELECT "avatar", "createdAt", "email", "firstName", "id", "lastName", "name", "passwordHash", "school", "schoolClass", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_familyCode_key" ON "User"("familyCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "FamilyLink_childId_idx" ON "FamilyLink"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyLink_parentId_childId_key" ON "FamilyLink"("parentId", "childId");

-- CreateIndex
CREATE INDEX "Cheer_toId_createdAt_idx" ON "Cheer"("toId", "createdAt");

-- CreateIndex
CREATE INDEX "Challenge_toId_createdAt_idx" ON "Challenge"("toId", "createdAt");

-- CreateIndex
CREATE INDEX "Challenge_fromId_createdAt_idx" ON "Challenge"("fromId", "createdAt");
