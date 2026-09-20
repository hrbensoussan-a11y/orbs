"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";
import type { ThemeName } from "@/lib/constants";

const LINKS = [
  { href: "/timeline", label: "Journal" },
  { href: "/search", label: "Recherche" },
  { href: "/settings", label: "Réglages" },
];

export function AppHeader({ theme }: { theme: ThemeName }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="mx-auto max-w-3xl px-4 h-14 flex items-center gap-2">
        <Link href="/timeline" className="font-serif text-xl mr-1 shrink-0">
          Orbs
        </Link>

        <nav className="flex items-center gap-0.5 text-sm overflow-x-auto no-scrollbar">
          {LINKS.map((l) => {
            const active =
              pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`px-2.5 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
                  active
                    ? "text-ink bg-surface-2"
                    : "text-muted hover:text-ink"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <Link
            href="/write"
            className="btn-primary !py-1.5 !px-3 text-sm whitespace-nowrap"
          >
            <span aria-hidden>+</span> Écrire
          </Link>
          <ThemeToggle initial={theme} />
        </div>
      </div>
    </header>
  );
}
