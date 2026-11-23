-- Assistant IA : style d'accompagnement et profil d'apprentissage (Groupe A).
-- Ajout de deux colonnes à "Settings", sans recopier la table : les lignes
-- existantes sont conservées telles quelles et reçoivent les valeurs par
-- défaut (style « balanced », profil vide).
ALTER TABLE "Settings" ADD COLUMN "aiStyle" TEXT NOT NULL DEFAULT 'balanced';
ALTER TABLE "Settings" ADD COLUMN "learningProfile" TEXT;
