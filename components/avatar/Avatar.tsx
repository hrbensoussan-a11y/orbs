import type { ReactNode } from "react";
import {
  type AvatarConfig,
  parseAvatar,
  avatarUid,
  skinOf,
  hueOf,
  bgOf,
  clothingColorOf,
} from "@/lib/avatar/config";

const INK = "#402f26";

type Props = {
  /** Configuration : objet, chaîne JSON, ou null (→ avatar par défaut). */
  config?: AvatarConfig | string | null;
  size?: number;
  className?: string;
  /** Coupe le personnage en cercle (badge). true par défaut. */
  round?: boolean;
  /** Anime l'avatar (léger balancement, clignement, coucou). */
  anim?: boolean;
};

/**
 * Avatar vectoriel entièrement dessiné en SVG à partir de la configuration.
 * Composant pur : rendu identique côté serveur et client.
 */
export function Avatar({ config, size = 40, className, round = true, anim = false }: Props) {
  const cfg = parseAvatar(config as unknown);
  const uid = avatarUid(cfg);
  const skin = skinOf(cfg.skin);
  const hue = hueOf(cfg.hairColor);
  const bg = bgOf(cfg.bg);
  const cloth = clothingColorOf(cfg.clothingColor);

  const clipId = `${uid}-clip`;
  const bgId = `${uid}-bg`;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={[className, anim ? "av-live" : ""].filter(Boolean).join(" ") || undefined}
      role="img"
      aria-label="Avatar"
      style={{ display: "block", borderRadius: round ? "50%" : undefined }}
    >
      <defs>
        {bg.type === "grad" && (
          <linearGradient id={bgId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={bg.from} />
            <stop offset="100%" stopColor={bg.to} />
          </linearGradient>
        )}
        <clipPath id={clipId}>
          <circle cx="50" cy="50" r="50" />
        </clipPath>
      </defs>

      {/* Fond */}
      <rect
        x="0"
        y="0"
        width="100"
        height="100"
        fill={bg.type === "grad" ? `url(#${bgId})` : bg.color}
      />

      <g clipPath={round ? `url(#${clipId})` : undefined}>
       <g className="av-body">
        {/* Cheveux arrière */}
        {hairBack(cfg.hair, hue.c, hue.hi)}

        {/* Épaules / habits */}
        {clothing(cfg.clothing, cloth, skin.base, cfg.body)}

        {/* Cou */}
        <path d="M44 60 L44 80 Q50 83 56 80 L56 60 Z" fill={skin.base} />
        <path d="M42 60 Q50 69 58 60 Q50 65 42 60 Z" fill={skin.shade} opacity="0.45" />

        {/* Tête + oreilles */}
        <ellipse cx="29.5" cy="49" rx="4.3" ry="5" fill={skin.base} />
        <ellipse cx="70.5" cy="49" rx="4.3" ry="5" fill={skin.base} />
        <ellipse cx="29.8" cy="49" rx="2" ry="2.6" fill={skin.shade} opacity="0.5" />
        <ellipse cx="70.2" cy="49" rx="2" ry="2.6" fill={skin.shade} opacity="0.5" />
        <ellipse cx="50" cy="46" rx="21.5" ry="24.5" fill={skin.base} />
        <path
          d="M50 68 Q60 68 66 58 Q64 70 50 70.5 Q36 70 34 58 Q40 68 50 68 Z"
          fill={skin.shade}
          opacity="0.35"
        />

        {/* Joues */}
        <ellipse cx="37.5" cy="53" rx="3.2" ry="1.9" fill="#ff9e9e" opacity="0.32" />
        <ellipse cx="62.5" cy="53" rx="3.2" ry="1.9" fill="#ff9e9e" opacity="0.32" />

        {/* Sourcils, yeux, cils, nez */}
        {brows(cfg.brows, hue.c)}
        <g className="av-eyes">{eyes(cfg.eyes)}</g>
        {cfg.body === "feminin" && lashes()}
        <path
          d="M48.4 48.5 Q49.6 52 51.4 49.6"
          fill="none"
          stroke={skin.shade}
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* Barbe puis bouche par-dessus */}
        {facialHair(cfg.facialHair, hue.c)}
        {mouth(cfg.mouth)}

        {/* Cheveux avant */}
        {hairFront(cfg.hair, hue.c, hue.hi)}

        {/* Lunettes */}
        {glasses(cfg.glasses)}

        {/* Accessoire de tête */}
        {headwear(cfg.headwear, cloth)}
       </g>
        {/* Pose (bras + main), au-dessus du corps */}
        {poseArm(cfg.pose, skin.base, cloth)}
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ Yeux */

function eyes(style: string): ReactNode {
  const L = 42;
  const R = 58;
  const cy = 47;
  const open = (cx: number, rx = 3.3, ry = 4) => (
    <g key={cx}>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#fff" />
      <circle cx={cx} cy={cy + 0.6} r={rx * 0.62} fill={INK} />
      <circle cx={cx - 0.9} cy={cy - 0.8} r="0.8" fill="#fff" />
    </g>
  );
  const arcDown = (cx: number) => (
    <path
      key={cx}
      d={`M${cx - 3.4} ${cy - 0.5} Q${cx} ${cy + 3.5} ${cx + 3.4} ${cy - 0.5}`}
      fill="none"
      stroke={INK}
      strokeWidth="2.1"
      strokeLinecap="round"
    />
  );
  switch (style) {
    case "wide":
      return [open(L, 3.8, 4.6), open(R, 3.8, 4.6)];
    case "big":
      return [open(L, 4.4, 5.3), open(R, 4.4, 5.3)];
    case "happy":
      return [
        <path key="l" d={`M${L - 3.6} ${cy + 1} Q${L} ${cy - 3.4} ${L + 3.6} ${cy + 1}`} fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />,
        <path key="r" d={`M${R - 3.6} ${cy + 1} Q${R} ${cy - 3.4} ${R + 3.6} ${cy + 1}`} fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />,
      ];
    case "sleepy":
      return [arcDown(L), arcDown(R)];
    case "wink":
      return [open(L), <path key="r" d={`M${R - 3.4} ${cy + 1} Q${R} ${cy - 3.2} ${R + 3.4} ${cy + 1}`} fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />];
    case "kawaii":
      return [L, R].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={cy} r="3.6" fill={INK} />
          <circle cx={cx - 1} cy={cy - 1.2} r="1.2" fill="#fff" />
          <circle cx={cx + 1.1} cy={cy + 1} r="0.7" fill="#fff" />
        </g>
      ));
    default:
      return [open(L), open(R)];
  }
}

