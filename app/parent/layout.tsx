import Link from "next/link";
import { LogOut } from "lucide-react";
import { requireParent } from "@/lib/auth";
import { logout } from "@/app/actions/auth";
import { displayName } from "@/lib/family";

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireParent();
  return (
    <div className="min-h-dvh">
      <header className="mx-auto max-w-2xl px-4 pt-[calc(env(safe-area-inset-top,0px)+16px)] flex items-center gap-2">
        <Link href="/parent" className="flex items-center gap-2.5 font-bold text-lg">
          <span className="h-6 w-6 rounded-full bg-[linear-gradient(135deg,var(--green),var(--sky))]" aria-hidden />
          Orbs <span className="chip">Espace parent</span>
        </Link>
        <span className="ml-auto text-sm text-ink-2 hidden sm:inline">{displayName(user)}</span>
        <form action={logout}>
          <button type="submit" className="btn-ghost !px-2.5" title="Se déconnecter" aria-label="Se déconnecter">
            <LogOut size={17} aria-hidden />
          </button>
        </form>
      </header>
      <main className="mx-auto max-w-2xl px-4 pt-5 pb-16">{children}</main>
    </div>
  );
}
