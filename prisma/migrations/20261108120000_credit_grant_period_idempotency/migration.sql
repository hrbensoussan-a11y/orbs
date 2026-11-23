-- Idempotence atomique des octrois de crédits par période (fix audit Stripe P0).
--
-- `cycleKey` porte une clé d'idempotence déterministe sur les lignes d'OCTROI
-- (grant_cycle / grant_upgrade), dérivée du début de période (jamais de
-- l'horloge courante). La contrainte unique (userId, cycleKey) fait de
-- l'insertion une garde atomique : des webhooks rejoués ou simultanés visant la
-- même période ne créditent qu'une seule fois. Les lignes hors octroi laissent
-- `cycleKey` à NULL (plusieurs NULL autorisés dans un index unique).

-- AlterTable
ALTER TABLE "CreditLedger" ADD COLUMN "cycleKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CreditLedger_userId_cycleKey_key" ON "CreditLedger"("userId", "cycleKey");
