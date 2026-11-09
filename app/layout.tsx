import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { RegisterSW } from "@/components/RegisterSW";

export const metadata: Metadata = {
  title: "Orbs",
  description: "Ton assistant scolaire — journal, agenda, cours et plus.",
  manifest: "/manifest.webmanifest",
  applicationName: "Orbs",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Orbs" },
  other: { "mobile-web-app-capable": "yes", "apple-mobile-web-app-capable": "yes" },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#38c172",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Applique le thème / fond / luminosité mémorisés avant le premier rendu
// (évite le flash de couleurs au chargement).
const APPEARANCE_INIT = `try{var a=JSON.parse(localStorage.getItem('orbs.appearance')||'{}');var r=document.documentElement;if(a.theme)r.setAttribute('data-theme',a.theme);if(a.bg)r.setAttribute('data-bg',a.bg);r.style.setProperty('--dim',String(typeof a.dim==='number'?a.dim:0));if(localStorage.getItem('orbs.motion')==='reduced')r.setAttribute('data-motion','reduced');}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // `suppressHydrationWarning` : le script d'apparence ci-dessous pose
    // data-theme / data-bg / --dim sur <html> AVANT l'hydratation (anti-flash),
    // ce que le HTML serveur ne contient pas. On indique à React que cette
    // différence sur <html> est voulue (elle ne concerne que cet élément).
    <html lang="fr" suppressHydrationWarning>
      <body>
        <Script id="orbs-appearance" strategy="beforeInteractive">
          {APPEARANCE_INIT}
        </Script>
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
