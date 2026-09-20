import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getEntry } from "@/lib/entries";
import { Markdown } from "@/components/Markdown";
import { DeleteEntryButton } from "@/components/DeleteEntryButton";
import {
  deleteEntry,
  toggleFavorite,
  togglePinned,
} from "@/app/actions/entries";
import { moodEmoji, MOODS } from "@/lib/definitions";
import { formatLongDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function EntryPage({ params }: PageProps<"/entry/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const entry = await getEntry(user.id, id);
  if (!entry) notFound();

  const emoji = entry.moodEmoji ?? moodEmoji(entry.mood);
  const moodLabel = MOODS.find((m) => m.value === entry.mood)?.label;

  return (
    <article className="mx-auto max-w-2xl px-4 py-6">
      {/* Barre d'actions */}
      <div className="flex items-center justify-between gap-2 mb-6">
        <Link href="/timeline" className="text-sm text-muted hover:text-ink">
          ← Journal
        </Link>
        <div className="flex items-center gap-1.5">
          <form action={toggleFavorite}>
            <input type="hidden" name="id" value={entry.id} />
            <button
              className="btn-ghost !px-2.5"
              title={entry.favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
            >
              <span className={entry.favorite ? "text-accent" : ""}>
                {entry.favorite ? "★" : "☆"}
              </span>
            </button>
          </form>
          <form action={togglePinned}>
            <input type="hidden" name="id" value={entry.id} />
            <button
              className="btn-ghost !px-2.5"
              title={entry.pinned ? "Désépingler" : "Épingler"}
            >
              📌
            </button>
          </form>
          <Link href={`/write/${entry.id}`} className="btn-ghost">
            Modifier
          </Link>
          <DeleteEntryButton action={deleteEntry} id={entry.id} />
        </div>
      </div>

      {/* En-tête de l'entrée */}
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <span className="capitalize">{formatLongDate(entry.entryDate)}</span>
          {emoji && (
            <span className="flex items-center gap-1">
              <span aria-hidden>{emoji}</span>
              {moodLabel && <span>{moodLabel}</span>}
            </span>
          )}
          {entry.location && <span>· {entry.location}</span>}
        </div>
        {entry.title && (
          <h1 className="font-serif text-3xl mt-2 leading-tight">
            {entry.title}
          </h1>
        )}
      </header>

      {/* Corps */}
      {entry.content.trim() ? (
        <Markdown>{entry.content}</Markdown>
      ) : (
        <p className="text-muted italic">Cette entrée n’a pas encore de texte.</p>
      )}

      {/* Tags */}
      {entry.tags.length > 0 && (
        <footer className="mt-8 pt-4 border-t border-line flex flex-wrap gap-1.5">
          {entry.tags.map((t) => (
            <Link
              key={t.id}
              href={`/search?tag=${encodeURIComponent(t.name)}`}
              className="chip hover:text-ink"
            >
              #{t.name}
            </Link>
          ))}
        </footer>
      )}
    </article>
  );
}