/* -------------------------------------------------------------- Sourcils */

function brows(style: string, c: string): ReactNode {
  const draw = (cx: number) => {
    let d: string;
    if (style === "raised") d = `M${cx - 3.6} 38.5 Q${cx} 35 ${cx + 3.6} 38`;
    else if (style === "flat") d = `M${cx - 3.6} 38.2 L${cx + 3.6} 38.2`;
    else d = `M${cx - 3.6} 39 Q${cx} 36.6 ${cx + 3.6} 38.4`;
    return (
      <path key={cx} d={d} fill="none" stroke={c} strokeWidth="1.9" strokeLinecap="round" />
    );
  };
  return [draw(42), draw(58)];
}

/* ---------------------------------------------------------------- Bouche */

function mouth(style: string): ReactNode {
  switch (style) {
    case "grin":
      return (
        <g>
          <path d="M42 55 Q50 64 58 55 Q50 58.5 42 55 Z" fill={INK} />
          <path d="M43.5 55.4 Q50 57 56.5 55.4 Q50 54.4 43.5 55.4 Z" fill="#fff" />
        </g>
      );
    case "soft":
      return <path d="M45.5 57 Q50 60 54.5 57" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />;
    case "open":
      return (
        <g>
          <ellipse cx="50" cy="58" rx="5" ry="4.2" fill={INK} />
          <path d="M45.4 56 Q50 54.6 54.6 56 Q50 57.6 45.4 56 Z" fill="#fff" />
          <ellipse cx="50" cy="60.4" rx="2.6" ry="1.6" fill="#ff8f8f" />
        </g>
      );
    case "smirk":
      return <path d="M44 57.5 Q52 61 57.5 55" fill="none" stroke={INK} strokeWidth="2.1" strokeLinecap="round" />;
    case "surprised":
      return <ellipse cx="50" cy="58" rx="2.7" ry="3.3" fill={INK} />;
    default:
      return <path d="M43 56 Q50 62.5 57 56" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />;
  }
}

