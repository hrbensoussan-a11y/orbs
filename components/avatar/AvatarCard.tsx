"use client";

import { useState } from "react";
import { Pencil, Sparkles } from "lucide-react";
import { Avatar } from "./Avatar";
import { AvatarBuilder } from "./AvatarBuilder";
import type { AvatarConfig } from "@/lib/avatar/config";

export function AvatarCard({ initial }: { initial: AvatarConfig }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={() => setOpen(true)}
          className="relative rounded-full"
          aria-label="Modifier mon avatar"
        >
          <span
            className="glass-strong rounded-full p-1.5 inline-block"
            style={{ boxShadow: "var(--shadow-float)" }}
          >
            <Avatar config={initial} size={104} />
          </span>
          <span
            className="absolute bottom-0 right-0 grid place-items-center h-8 w-8 rounded-full text-white"
            style={{ background: "var(--green)", boxShadow: "var(--shadow-soft)" }}
            aria-hidden
          >
            <Pencil size={15} strokeWidth={2} />
          </span>
        </button>
        <button className="btn-ghost" onClick={() => setOpen(true)}>
          <Sparkles size={16} aria-hidden /> Personnaliser mon avatar
        </button>
      </div>

      {open && <AvatarBuilder initial={initial} onClose={() => setOpen(false)} />}
    </>
  );
}
