"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Shuffle, X, Check } from "lucide-react";
import { Avatar } from "./Avatar";
import { updateAvatar } from "@/app/actions/account";
import {
  type AvatarConfig,
  DEFAULT_AVATAR,
  randomAvatar,
  BGS,
  SKINS,
  HAIRS,
  HAIR_COLORS,
  EYES,
  BROWS,
  MOUTHS,
  FACIAL_HAIR,
  GLASSES,
  HEADWEAR,
  CLOTHINGS,
  CLOTHING_COLORS,
  BODIES,
  POSES,
  type Option,
} from "@/lib/avatar/config";

type CatId = keyof AvatarConfig;

// Grille des vignettes : 4 colonnes sur téléphone, puis plus serrée dès que la
// largeur le permet (la colonne du panneau est plafonnée à 720px).
const GRID = "grid grid-cols-4 min-[520px]:grid-cols-5 min-[680px]:grid-cols-6 gap-3";

const CATS: { id: CatId; label: string; options: Option[] }[] = [
  { id: "body", label: "Silhouette", options: BODIES },
  { id: "pose", label: "Poses", options: POSES },
  { id: "bg", label: "Fond", options: BGS },
  { id: "skin", label: "Peau", options: SKINS },
  { id: "hair", label: "Cheveux", options: HAIRS },
  { id: "eyes", label: "Yeux", options: EYES },
  { id: "brows", label: "Sourcils", options: BROWS },
  { id: "mouth", label: "Bouche", options: MOUTHS },
  { id: "facialHair", label: "Barbe", options: FACIAL_HAIR },
  { id: "glasses", label: "Lunettes", options: GLASSES },
  { id: "headwear", label: "Accessoire", options: HEADWEAR },
  { id: "clothing", label: "Habits", options: CLOTHINGS },
];

