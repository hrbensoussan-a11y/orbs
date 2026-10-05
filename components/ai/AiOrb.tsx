"use client";

// Bulle IA flottante — présente sur toutes les pages de l'app.
//
// - Petit rond en bas à gauche, que l'on peut déplacer (glisser-déposer)
//   n'importe où à l'écran ; sa position est mémorisée en localStorage.
// - Au clic (sans déplacement), ouvre l'assistant IA (page /ia).
// - Masquée sur /ia (on y est déjà).
//
// La distinction clic / glissement se fait avec un seuil de 6 px : en dessous
// c'est un clic, au-dessus c'est un déplacement.

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

const SIZE = 56; // diamètre du rond, en px (doit suivre .ai-orb dans globals.css)
const EDGE = 8; // marge minimale avec les bords
const DRAG_THRESHOLD = 6; // px avant de considérer que c'est un déplacement
const POS_KEY = "orbs.aiorb.pos";

type Pos = { x: number; y: number };

export function AiOrb() {
  const router = useRouter();
  const pathname = usePathname();

  const [pos, setPos] = useState<Pos | null>(null);
  const posRef = useRef<Pos>({ x: 0, y: 0 });
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const startRef = useRef({ px: 0, py: 0, x: 0, y: 0 });

  const clamp = useCallback((p: Pos): Pos => {
    const maxX = window.innerWidth - SIZE - EDGE;
    const maxY = window.innerHeight - SIZE - EDGE;
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

  // Position initiale : mémorisée, sinon en bas à gauche, au-dessus de la barre.
  useEffect(() => {
    let initial: Pos | null = null;
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (typeof p?.x === "number" && typeof p?.y === "number") initial = p;
      }
    } catch {
      /* localStorage indisponible : on repart sur la position par défaut */
    }
    // Première mise en place après le montage : window n'existe pas côté serveur,
    // donc ce state ne peut pas être calculé au rendu.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    place(initial ?? { x: EDGE + 6, y: window.innerHeight - SIZE - 96 });
  }, [place]);

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

  // Rien tant que la position n'est pas calculée (évite tout décalage au montage),
  // et rien sur la page IA elle-même.
  if (!pos || pathname === "/ia") return null;

  return (
    <button
      type="button"
      className="ai-orb"
      aria-label="Ouvrir l’assistant IA"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ left: pos.x, top: pos.y }}
    >
      <Sparkles size={24} strokeWidth={2} aria-hidden />
    </button>
  );
}
