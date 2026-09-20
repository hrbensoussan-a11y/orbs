import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Orbs",
  description: "Ton assistant scolaire — journal, agenda, cours et plus.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
