import { Editor, type EditorEntry } from "@/components/Editor";
import { promptForDate } from "@/lib/definitions";

export default function WriteNewPage() {
  const initial: EditorEntry = {
    id: null,
    title: "",
    content: "",
    mood: null,
    location: "",
    tags: [],
    entryDate: new Date().toISOString(),
  };
  return <Editor initial={initial} suggestedPrompt={promptForDate()} />;
}
