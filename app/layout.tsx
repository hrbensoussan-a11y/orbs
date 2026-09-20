import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Orbs",
  description: "Ton assistant scolaire — journal, agenda, cours et plus.",
};

// Applique le thème / fond / luminosité mémorisés avant le premier rendu
// (évite le flash de couleurs au chargement).
const APPEARANCE_INIT = `try{var a=JSON.parse(localStorage.getItem('orbs.appearance')||'{}');var r=document.documentElement;if(a.theme)r.setAttribute('data-theme',a.theme);if(a.bg)r.setAttribute('data-bg',a.bg);r.style.setProperty('--dim',String(typeof a.dim==='number'?a.dim:0));}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr">
      <body>
        <Script id="orbs-appearance" strategy="beforeInteractive">
          {APPEARANCE_INIT}
        </Script>
        {children}
      </body>
    </html>
  );
}
