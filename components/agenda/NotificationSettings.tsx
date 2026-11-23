"use client";

// Réglages des rappels de l'agenda, répartis en deux catégories des Réglages :
//   - Notifications : interrupteur général (demande la permission du
//     navigateur), sonnerie avec aperçu, volume, « Tester le rappel », et le
//     rappel d'écriture du journal (+ heure) ;
//   - Agenda : rappel avant les cours (+ délai), résumé des devoirs (+ heure,
//     + week-end), et le soir « Préparer ma journée de demain » (+ heure,
//     + aperçu du récapitulatif réel).
// Une seule source : lib/agenda/notifications (espace local du compte). Les
// deux écrans restent synchronisés par l'événement NOTIF_EVENT, émis à chaque
// enregistrement et déjà écouté par le planificateur des rappels.

import { useCallback, useEffect, useState } from "react";
import { BellOff, BellRing, CalendarCheck, CalendarClock, CalendarDays, CalendarOff, Eye, GraduationCap, MoonStar, Music2, NotebookPen, Play, Volume1, Volume2 } from "lucide-react";
import { RINGTONES, playRingtone, unlockOnGesture } from "@/lib/sound/ringtones";
import {
  LEAD_CHOICES,
  NOTIF_EVENT,
  defaultNotifSettings,
  JOURNAL_KEY,
  TOMORROW_KEY,
  fireNotification,
  loadNotifSettings,
  markReminderFired,
  notifPermission,
  reminderFiredToday,
  requestNotifPermission,
  saveNotifSettings,
  type NotifPermission,
  type NotifSettings,
} from "@/lib/agenda/notifications";
import { OptionTile, SettingJump, SettingRow, SettingsGroup, Switch } from "@/components/settings/controls";
import { openTomorrowRecap } from "@/components/agenda/TomorrowRecap";

function useNotifSettings() {
  const [s, setS] = useState<NotifSettings | null>(null);
  const [perm, setPerm] = useState<NotifPermission>("default");

  useEffect(() => {
    unlockOnGesture();
    const sync = () => setS(loadNotifSettings());
    /* eslint-disable react-hooks/set-state-in-effect */
    sync();
    setPerm(notifPermission());
    /* eslint-enable react-hooks/set-state-in-effect */
    window.addEventListener(NOTIF_EVENT, sync);
    return () => window.removeEventListener(NOTIF_EVENT, sync);
  }, []);

  const patch = useCallback((next: Partial<NotifSettings>) => {
    setS((prev) => {
      const merged = { ...(prev ?? defaultNotifSettings()), ...next };
      // Hors du rendu : l'événement émis met à jour l'autre écran.
      queueMicrotask(() => saveNotifSettings(merged));
      return merged;
    });
  }, []);

  return { s, perm, setPerm, patch };
}

// ---------------------------------------------------------------------------
// Notifications : activation, sonnerie, volume, test
// ---------------------------------------------------------------------------

