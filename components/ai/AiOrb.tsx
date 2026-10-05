"use client";

// Bulle IA flottante — présente sur toutes les pages de l'app.
//
// - Petit rond (logo Orbs : cercle foncé + point vert) en bas à gauche, que
//   l'on peut déplacer (glisser-déposer) n'importe où ; position mémorisée.
// - Au clic (sans déplacement), ouvre l'assistant IA (page /ia).
// - Masquée sur /ia (on y est déjà).
// - Réglages (localStorage, voir AiOrbSettings) : taille (petite / moyenne /
//   grande) et affichage (on peut l'enlever). Les changements sont pris en
//   compte en direct via l'évènement "orbs:aiorb".

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { usePathname, useRouter } from "next/navigation";

const SIZES = { sm: 46, md: 56, lg: 72 } as const;
type SizeKey = keyof typeof SIZES;
type Prefs = { hidden: boolean; size: SizeKey };

const EDGE = 8; // marge minimale avec les bords
const DRAG_THRESHOLD = 6; // px avant de considérer que c'est un déplacement
const POS_KEY = "orbs.aiorb.pos";
const PREFS_KEY = "orbs.aiorb.prefs";

type Pos = { x: number; y: number };

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { hidden: !!p?.hidden, size: (SIZES as Record<string, number>)[p?.size] ? p.size : "md" };
    }
  } catch {
    /* localStorage indisponible : réglages par défaut */
  }
  return { hidden: false, size: "md" };
}

export function AiOrb() {
  const router = useRouter();
  const pathname = usePathname();

  const [pos, setPos] = useState<Pos | null>(null);
  const [prefs, setPrefs] = useState<Prefs>({ hidden: false, size: "md" });
  const posRef = useRef<Pos>({ x: 0, y: 0 });
  const prefsRef = useRef<Prefs>(prefs);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const startRef = useRef({ px: 0, py: 0, x: 0, y: 0 });

  const clamp = useCallback((p: Pos): Pos => {
    const size = SIZES[prefsRef.current.size];
    const maxX = window.innerWidth - size - EDGE;
    const maxY = window.innerHeight - size - EDGE;
    return {
      x: Math.max(EDGE, Math.min(p.x, Math.max(EDGE, maxX))),
      y: Math.max(EDGE, Math.min(p.y, Math.max(EDGE, maxY))),
    };
  }, []);

  const place = useCallback(
    (p: Pos) => {
      const c = clamp(p);
      posRef.current = c;
      setPos(c);
    },
    [clamp],
  );

  // Position + réglages initiaux (après le montage : window/localStorage
  // n'existent pas côté serveur).
  useEffect(() => {
    const p = loadPrefs();
    prefsRef.current = p;
    let initial: Pos | null = null;
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) {
        const j = JSON.parse(raw);
        if (typeof j?.x === "number" && typeof j?.y === "number") initial = j;
      }
    } catch {
      /* position par défaut */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefs(p);
    place(initial ?? { x: EDGE + 6, y: window.innerHeight - SIZES[p.size] - 96 });
  }, [place]);

  // Réglages modifiés ailleurs (page Réglages, autre onglet) : on relit.
  useEffect(() => {
    const refresh = () => setPrefs(loadPrefs());
    window.addEventListener("storage", refresh);
    window.addEventListener("orbs:aiorb", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("orbs:aiorb", refresh);
    };
  }, []);

  // Quand la taille change, on garde le rond entièrement à l'écran.
  useEffect(() => {
    prefsRef.current = prefs;
    place(posRef.current);
  }, [prefs, place]);

  // On garde le rond à l'écran quand la fenêtre change de taille.
  useEffect(() => {
    const onResize = () => place(posRef.current);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [place]);

  function onPointerDown(e: PointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    draggingRef.current = true;
    movedRef.current = false;
    startRef.current = { px: e.clientX, py: e.clientY, x: posRef.current.x, y: posRef.current.y };
  }

  function onPointerMove(e: PointerEvent<HTMLButtonElement>) {
    if (!draggingRef.current) return;
    const dx = e.clientX - startRef.current.px;
    const dy = e.clientY - startRef.current.py;
    if (!movedRef.current && Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) movedRef.current = true;
    if (movedRef.current) place({ x: startRef.current.x + dx, y: startRef.current.y + dy });
  }

  function onPointerUp() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (movedRef.current) {
      try {
        localStorage.setItem(POS_KEY, JSON.stringify(posRef.current));
      } catch {
        /* ignore */
      }
    } else {
      router.push("/ia");
    }
  }

  if (!pos || prefs.hidden || pathname === "/ia") return null;

  const size = SIZES[prefs.size];
  return (
    <button
      type="button"
      className="ai-orb"
      aria-label="Ouvrir l’assistant IA"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ left: pos.x, top: pos.y, width: size, height: size }}
    >
      <span className="ai-orb-dot" aria-hidden />
    </button>
  );
}
