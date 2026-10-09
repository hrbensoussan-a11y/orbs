import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NotesApp } from "@/components/notes/NotesApp";

export default function NotesPage() {
  return (
    <div>
      <div className="mx-auto max-w-xl px-4 pt-[calc(env(safe-area-inset-top,0px)+14px)]">
        <Link href="/accueil" className="btn-ghost !py-1.5">
          <ArrowLeft size={16} aria-hidden /> Accueil
        </Link>
      </div>
      <NotesApp />
    </div>
  );
}
