// Filtre des données locales avant export — CLIENT (fonctions pures).
//
// L'archive « Télécharger mes données » contient les données personnelles
// enregistrées sur l'appareil (lib/localAccountData). Elle ne doit JAMAIS
// contenir de moyen de connexion ou de clé technique (jeton, mot de passe,
// clé d'API, cookie, code PIN…), même si une évolution future d'Orbs venait à
// en ranger un dans le stockage local. Elle ne doit pas non plus perdre de
// données personnelles : rien n'est retiré « au hasard ».
//
// Règles, de la plus sûre à la plus large :
//   1. Toute clé rangée sous le nom d'un autre espace (`orbs.user.…`,
//      `orbs.device.…`) est exclue : son propriétaire n'est pas certain.
//   2. Toute chaîne qui EST, en entier, un secret au format reconnaissable
//      (JWT, en-tête « Bearer », clé Stripe/OpenAI/GitHub/AWS/Google/Brevo,
//      clé privée PEM, cookie de session d'Orbs) est retirée, où qu'elle
//      soit. Un texte qui se contente d'en parler est conservé.
//   3. Données NON RELUES (clés inconnues du catalogue : ajouts futurs) :
//      une clé ou un champ dont le NOM désigne un moyen de connexion
//      (token, secret, password, auth, apiKey, cookie, pin, sessionToken…)
//      est retiré, sauf si sa valeur ne peut rien cacher (vrai/faux, vide,
//      ou un nombre pour un simple compteur de « tokens »).
//      Les données du catalogue, relues une à une et qui contiennent des noms
//      choisis par l'élève (matières, dossiers…), ne subissent pas cette
//      règle : une matière appelée « Secret » ne doit pas disparaître.
//
// Tout ce qui est retiré est LISTÉ dans l'archive (`elementsRetires`), avec
// la raison : l'élève sait exactement ce qui n'a pas été inclus.

export type LocalExclusion = { donnee: string; raison: string };

export const EXCLUSION_REASON = {
  secret:
    "Moyen de connexion ou clé technique (jeton, mot de passe, clé, cookie, code…) : " +
    "jamais inclus dans une archive.",
  foreign:
    "Donnée rangée sous le nom d'un autre espace (autre compte ou appareil) : son " +
    "propriétaire n'est pas certain, elle n'est pas incluse.",
  tooDeep: "Structure trop imbriquée pour être vérifiée : non incluse, par prudence.",
} as const;

// ---------------------------------------------------------------------------
// Noms sensibles
// ---------------------------------------------------------------------------

/** Mots qui, seuls, désignent un moyen de connexion ou un secret. */
const SECRET_WORDS = new Set([
  "secret", "secrets", "password", "passwords", "passwd", "pwd", "passphrase",
  "passcode", "mdp", "motdepasse", "credential", "credentials", "creds",
  "cookie", "cookies", "jwt", "bearer", "csrf", "xsrf", "otp", "totp", "auth",
  "oauth", "authorization", "authentication", "apikey", "apikeys", "apisecret",
  "privatekey", "accesstoken", "refreshtoken", "idtoken", "authtoken",
  "sessionid", "sessiontoken", "sessionkey", "sessioncookie", "pin", "pincode",
  "codepin",
]);

/** « token(s) » / « jeton(s) » : un nombre associé n'est qu'un compteur (usage de l'IA). */
const TOKEN_WORDS = new Set(["token", "tokens", "jeton", "jetons"]);

/** Morceaux qui désignent un secret même collés à d'autres mots. */
const SECRET_FRAGMENTS = [
  "password", "motdepasse", "passwd", "secret", "credential", "apikey",
  "privatekey", "accesstoken", "refreshtoken", "authtoken", "sessiontoken",
  "bearer", "jwt",
];

/** « key » / « code » / « session » ne sont sensibles qu'accompagnés. */
const KEY_WORDS = new Set(["key", "keys", "cle", "cles"]);
const KEY_QUALIFIERS = new Set([
  "api", "private", "secret", "access", "signing", "encryption", "crypto",
  "session", "auth", "client", "license", "licence",
]);
const CODE_QUALIFIERS = new Set([
  "verification", "verify", "otp", "auth", "pin", "reset", "login", "invite",
  "invitation", "family", "famille", "access", "recovery", "backup",
  "connexion", "confirmation", "magic",
]);
const SESSION_QUALIFIERS = new Set(["token", "key", "cookie", "secret"]);

/** Découpe un nom (camelCase, snake_case, points, tirets) en mots minuscules. */
export function nameWords(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((w) => w.replace(/\d+$/, ""))
    .filter(Boolean);
}

/**
 * Le nom désigne-t-il un moyen de connexion ou un secret ?
 * `null` si non ; sinon `countSafe` indique qu'un NOMBRE associé n'est qu'un
 * compteur (cas de « tokens » seul) et peut être gardé.
 */
export function sensitiveName(name: string): null | { countSafe: boolean } {
  const words = nameWords(name);
  const has = (set: Set<string>) => words.some((w) => set.has(w));
  const joined = words.join("");

  const strong =
    has(SECRET_WORDS) ||
    SECRET_FRAGMENTS.some((f) => joined.includes(f)) ||
    (words.some((w) => KEY_WORDS.has(w)) && has(KEY_QUALIFIERS)) ||
    (words.some((w) => w === "code" || w === "codes") && has(CODE_QUALIFIERS)) ||
    (words.includes("session") && has(SESSION_QUALIFIERS)) ||
    (words.length === 2 && words[0] === "session" && words[1] === "id");
  if (strong) return { countSafe: false };
  if (has(TOKEN_WORDS)) return { countSafe: true };
  return null;
}

