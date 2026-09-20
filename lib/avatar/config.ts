// Avatar « maison » — un personnage vectoriel entièrement paramétrable,
// façon Bitmoji / Animal Crossing. Aucune photo, aucune IA : tout est
// dessiné en SVG à partir de cette configuration. Ce fichier est la source
// de vérité partagée par le rendu (components/avatar/Avatar) et l'éditeur
// (components/avatar/AvatarBuilder).

export type AvatarConfig = {
  bg: string;
  skin: string;
  hair: string;
  hairColor: string;
  brows: string;
  eyes: string;
  mouth: string;
  facialHair: string;
  glasses: string;
  headwear: string;
  clothing: string;
  clothingColor: string;
};

export type Option = { id: string; label: string };

/* --- Palettes ------------------------------------------------------------ */

export type Skin = { id: string; label: string; base: string; shade: string };
export const SKINS: Skin[] = [
  { id: "s1", label: "Porcelaine", base: "#ffe1cf", shade: "#f0c3a3" },
  { id: "s2", label: "Sable", base: "#f4c9a3", shade: "#e2a877" },
  { id: "s3", label: "Miel", base: "#e0ac83", shade: "#c98a5c" },
  { id: "s4", label: "Caramel", base: "#c68642", shade: "#a86a2e" },
  { id: "s5", label: "Cacao", base: "#8d5524", shade: "#6f4019" },
  { id: "s6", label: "Ébène", base: "#5c3a24", shade: "#452817" },
];

export type Hue = { id: string; label: string; c: string; hi: string };
export const HAIR_COLORS: Hue[] = [
  { id: "noir", label: "Noir", c: "#2a2a2e", hi: "#3d3d46" },
  { id: "brun", label: "Brun", c: "#4b3225", hi: "#5e4232" },
  { id: "chatain", label: "Châtain", c: "#7a5230", hi: "#946734" },
  { id: "blond", label: "Blond", c: "#e3c072", hi: "#f0d494" },
  { id: "blondf", label: "Blond foncé", c: "#b8894a", hi: "#cc9e5c" },
  { id: "roux", label: "Roux", c: "#c8562f", hi: "#dd6c3f" },
  { id: "gris", label: "Gris", c: "#b6b6bf", hi: "#d0d0d7" },
  { id: "violet", label: "Violet", c: "#a56bd6", hi: "#bd86e6" },
  { id: "bleu", label: "Bleu", c: "#5a8fe0", hi: "#7aa8ee" },
  { id: "rose", label: "Rose", c: "#ec86b5", hi: "#f5a0c8" },
];

export type Bg =
  | { id: string; label: string; type: "solid"; color: string }
  | { id: string; label: string; type: "grad"; from: string; to: string };
export const BGS: Bg[] = [
  { id: "mint", label: "Menthe", type: "grad", from: "#d3f6e2", to: "#8fe0bb" },
  { id: "sky", label: "Ciel", type: "grad", from: "#dcebff", to: "#a9caff" },
  { id: "lilac", label: "Lilas", type: "grad", from: "#ecdcff", to: "#c9a9f5" },
  { id: "peach", label: "Pêche", type: "grad", from: "#ffe6d5", to: "#ffc2a0" },
  { id: "coral", label: "Corail", type: "grad", from: "#ffdada", to: "#ff9e9e" },
  { id: "sun", label: "Soleil", type: "grad", from: "#fff2cc", to: "#ffd97a" },
  { id: "green", label: "Vert", type: "grad", from: "#c9f5dd", to: "#38c172" },
  { id: "slate", label: "Ardoise", type: "solid", color: "#e6ebf1" },
];

export const CLOTHING_COLORS: { id: string; label: string; c: string }[] = [
  { id: "green", label: "Vert", c: "#38c172" },
  { id: "sky", label: "Bleu", c: "#5a8fe0" },
  { id: "lilac", label: "Violet", c: "#a56bd6" },
  { id: "coral", label: "Corail", c: "#ff8f8f" },
  { id: "amber", label: "Ambre", c: "#ffb454" },
  { id: "rose", label: "Rose", c: "#ec86b5" },
  { id: "ink", label: "Encre", c: "#2f333c" },
  { id: "cloud", label: "Nuage", c: "#eef1f6" },
];

/* --- Catalogues de formes ------------------------------------------------ */

export const HAIRS: Option[] = [
  { id: "none", label: "Chauve" },
  { id: "buzz", label: "Rasé" },
  { id: "short", label: "Court" },
  { id: "sidePart", label: "Raie" },
  { id: "wavy", label: "Ondulé" },
  { id: "curly", label: "Bouclé" },
  { id: "afro", label: "Afro" },
  { id: "bun", label: "Chignon" },
  { id: "ponytail", label: "Couettes" },
  { id: "long", label: "Longs" },
  { id: "bob", label: "Carré" },
  { id: "spiky", label: "Piquants" },
];

export const EYES: Option[] = [
  { id: "default", label: "Normaux" },
  { id: "happy", label: "Joyeux" },
  { id: "wink", label: "Clin d’œil" },
  { id: "sleepy", label: "Doux" },
  { id: "wide", label: "Grands" },
  { id: "kawaii", label: "Étoilés" },
];

export const BROWS: Option[] = [
  { id: "natural", label: "Naturels" },
  { id: "raised", label: "Relevés" },
  { id: "flat", label: "Droits" },
];

