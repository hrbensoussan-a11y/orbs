// Sonneries de notification — synthétisées via la Web Audio API.
// Aucun fichier audio à télécharger : chaque sonnerie est une petite partition
// de notes jouées au chargement. Léger, fonctionne hors-ligne, et reste fidèle
// à l'esprit « tout sur ton appareil ».
//
// Les navigateurs bloquent le son tant que l'utilisateur n'a pas interagi avec
// la page : on « débloque » le contexte audio au premier geste (unlockOnGesture).
// Après ça, les sonneries programmées (rappels) peuvent jouer toutes seules.

export type RingtoneId =
  | "cloche"
  | "carillon"
  | "marimba"
  | "goutte"
  | "pop"
  | "arcade"
  | "douce"
  | "silence";

// Une note : fréquence (Hz), départ (s, relatif au début), durée (s),
// forme d'onde, gain relatif, et glissando optionnel (fréquence de fin).
type Note = {
  f: number;
  t: number;
  d: number;
  type?: OscillatorType;
  g?: number;
  slideTo?: number;
};

export type Ringtone = {
  id: RingtoneId;
  name: string;
  emoji: string;
  notes: Note[];
};

// Notes utiles (Hz) pour écrire les partitions lisiblement.
const C5 = 523.25;
const D5 = 587.33;
const E5 = 659.25;
const G5 = 783.99;
const A5 = 880.0;
const C6 = 1046.5;
const G4 = 392.0;
const E4 = 329.63;

export const RINGTONES: Ringtone[] = [
  {
    id: "cloche",
    name: "Cloche",
    emoji: "🔔",
    // Un son de cloche = fondamentale + harmoniques qui s'éteignent.
    notes: [
      { f: C5, t: 0, d: 1.4, type: "sine", g: 1 },
      { f: C5 * 2.0, t: 0, d: 1.1, type: "sine", g: 0.45 },
      { f: C5 * 3.0, t: 0, d: 0.9, type: "sine", g: 0.25 },
      { f: C5 * 4.2, t: 0, d: 0.7, type: "sine", g: 0.14 },
    ],
  },
  {
    id: "carillon",
    name: "Carillon",
    emoji: "🎐",
    // Petite descente de cloches, façon sonnerie d'école.
    notes: [
      { f: E5, t: 0.0, d: 0.9, type: "sine", g: 0.9 },
      { f: C5, t: 0.18, d: 0.9, type: "sine", g: 0.9 },
      { f: G4, t: 0.36, d: 1.0, type: "sine", g: 0.9 },
      { f: C5, t: 0.6, d: 1.1, type: "sine", g: 0.8 },
    ],
  },
  {
    id: "marimba",
    name: "Marimba",
    emoji: "🪵",
    // Arpège boisé, notes courtes et chaleureuses.
    notes: [
      { f: C5, t: 0.0, d: 0.35, type: "triangle", g: 0.9 },
      { f: E5, t: 0.12, d: 0.35, type: "triangle", g: 0.9 },
      { f: G5, t: 0.24, d: 0.4, type: "triangle", g: 0.9 },
      { f: C6, t: 0.36, d: 0.6, type: "triangle", g: 0.8 },
    ],
  },
  {
    id: "goutte",
    name: "Goutte d'eau",
    emoji: "💧",
    // Glissando descendant : effet « plouf » tout doux.
    notes: [
      { f: C6, t: 0.0, d: 0.5, type: "sine", g: 0.9, slideTo: G4 },
      { f: A5, t: 0.35, d: 0.6, type: "sine", g: 0.6, slideTo: E4 },
    ],
  },
  {
    id: "pop",
    name: "Pop",
    emoji: "🫧",
    // Deux petites bulles qui montent — vif et discret.
    notes: [
      { f: A5, t: 0.0, d: 0.12, type: "sine", g: 0.9, slideTo: C6 },
      { f: C6, t: 0.14, d: 0.14, type: "sine", g: 0.9, slideTo: E5 * 2 },
    ],
  },
  {
    id: "arcade",
    name: "Arcade",
    emoji: "🎮",
    // Petit jingle rétro 8-bit, ondes carrées.
    notes: [
      { f: C5, t: 0.0, d: 0.1, type: "square", g: 0.5 },
      { f: E5, t: 0.1, d: 0.1, type: "square", g: 0.5 },
      { f: G5, t: 0.2, d: 0.1, type: "square", g: 0.5 },
      { f: C6, t: 0.3, d: 0.26, type: "square", g: 0.5 },
    ],
  },
  {
    id: "douce",
    name: "Douce",
    emoji: "🌙",
    // Accord majeur qui monte en fondu — apaisant.
    notes: [
      { f: C5, t: 0.0, d: 1.3, type: "sine", g: 0.7 },
      { f: E5, t: 0.16, d: 1.2, type: "sine", g: 0.6 },
      { f: G5, t: 0.32, d: 1.1, type: "sine", g: 0.5 },
      { f: D5, t: 0.48, d: 1.0, type: "sine", g: 0.35 },
    ],
  },
  {
    id: "silence",
    name: "Silence",
    emoji: "🔕",
    // Aucune sonnerie : la notification s'affiche sans bruit d'Orbs.
    notes: [],
  },
];

