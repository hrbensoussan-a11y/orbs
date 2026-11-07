// Économie de crédits d'Orbs — dérivée des COÛTS API RÉELS, pas fixée au hasard.
//
// Objectif (cahier des charges) : « Ne fixe pas arbitrairement les allocations
// de crédits : propose des valeurs cohérentes à partir des coûts API réels et
// rends-les configurables. »
//
// Principe. Un seul portefeuille de crédits (voir prisma `CreditWallet`) sert à
// toutes les consommations d'IA. Chaque action a un COÛT en crédits calculé à
// partir de :
//   1) le prix réel du modèle appelé (€/million de tokens) ;
//   2) une consommation moyenne estimée (tokens d'entrée/sortie) de l'action ;
//   3) la « valeur » d'un crédit (combien de coût API un crédit représente).
//
// Tout est pilotable par variables d'environnement avec des valeurs par défaut
// raisonnables ; changer un prix de modèle ou une allocation ne demande donc
// aucune modification de code.
//
// ⚠️ Module SANS secret (prix publics + hypothèses), mais pensé pour être
// consommé côté SERVEUR (composants serveur, routes). Les valeurs affichées au
// navigateur transitent en props depuis un composant serveur : on évite ainsi
// toute divergence entre `process.env` serveur et client (les variables non
// `NEXT_PUBLIC_` ne sont pas lisibles côté client).
//
// Les deux MOTEURS d'IA, Core et Ultra, partagent ce portefeuille unique :
//   - Core  = réflexion « moyenne »  → mappé sur le mode Luna (lib/ai/modes).
//   - Ultra = réflexion « poussée » → mappé sur le mode Terra.
// Le moteur ne change que le COÛT en crédits, jamais la source des crédits.

import type { AiModeId } from "@/lib/ai/modes";

/** Moteur de facturation des crédits (le portefeuille est commun). */
export type CreditEngine = "core" | "ultra";

/** Actions d'IA facturées en crédits. */
export type CreditOp =
  | "chat_core"
  | "chat_ultra"
  | "cards"
  | "voice_stt"
  | "voice_tts";

