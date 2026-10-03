import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getEntry } from "@/lib/entries";
import { Editor, type EditorEntry } from "@/components/Editor";
import { promptForDate } from "@/lib/definitions";

export default async function WriteEditPage({
  params,
}: PageProps<"/write/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const entry = await getEntry(user.id, id);
  if (!entry) notFound();

  const initial: EditorEntry = {
    id: entry.id,
    title: entry.title ?? "",
    content: entry.content,
    mood: entry.mood,
    location: entry.location ?? "",
    tags: entry.tags.map((t) => t.name),
    entryDate: entry.entryDate.toISOString(),
  };

  return (
    <Editor
      initial={initial}
      suggestedPrompt={entry.promptText ?? promptForDate(entry.entryDate)}
    />
  );
}