const BY_ID = new Map(RINGTONES.map((r) => [r.id, r]));
export const DEFAULT_RINGTONE: RingtoneId = "carillon";

export function ringtoneById(id: string | undefined): Ringtone {
  return BY_ID.get((id as RingtoneId) ?? "") ?? BY_ID.get(DEFAULT_RINGTONE)!;
}

// ---- Contexte audio partagé ----

type Ctx = AudioContext & { _orbsUnlockBound?: boolean };
let ctx: Ctx | null = null;

function audioContextClass(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function getCtx(): Ctx | null {
  if (ctx) return ctx;
  const AC = audioContextClass();
  if (!AC) return null;
  try {
    ctx = new AC() as Ctx;
  } catch {
    return null;
  }
  return ctx;
}

/**
 * Débloque le son au premier geste de l'utilisateur (clic, touche, toucher).
 * À appeler une fois au montage de l'app : ensuite les rappels programmés
 * peuvent jouer leur sonnerie sans geste supplémentaire.
 */
export function unlockOnGesture(): void {
  if (typeof window === "undefined") return;
  const c = getCtx();
  if (!c || c._orbsUnlockBound) return;
  c._orbsUnlockBound = true;
  const resume = () => {
    c.resume().catch(() => {});
  };
  const opts = { passive: true } as AddEventListenerOptions;
  window.addEventListener("pointerdown", resume, opts);
  window.addEventListener("keydown", resume, opts);
  window.addEventListener("touchstart", resume, opts);
}

/**
 * Joue une sonnerie. `volume` ∈ [0, 1]. Renvoie une promesse résolue quand le
 * son est terminé (ou tout de suite si rien n'a pu être joué). Échoue en
 * silence si l'audio est indisponible ou bloqué.
 */
export async function playRingtone(
  id: string | undefined,
  volume = 0.7,
): Promise<void> {
  const ring = ringtoneById(id);
  if (ring.notes.length === 0) return; // « Silence »
  const c = getCtx();
  if (!c) return;
  try {
    if (c.state === "suspended") await c.resume();
  } catch {
    /* bloqué tant qu'il n'y a pas eu de geste : on abandonne sans bruit */
    return;
  }

  const vol = Math.max(0, Math.min(1, volume));
  const master = c.createGain();
  master.gain.value = vol;
  master.connect(c.destination);

  const start = c.currentTime + 0.02;
  let end = start;

  for (const n of ring.notes) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = n.type ?? "sine";
    const t0 = start + n.t;
    const t1 = t0 + n.d;
    osc.frequency.setValueAtTime(n.f, t0);
    if (typeof n.slideTo === "number") {
      // Glissando : rampe exponentielle jusqu'à la fréquence de fin.
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, n.slideTo), t1);
    }
    // Enveloppe : attaque rapide puis extinction exponentielle.
    const peak = Math.max(0.0001, n.g ?? 1);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t1 + 0.02);
    if (t1 > end) end = t1;
  }

  const ms = Math.max(0, (end - c.currentTime) * 1000);
  await new Promise<void>((resolve) => setTimeout(resolve, ms + 60));
  try {
    master.disconnect();
  } catch {
    /* ignore */
  }
}
