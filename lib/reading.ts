// Confort de lecture (Réglages → Apparence → Lecture).
//
// Deux réglages, enregistrés sur le compte (Settings) et appliqués par le
// layout de l'app sous forme de variables CSS, UNIQUEMENT sur les zones de
// lecture : l'éditeur du journal (.writing-surface), les pages du journal et
// les réponses de l'assistant (.reading). Boutons, menus et titres des
// Réglages ne bougent pas.
//   - taille du texte : Settings.fontSize (existant) → --reading-size ;
//   - espacement : Settings.lineSpacing → --reading-leading (interligne) et
//     --reading-gap (espace entre paragraphes). « normal » ne pose aucune
//     variable : l'affichage reste exactement celui d'avant.

import type { CSSProperties } from "react";
import { FONT_SIZES } from "@/lib/constants";

export type LineSpacing = "compact" | "normal" | "large";

export const LINE_SPACINGS: readonly { value: LineSpacing; label: string }[] = [
  { value: "compact", label: "Serré" },
  { value: "normal", label: "Normal" },
  { value: "large", label: "Aéré" },
] as const;

const SPACING_VARS: Record<LineSpacing, { leading: string; gap: string } | null> = {
  compact: { leading: "1.5", gap: "0.75em" },
  normal: null,
  large: { leading: "2", gap: "1.3em" },
};

export function isLineSpacing(v: unknown): v is LineSpacing {
  return v === "compact" || v === "normal" || v === "large";
}

export function toLineSpacing(v: unknown): LineSpacing {
  return isLineSpacing(v) ? v : "normal";
}

/** Variables CSS de lecture pour le layout de l'app. */
export function readingStyle(fontSize: string | null | undefined, lineSpacing: string | null | undefined): CSSProperties {
  const style: Record<string, string> = {
    "--reading-size": FONT_SIZES[fontSize ?? "base"] ?? FONT_SIZES.base,
  };
  const spacing = SPACING_VARS[toLineSpacing(lineSpacing)];
  if (spacing) {
    style["--reading-leading"] = spacing.leading;
    style["--reading-gap"] = spacing.gap;
  }
  return style as CSSProperties;
}
