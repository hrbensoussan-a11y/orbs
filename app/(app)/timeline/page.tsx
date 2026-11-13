import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getTimelineEntries, type EntryWithTags } from "@/lib/entries";
import { EntryCard } from "@/components/EntryCard";
import { promptForDate } from "@/lib/definitions";

export const dynamic = "force-dynamic";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "Bonne nuit";
  if (h < 18) return "Bonjour";
  return "Bonsoir";
}

function monthLabel(date: Date): string {
  const s = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(date);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function groupByMonth(entries: EntryWithTags[]) {
  const groups: { key: string; label: string; items: EntryWithTags[] }[] = [];
  for (const entry of entries) {
    const d = new Date(entry.entryDate);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = { key, label: monthLabel(d), items: [] };
      groups.push(group);
    }
    group.items.push(entry);
  }
  return groups;
}

export default async function TimelinePage() {
  const user = await requireUser();
  const entries = await getTimelineEntries(user.id);

  const name = user.name?.trim();
  const pinned = entries.filter((e) => e.pinned);
  const rest = entries.filter((e) => !e.pinned);
  const months = groupByMonth(rest);

  return (
    <div className="mx-auto max-w-xl px-4 pt-[calc(env(safe-area-inset-top,0px)+18px)] pb-6">
      <h1 className="text-2xl font-semibold mb-4">Journal</h1>
      {/* Invitation à écrire aujourd'hui */}
      <section className="card p-5 mb-8">
        <p className="text-muted text-sm">
          {greeting()}
          {name ? `, ${name}` : ""}.
        </p>
        <p className="font-serif text-xl mt-1">Envie d’écrire aujourd’hui ?</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link href="/write" className="btn-primary">
            Écrire aujourd’hui
          </Link>
          <span className="text-sm text-muted italic">
            {promptForDate()}
          </span>
        </div>
      </section>

      {entries.length === 0 ? (
        <div className="text-center py-16">
          <p className="font-serif text-2xl">Ton carnet est vierge.</p>
          <p className="text-muted mt-2">
            La première page est la plus difficile — et la plus légère.
          </p>
          <Link href="/write" className="btn-primary mt-6 inline-flex">
            Écrire ma première page
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-8 stagger">
          {pinned.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-ink-2 mb-3">
                Épinglées
              </h2>
              <div className="flex flex-col gap-3">
                {pinned.map((e) => (
                  <EntryCard key={e.id} entry={e} />
                ))}
              </div>
            </section>
          )}

          {months.map((group) => (
            <section key={group.key}>
              <h2 className="text-sm font-semibold text-ink-2 mb-3">
                {group.label}
              </h2>
              <div className="flex flex-col gap-3">
                {group.items.map((e) => (
                  <EntryCard key={e.id} entry={e} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