/* ------------------------------------------------------------ Barbe/moustache */

function facialHair(style: string, c: string): ReactNode {
  switch (style) {
    case "stubble":
      return <path d="M34 53 Q38 70 50 71.5 Q62 70 66 53 Q60 64 50 64 Q40 64 34 53 Z" fill={c} opacity="0.28" />;
    case "mustache":
      return <path d="M41 54.5 Q46 52.5 50 55 Q54 52.5 59 54.5 Q54 58.5 50 56.2 Q46 58.5 41 54.5 Z" fill={c} />;
    case "goatee":
      return (
        <g>
          <path d="M41 54.5 Q46 52.5 50 55 Q54 52.5 59 54.5 Q54 58.5 50 56.2 Q46 58.5 41 54.5 Z" fill={c} />
          <path d="M45 62 Q50 69 55 62 Q53 66.5 50 66.5 Q47 66.5 45 62 Z" fill={c} />
        </g>
      );
    case "beard":
      return (
        <g>
          <path d="M32 46 Q33 71 50 73.5 Q67 71 68 46 Q66 59 57 61 Q53 65 50 63.5 Q47 65 43 61 Q34 59 32 46 Z" fill={c} />
          <path d="M41 54.5 Q46 52.5 50 55 Q54 52.5 59 54.5 Q54 58.5 50 56.2 Q46 58.5 41 54.5 Z" fill={c} />
        </g>
      );
    default:
      return null;
  }
}

/* --------------------------------------------------------------- Cheveux */

function shine(): ReactNode {
  return <path d="M36 25 Q44 20.5 53 22" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity="0.35" />;
}

const CAP = "M27 46 Q26 18 50 18 Q74 18 73 46 Q71 30 57 29 Q53 34 50 32 Q47 34 43 29 Q29 30 27 46 Z";