// --- petits lecteurs d'environnement (nombre > 0, sinon valeur par défaut) ---
function num(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw == null || raw === "" ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ---------------------------------------------------------------------------
// 1) Prix réels des modèles (€ par MILLION de tokens).
//
// Les modèles gpt-5.6 Core/Ultra sont des modèles de raisonnement : l'effort de
// raisonnement est facturé comme de la SORTIE, d'où un prix de sortie élevé et
// une différence marquée entre Core (effort moyen) et Ultra (effort poussé).
// Valeurs par défaut alignées sur les tarifs publics d'une famille « GPT-5 » :
//   Core  ≈ un modèle « mini »  : entrée 0,25 €/M, sortie 2,00 €/M.
//   Ultra ≈ le modèle complet   : entrée 1,25 €/M, sortie 10,00 €/M.
// Ajustez via l'environnement selon le fournisseur réel.
// ---------------------------------------------------------------------------
export const MODEL_PRICE_EUR_PER_MTOK = {
  core: {
    input: num("CREDITS_CORE_INPUT_EUR_PER_MTOK", 0.25),
    output: num("CREDITS_CORE_OUTPUT_EUR_PER_MTOK", 2.0),
  },
  ultra: {
    input: num("CREDITS_ULTRA_INPUT_EUR_PER_MTOK", 1.25),
    output: num("CREDITS_ULTRA_OUTPUT_EUR_PER_MTOK", 10.0),
  },
} as const;

// ---------------------------------------------------------------------------
// 2) Consommation moyenne estimée par action (tokens). Volontairement un peu
//    généreuse pour que le coût réel reste SOUS le coût facturé en crédits.
//    (Le chat garde une marge via `OPENAI_MAX_COMPLETION_TOKENS`, défaut 1400.)
// ---------------------------------------------------------------------------
const USAGE = {
  chat_core: {
    input: num("CREDITS_USAGE_CHAT_CORE_IN", 1500),
    output: num("CREDITS_USAGE_CHAT_CORE_OUT", 600),
  },
  chat_ultra: {
    input: num("CREDITS_USAGE_CHAT_ULTRA_IN", 1800),
    output: num("CREDITS_USAGE_CHAT_ULTRA_OUT", 1400),
  },
  // Les fiches utilisent le modèle « poussé » (lib/ai/openai → AI_CONFIG.model).
  cards: {
    input: num("CREDITS_USAGE_CARDS_IN", 1600),
    output: num("CREDITS_USAGE_CARDS_OUT", 900),
  },
} as const;

// Voix : facturée à un coût € forfaitaire par appel (Whisper ≈ 0,006 €/min ;
// TTS gpt-4o-mini ≈ coût comparable pour une réponse courte lue à voix haute).
const VOICE_EUR = {
  stt: num("CREDITS_VOICE_STT_EUR", 0.004),
  tts: num("CREDITS_VOICE_TTS_EUR", 0.004),
} as const;

// ---------------------------------------------------------------------------
// 3) Valeur d'un crédit : combien de coût API (en €) un crédit « couvre ».
//    0,002 € ⇒ 500 crédits = 1 € de coût API brut. Plus la valeur est basse,
//    plus un crédit est « petit » (donc plus d'allocation nominale).
// ---------------------------------------------------------------------------
export const CREDIT_VALUE_EUR = num("CREDITS_VALUE_EUR", 0.002);

/** Coût € réel estimé d'une action (avant conversion en crédits). */
export function opCostEur(op: CreditOp): number {
  switch (op) {
    case "chat_core":
      return (
        (USAGE.chat_core.input * MODEL_PRICE_EUR_PER_MTOK.core.input) / 1e6 +
        (USAGE.chat_core.output * MODEL_PRICE_EUR_PER_MTOK.core.output) / 1e6
      );
    case "chat_ultra":
      return (
        (USAGE.chat_ultra.input * MODEL_PRICE_EUR_PER_MTOK.ultra.input) / 1e6 +
        (USAGE.chat_ultra.output * MODEL_PRICE_EUR_PER_MTOK.ultra.output) / 1e6
      );
    case "cards":
      return (
        (USAGE.cards.input * MODEL_PRICE_EUR_PER_MTOK.ultra.input) / 1e6 +
        (USAGE.cards.output * MODEL_PRICE_EUR_PER_MTOK.ultra.output) / 1e6
      );
    case "voice_stt":
      return VOICE_EUR.stt;
    case "voice_tts":
      return VOICE_EUR.tts;
  }
}

/**
 * Coût d'une action en CRÉDITS = coût € réel ÷ valeur d'un crédit, arrondi au
 * crédit supérieur (jamais 0 : toute action coûte au moins 1 crédit).
 *
 * Valeurs dérivées avec les défauts ci-dessus (pour mémoire) :
 *   chat_core  ≈ 0,00158 € → 1 crédit
 *   chat_ultra ≈ 0,01625 € → 9 crédits
 *   cards      ≈ 0,011 €   → 6 crédits
 *   voice_stt  = 0,004 €   → 2 crédits
 *   voice_tts  = 0,004 €   → 2 crédits
 */
export function creditCost(op: CreditOp): number {
  return Math.max(1, Math.ceil(opCostEur(op) / CREDIT_VALUE_EUR));
}

/** Tableau figé des coûts (pratique pour l'affichage et les props). */
export function creditCosts(): Record<CreditOp, number> {
  return {
    chat_core: creditCost("chat_core"),
    chat_ultra: creditCost("chat_ultra"),
    cards: creditCost("cards"),
    voice_stt: creditCost("voice_stt"),
    voice_tts: creditCost("voice_tts"),
  };
}

/** Moteur (Core/Ultra) associé à un mode de chat (Luna/Terra). */
export function engineForMode(mode: AiModeId): CreditEngine {
  return mode === "terra" ? "ultra" : "core";
}

/** Op de chat correspondant à un moteur. */
export function chatOpForEngine(engine: CreditEngine): CreditOp {
  return engine === "ultra" ? "chat_ultra" : "chat_core";
}

/** Libellé court d'un moteur (affichage). */
export const ENGINE_LABEL: Record<CreditEngine, string> = {
  core: "Core",
  ultra: "Ultra",
};
