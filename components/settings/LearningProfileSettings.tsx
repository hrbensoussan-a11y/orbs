"use client";

// Réglages → Assistant IA → « Ce que l'assistant sait de toi ».
//
// Profil d'apprentissage FACULTATIF, rempli uniquement par l'élève : classe
// (la même que dans Compte → Profil), façons d'apprendre, matières à
// accompagner, difficultés, et une courte note libre. Chaque modification est
// enregistrée sur le compte (action serveur saveLearningProfile, validée côté
// serveur) ; l'assistant le relit à chaque message (/api/ai/chat).
//
// L'élève peut tout consulter ici, retirer une information (pastille, champ)
// ou tout vider d'un coup.

import { useRef, useState, useTransition } from "react";
import { Check, Eraser, GraduationCap, NotebookPen, X } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PillToggles, SettingRow, SettingsGroup } from "@/components/settings/controls";
import {
  LEARNING_DIFFICULTIES,
  LEARNING_PREFERENCES,
  PROFILE_LIMITS,
  PROFILE_SUBJECTS,
  cleanText,
  isProfileEmpty,
  type LearningProfile,
} from "@/lib/ai/learningProfile";
import { clearLearningProfile, saveLearningProfile, type ProfileResult } from "@/app/actions/assistant";

type Snapshot = { schoolClass: string; profile: LearningProfile };

const SUBJECT_OPTIONS = PROFILE_SUBJECTS.map((s) => ({ id: s, label: s }));

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((v) => v !== id) : [...list, id];
}

