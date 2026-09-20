import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateSettings } from "@/app/actions/settings";
import { logout } from "@/app/actions/auth";
import { ThemeToggle } from "@/components/ThemeToggle";
import { THEME_COOKIE, type ThemeName } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const settings = await prisma.settings.findUnique({
    where: { userId: user.id },
  });
  const theme: ThemeName =
    (await cookies()).get(THEME_COOKIE)?.value === "dark" ? "dark" : "light";

  const font = settings?.font ?? "serif";
  const fontSize = settings?.fontSize ?? "base";

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 flex flex-col gap-6">
      <h1 className="font-serif text-2xl">Réglages</h1>

      {/* Apparence */}
      <section className="card p-5">
        <h2 className="font-medium mb-4">Apparence</h2>

        <div className="flex items-center justify-between py-2">
          <div>
            <p>Thème</p>
            <p className="text-sm text-muted">Clair ou sombre (idéal le soir).</p>
          </div>
          <ThemeToggle initial={theme} />
        </div>

        <form action={updateSettings} className="mt-4 flex flex-col gap-4">
          <label className="flex items-center justify-between gap-4">
            <span>Police de lecture</span>
            <select name="font" defaultValue={font} className="input max-w-40">
              <option value="serif">Serif (livre)</option>
              <option value="sans">Sans-serif</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-4">
            <span>Taille du texte</span>
            <select
              name="fontSize"
              defaultValue={fontSize}
              className="input max-w-40"
            >
              <option value="sm">Petite</option>
              <option value="base">Normale</option>
              <option value="lg">Grande</option>
            </select>
          </label>
          <button type="submit" className="btn-primary self-start">
            Enregistrer
          </button>
        </form>
      </section>

      {/* Données */}
      <section className="card p-5">
        <h2 className="font-medium mb-1">Tes données</h2>
        <p className="text-sm text-muted mb-4">
          Ton journal t’appartient. L’export est libre et complet — c’est aussi
          ta sauvegarde. Garde une copie en lieu sûr.
        </p>
        <div className="flex flex-wrap gap-3">
          <a href="/api/export?format=json" className="btn-ghost" download>
            Exporter en JSON
          </a>
          <a href="/api/export?format=md" className="btn-ghost" download>
            Exporter en Markdown
          </a>
        </div>
        <p className="text-xs text-muted mt-4">
          À venir : chiffrement de bout en bout, verrou par code, et
          récupération de compte. En attendant, l’export reste ta meilleure
          sauvegarde.
        </p>
      </section>

      {/* Compte */}
      <section className="card p-5">
        <h2 className="font-medium mb-1">Compte</h2>
        <p className="text-sm text-muted mb-4">
          Connecté en tant que <span className="text-ink">{user.email}</span>.
        </p>
        <form action={logout}>
          <button type="submit" className="btn-ghost">
            Se déconnecter
          </button>
        </form>
      </section>
    </div>
  );
}
