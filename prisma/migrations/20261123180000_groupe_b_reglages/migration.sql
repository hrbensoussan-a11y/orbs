-- Groupe B des Réglages.
-- B1 : suppression du verrouillage PIN du journal, abandonné. Ces trois
--      colonnes n'étaient lues nulle part (aucun écran ni contrôle d'accès) ;
--      les entrées du journal elles-mêmes ne sont pas touchées.
-- B4 : espacement de lecture. B5 : conservation des conversations IA.
-- Colonnes retirées et ajoutées une à une : aucune table n'est recopiée.
ALTER TABLE "Settings" DROP COLUMN "pinLockEnabled";
ALTER TABLE "Settings" DROP COLUMN "pinHash";
ALTER TABLE "Entry" DROP COLUMN "locked";
ALTER TABLE "Settings" ADD COLUMN "aiRetention" TEXT NOT NULL DEFAULT 'keep';
ALTER TABLE "Settings" ADD COLUMN "aiHistoryClearedAt" DATETIME;
ALTER TABLE "Settings" ADD COLUMN "lineSpacing" TEXT NOT NULL DEFAULT 'normal';