// ---------------------------------------------------------------------------
// Valeurs au format secret
// ---------------------------------------------------------------------------

/** Formats de secrets reconnaissables quand ils forment TOUTE la valeur. */
const SECRET_VALUE_PATTERNS: RegExp[] = [
  /^eyJ[\w-]{4,}\.eyJ[\w-]{4,}\.[\w-]*$/, // JWT (jeton de session, d'API…)
  /^(?:bearer|basic)\s+[\w.~+/=-]{12,}$/i, // en-tête d'autorisation
  /^(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}$/, // clé secrète Stripe
  /^whsec_[A-Za-z0-9+/=]{10,}$/, // secret de webhook Stripe
  /^sk-[A-Za-z0-9_-]{20,}$/, // clé d'API (OpenAI et compatibles)
  /^xkeysib-[A-Za-z0-9_-]{20,}$/, // clé d'API Brevo
  /^(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}$/, // jeton GitHub
  /^github_pat_\w{20,}$/, // jeton GitHub (fin)
  /^xox[abposr]-[\w-]{10,}$/, // jeton Slack
  /^AKIA[0-9A-Z]{16}$/, // identifiant de clé AWS
  /^AIza[\w-]{35}$/, // clé d'API Google
];

/** Formats reconnaissables même au milieu d'une valeur. */
const SECRET_VALUE_CONTAINS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, // clé privée PEM
  /\borbs_session=/, // cookie de session d'Orbs recopié
];

export function looksLikeSecretValue(value: string): boolean {
  const t = value.trim();
  return (
    SECRET_VALUE_PATTERNS.some((re) => re.test(t)) ||
    SECRET_VALUE_CONTAINS.some((re) => re.test(value))
  );
}

// ---------------------------------------------------------------------------
// Filtrage d'une entrée du stockage local
// ---------------------------------------------------------------------------

/** Profondeur maximale vérifiée (les données d'Orbs en sont très loin). */
export const MAX_FILTER_DEPTH = 64;

const REMOVED = Symbol("removed");

/** Une valeur qui ne peut rien cacher (vrai/faux, vide, compteur). */
function harmless(value: unknown, countSafe: boolean): boolean {
  return (
    value === null ||
    value === "" ||
    typeof value === "boolean" ||
    (countSafe && typeof value === "number")
  );
}

function clean(
  value: unknown,
  path: string,
  reviewed: boolean,
  exclusions: LocalExclusion[],
  depth: number,
): unknown {
  if (typeof value === "string") {
    if (looksLikeSecretValue(value)) {
      exclusions.push({ donnee: path, raison: EXCLUSION_REASON.secret });
      return REMOVED;
    }
    return value;
  }
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_FILTER_DEPTH) {
    exclusions.push({ donnee: path, raison: EXCLUSION_REASON.tooDeep });
    return REMOVED;
  }
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    value.forEach((item, i) => {
      const c = clean(item, `${path}[${i}]`, reviewed, exclusions, depth + 1);
      if (c !== REMOVED) out.push(c);
    });
    return out;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const p = `${path} › ${k}`;
    if (!reviewed) {
      const s = sensitiveName(k);
      if (s && !harmless(v, s.countSafe)) {
        exclusions.push({ donnee: p, raison: EXCLUSION_REASON.secret });
        continue;
      }
    }
    const c = clean(v, p, reviewed, exclusions, depth + 1);
    // defineProperty : un champ nommé « __proto__ » reste une donnée ordinaire.
    if (c !== REMOVED) {
      Object.defineProperty(out, k, { value: c, enumerable: true, writable: true, configurable: true });
    }
  }
  return out;
}

export type FilteredEntry = { keep: true; value: unknown } | { keep: false };

/**
 * Filtre UNE entrée du stockage local d'un compte avant l'export.
 * @param name    nom de la donnée dans l'espace du compte (ex. "orbs.agenda.v1")
 * @param value   valeur déjà décodée (JSON ou texte)
 * @param reviewed true si la donnée figure au catalogue relu (LOCAL_DATA_CATALOG)
 * @param label   chemin affiché dans la liste des éléments retirés
 */
export function filterLocalEntry(
  name: string,
  value: unknown,
  opts: { reviewed: boolean; label?: string; exclusions: LocalExclusion[] },
): FilteredEntry {
  const label = opts.label ?? name;
  if (name.includes("orbs.user.") || name.startsWith("orbs.device.")) {
    opts.exclusions.push({ donnee: label, raison: EXCLUSION_REASON.foreign });
    return { keep: false };
  }
  if (!opts.reviewed) {
    const s = sensitiveName(name);
    if (s && !harmless(value, s.countSafe)) {
      opts.exclusions.push({ donnee: label, raison: EXCLUSION_REASON.secret });
      return { keep: false };
    }
  }
  const c = clean(value, label, opts.reviewed, opts.exclusions, 0);
  return c === REMOVED ? { keep: false } : { keep: true, value: c };
}
