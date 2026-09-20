import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Star, Pin, Pencil } from "lucide-react";
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
    <div className="mx-auto max-w-xl px-4 pt-[calc(env(safe-area-inset-top,0px)+14px)] pb-6">
      {/* Barre d'actions */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <Link href="/timeline" className="btn-ghost !py-1.5">
          <ArrowLeft size={16} aria-hidden /> Journal
        </Link>
        <div className="flex items-center gap-1.5">
          <form action={toggleFavorite}>
            <input type="hidden" name="id" value={entry.id} />
            <button
              className="btn-ghost !px-2.5"
              title={entry.favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
            >
              <Star
                size={17}
                className={entry.favorite ? "text-amber fill-[var(--amber)]" : ""}
                aria-hidden
              />
            </button>
          </form>
          <form action={togglePinned}>
            <input type="hidden" name="id" value={entry.id} />
            <button
              className="btn-ghost !px-2.5"
              title={entry.pinned ? "Désépingler" : "Épingler"}
            >
              <Pin
                size={17}
                className={entry.pinned ? "text-green-ink" : ""}
                aria-hidden
              />
            </button>
          </form>
          <Link href={`/write/${entry.id}`} className="btn-ghost !py-1.5">
            <Pencil size={15} aria-hidden /> Modifier
          </Link>
          <DeleteEntryButton action={deleteEntry} id={entry.id} />
        </div>
      </div>

      <article className="card p-6">
        <header className="mb-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
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
            <h1 className="text-3xl font-semibold mt-2 leading-tight">
              {entry.title}
            </h1>
          )}
        </header>

        {entry.content.trim() ? (
          <Markdown>{entry.content}</Markdown>
        ) : (
          <p className="text-ink-2 italic">
            Cette entrée n’a pas encore de texte.
          </p>
        )}

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
    </div>
  );
}
