"use client";

// Bouton qui demande confirmation avant d'envoyer le formulaire dans lequel il
// se trouve. À utiliser à l'intérieur d'un <form action={serverAction}> : au
// clic, on affiche la fenêtre Oui / Non ; ce n'est qu'au « Oui » que le
// formulaire part réellement (requestSubmit). Idéal pour les actions qui
// changent beaucoup de choses (se déconnecter…).

import { useRef, useState, type ReactNode } from "react";
import { ConfirmDialog, type ConfirmTone } from "./ConfirmDialog";

export function ConfirmSubmit({
  children,
  className,
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = "default",
  icon,
  disabled,
}: {
  children: ReactNode;
  className?: string;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  icon?: ReactNode;
  disabled?: boolean;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={className}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {children}
      </button>

      <ConfirmDialog
        open={open}
        title={title}
        message={message}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        tone={tone}
        icon={icon}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          btnRef.current?.closest("form")?.requestSubmit();
        }}
      />
    </>
  );
}