function hairFront(style: string, c: string, hi: string): ReactNode {
  switch (style) {
    case "none":
      return null;
    case "buzz":
      return <path d="M29 45 Q28 21 50 20 Q72 21 71 45 Q68 30 50 29 Q32 30 29 45 Z" fill={c} opacity="0.9" />;
    case "short":
      return (
        <g>
          <path d={CAP} fill={c} />
          {shine()}
        </g>
      );
    case "sidePart":
      return (
        <g>
          <path d="M27 47 Q25 18 51 18 Q74 18 72 41 Q70 28 56 28 Q40 23 33 33 Q31 36 28 33 Q27 40 27 47 Z" fill={c} />
          {shine()}
        </g>
      );
    case "wavy":
      return (
        <g>
          <path d="M27 46 Q26 18 50 18 Q74 18 73 46 Q69 32 62 32 Q60 36 56 33 Q53 37 50 33 Q47 37 44 33 Q40 36 38 32 Q31 32 27 46 Z" fill={c} />
          {shine()}
        </g>
      );
    case "curly":
      return (
        <g fill={c}>
          <circle cx="31" cy="27" r="9" />
          <circle cx="42" cy="21" r="9" />
          <circle cx="54" cy="20" r="9" />
          <circle cx="66" cy="24" r="9" />
          <circle cx="70" cy="34" r="8" />
          <circle cx="30" cy="36" r="8" />
          <path d="M30 46 Q29 33 50 32 Q71 33 70 46 Q66 37 50 36 Q34 37 30 46 Z" />
        </g>
      );
    case "afro":
      return <path d="M30 46 Q29 33 50 32 Q71 33 70 46 Q66 37 50 36 Q34 37 30 46 Z" fill={c} />;
    case "bun":
      return (
        <g>
          <circle cx="50" cy="15" r="6.5" fill={c} />
          <circle cx="47.5" cy="13.5" r="2" fill={hi} opacity="0.6" />
          <path d={CAP} fill={c} />
          {shine()}
        </g>
      );
    case "ponytail":
      return (
        <g>
          <path d={CAP} fill={c} />
          {shine()}
        </g>
      );
    case "long":
      return (
        <g>
          <path d={CAP} fill={c} />
          {shine()}
        </g>
      );
    case "bob":
      return (
        <g>
          <path d={CAP} fill={c} />
          {shine()}
        </g>
      );
    case "spiky":
      return (
        <path
          d="M27 46 Q27 33 30 29 L28 21 L34 27 L34 17 L41 25 L42 14 L50 23 L58 14 L59 25 L66 17 L66 27 L72 21 L70 29 Q73 33 73 46 Q66 33 57 31 Q53 35 50 33 Q47 35 43 31 Q34 33 27 46 Z"
          fill={c}
        />
      );
    default:
      return <path d={CAP} fill={c} />;
  }
}

function hairBack(style: string, c: string, hi: string): ReactNode {
  switch (style) {
    case "curly":
      return (
        <g fill={c}>
          <circle cx="24" cy="42" r="9" />
          <circle cx="76" cy="42" r="9" />
          <circle cx="28" cy="30" r="10" />
          <circle cx="72" cy="30" r="10" />
        </g>
      );
    case "afro":
      return (
        <g fill={c}>
          <circle cx="50" cy="24" r="17" />
          <circle cx="29" cy="31" r="14" />
          <circle cx="71" cy="31" r="14" />
          <circle cx="23" cy="45" r="12" />
          <circle cx="77" cy="45" r="12" />
          <circle cx="50" cy="17" r="13" />
        </g>
      );
    case "ponytail":
      return (
        <g fill={c}>
          <ellipse cx="24" cy="47" rx="7" ry="9.5" />
          <ellipse cx="76" cy="47" rx="7" ry="9.5" />
          <ellipse cx="22" cy="41" rx="2.4" ry="2.4" fill={hi} opacity="0.5" />
        </g>
      );
    case "long":
      return (
        <path
          d="M24 44 Q22 18 50 18 Q78 18 76 44 Q80 70 72 88 L63 88 Q70 62 66 44 Q66 30 50 30 Q34 30 34 44 Q30 62 37 88 L28 88 Q20 70 24 44 Z"
          fill={c}
        />
      );
    case "bob":
      return (
        <path
          d="M25 44 Q23 18 50 18 Q77 18 75 44 Q77 60 69 68 L61 65 Q68 54 66 44 Q66 30 50 30 Q34 30 34 44 Q32 54 39 65 L31 68 Q23 60 25 44 Z"
          fill={c}
        />
      );
    default:
      return null;
  }
}

/* -------------------------------------------------------------- Lunettes */