export function AvatarBuilder({
  initial,
  onClose,
}: {
  initial: AvatarConfig;
  onClose: () => void;
}) {
  const router = useRouter();
  const [cfg, setCfg] = useState<AvatarConfig>(initial);
  const [cat, setCat] = useState<CatId>("hair");
  const [pending, startTransition] = useTransition();

  const active = CATS.find((c) => c.id === cat)!;
  const set = (patch: Partial<AvatarConfig>) => setCfg((p) => ({ ...p, ...patch }));

  function save() {
    const fd = new FormData();
    fd.set("avatar", JSON.stringify(cfg));
    startTransition(async () => {
      await updateAvatar(fd);
      router.refresh();
      onClose();
    });
  }

  // Échap pour fermer + page figée derrière le panneau (même comportement que
  // les autres fenêtres du projet, voir ConfirmDialog).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  // Rendu via un portail sur <body> : INDISPENSABLE. Le panneau est ouvert
  // depuis une carte (.card), et les cartes ont un backdrop-filter, ce qui en
  // fait le bloc conteneur de leurs enfants position:fixed. Sans portail, le
  // plein écran se réduisait à la taille de la carte du profil (926 × 287 px
  // sur un écran 1920) : les options débordaient et le reste de la page
  // transparaissait au travers.
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--canvas)" }}>
      {/* Fond vivant discret déjà géré par body ; on pose un voile doux */}
      <div className="absolute inset-0 -z-10" style={{ background: "var(--veil)" }} aria-hidden />

      {/* Colonne centrée : le panneau occupe tout l'écran, mais son contenu
          reste dans une largeur de lecture confortable et centrée, comme le
          reste de l'application. Sans ce plafond, les options s'étalaient sur
          toute la largeur d'un écran de bureau (colonnes à 480px d'écart). */}
      <div className="w-full mx-auto flex-1 min-h-0 flex flex-col" style={{ maxWidth: 720 }}>
      {/* En-tête */}
      <header
        className="flex items-center justify-between px-4 shrink-0"
        style={{ paddingTop: "calc(env(safe-area-inset-top,0px) + 14px)", paddingBottom: 10 }}
      >
        <button className="btn-ghost !px-2.5" onClick={onClose} aria-label="Annuler">
          <X size={18} aria-hidden />
        </button>
        <h2 className="font-semibold text-lg display">Mon avatar</h2>
        <button
          className="btn-ghost !px-2.5"
          onClick={() => set(randomAvatar())}
          aria-label="Avatar aléatoire"
          title="Aléatoire"
        >
          <Shuffle size={18} aria-hidden />
        </button>
      </header>

      {/* Aperçu */}
      <div className="flex flex-col items-center gap-2 py-2 shrink-0">
        <div className="glass-strong rounded-full p-2" style={{ boxShadow: "var(--shadow-float)" }}>
          <Avatar config={cfg} size={140} anim />
        </div>
        <button
          className="text-sm text-ink-3 underline underline-offset-2"
          onClick={() => setCfg(DEFAULT_AVATAR)}
        >
          Réinitialiser
        </button>
      </div>

      {/* Onglets de catégories — défilement horizontal sur téléphone (faute de
          place), mais repliés sur plusieurs lignes dès 680px : sinon les
          dernières catégories (Barbe, Lunettes…) restaient coupées à droite
          alors que la place ne manque pas. */}
      <div className="shrink-0 overflow-x-auto no-scrollbar px-3 min-[680px]:overflow-x-visible">
        <div className="flex gap-2 w-max pb-1 min-[680px]:w-full min-[680px]:flex-wrap min-[680px]:justify-center">
          {CATS.map((c) => (
            <button
              key={c.id}
              onClick={() => setCat(c.id)}
              className="px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap border"
              style={{
                borderColor: cat === c.id ? "var(--green)" : "var(--glass-stroke)",
                background:
                  cat === c.id ? "color-mix(in srgb,var(--green) 15%,transparent)" : "var(--fill)",
                color: cat === c.id ? "var(--green-ink)" : "var(--ink-2)",
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Options */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4">
        {/* Sous-palette de couleurs (cheveux / habits) */}
        {cat === "hair" && (
          <ColorRow
            label="Couleur des cheveux"
            colors={HAIR_COLORS.map((h) => ({ id: h.id, color: h.c }))}
            value={cfg.hairColor}
            onPick={(id) => set({ hairColor: id })}
          />
        )}
        {cat === "clothing" && (
          <ColorRow
            label="Couleur des habits"
            colors={CLOTHING_COLORS.map((c) => ({ id: c.id, color: c.c }))}
            value={cfg.clothingColor}
            onPick={(id) => set({ clothingColor: id })}
          />
        )}

        {cat === "bg" ? (
          <div className={GRID}>
            {BGS.map((b) => {
              const on = cfg.bg === b.id;
              const bgStyle =
                b.type === "grad"
                  ? `linear-gradient(135deg, ${b.from}, ${b.to})`
                  : b.color;
              return (
                <button key={b.id} onClick={() => set({ bg: b.id })} className="flex flex-col items-center gap-1.5">
                  <span
                    className="w-full rounded-2xl"
                    style={{
                      aspectRatio: "1",
                      background: bgStyle,
                      boxShadow: on ? "0 0 0 3px var(--green)" : "inset 0 0 0 1px var(--glass-stroke)",
                    }}
                  />
                  <span className="text-[0.68rem] text-ink-3">{b.label}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className={GRID}>
            {active.options.map((o) => {
              const on = cfg[cat] === o.id;
              const preview = { ...cfg, [cat]: o.id } as AvatarConfig;
              return (
                <button key={o.id} onClick={() => set({ [cat]: o.id } as Partial<AvatarConfig>)} className="flex flex-col items-center gap-1.5">
                  <span
                    className="rounded-2xl overflow-hidden"
                    style={{ boxShadow: on ? "0 0 0 3px var(--green)" : "inset 0 0 0 1px var(--glass-stroke)" }}
                  >
                    <Avatar config={preview} size={62} />
                  </span>
                  <span className="text-[0.68rem] text-ink-3 text-center leading-tight">{o.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Pied : enregistrer */}
      <footer
        className="shrink-0 px-4 pt-3 border-t border-line"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom,0px) + 14px)" }}
      >
        <button className="btn-primary w-full justify-center" onClick={save} disabled={pending}>
          <Check size={18} aria-hidden /> {pending ? "Enregistrement…" : "Enregistrer mon avatar"}
        </button>
      </footer>
      </div>
    </div>,
    document.body,
  );
}

function ColorRow({
  label,
  colors,
  value,
  onPick,
}: {
  label: string;
  colors: { id: string; color: string }[];
  value: string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="mb-4">
      <div className="text-sm text-ink-2 mb-2">{label}</div>
      <div className="flex flex-wrap gap-2.5">
        {colors.map((c) => {
          const on = value === c.id;
          return (
            <button
              key={c.id}
              onClick={() => onPick(c.id)}
              aria-label={c.id}
              className="h-8 w-8 rounded-full"
              style={{
                background: c.color,
                boxShadow: on ? "0 0 0 3px var(--green), 0 0 0 4.5px var(--canvas)" : "inset 0 0 0 1px rgba(0,0,0,.12)",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
