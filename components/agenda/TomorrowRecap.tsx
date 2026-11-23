"use client";

// « Préparer ma journée de demain » — ce que l'élève voit dans Orbs.
//
//   - Un bandeau discret (en haut, comme une notification iOS) quand le rappel
//     du soir se déclenche (TOMORROW_EVENT, émis par runReminderTick) : il
//     PROPOSE le récapitulatif sans interrompre ce que l'élève fait.
//   - Le récapitulatif complet, dans une feuille : cours, devoirs à rendre,
//     devoirs à terminer et affaires à préparer — lus dans l'agenda réel au
//     moment de l'ouverture.
//
// La feuille s'ouvre depuis le bandeau, en touchant la notification système
// (message du service worker, ou NOTIF_OPEN_EVENT), depuis une notification
// touchée alors qu'Orbs était fermé (`?rappel=demain`), ou depuis l'aperçu des
// Réglages. Monté une fois pour toute l'app (NotificationScheduler).

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Backpack, CalendarClock, ClipboardCheck, Clock, MoonStar, NotebookPen, X } from "lucide-react";
import { dateKey, loadAgenda } from "@/lib/agenda/store";
import { buildTomorrowPlan, hasSomethingTomorrow, type TomorrowPlan } from "@/lib/agenda/tomorrow";
import { NOTIF_OPEN_EVENT, TOMORROW_EVENT } from "@/lib/agenda/notifications";
import { loadSubjectColors, subjectColor } from "@/lib/subjectColors";

type Sheet = { plan: TomorrowPlan; colors: Record<string, string> };

function readSheet(): Sheet {
  return { plan: buildTomorrowPlan(loadAgenda(), new Date()), colors: loadSubjectColors() };
}

/** Ouvre le récapitulatif de demain depuis n'importe où dans Orbs. */
export function openTomorrowRecap(): void {
  window.dispatchEvent(new CustomEvent(NOTIF_OPEN_EVENT, { detail: { open: "tomorrow" } }));
}

