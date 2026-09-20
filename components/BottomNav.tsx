"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, GraduationCap, Sparkles, NotebookPen, CalendarCheck } from "lucide-react";

const ITEMS = [
  { href: "/accueil", label: "Menu", Icon: Home, match: ["/accueil"] },
  { href: "/apprendre", label: "Apprendre", Icon: GraduationCap, match: ["/apprendre"] },
  { href: "/ia", label: "IA", Icon: Sparkles, match: ["/ia"] },
  { href: "/timeline", label: "Journal", Icon: NotebookPen, match: ["/timeline", "/write", "/entry", "/search"] },
  { href: "/agenda", label: "Agenda", Icon: CalendarCheck, match: ["/agenda"] },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav" aria-label="Navigation principale">
      {ITEMS.map(({ href, label, Icon, match }) => {
        const active = match.some(
          (m) => pathname === m || pathname.startsWith(m + "/"),
        );
        return (
          <Link
            key={href}
            href={href}
            className={`nav-item${active ? " active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={21} strokeWidth={active ? 2.1 : 1.8} aria-hidden />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
