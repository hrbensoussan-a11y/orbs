// Entrées brutes & vérification tolérante (spec §5, §6).

/** minuscule → sans accents → ponctuation en espaces → espaces réduits. */
export function normalize(s: string): string {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // accents
    .replace(/[^\p{L}\p{N}]+/gu, " ") // ponctuation -> espace
    .replace(/\s+/g, " ")
    .trim();
}

const ARTICLES = /^(le |la |les |l |un |une |des |the |a |an )/;

/** Comparaison tolérante ; option : ignorer un article initial. */
export function answerMatches(input: string, answer: string): boolean {
  const a = normalize(input);
  const b = normalize(answer);
  if (!a) return false;
  if (a === b) return true;
  return a.replace(ARTICLES, "") === b.replace(ARTICLES, "");
}

/** Ratio de mots corrects (pour texte à trous). */
export function wordRatio(input: string, answer: string): number {
  const a = normalize(input).split(" ").filter(Boolean);
  const b = normalize(answer).split(" ").filter(Boolean);
  if (!b.length) return a.length ? 0 : 1;
  const bag = new Map<string, number>();
  for (const w of b) bag.set(w, (bag.get(w) || 0) + 1);
  let hit = 0;
  for (const w of a) {
    const n = bag.get(w) || 0;
    if (n > 0) {
      hit += 1;
      bag.set(w, n - 1);
    }
  }
  return hit / b.length;
}

function stripBullet(line: string): string {
  return line.replace(/^\s*([-*•]|\d+[.)])\s+/, "").trim();
}

export type ParseResult = {
  pairs: { t: string; d: string }[];
  separator: string;
  ignored: number;
};

/** Détecte le séparateur et découpe le collage en paires [champ1, champ2]. */
export function parsePaste(text: string, forced?: string): ParseResult {
  const lines = text
    .split(/\r?\n/)
    .map(stripBullet)
    .filter((l) => l.length > 0);

  const sep = forced && forced !== "auto" ? forced : detectSeparator(lines);

  const pairs: { t: string; d: string }[] = [];
  let ignored = 0;
  for (const line of lines) {
    const at = findSep(line, sep); // position du séparateur (formes espacée/nue)
    if (at < 0) {
      ignored += 1;
      continue;
    }
    const t = line.slice(0, at).trim();
    const d = line.slice(at + sepLen(sep)).trim();
    if (t && d) pairs.push({ t, d });
    else ignored += 1;
  }
  return { pairs, separator: sep, ignored };
}

function findSep(line: string, sep: string): number {
  if (sep === "\t") return line.indexOf("\t");
  const core = sep.trim();
  // essaie d'abord la forme espacée, sinon la forme nue
  const spaced = line.indexOf(` ${core} `);
  if (spaced >= 0) return spaced + 1;
  return line.indexOf(core);
}
function sepLen(sep: string): number {
  if (sep === "\t") return 1;
  return sep.trim().length;
}

// ---- Texte à trous (cloze) ----
export type ClozeToken =
  | { type: "text"; value: string }
  | { type: "blank"; answer: string };

/** Découpe un passage en segments texte / trous, en repérant [[mot]] même collés. */
export function clozeParse(passage: string): ClozeToken[] {
  const out: ClozeToken[] = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(passage))) {
    if (m.index > last) out.push({ type: "text", value: passage.slice(last, m.index) });
    out.push({ type: "blank", answer: m[1] });
    last = m.index + m[0].length;
  }
  if (last < passage.length) out.push({ type: "text", value: passage.slice(last) });
  return out;
}

export function clozeBlankCount(passage: string): number {
  return clozeParse(passage).filter((t) => t.type === "blank").length;
}

/** Tokenise en mots / non-mots pour l'éditeur cloze et le masquage. */
export type WordToken = { value: string; isWord: boolean };
export function tokenizeWords(text: string): WordToken[] {
  const re = /([\p{L}\p{N}][\p{L}\p{N}-]*)|([^\p{L}\p{N}]+)/gu;
  const out: WordToken[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out.push({ value: m[0], isWord: m[1] !== undefined });
  }
  return out;
}

// ---- Édition cloze : tokens qui préservent la source (cocher un mot) ----
export type MarkedToken = { src: string; kind: "blank" | "word" | "other"; word: string };

export function tokenizeMarked(text: string): MarkedToken[] {
  const re = /\[\[[^\]]+\]\]|[\p{L}\p{N}][\p{L}\p{N}-]*|[^\p{L}\p{N}]+/gu;
  const out: MarkedToken[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const src = m[0];
    if (src.startsWith("[[") && src.endsWith("]]")) {
      out.push({ src, kind: "blank", word: src.slice(2, -2) });
    } else if (/[\p{L}\p{N}]/u.test(src[0])) {
      out.push({ src, kind: "word", word: src });
    } else {
      out.push({ src, kind: "other", word: src });
    }
  }
  return out;
}

export function toggleMarkedToken(tokens: MarkedToken[], i: number): string {
  return tokens
    .map((t, j) => {
      if (j !== i || t.kind === "other") return t.src;
      return t.kind === "blank" ? t.word : `[[${t.word}]]`;
    })
    .join("");
}

// ---- Masquage déterministe (apprendre par cœur) ----
function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Ensemble d'indices de mots masqués pour une fraction donnée (nesté : un
 *  palier supérieur masque au moins les mêmes mots). Déterministe par (seed, i). */
export function maskedSet(seed: string, wordCount: number, frac: number): Set<number> {
  const order = [...Array(wordCount).keys()].sort(
    (a, b) => hashStr(seed + ":" + a) - hashStr(seed + ":" + b),
  );
  const n = Math.round(frac * wordCount);
  return new Set(order.slice(0, n));
}

function detectSeparator(lines: string[]): string {
  const candidates = ["\t", "—", "–", ":", "=", "|", ";", " - "];
  let best = ":";
  let bestScore = -1;
  for (const c of candidates) {
    let hits = 0;
    for (const l of lines) if (findSep(l, c) > 0) hits += 1;
    const score = hits;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}