export function TomorrowRecap() {
  const [banner, setBanner] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const doneRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onFired = (e: Event) => {
      const summary = (e as CustomEvent<{ summary?: string }>).detail?.summary;
      setBanner(summary || "Ton récapitulatif est prêt.");
    };
    const onOpen = (e: Event) => {
      if ((e as CustomEvent<{ open?: string }>).detail?.open !== "tomorrow") return;
      setBanner(null);
      setSheet(readSheet());
    };
    const onWorker = (e: MessageEvent) => {
      const d = e.data as { type?: string; open?: string } | null;
      if (d?.type === "orbs:notification-open" && d.open === "tomorrow") {
        setBanner(null);
        setSheet(readSheet());
      }
    };
    window.addEventListener(TOMORROW_EVENT, onFired);
    window.addEventListener(NOTIF_OPEN_EVENT, onOpen);
    const sw = typeof navigator !== "undefined" && "serviceWorker" in navigator ? navigator.serviceWorker : null;
    sw?.addEventListener("message", onWorker);

    // Notification touchée alors qu'Orbs était fermé : `?rappel=demain`.
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("rappel") === "demain") {
        url.searchParams.delete("rappel");
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSheet(readSheet());
      }
    } catch {
      /* adresse illisible : rien à ouvrir */
    }

    return () => {
      window.removeEventListener(TOMORROW_EVENT, onFired);
      window.removeEventListener(NOTIF_OPEN_EVENT, onOpen);
      sw?.removeEventListener("message", onWorker);
    };
  }, []);

  // Feuille ouverte : Échap pour fermer, défilement de la page bloqué.
  useEffect(() => {
    if (!sheet) return;
    // Focus sur « C'est noté » SANS faire défiler : le récapitulatif s'ouvre
    // sur son titre, même quand il est plus long que l'écran.
    doneRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheet(null);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [sheet]);

  if (typeof document === "undefined") return null;

  return (
    <>
      {banner !== null &&
        !sheet &&
        createPortal(
          <div className="recap-banner glass-strong" role="status">
            <span className="icon-chip lilac !h-10 !w-10" aria-hidden>
              <MoonStar size={19} />
            </span>
            {/* Toute la zone de texte se touche (comme une notification iOS) ;
                pour le clavier et les lecteurs d'écran, l'action est « Voir ». */}
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              className="min-w-0 flex-1 text-left"
              onClick={() => {
                setBanner(null);
                setSheet(readSheet());
              }}
            >
              <span className="block font-semibold text-[0.92rem] leading-tight">Prépare ta journée de demain</span>
              <span className="block text-[0.8rem] text-ink-2 truncate mt-0.5">{banner}</span>
            </button>
            <button
              type="button"
              className="btn-primary !px-3.5 !py-1.5 text-sm"
              onClick={() => {
                setBanner(null);
                setSheet(readSheet());
              }}
            >
              Voir
            </button>
            <button
              type="button"
              className="recap-close"
              onClick={() => setBanner(null)}
              aria-label="Fermer le rappel"
            >
              <X size={16} aria-hidden />
            </button>
          </div>,
          document.body,
        )}

      {sheet &&
        createPortal(
          <div
            className="recap-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget) setSheet(null);
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="recap-title"
          >
            <div className="recap-sheet glass-strong">
              <RecapContent sheet={sheet} onClose={() => setSheet(null)} doneRef={doneRef} />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function RecapContent({
  sheet,
  onClose,
  doneRef,
}: {
  sheet: Sheet;
  onClose: () => void;
  doneRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const { plan, colors } = sheet;
  const empty = !hasSomethingTomorrow(plan) && plan.unfinished.length === 0;
  const todayKey = dateKey();
  const lateLabel = (due: string) => (due < todayKey ? "en retard" : "pour aujourd’hui");

  return (
    <>
      <header className="flex items-start gap-3">
        <span className="icon-chip lilac" aria-hidden>
          <MoonStar size={21} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="recap-title" className="font-semibold text-lg leading-tight">
            Voici ce qui t’attend demain
          </h2>
          <p className="text-sm text-ink-2 mt-0.5">{plan.label}</p>
        </div>
        <button type="button" className="recap-close -mr-1 -mt-1" onClick={onClose} aria-label="Fermer">
          <X size={18} aria-hidden />
        </button>
      </header>

      {empty ? (
        <div className="recap-empty">
          <p className="font-medium">Rien de prévu demain dans ton agenda.</p>
          <p className="text-sm text-ink-2 mt-1">
            Ajoute tes cours et tes devoirs : ce récapitulatif se remplira tout seul.
          </p>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {plan.courses.length > 0 && (
            <section>
              <h3 className="recap-title">
                <CalendarClock size={15} aria-hidden /> Cours
              </h3>
              <ul className="recap-list">
                {plan.courses.map((c) => (
                  <li key={c.id} className="recap-item">
                    <span className="recap-time">
                      {c.start}
                      <span className="text-ink-3"> – {c.end}</span>
                    </span>
                    <span className="recap-dot" style={{ background: subjectColor(c.subject, colors) }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{c.subject}</span>
                      {(c.room || c.teacher) && (
                        <span className="block text-xs text-ink-3 truncate">
                          {[c.room && `Salle ${c.room}`, c.teacher].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {plan.dueTomorrow.length > 0 && (
            <section>
              <h3 className="recap-title">
                <ClipboardCheck size={15} aria-hidden /> À rendre demain
              </h3>
              <ul className="recap-list">
                {plan.dueTomorrow.map((h) => (
                  <li key={h.id} className="recap-item">
                    <span className="recap-dot" style={{ background: subjectColor(h.subject, colors) }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{h.title}</span>
                      <span className="text-ink-3"> · {h.subject}</span>
                      {h.note && <span className="block text-xs text-ink-2 mt-0.5">{h.note}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {plan.unfinished.length > 0 && (
            <section>
              <h3 className="recap-title">
                <NotebookPen size={15} aria-hidden /> À terminer
              </h3>
              <ul className="recap-list">
                {plan.unfinished.map((h) => (
                  <li key={h.id} className="recap-item">
                    <span className="recap-dot" style={{ background: subjectColor(h.subject, colors) }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{h.title}</span>
                      <span className="text-ink-3"> · {h.subject}</span>
                    </span>
                    <span className="recap-tag">{lateLabel(h.due)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {plan.courses.length > 0 && (
            <section>
              <h3 className="recap-title">
                <Backpack size={15} aria-hidden /> À préparer
              </h3>
              <ul className="recap-list">
                <li className="recap-item">
                  <Backpack size={16} className="text-ink-3 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1">
                    Tes affaires pour : <span className="font-medium">{plan.bring.join(", ")}</span>
                  </span>
                </li>
                <li className="recap-item">
                  <Clock size={16} className="text-ink-3 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1">
                    Premier cours à <span className="font-medium">{plan.courses[0].start}</span>
                  </span>
                </li>
              </ul>
            </section>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2.5 mt-5">
        <Link href="/agenda" className="btn-ghost" onClick={onClose}>
          Ouvrir l’agenda
        </Link>
        <button ref={doneRef} type="button" className="btn-primary" onClick={onClose}>
          C’est noté
        </button>
      </div>
    </>
  );
}
