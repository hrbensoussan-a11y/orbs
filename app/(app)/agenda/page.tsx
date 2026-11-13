import { AgendaApp } from "@/components/agenda/AgendaApp";

export default async function AgendaPage({ searchParams }: PageProps<"/agenda">) {
  // « Voir l’agenda » depuis l’accueil ouvre directement l’emploi du temps.
  const { vue } = await searchParams;
  return <AgendaApp initialTab={vue === "edt" ? "edt" : "devoirs"} />;
}