export function LearningProfileSettings({
  initial,
  firstName,
}: {
  initial: Snapshot;
  firstName: string | null;
}) {
  // Affiché (mis à jour tout de suite) ; dernier état confirmé par le serveur.
  const [data, setData] = useState<Snapshot>(initial);
  const confirmedRef = useRef<Snapshot>(initial);
  const [classDraft, setClassDraft] = useState(initial.schoolClass);
  const [aboutDraft, setAboutDraft] = useState(initial.profile.about);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [confirmClear, setConfirmClear] = useState(false);
  const [pending, startTransition] = useTransition();
  // Seule la réponse de la DERNIÈRE demande met l'écran à jour : une réponse
  // plus ancienne ne doit pas effacer une modification faite entre-temps.
  const seq = useRef(0);

  /**
   * Recale les champs de texte sur `shown`, SAUF si l'élève les a modifiés
   * depuis l'envoi (`sent`) : une réponse lente n'efface jamais une saisie.
   */
  function syncDrafts(sent: Snapshot, shown: Snapshot) {
    setClassDraft((d) => (d === sent.schoolClass ? shown.schoolClass : d));
    setAboutDraft((d) => (d === sent.profile.about ? shown.profile.about : d));
  }

  function settle(mine: number, sent: Snapshot, res: ProfileResult | null) {
    if (res?.ok) {
      const saved = { schoolClass: res.schoolClass, profile: res.profile };
      confirmedRef.current = saved;
      if (mine !== seq.current) return;
      setData(saved);
      syncDrafts(sent, saved);
      setStatus("saved");
    } else if (mine === seq.current) {
      const back = confirmedRef.current;
      setData(back);
      syncDrafts(sent, back);
      setStatus("error");
    }
  }

  function persist(next: Snapshot) {
    const mine = ++seq.current;
    setData(next);
    setStatus("idle");
    startTransition(async () => {
      let res: ProfileResult | null = null;
      try {
        res = await saveLearningProfile({ schoolClass: next.schoolClass, ...next.profile });
      } catch {
        res = null;
      }
      settle(mine, next, res);
    });
  }

  function patchProfile(p: Partial<LearningProfile>) {
    persist({ ...data, profile: { ...data.profile, ...p } });
  }

  function commitClass() {
    const value = cleanText(classDraft, PROFILE_LIMITS.schoolClass);
    setClassDraft(value);
    if (value !== data.schoolClass) persist({ ...data, schoolClass: value });
  }

  function commitAbout() {
    const value = cleanText(aboutDraft, PROFILE_LIMITS.about);
    setAboutDraft(value);
    if (value !== data.profile.about) patchProfile({ about: value });
  }

  function doClear() {
    setConfirmClear(false);
    const mine = ++seq.current;
    const sent = data;
    setStatus("idle");
    startTransition(async () => {
      let res: ProfileResult | null = null;
      try {
        res = await clearLearningProfile();
      } catch {
        res = null;
      }
      if (res?.ok && mine === seq.current) {
        // Tout est effacé : les champs aussi (la fenêtre de confirmation
        // empêchait toute saisie pendant ce temps).
        setClassDraft("");
        setAboutDraft("");
      }
      settle(mine, sent, res);
    });
  }

  const p = data.profile;
  const empty = isProfileEmpty(p) && !data.schoolClass;
  const aboutLeft = PROFILE_LIMITS.about - aboutDraft.length;

  return (
    <>
      <SettingsGroup
        title="Ce que l’assistant sait de toi"
        footer={
          <>
            Facultatif. L’assistant reçoit ces informations avec tes questions pour adapter ses
            explications{firstName ? ` ; il connaît aussi ton prénom (${firstName})` : ""}. Rien n’est
            jamais rempli à ta place, et tout s’efface en un geste.{" "}
            <span aria-live="polite">
              {status === "saved" && !pending && (
                <span className="st-saved">
                  <Check size={13} aria-hidden /> Enregistré
                </span>
              )}
              {status === "error" && <span className="text-coral">L’enregistrement a échoué. Réessaie.</span>}
            </span>
          </>
        }
      >
        <SettingRow
          id="profil-classe"
          icon={<GraduationCap size={17} />}
          title="Classe ou niveau"
          desc="La même que dans ton profil de compte. L’assistant adapte son vocabulaire et ses explications."
          stack
        >
          <div className="flex items-center gap-2">
            <input
              type="text"
              className="st-text"
              value={classDraft}
              maxLength={PROFILE_LIMITS.schoolClass}
              placeholder="Ex. : 3e, Seconde, Terminale…"
              onChange={(e) => setClassDraft(e.target.value)}
              onBlur={commitClass}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              aria-label="Classe ou niveau"
              autoComplete="off"
            />
            {data.schoolClass && (
              <button
                type="button"
                className="btn-ghost !px-2.5"
                onClick={() => persist({ ...data, schoolClass: "" })}
                aria-label="Retirer ma classe"
                title="Retirer"
              >
                <X size={15} aria-hidden />
              </button>
            )}
          </div>
        </SettingRow>

        <SettingRow
          id="profil-preferences"
          title="Comment tu apprends le mieux"
          desc="Choisis autant d’options que tu veux."
          stack
        >
          <PillToggles
            options={LEARNING_PREFERENCES}
            selected={p.prefs}
            onToggle={(id) => patchProfile({ prefs: toggle(p.prefs, id) })}
            label="Comment tu apprends le mieux"
          />
        </SettingRow>

        <SettingRow
          id="profil-matieres"
          title="Matières où tu veux plus d’aide"
          desc="L’assistant y prendra plus de temps pour expliquer et vérifier que tu as compris."
          stack
        >
          <PillToggles
            options={SUBJECT_OPTIONS}
            selected={p.subjects}
            onToggle={(id) => patchProfile({ subjects: toggle(p.subjects, id) })}
            label="Matières où tu veux plus d’aide"
          />
        </SettingRow>

        <SettingRow
          id="profil-difficultes"
          title="Ce qui est plus difficile pour toi"
          desc="Seulement si tu le souhaites. Pas besoin de diagnostic : juste ce qui aide l’assistant à t’expliquer."
          stack
        >
          <PillToggles
            options={LEARNING_DIFFICULTIES}
            selected={p.difficulties}
            onToggle={(id) => patchProfile({ difficulties: toggle(p.difficulties, id) })}
            label="Ce qui est plus difficile pour toi"
          />
        </SettingRow>

        <SettingRow
          id="profil-precisions"
          icon={<NotebookPen size={17} />}
          title="Autre chose à savoir"
          desc="Par exemple : « je prépare le brevet » ou « j’aime les exemples avec le sport »."
          stack
        >
          <textarea
            className="st-textarea"
            value={aboutDraft}
            maxLength={PROFILE_LIMITS.about}
            rows={3}
            placeholder="Ce que tu veux que l’assistant sache sur ta scolarité…"
            onChange={(e) => setAboutDraft(e.target.value)}
            onBlur={commitAbout}
            aria-label="Autre chose à savoir"
          />
          <div className="mt-1.5 flex items-center justify-between gap-3 text-xs" style={{ color: "var(--st-desc)" }}>
            <span aria-live="polite">{aboutLeft <= 60 ? `${aboutLeft} caractère${aboutLeft > 1 ? "s" : ""} restant${aboutLeft > 1 ? "s" : ""}` : ""}</span>
            {data.profile.about && (
              <button type="button" className="st-link-btn" onClick={() => patchProfile({ about: "" })}>
                <X size={13} aria-hidden /> Effacer ce texte
              </button>
            )}
          </div>
        </SettingRow>

        <SettingRow
          id="profil-vider"
          icon={<Eraser size={17} />}
          title="Vider mon profil"
          desc={
            empty
              ? "Rien n’est renseigné : l’assistant ne connaît que ton prénom."
              : "Efface toutes les informations ci-dessus, classe comprise."
          }
        >
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setConfirmClear(true)}
            disabled={empty}
          >
            <span style={{ color: empty ? undefined : "var(--coral)" }}>Vider</span>
          </button>
        </SettingRow>
      </SettingsGroup>

      <ConfirmDialog
        open={confirmClear}
        tone="danger"
        icon={<Eraser size={20} />}
        title="Vider ton profil d’apprentissage ?"
        message="Ta classe, tes façons d’apprendre, tes matières, tes difficultés et ta note seront effacées. L’assistant ne les utilisera plus. Ta classe disparaîtra aussi de ton profil de compte."
        confirmLabel="Oui, tout effacer"
        cancelLabel="Non"
        onCancel={() => setConfirmClear(false)}
        onConfirm={doClear}
      />
    </>
  );
}
