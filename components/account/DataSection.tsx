import Link from "next/link";
import { ChevronRight, Database, Trash2 } from "lucide-react";
import { ExportDataButton } from "./ExportDataButton";

export function DataSection() {
  return (
    <section id="donnees" className="card p-5 flex flex-col gap-4 scroll-mt-20">
      <header className="flex items-center gap-3">
        <span className="icon-chip coral">
          <Database size={20} aria-hidden />
        </span>
        <div>
          <h2 className="font-semibold leading-tight">Mes données</h2>
          <p className="text-sm text-ink-3 leading-snug">
            Tes données t’appartiennent : tu peux les emporter ou tout effacer.
          </p>
        </div>
      </header>

      {/* Export complet */}
      <div className="border-t border-line pt-4">
        <p className="text-sm text-ink-2 mb-3">
          Une archive JSON avec ton profil, ton journal, ta progression, ton espace
          famille et ton abonnement, plus ce que cet appareil garde en mémoire (agenda,
          notes, paquets Apprendre, conversations IA, brouillon, préférences). Elle ne
          contient jamais ton mot de passe ni aucun code de connexion. Les données
          gardées par tes autres appareils n’y figurent que si tu exportes aussi depuis
          eux.
        </p>
        <ExportDataButton />
      </div>

      {/* Suppression du compte */}
      <div className="border-t border-line pt-4">
        <p className="text-sm text-ink-2 mb-3">
          Tu peux supprimer définitivement ton compte et tout ce qu’il contient.
          Cette action est irréversible.
        </p>
        <Link href="/compte/supprimer" className="btn-ghost w-full justify-between" style={{ color: "var(--coral)" }}>
          <span className="inline-flex items-center gap-2">
            <Trash2 size={16} aria-hidden /> Supprimer mon compte
          </span>
          <ChevronRight size={16} aria-hidden />
        </Link>
      </div>
    </section>
  );
}
