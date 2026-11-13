"use client";

import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "./ConfirmDialog";

export function DeleteEntryButton({
  action,
  id,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <form ref={formRef} action={action}>
      <input type="hidden" name="id" value={id} />
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-ghost !px-2.5"
        style={{ color: "var(--coral)" }}
        title="Supprimer"
        aria-label="Supprimer"
      >
        <Trash2 size={16} aria-hidden />
      </button>

      <ConfirmDialog
        open={open}
        tone="danger"
        icon={<Trash2 size={20} />}
        title="Supprimer cette page ?"
        message="Cette page de journal sera définitivement supprimée. Cette action est irréversible."
        confirmLabel="Oui, supprimer"
        cancelLabel="Non, garder"
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          formRef.current?.requestSubmit();
        }}
      />
    </form>
  );
}
