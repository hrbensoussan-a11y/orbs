// Apparence (thème, fond, luminosité, animations) — réglages du compte
// connecté, rangés dans son espace local (lib/userStorage).
//
// Deux chemins appliquent ces réglages sur <html> et doivent rester alignés :
//   - APPEARANCE_INIT : script exécuté AVANT React (anti-flash au chargement).
//     Il ne peut pas importer de module, donc il relit lui-même le marqueur
//     d'appareil puis la clé du compte ;
//   - applyStoredAppearance() : appelé par StorageScope quand le compte actif
//     change sans rechargement (connexion, déconnexion).
// Hors compte (écran de connexion), l'apparence par défaut s'applique : les
// réglages d'un compte ne débordent pas sur le suivant.

import {
  ACTIVE_USER_KEY,
  USER_PREFIX,
  readUserItem,
  removeUserItem,
  writeUserItem,
} from "@/lib/userStorage";

export const APPEARANCE_KEY = "orbs.appearance";
export const MOTION_KEY = "orbs.motion";

export type Appearance = { theme: string; bg: string; dim: number };

export const DEFAULT_APPEARANCE: Appearance = { theme: "light", bg: "rainbow", dim: 0 };

/** Réglages mémorisés du compte actif (valeurs par défaut sinon). */
export function readAppearance(): Appearance {
  try {
    const o = JSON.parse(readUserItem(APPEARANCE_KEY) || "{}");
    return {
      theme: o.theme || DEFAULT_APPEARANCE.theme,
      bg: o.bg || DEFAULT_APPEARANCE.bg,
      dim: typeof o.dim === "number" ? o.dim : DEFAULT_APPEARANCE.dim,
    };
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function saveAppearance(a: Appearance): void {
  try {
    writeUserItem(APPEARANCE_KEY, JSON.stringify(a));
  } catch {
    /* quota / mode privé */
  }
}

export function applyAppearance(a: Appearance): void {
  const r = document.documentElement;
  r.setAttribute("data-theme", a.theme);
  r.setAttribute("data-bg", a.bg);
  r.style.setProperty("--dim", String(a.dim));
}

export function readReducedMotion(): boolean {
  try {
    return readUserItem(MOTION_KEY) === "reduced";
  } catch {
    return false;
  }
}

export function saveReducedMotion(reduced: boolean): void {
  try {
    if (reduced) writeUserItem(MOTION_KEY, "reduced");
    else removeUserItem(MOTION_KEY);
  } catch {
    /* ignore */
  }
}

/** Oublie les réglages d'apparence du compte actif. */
export function clearAppearance(): void {
  try {
    removeUserItem(APPEARANCE_KEY);
    removeUserItem(MOTION_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Réapplique sur <html> les réglages du compte actif — ou l'apparence par
 * défaut s'il n'y en a pas (aucun compte, ou rien de mémorisé). Même résultat
 * que APPEARANCE_INIT sur un document neuf.
 */
export function applyStoredAppearance(): void {
  if (typeof document === "undefined") return;
  const r = document.documentElement;
  let a: Partial<Appearance> = {};
  try {
    a = JSON.parse(readUserItem(APPEARANCE_KEY) || "{}") ?? {};
  } catch {
    a = {};
  }
  if (a.theme) r.setAttribute("data-theme", a.theme);
  else r.removeAttribute("data-theme");
  if (a.bg) r.setAttribute("data-bg", a.bg);
  else r.removeAttribute("data-bg");
  r.style.setProperty("--dim", String(typeof a.dim === "number" ? a.dim : 0));
  if (readReducedMotion()) r.setAttribute("data-motion", "reduced");
  else r.removeAttribute("data-motion");
}

// Script anti-flash, injecté tel quel dans <head> par app/layout.tsx.
// Il lit le marqueur d'appareil (compte actif), vérifie sa forme, puis ne lit
// QUE les clés de ce compte. Sans marqueur valide : apparence par défaut.
export const APPEARANCE_INIT =
  `try{var u=localStorage.getItem(${JSON.stringify(ACTIVE_USER_KEY)});` +
  `if(u&&/^[A-Za-z0-9_-]{1,64}$/.test(u)){var p=${JSON.stringify(USER_PREFIX)}+u+':';` +
  `var a=JSON.parse(localStorage.getItem(p+${JSON.stringify(APPEARANCE_KEY)})||'{}');` +
  `var r=document.documentElement;` +
  `if(a.theme)r.setAttribute('data-theme',a.theme);` +
  `if(a.bg)r.setAttribute('data-bg',a.bg);` +
  `r.style.setProperty('--dim',String(typeof a.dim==='number'?a.dim:0));` +
  `if(localStorage.getItem(p+${JSON.stringify(MOTION_KEY)})==='reduced')r.setAttribute('data-motion','reduced');` +
  `}}catch(e){}`;
