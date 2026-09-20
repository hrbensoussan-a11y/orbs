import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { searchEntries, getUserTags } from "@/lib/entries";
import { EntryCard } from "@/components/EntryCard";
import { MOODS } from "@/lib/definitions";

export const dynamic = "force-dynamic";

function str(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

export default async function SearchPage({
  searchParams,
}: PageProps<"/search">) {
  const user = await requireUser();
  const sp = await searchParams;

  const query = str(sp.query);
  const moodParam = str(sp.mood);
  const tag = str(sp.tag);
  const from = str(sp.from);
  const to = str(sp.to);

  const hasFilters = Boolean(query || moodParam || tag || from || to);

  const [results, tags] = await Promise.all([
    hasFilters
      ? searchEntries(user.id, {
          query: query || undefined,
          mood: moodParam ? Number(moodParam) : undefined,
          tag: tag || undefined,
          from: from ? new Date(from) : undefined,
          to: to ? new Date(`${to}T23:59:59`) : undefined,
        })
      : Promise.resolve([]),
    getUserTags(user.id),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="font-serif text-2xl mb-4">Rechercher</h1>

      <form method="GET" className="card p-4 flex flex-col gap-3 mb-6">
        <input
          type="search"
          name="query"
          defaultValue={query}
          placeholder="Rechercher dans tout le journal…"
          className="input"
          autoFocus
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Humeur</span>
            <select name="mood" defaultValue={moodParam} className="input">
              <option value="">Toutes</option>
              {MOODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.emoji} {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Tag</span>
            <select name="tag" defaultValue={tag} className="input">
              <option value="">Tous</option>
              {tags.map((t) => (
                <option key={t.id} value={t.name}>
                  #{t.name} ({t._count.entries})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Depuis</span>
            <input type="date" name="from" defaultValue={from} className="input" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Jusqu’au</span>
            <input type="date" name="to" defaultValue={to} className="input" />
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary">
            Rechercher
          </button>
          {hasFilters && (
            <Link href="/search" className="text-sm text-muted hover:text-ink">
              Réinitialiser
            </Link>
          )}
        </div>
      </form>

      {hasFilters ? (
        results.length > 0 ? (
          <>
            <p className="text-sm text-muted mb-3">
              {results.length} entrée{results.length > 1 ? "s" : ""}
            </p>
            <div className="flex flex-col gap-3">
              {results.map((e) => (
                <EntryCard key={e.id} entry={e} />
              ))}
            </div>
          </>
        ) : (
          <p className="text-muted text-center py-10">
            Aucune entrée ne correspond à cette recherche.
          </p>
        )
      ) : (
        <p className="text-muted text-center py-10">
          Cherche un mot, filtre par humeur, tag ou période.
        </p>
      )}
    </div>
  );
}
