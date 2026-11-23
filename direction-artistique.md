# 🪟 Direction artistique — « Verre & Jardin »

Contrat visuel du projet. À respecter sur **chaque écran**. But : un verre dépoli
(glassmorphism) qui flotte au-dessus d'un fond vivant. Doux, aéré, printanier,
gen-z — **jamais** l'esthétique « générée par IA ».

## 1. Intention

Matinée de printemps : pétales, lumière tamisée, rien de pressé. L'interface
**flotte** au-dessus du fond (panneaux de verre givré). Trois sensations en
permanence : **calme, légèreté, lenteur maîtrisée**. Un écran dense/nerveux = raté.

## 2. Les 3 règles d'or

1. **Le fond est vivant** — photo nature floutée (ou dégradé pastel en mouvement
   très lent) porte toute la couleur. Les cartes restent claires et neutres.
2. **Les surfaces sont en verre** — blanc translucide + flou + bordure lumineuse
   + ombre très douce. C'est la signature.
3. **Tout respire** — beaucoup d'air, gros rayons, hiérarchie claire.

## 3. Fond d'écran

Photo nature floutée (ciel, feuillage, fleurs, eau) désaturée ~15 %, blur 8–20px,
voile blanc léger par-dessus. Fallback : dégradé mesh pastel (pêche → lilas →
menthe → ciel) qui dérive en 60–90 s. Toujours : **grain ~4 %** + vignettage
discret (le léger « défaut » qui casse l'effet trop IA).

```css
background:
  radial-gradient(60% 60% at 15% 20%, #FFE1CE 0%, transparent 60%),
  radial-gradient(55% 55% at 85% 15%, #E7D3FF 0%, transparent 60%),
  radial-gradient(60% 60% at 80% 85%, #CFF3DF 0%, transparent 60%),
  radial-gradient(60% 60% at 20% 90%, #D5E7FF 0%, transparent 60%),
  #EAF0F4;
```

## 4. Le verre (recette exacte)

```css
.glass {
  background: rgba(255, 255, 255, 0.60);
  backdrop-filter: blur(22px) saturate(180%);
  -webkit-backdrop-filter: blur(22px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.70);
  border-radius: 26px;
  box-shadow: 0 8px 30px rgba(31,41,68,.08), inset 0 1px 0 rgba(255,255,255,.55);
}
```

Lisibilité non négociable : texte toujours lisible (monter l'opacité à 0.72 sur
fond chargé) ; ne pas flouter au-delà de ~28px ; le verre est pour les surfaces,
le fond reste photo/dégradé.

## 5. Palette

Vert = couleur primaire (états actifs, actions). Les autres accents **codent
l'information** (une catégorie = une couleur), pas la déco.

| Rôle | Hex |
| --- | --- |
| Vert primaire | `#38C172` |
| Vert encre | `#1E9E57` |
| Ambre | `#F6A93B` |
| Corail | `#FF6F91` |
| Ciel | `#5B9DF0` |
| Lilas | `#B48CF2` |
| Encre | `#1F2233` |
| Gris moyen | `#565B73` |
| Gris clair | `#9AA0B4` |

```css
:root {
  --green:#38C172; --green-ink:#1E9E57;
  --amber:#F6A93B; --coral:#FF6F91; --sky:#5B9DF0; --lilac:#B48CF2;
  --ink:#1F2233; --ink-2:#565B73; --ink-3:#9AA0B4;
  --glass:rgba(255,255,255,.60); --glass-strong:rgba(255,255,255,.72);
  --glass-stroke:rgba(255,255,255,.70); --blur:22px;
  --r-card:26px; --r-inner:18px; --r-chip:16px; --r-pill:999px;
  --shadow-soft:0 8px 30px rgba(31,41,68,.08);
  --shadow-float:0 14px 40px rgba(31,41,68,.12);
  --highlight:inset 0 1px 0 rgba(255,255,255,.55);
  --s1:4px; --s2:8px; --s3:12px; --s4:16px; --s5:20px; --s6:24px; --s8:32px;
  --ease:cubic-bezier(.22,1,.36,1);
  --t-micro:180ms; --t-base:320ms; --t-enter:600ms;
}
```

## 6. Typographie

**Pas de police système** (premier tell « IA »). Corps + UI : **General Sans**
(Fontshare). Display (gros chiffres/titres héros) : **Clash Grotesk**.

```css
@import url('https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600,700&f[]=clash-grotesk@500,600&display=swap');
```

Chiffre héros : Clash Grotesk 600, très grand, `tabular-nums`, `-0.02em`. Titres :
General Sans 600–700. Corps : 400–500 gris moyen. Casse phrase, lignes < 80 car.

## 7. Formes, ombres, espacements

Rayons **variables** : carte 26 / interne 18 / chip 16 / pilule 999. Une seule
ombre douce au repos, `--shadow-float` au survol. Échelle 4/8/12/16/20/24/32.
Cartes qui ne touchent jamais les bords (~16px).

## 8. Composants

Carte verre · bouton pilule (libellé = action réelle) · chip d'icône pastel
(accent à 14 %, icône en plein) · barre de nav verre en bas (actif = vert) · KPI
Clash Grotesk + mini-graphe fin · tag pilule teinté · **icônes Lucide/Phosphor**
(trait ~1.75–2px, **jamais d'emoji**).

## 9. Mouvement

**Un seul** moment orchestré au chargement (stagger ~60ms, une fois). Motion qui
répond à l'action (pression `scale(.97)`, onglet = glissement doux). Survol réservé
au vraiment interactif (`translateY(-3px)` + ombre flottante). Respecter
`prefers-reduced-motion`.

## 10. ❌ À éviter (« ça fait IA »)

Kit SaaS uniforme · dégradé violet/bleu startup · `blue-500` Tailwind · emoji-icônes
· LABELS MAJUSCULES · méta « A · B · C » · « — » tiret cadratin · flèche « → » sur
les boutons · monospace pour les données · un mot de titre coloré · symétrie morte
tout centré · flou laiteux illisible · fond trop propre (garder grain + vignette).