export const MOUTHS: Option[] = [
  { id: "smile", label: "Sourire" },
  { id: "grin", label: "Dents" },
  { id: "soft", label: "Discret" },
  { id: "open", label: "Rire" },
  { id: "smirk", label: "Malicieux" },
  { id: "surprised", label: "Surpris" },
];

export const FACIAL_HAIR: Option[] = [
  { id: "none", label: "Aucune" },
  { id: "stubble", label: "Barbe de 3 j" },
  { id: "mustache", label: "Moustache" },
  { id: "goatee", label: "Bouc" },
  { id: "beard", label: "Barbe" },
];

export const GLASSES: Option[] = [
  { id: "none", label: "Aucune" },
  { id: "round", label: "Rondes" },
  { id: "square", label: "Carrées" },
  { id: "sun", label: "Soleil" },
];

export const HEADWEAR: Option[] = [
  { id: "none", label: "Aucun" },
  { id: "beanie", label: "Bonnet" },
  { id: "headband", label: "Bandeau" },
  { id: "cap", label: "Casquette" },
  { id: "flower", label: "Fleur" },
  { id: "headphones", label: "Casque" },
];

export const CLOTHINGS: Option[] = [
  { id: "crew", label: "T-shirt" },
  { id: "hoodie", label: "Sweat" },
  { id: "collar", label: "Chemise" },
  { id: "vneck", label: "Col V" },
];

/* --- Défaut, lecture, aléatoire ----------------------------------------- */

export const DEFAULT_AVATAR: AvatarConfig = {
  bg: "mint",
  skin: "s1",
  hair: "short",
  hairColor: "brun",
  brows: "natural",
  eyes: "default",
  mouth: "smile",
  facialHair: "none",
  glasses: "none",
  headwear: "none",
  clothing: "crew",
  clothingColor: "green",
};

const has = (list: { id: string }[], id: unknown): id is string =>
  typeof id === "string" && list.some((o) => o.id === id);

/** Lit une configuration (JSON ou objet) en réparant chaque champ manquant. */
export function parseAvatar(raw: unknown): AvatarConfig {
  let o: Record<string, unknown> = {};
  if (typeof raw === "string") {
    try {
      o = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      o = {};
    }
  } else if (raw && typeof raw === "object") {
    o = raw as Record<string, unknown>;
  }
  const d = DEFAULT_AVATAR;
  return {
    bg: has(BGS, o.bg) ? (o.bg as string) : d.bg,
    skin: has(SKINS, o.skin) ? (o.skin as string) : d.skin,
    hair: has(HAIRS, o.hair) ? (o.hair as string) : d.hair,
    hairColor: has(HAIR_COLORS, o.hairColor) ? (o.hairColor as string) : d.hairColor,
    brows: has(BROWS, o.brows) ? (o.brows as string) : d.brows,
    eyes: has(EYES, o.eyes) ? (o.eyes as string) : d.eyes,
    mouth: has(MOUTHS, o.mouth) ? (o.mouth as string) : d.mouth,
    facialHair: has(FACIAL_HAIR, o.facialHair) ? (o.facialHair as string) : d.facialHair,
    glasses: has(GLASSES, o.glasses) ? (o.glasses as string) : d.glasses,
    headwear: has(HEADWEAR, o.headwear) ? (o.headwear as string) : d.headwear,
    clothing: has(CLOTHINGS, o.clothing) ? (o.clothing as string) : d.clothing,
    clothingColor: has(CLOTHING_COLORS, o.clothingColor)
      ? (o.clothingColor as string)
      : d.clothingColor,
  };
}

const pick = <T extends { id: string }>(list: T[]): string =>
  list[Math.floor(Math.random() * list.length)].id;

/** Tire un avatar au hasard (les accessoires restent souvent absents). */
export function randomAvatar(): AvatarConfig {
  const maybe = (list: Option[]) =>
    Math.random() < 0.55 ? "none" : pick(list);
  return {
    bg: pick(BGS),
    skin: pick(SKINS),
    hair: pick(HAIRS),
    hairColor: pick(HAIR_COLORS),
    brows: pick(BROWS),
    eyes: pick(EYES),
    mouth: pick(MOUTHS),
    facialHair: maybe(FACIAL_HAIR),
    glasses: maybe(GLASSES),
    headwear: maybe(HEADWEAR),
    clothing: pick(CLOTHINGS),
    clothingColor: pick(CLOTHING_COLORS),
  };
}

/** Identifiant stable (serveur = client) pour namespacer les <defs> SVG. */
export function avatarUid(cfg: AvatarConfig): string {
  const s = JSON.stringify(cfg);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return "av" + (h >>> 0).toString(36);
}

/* --- Résolveurs de couleurs (utilisés par le rendu) --------------------- */

export const skinOf = (id: string): Skin =>
  SKINS.find((s) => s.id === id) ?? SKINS[0];
export const hueOf = (id: string): Hue =>
  HAIR_COLORS.find((h) => h.id === id) ?? HAIR_COLORS[0];
export const bgOf = (id: string): Bg => BGS.find((b) => b.id === id) ?? BGS[0];
export const clothingColorOf = (id: string): string =>
  (CLOTHING_COLORS.find((c) => c.id === id) ?? CLOTHING_COLORS[0]).c;
