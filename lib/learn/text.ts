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

  let sep = forced && forced !== "auto" ? forced : detectSeparator(lines);

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
