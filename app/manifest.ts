import type { MetadataRoute } from "next";

// Manifest PWA : rend Orbs installable (« Ajouter à l'écran d'accueil »)
// et lançable comme une app. Servi à /manifest.webmanifest.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Orbs — assistant scolaire",
    short_name: "Orbs",
    description:
      "Ton assistant scolaire : journal, révisions, agenda et plus. Tout reste sur ton appareil.",
    start_url: "/accueil",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#eaf0f4",
    theme_color: "#38c172",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
