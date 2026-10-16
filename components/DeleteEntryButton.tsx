"use client";

import { useRef } from "react";
import { Trash2 } from "lucide-react";

export function DeleteEntryButton({
  action,
  id,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action}>
      <input type="hidden" name="id" value={id} />
      <button
        type="button"
        onClick={() => {
          if (
            confirm(
              "Supprimer cette entrée ? Cette action est définitive.",
            )
          ) {
            formRef.current?.requestSubmit();
          }
        }}
        className="btn-ghost !px-2.5"
        style={{ color: "var(--coral)" }}
        title="Supprimer"
        aria-label="Supprimer"
      >
        <Trash2 size={16} aria-hidden />
      </button>
    </form>
  );
}