function glasses(style: string): ReactNode {
  if (style === "none") return null;
  const bridge = <line x1="46" y1="46.5" x2="54" y2="46.5" stroke={INK} strokeWidth="1.6" />;
  const arms = (
    <g stroke={INK} strokeWidth="1.6" strokeLinecap="round">
      <line x1="35" y1="46" x2="30" y2="47.5" />
      <line x1="65" y1="46" x2="70" y2="47.5" />
    </g>
  );
  if (style === "round")
    return (
      <g fill="none" stroke={INK} strokeWidth="1.8">
        <circle cx="42" cy="47" r="5.2" />
        <circle cx="58" cy="47" r="5.2" />
        {bridge}
        {arms}
      </g>
    );
  if (style === "square")
    return (
      <g fill="none" stroke={INK} strokeWidth="1.8">
        <rect x="36.5" y="42.5" width="10" height="8.5" rx="2.4" />
        <rect x="53.5" y="42.5" width="10" height="8.5" rx="2.4" />
        {bridge}
        {arms}
      </g>
    );
  // sun
  return (
    <g>
      <rect x="36.5" y="42.5" width="10.5" height="8.8" rx="3.2" fill={INK} />
      <rect x="53" y="42.5" width="10.5" height="8.8" rx="3.2" fill={INK} />
      <line x1="46.5" y1="44.5" x2="53.5" y2="44.5" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      {arms}
    </g>
  );
}

/* --------------------------------------------------------- Accessoire tête */

function headwear(style: string, color: string): ReactNode {
  switch (style) {
    case "beanie":
      return (
        <g>
          <path d="M25 41 Q25 18 50 17 Q75 18 75 41 Q60 31 50 31 Q40 31 25 41 Z" fill={color} />
          <rect x="24" y="38" width="52" height="6.5" rx="3.2" fill={color} />
          <rect x="24" y="38" width="52" height="6.5" rx="3.2" fill="#000" opacity="0.12" />
          <circle cx="50" cy="14" r="3.2" fill={color} />
        </g>
      );
    case "headband":
      return (
        <g>
          <rect x="26" y="34" width="48" height="5.5" rx="2.75" fill={color} transform="rotate(-4 50 37)" />
          <path d="M70 33 l5 -3 l-1 5 l4 1 l-5 3 Z" fill={color} />
        </g>
      );
    case "cap":
      return (
        <g fill={color}>
          <path d="M26 40 Q26 19 50 18 Q74 19 74 40 Q60 30 50 30 Q40 30 26 40 Z" />
          <path d="M46 39 Q28 40 21 46 Q29 43 46 42 Z" />
          <circle cx="50" cy="19.5" r="2.2" fill="#000" opacity="0.12" />
        </g>
      );
    case "flower":
      return (
        <g>
          {[0, 72, 144, 216, 288].map((a) => {
            const r = (a * Math.PI) / 180;
            return <circle key={a} cx={68 + Math.cos(r) * 3.4} cy={27 + Math.sin(r) * 3.4} r="2.4" fill="#ff9ec4" />;
          })}
          <circle cx="68" cy="27" r="2.2" fill="#ffd36e" />
        </g>
      );
    case "headphones":
      return (
        <g>
          <path d="M27 44 Q27 15 50 14 Q73 15 73 44" fill="none" stroke="#3a3f4a" strokeWidth="3.4" strokeLinecap="round" />
          <rect x="23.5" y="42" width="7.5" height="11" rx="3.4" fill={color} />
          <rect x="69" y="42" width="7.5" height="11" rx="3.4" fill={color} />
        </g>
      );
    default:
      return null;
  }
}

/* --------------------------------------------------------------- Cils / poses */

function lashes(): ReactNode {
  const set = (cx: number, dir: number) => {
    const ox = cx + dir * 3.7;
    const oy = 44.3;
    return (
      <g key={cx}>
        <path d={`M${ox} ${oy} q${dir * 1.9} -1.5 ${dir * 2.7} -2.4`} stroke={INK} strokeWidth="0.9" fill="none" strokeLinecap="round" />
        <path d={`M${ox - dir * 1.5} ${oy - 0.3} q${dir * 1.3} -1.6 ${dir * 1.9} -2.6`} stroke={INK} strokeWidth="0.9" fill="none" strokeLinecap="round" />
      </g>
    );
  };
  return [set(42, -1), set(58, 1)];
}

