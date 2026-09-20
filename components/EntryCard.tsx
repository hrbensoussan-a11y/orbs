import Link from "next/link";
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
      className="card block p-4 transition-colors hover:border-accent/50"
    >
      <div className="flex items-center justify-between gap-3 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          {entry.pinned && <span title="Épinglée">📌</span>}
          {entry.favorite && (
            <span className="text-accent" title="Favori">
              ★
            </span>
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
        <h3 className="font-serif text-lg mt-1.5 leading-snug">{entry.title}</h3>
      )}

      {preview ? (
        <p className="text-muted mt-1 line-clamp-2 leading-relaxed">{preview}</p>
      ) : (
        !entry.title && (
          <p className="text-muted/70 italic mt-1">(entrée vide)</p>
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
