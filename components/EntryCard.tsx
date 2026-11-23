import Link from "next/link";
import { Pin, Star } from "lucide-react";
import type { EntryWithTags } from "@/lib/entries";
import { excerpt } from "@/lib/entries";
import { moodEmoji } from "@/lib/definitions";
import { relativeDay } from "@/lib/format";

export function EntryCard({ entry }: { entry: EntryWithTags }) {
  const emoji = entry.moodEmoji ?? moodEmoji(entry.mood);
  const preview = excerpt(entry.content);

  return (
    <Link
      href={`/entry/${entry.id}`}
      className="card block p-4 transition-transform duration-200 hover:-translate-y-[3px] hover:shadow-[var(--shadow-float)]"
    >
      <div className="flex items-center justify-between gap-3 text-xs text-ink-3">
        <span className="flex items-center gap-1.5">
          {entry.pinned && <Pin size={13} className="text-ink-2" aria-hidden />}
          {entry.favorite && (
            <Star size={13} className="text-amber fill-[var(--amber)]" aria-hidden />
          )}
          <span className="capitalize">{relativeDay(entry.entryDate)}</span>
        </span>
        {emoji && (
          <span className="text-base" aria-hidden>
            {emoji}
          </span>
        )}
      </div>

      {entry.title && (
        <h3 className="text-lg font-semibold mt-1.5 leading-snug">
          {entry.title}
        </h3>
      )}

      {preview ? (
        <p className="text-ink-2 mt-1 line-clamp-2 leading-relaxed">{preview}</p>
      ) : (
        !entry.title && (
          <p className="text-ink-3 italic mt-1">(entrée vide)</p>
        )
      )}

      {entry.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {entry.tags.slice(0, 5).map((t) => (
            <span key={t.id} className="chip">
              #{t.name}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
