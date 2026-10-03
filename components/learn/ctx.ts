import type { State } from "@/lib/learn/types";

/** Contexte partagé du module Apprendre : l'état local + une sauvegarde. */
export type LearnCtx = {
  s: State;
  save: () => void;
};