function handOpen(x: number, y: number, c: string): ReactNode {
  const fingers = [0, 1, 2, 3].map((i) => {
    const fx = x - 4.2 + i * 2.8;
    return <rect key={i} x={fx - 1.2} y={y - 8.5} width="2.4" height="7" rx="1.2" fill={c} />;
  });
  return (
    <g>
      <circle cx={x} cy={y} r="5" fill={c} />
      {fingers}
      <circle cx={x - 5} cy={y + 1} r="1.9" fill={c} />
    </g>
  );
}

function handPeace(x: number, y: number, c: string): ReactNode {
  return (
    <g>
      <circle cx={x} cy={y + 1} r="4.7" fill={c} />
      <rect x={x - 2.7} y={y - 9} width="2.4" height="9.5" rx="1.2" fill={c} transform={`rotate(-12 ${x - 1.5} ${y})`} />
      <rect x={x + 0.4} y={y - 9} width="2.4" height="9.5" rx="1.2" fill={c} transform={`rotate(12 ${x + 1.6} ${y})`} />
    </g>
  );
}

function handThumb(x: number, y: number, c: string): ReactNode {
  return (
    <g>
      <circle cx={x} cy={y + 2} r="5" fill={c} />
      <rect x={x - 1.4} y={y - 6.5} width="2.8" height="8.5" rx="1.4" fill={c} />
    </g>
  );
}

function poseArm(style: string, skin: string, sleeve: string): ReactNode {
  if (!style || style === "none") return null;
  const hand =
    style === "peace" ? handPeace(84, 40, skin) : style === "thumbsup" ? handThumb(84, 40, skin) : handOpen(84, 39, skin);
  return (
    <g className={style === "wave" ? "av-arm av-wavehand" : "av-arm"}>
      <path d="M64 80 Q80 78 84 47" fill="none" stroke={sleeve} strokeWidth="11" strokeLinecap="round" />
      <path d="M83 58 Q86 50 84 45.5" fill="none" stroke={skin} strokeWidth="9" strokeLinecap="round" />
      {hand}
    </g>
  );
}

/* ---------------------------------------------------------------- Habits */

function clothing(style: string, color: string, skinBase: string, body: string): ReactNode {
  const sh =
    body === "masculin"
      ? "M11 100 Q11 82 32 77.5 Q41 75.5 50 75.5 Q59 75.5 68 77.5 Q89 82 89 100 Z"
      : body === "feminin"
        ? "M22 100 Q22 86 35 81 Q42 79.2 50 79.2 Q58 79.2 65 81 Q78 86 78 100 Z"
        : "M17 100 Q17 84 34 79.5 Q42 77.5 50 77.5 Q58 77.5 66 79.5 Q83 84 83 100 Z";
  const base = <path d={sh} fill={color} />;
  switch (style) {
    case "hoodie":
      return (
        <g>
          {base}
          <path d="M34 80 Q40 73 50 73 Q60 73 66 80 Q58 78 50 78 Q42 78 34 80 Z" fill="#000" opacity="0.1" />
          <line x1="47" y1="80" x2="46" y2="90" stroke="#000" strokeWidth="1.4" opacity="0.25" strokeLinecap="round" />
          <line x1="53" y1="80" x2="54" y2="90" stroke="#000" strokeWidth="1.4" opacity="0.25" strokeLinecap="round" />
        </g>
      );
    case "collar":
      return (
        <g>
          {base}
          <path d="M50 79 L42 86 L47 88 Z" fill="#fff" opacity="0.85" />
          <path d="M50 79 L58 86 L53 88 Z" fill="#fff" opacity="0.85" />
          <line x1="50" y1="80" x2="50" y2="99" stroke="#000" strokeWidth="1.2" opacity="0.18" />
        </g>
      );
    case "vneck":
      return (
        <g>
          {base}
          <path d="M43 79 L50 89 L57 79 Q50 80 43 79 Z" fill={skinBase} />
        </g>
      );
    default: // crew
      return (
        <g>
          {base}
          <path d="M42 79 Q50 85 58 79" fill="none" stroke="#000" strokeWidth="1.4" opacity="0.14" strokeLinecap="round" />
        </g>
      );
  }
}