export function NotificationGeneralSettings() {
  const { s, perm, setPerm, patch } = useNotifSettings();
  const [journalHint, setJournalHint] = useState("");

  // « Prochain rappel » du journal : dépend de l'heure, calculé hors du rendu.
  useEffect(() => {
    if (!s?.journal) return;
    const today = !isPastToday(s.journalTime) && !reminderFiredToday(JOURNAL_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setJournalHint(
      `Prochain : ${today ? "aujourd’hui" : "demain"} à ${s.journalTime}, si tu n’as encore rien écrit.`,
    );
  }, [s]);

  if (!s) return <div className="h-40" aria-hidden />;

  /** Comme le récapitulatif du soir : activé après l'heure, il commence demain. */
  function changeJournal(next: Partial<Pick<NotifSettings, "journal" | "journalTime">>) {
    if (!s) return;
    const merged = { ...s, ...next };
    if (merged.journal && isPastToday(merged.journalTime)) markReminderFired(JOURNAL_KEY);
    patch(next);
  }

  async function toggleEnabled(next: boolean) {
    if (next) setPerm(await requestNotifPermission());
    patch({ enabled: next });
  }
  function preview(id: string) {
    unlockOnGesture();
    playRingtone(id, s?.volume ?? 0.7).catch(() => {});
  }
  async function test() {
    if (!s) return;
    await fireNotification(
      "Test de rappel ✓",
      "C'est le son que tu entendras pour tes cours et tes devoirs.",
      s,
      "orbs-test",
    );
  }

  const off = !s.enabled;

  return (
    <>
      <SettingsGroup
        footer="Les rappels sonnent quand Orbs est ouvert sur cet appareil. Ces réglages sont propres à cet appareil."
      >
        <SettingRow
          id="rappels"
          icon={<BellRing size={17} />}
          title="Activer les rappels"
          desc="Cours qui approchent et devoirs du jour, avec une sonnerie."
        >
          <Switch checked={s.enabled} onChange={toggleEnabled} label="Activer les rappels" />
        </SettingRow>
        {perm === "denied" && (
          <div className="st-row">
            <p className="st-note st-note--warn">
              <BellOff size={17} aria-hidden />
              <span>
                Les notifications sont bloquées par le navigateur. Autorise-les dans ses réglages pour
                voir les rappels à l’écran ; la sonnerie, elle, joue quand Orbs est ouvert.
              </span>
            </p>
          </div>
        )}
        {perm === "unsupported" && s.enabled && (
          <div className="st-row">
            <p className="st-note st-note--info">
              <BellRing size={17} aria-hidden />
              <span>Ce navigateur n’affiche pas de notifications. La sonnerie jouera quand Orbs est ouvert.</span>
            </p>
          </div>
        )}
      </SettingsGroup>

      <SettingsGroup title="Son">
        <SettingRow id="sonnerie" title="Sonnerie" desc="Touche une sonnerie pour l’écouter." stack disabled={off}>
          <div className="st-tiles" role="radiogroup" aria-label="Sonnerie" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(132px, 1fr))" }}>
            {RINGTONES.map((r) => (
              <OptionTile
                key={r.id}
                selected={s.sound === r.id}
                onSelect={() => {
                  patch({ sound: r.id });
                  preview(r.id);
                }}
                label={r.name}
                disabled={off}
                className="!flex-row !items-center !gap-2.5 !py-2.5"
              >
                <span className="text-xl leading-none" aria-hidden>
                  {r.emoji}
                </span>
                <span className="st-tile-label">{r.name}</span>
              </OptionTile>
            ))}
          </div>
        </SettingRow>

        <SettingRow id="volume" title="Volume" stack disabled={off}>
          <div className="flex items-center gap-3">
            <Volume1 size={18} className="shrink-0" style={{ color: "var(--st-desc)" }} aria-hidden />
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(s.volume * 100)}
              onChange={(e) => patch({ volume: Number(e.target.value) / 100 })}
              onMouseUp={() => preview(s.sound)}
              onTouchEnd={() => preview(s.sound)}
              onKeyUp={() => preview(s.sound)}
              className="st-range"
              style={{ "--p": `${Math.round(s.volume * 100)}%` } as React.CSSProperties}
              aria-label="Volume de la sonnerie"
              disabled={off}
            />
            <Volume2 size={18} className="shrink-0" style={{ color: "var(--st-desc)" }} aria-hidden />
            <span className="st-value">{Math.round(s.volume * 100)} %</span>
          </div>
        </SettingRow>

        <SettingRow
          id="tester-rappel"
          title="Tester le rappel"
          desc="Joue la sonnerie et affiche une notification d’essai."
          disabled={off}
        >
          <button type="button" className="btn-ghost" onClick={test} disabled={off}>
            <Play size={14} aria-hidden /> Tester
          </button>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        title="Journal"
        footer="Une fois par jour, à partir de l’heure choisie, seulement si aucune page n’a encore été écrite aujourd’hui. Il sonne si Orbs est ouvert sur cet appareil."
      >
        <SettingRow
          id="rappel-journal"
          icon={<NotebookPen size={17} />}
          title="Rappel d’écriture du journal"
          desc="Pour penser à écrire quelques lignes dans ta journée."
          disabled={off}
        >
          <Switch
            checked={s.journal}
            onChange={(v) => changeJournal({ journal: v })}
            label="Rappel d’écriture du journal"
            disabled={off}
          />
        </SettingRow>
        {s.journal && (
          <SettingRow title="Chaque jour à" desc={journalHint} disabled={off}>
            <input
              type="time"
              className="st-time"
              value={s.journalTime}
              onChange={(e) => e.target.value && changeJournal({ journalTime: e.target.value })}
              aria-label="Heure du rappel du journal"
              disabled={off}
            />
          </SettingRow>
        )}
      </SettingsGroup>

      <SettingJump
        category="agenda"
        icon={<CalendarDays size={16} />}
        title="Quand être prévenu·e"
        desc="Rappels avant les cours et résumé des devoirs, dans Agenda."
      />
      <SettingJump
        category="apprentissage"
        icon={<GraduationCap size={16} />}
        title="Mode Concentration"
        desc="Pendant tes sessions de travail, les rappels non essentiels attendent la fin."
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Agenda : quels rappels, et quand
// ---------------------------------------------------------------------------

/** Ouvre la catégorie Notifications des Réglages (sans recharger la page). */
function openNotifications() {
  window.history.pushState(null, "", "/settings?c=notifications");
  window.scrollTo({ top: 0 });
}

function minutesOf(hm: string): number {
  const [h, m] = hm.split(":");
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

function isPastToday(hm: string): boolean {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes() >= minutesOf(hm);
}

/** « Prochain récapitulatif : aujourd’hui à 20:00… » (ou demain). */
function tomorrowHint(s: NotifSettings): string {
  const today = !isPastToday(s.tomorrowTime) && !reminderFiredToday(TOMORROW_KEY);
  return `Prochain : ${today ? "aujourd’hui" : "demain"} à ${s.tomorrowTime}, s’il y a un cours ou un devoir à rendre le lendemain.`;
}

export function AgendaReminderSettings() {
  const { s, patch } = useNotifSettings();
  const [hint, setHint] = useState("");

  // L'indication « prochain récapitulatif » dépend de l'heure actuelle : elle
  // est recalculée à chaque changement du réglage, hors du rendu.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (s?.tomorrow) setHint(tomorrowHint(s));
  }, [s]);

  if (!s) return <div className="h-40" aria-hidden />;
  const off = !s.enabled;

  /**
   * Activer le rappel (ou changer son heure) après l'heure du jour : il ne
   * part pas tout de suite, il commence le lendemain — pas de notification
   * surprise juste après avoir touché au réglage. L'aperçu reste disponible.
   */
  function changeTomorrow(next: Partial<Pick<NotifSettings, "tomorrow" | "tomorrowTime">>) {
    if (!s) return;
    const merged = { ...s, ...next };
    if (merged.tomorrow && isPastToday(merged.tomorrowTime)) markReminderFired(TOMORROW_KEY);
    patch(next);
  }

  return (
    <>
      {off && (
        <div className="st-note st-note--info">
          <CalendarOff size={17} className="shrink-0 mt-0.5" aria-hidden />
          <span>
            Les rappels sont désactivés : ces réglages s’appliqueront dès que tu les activeras.{" "}
            <button type="button" className="st-link-btn" onClick={openNotifications}>
              Activer les rappels
            </button>
          </span>
        </div>
      )}

      <SettingsGroup title="Cours">
        <SettingRow
          id="avant-cours"
          icon={<CalendarClock size={17} />}
          title="Rappel avant un cours"
          desc="Pour ne pas arriver en retard, d’après ton emploi du temps."
        >
          <Switch checked={s.courses} onChange={(v) => patch({ courses: v })} label="Prévenir avant les cours" />
        </SettingRow>
        {s.courses && (
          <SettingRow title="Me prévenir">
            <select
              className="st-select"
              value={s.leadMin}
              onChange={(e) => patch({ leadMin: Number(e.target.value) })}
              aria-label="Délai avant le cours"
            >
              {LEAD_CHOICES.map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? "À l’heure du cours" : m === 60 ? "1 h avant" : `${m} min avant`}
                </option>
              ))}
            </select>
          </SettingRow>
        )}
      </SettingsGroup>

      <SettingsGroup title="Devoirs">
        <SettingRow
          id="devoirs-du-jour"
          icon={<CalendarCheck size={17} />}
          title="Résumé des devoirs du jour"
          desc="Une fois par jour : devoirs en retard, pour aujourd’hui ou demain."
        >
          <Switch checked={s.homework} onChange={(v) => patch({ homework: v })} label="Résumé des devoirs" />
        </SettingRow>
        {s.homework && (
          <>
            <SettingRow title="Chaque jour à">
              <input
                type="time"
                className="st-time"
                value={s.homeworkTime}
                onChange={(e) => e.target.value && patch({ homeworkTime: e.target.value })}
                aria-label="Heure du résumé des devoirs"
              />
            </SettingRow>
            <SettingRow
              id="devoirs-week-end"
              title="Aussi le week-end"
              desc="Désactive-le pour profiter de ton samedi et de ton dimanche."
            >
              <Switch
                checked={s.homeworkWeekend}
                onChange={(v) => patch({ homeworkWeekend: v })}
                label="Résumé des devoirs le week-end"
              />
            </SettingRow>
          </>
        )}
      </SettingsGroup>

      <SettingsGroup
        title="Le soir"
        footer="Seulement s’il y a un cours ou un devoir à rendre le lendemain. Le rappel sonne si Orbs est ouvert sur cet appareil, même dans un onglet en arrière-plan sur ordinateur ; sinon, le récapitulatif t’attend à ta prochaine ouverture d’Orbs, jusqu’à minuit."
      >
        <SettingRow
          id="preparer-demain"
          icon={<MoonStar size={17} />}
          title="Préparer ma journée de demain"
          desc="Chaque soir, un récapitulatif de tes cours, de tes devoirs et de tes affaires pour le lendemain."
        >
          <Switch
            checked={s.tomorrow}
            onChange={(v) => changeTomorrow({ tomorrow: v })}
            label="Préparer ma journée de demain"
          />
        </SettingRow>
        {s.tomorrow && (
          <>
            <SettingRow title="Chaque soir à" desc={hint}>
              <input
                type="time"
                className="st-time"
                value={s.tomorrowTime}
                onChange={(e) => e.target.value && changeTomorrow({ tomorrowTime: e.target.value })}
                aria-label="Heure du récapitulatif du soir"
              />
            </SettingRow>
            <SettingRow
              title="Voir le récapitulatif"
              desc="Avec ce qui est prévu demain dans ton agenda, en ce moment."
            >
              <button type="button" className="btn-ghost" onClick={openTomorrowRecap}>
                <Eye size={15} aria-hidden /> Aperçu
              </button>
            </SettingRow>
          </>
        )}
      </SettingsGroup>

      <SettingJump
        category="notifications"
        icon={<Music2 size={16} />}
        title="Sonnerie et volume"
        desc="Le son de tes rappels, dans Notifications."
      />
    </>
  );
}
