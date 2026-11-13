"use client";

// Fenêtre de confirmation « comme sur les logiciels pro » : un message au
// milieu de l'écran, et deux choix clairs — Oui / Non.
// Composant présentiel contrôlé (on lui passe `open`, `onConfirm`, `onCancel`) ;
// il sert à la fois pour les actions serveur (via <ConfirmSubmit>) et pour les
// actions côté client (bulle IA, réinitialisation de l'apparence…).

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";

export type ConfirmTone = "default" | "danger";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Oui",
  cancelLabel = "Non",
  tone = "default",
  icon,
  onConfirm,
  onCancel,
  onDismiss,
}: {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  icon?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  /**
   * Fermeture SANS réponse (touche Échap, clic hors de la fenêtre). Par
   * défaut c'est un « Non » ; à fournir quand « Non » est une vraie décision
   * qu'on ne veut pas enregistrer sur un geste accidentel.
   */
  onDismiss?: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dismiss = onDismiss ?? onCancel;

  useEffect(() => {
    if (!open) return;
    // On met le focus sur « Non » : le choix sûr par défaut.
    cancelRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, dismiss]);

  if (!open || typeof document === "undefined") return null;

  // Rendu via un portail sur <body> : indispensable pour que le voile couvre
  // tout l'écran. Les cartes (.card) ont un backdrop-filter, ce qui « piège »
  // les enfants position:fixed (elles deviennent leur bloc conteneur) ; sans
  // portail, la fenêtre serait coincée dans la carte au lieu du viewport.
  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{ background: "rgba(31,41,68,.32)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div
        className="glass-strong w-full max-w-sm p-5"
        style={{ borderRadius: "24px" }}
      >
        <div className="flex items-start gap-3">
          <span
            className={`icon-chip ${tone === "danger" ? "coral" : "green"}`}
            aria-hidden
          >
            {icon ?? <AlertTriangle size={20} />}
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="confirm-dialog-title"
              className="font-semibold text-lg leading-tight"
            >
              {title}
            </h2>
            {message && <p className="text-sm text-ink-2 mt-1.5">{message}</p>}
          </div>
        </div>

        <div className="flex justify-end gap-2.5 mt-5">
          <button
            ref={cancelRef}
            type="button"
            className="btn-ghost"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={tone === "danger" ? "btn-danger" : "btn-primary"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
