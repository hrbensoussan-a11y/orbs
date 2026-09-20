import Link from "next/link";
import { ArrowLeft, Download, LogOut } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateSettings } from "@/app/actions/settings";
import { logout } from "@/app/actions/auth";
import { AppearanceButton } from "@/components/AppearanceButton";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const settings = await prisma.settings.findUnique({
    where: { userId: user.id },
  });
  const fontSize = settings?.fontSize ?? "base";

  return (
    <div className="mx-auto max-w-xl px-4 pt-[calc(env(safe-area-inset-top,0px)+18px)] flex flex-col gap-4">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/accueil" className="btn-ghost !px-2.5" aria-label="Retour">
          <ArrowLeft size={18} aria-hidden />
        </Link>
        <h1 className="text-2xl font-semibold">Réglages</h1>
      </div>

      {/* Apparence */}
      <section className="card p-5">
        <h2 className="font-semibold mb-4">Apparence</h2>
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <p>Thème & fond</p>
            <p className="text-sm text-ink-2">Clair, anti-lumière bleue, sombre, luminosité, fonds.</p>
          </div>
          <AppearanceButton variant="row" />
        </div>
        <form action={updateSettings} className="flex items-center justify-between gap-4 border-t border-line pt-4">
          <span>Taille du texte</span>
          <select name="fontSize" defaultValue={fontSize} className="input max-w-44">
            <option value="sm">Petite</option>
            <option value="base">Normale</option>
            <option value="lg">Grande</option>
          </select>
          <button type="submit" className="btn-primary">
            Enregistrer
          </button>
        </form>
      </section>

      {/* Données */}
      <section className="card p-5">
        <h2 className="font-semibold mb-1">Tes données</h2>
        <p className="text-sm text-ink-2 mb-4">
          Ton journal t’appartient. L’export est libre et complet — c’est aussi
          ta sauvegarde. Garde une copie en lieu sûr.
        </p>
        <div className="flex flex-wrap gap-3">
          <a href="/api/export?format=json" className="btn-ghost" download>
            <Download size={16} aria-hidden /> Exporter en JSON
          </a>
          <a href="/api/export?format=md" className="btn-ghost" download>
            <Download size={16} aria-hidden /> Exporter en Markdown
          </a>
        </div>
      </section>

      {/* Compte */}
      <section className="card p-5">
        <h2 className="font-semibold mb-1">Compte</h2>
        <p className="text-sm text-ink-2 mb-4">
          Connecté·e en tant que <span className="text-ink">{user.email}</span>.
        </p>
        <form action={logout}>
          <button type="submit" className="btn-ghost">
            <LogOut size={16} aria-hidden /> Se déconnecter
          </button>
        </form>
      </section>
    </div>
  );
}
