import type { Metadata } from "next";
import { cookies } from "next/headers";
import { THEME_COOKIE } from "@/lib/constants";
import "./globals.css";

export const metadata: Metadata = {
  title: "Orbs — journal",
  description: "Un carnet calme pour écrire, chaque jour.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = (await cookies()).get(THEME_COOKIE)?.value;
  const isDark = theme === "dark";
  return (
    <html lang="fr" className={isDark ? "dark" : undefined}>
      <body>{children}</body>
    </html>
  );
}
