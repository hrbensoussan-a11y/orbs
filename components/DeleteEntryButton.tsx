"use client";

import { useRef } from "react";

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
        className="btn-ghost text-red-600 dark:text-red-400"
      >
        Supprimer
      </button>
    </form>
  );
}
