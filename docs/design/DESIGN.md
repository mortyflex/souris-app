# SOURIS — Système de design

> Catégorie : système de design projet
> Surface : application mobile native (iOS + Android), avec un launcher web de revue
> Design system id : `user:web-prototype-design-system`
> Source : projet Open Design « Web Prototype » (`0f393b62-192f-43bc-9b6c-ff158193ffc2`), direction de marque `user:souris-design-direction`

Toutes les règles ci-dessous sont relevées dans le code source copié dans ce workspace
(`assets/souris.css`, `assets/souris.js`, `assets/agenda-view.js`, `screens/*.html`, `index.html`,
`logo-*.png`). Chaque section indique son fichier d'origine. Voir `context/provenance.md`
pour la table complète preuve → règle.

---

## 1. Thème visuel & atmosphère

Souris est une application mobile native de gestion quotidienne pour les professionnelles de la
beauté travaillant sur rendez-vous : d'abord une coiffeuse, mais le produit vise aussi les
prothésistes ongulaires, esthéticiennes et spécialistes lashes/brows.

La promesse n'est pas d'être le logiciel de salon le plus complet, mais le strict nécessaire pour
mener une journée de travail sans la lourdeur des logiciels de gestion. Le cœur du produit est
l'**Agenda**, qui est aussi l'écran d'accueil.

L'atmosphère recherchée : **légèreté, calme, maîtrise**. Chaleureux sans être enfantin, élégant sans
être luxueux, féminin sans clichés, professionnel sans être administratif, légèrement ludique.

Concrètement, dans le prototype :

- Fond blanc pur, texte violet navy profond, beaucoup de blanc et une hiérarchie typographique forte.
- Une structure d'agenda très calme sur laquelle les événements pastel sont les seules taches de couleur.
- Un seul motif graphique dans tout le produit : les rayures pêche du **temps de pose**.
- Les ombres sont teintées navy et quasi invisibles ; rien ne flotte sans raison.

**Idée directrice du produit, à ne jamais diluer :** une prestation se découpe en phases. Certaines
occupent la professionnelle, d'autres sont un temps de pose pendant lequel la cliente reste en
rendez-vous mais la professionnelle redevient libre. Une autre cliente peut donc être placée
volontairement dans ce créneau. Le système visuel existe pour rendre cela lisible d'un coup d'œil
(`assets/agenda-view.js`, rendez-vous `ines` + `camille`).

---

## 2. Couleur

Fichier de référence : `colors_and_type.css`. Source : bloc `:root` de `assets/souris.css`.

### Palette de marque enregistrée — les seules valeurs hex autorisées

| Token | Valeur | Rôle |
| --- | --- | --- |
| `--bg` | `#ffffff` | Fond de toutes les surfaces d'application |
| `--fg` | `#19163f` | Texte principal, jour sélectionné, toast |
| `--accent` | `#7354c7` | **Action et sélection uniquement** : bouton plein, FAB, onglet actif, anneau de focus |
| `--surface` | `#f6f6f7` | Fond de recherche, segmenté, état désactivé, bloc « pause » |
| `--muted` | `#9896a9` | Chevrons, mentions, numéro de version |
| `--border` | `#dfdee4` | Filets d'un pixel, séparateurs, contours de champ |

### Tons dérivés — en `oklch()`, jamais en hex inventé

- **Lavande** (`--lav-025 → --lav-700`, teinte 300) : structure, hover de ligne, avatar, prestation
  standard, indicateur Material actif, hover du bouton plein (`--lav-700`).
- **Rose** (`--rose-050 → --rose-600`, teinte 6) : ligne « maintenant », erreur de champ, action
  destructive, annulation.
- **Pêche** (`--peach-050 → --peach-700`, teinte 62) : **temps de pose** et disponibilité retrouvée.
- **`--fg-soft`** (`oklch(0.42 0.055 285)`) : texte secondaire — méta de ligne, eyebrow, sous-titre.
  Plus lisible que `--muted` ; c'est lui qu'on utilise pour du texte réellement lu.

### Règles de couleur

1. Le violet `--accent` est un signal fort : **au plus deux occurrences par écran**, jamais en aplat large.
2. Les pastels servent **exclusivement** à distinguer rendez-vous, phases et états. Jamais de fond de page pastel.
3. Un événement d'agenda combine trois variables locales : `--ev-bg` (050), `--ev-line` (200) et
   `--ev-key` (600/700, filet de 3px à gauche). Les quatre variantes sont `--ev--lav`, `--ev--rose`,
   `--ev--peach`, `--ev--off`.
4. Hors frame (largeur ≥ 520px), le fond de page passe à `--lav-025` pour détacher le téléphone.
5. Aucun dégradé décoratif. Les seuls dégradés du système sont fonctionnels : le shimmer de
   chargement et les rayures du temps de pose.

---

## 3. Typographie

Une seule famille : **Inter** — `"Inter", system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif`.
Sur Android, Roboto et Noto Sans s'intercalent dans la pile. Ce choix mono-famille est assumé : le
brief est utilitaire et dense en données ; le contraste vient de la graisse, de la taille et de
l'interlettrage, pas d'un second caractère.

Chargée depuis Google Fonts (400 / 500 / 600 / 700) dans chaque écran. Aucun fichier de police n'est
livré dans le projet source — voir « Blocages » ci-dessous.

| Rôle | Taille | Graisse | Interlettrage |
| --- | --- | --- | --- |
| Titre d'onboarding | 31px | 700 | −0.032em |
| Grand titre d'écran (iOS) | 27px / 1.12 | 700 | −0.028em |
| Grand titre d'écran (Android) | 24px | 600 | −0.01em |
| Titre de feuille modale | 19px | 700 | −0.02em |
| Résumé de journée (valeur) | 20px | 700 | −0.026em |
| Titre d'état vide/erreur | 17px | 700 | −0.017em |
| Base document | 16px / 1.45 | 400 | — |
| Titre de ligne de liste | 15.5px | 600 | −0.011em |
| Bouton, champ | 15px | 600 (500 Android) | −0.006em |
| Méta, sous-titre | 13px | 400 | +0.01em |
| Intertitre / eyebrow | 12px | 600 | **+0.09em, capitales** |
| Puce, heure d'événement, légende | 11.5px | 600 | +0.015em |
| Onglet iOS / Android | 10.5px / 12px | 600 / 500 | — |

Règles :

- `text-wrap:balance` sur tous les titres, `text-wrap:pretty` sur les paragraphes : c'est la défense
  du système contre les mots orphelins.
- Paragraphes de contenu limités à `30ch` (onboarding, états vides) ; jamais de ligne longue en mobile.
- `font-variant-numeric:tabular-nums` sur toute valeur susceptible de changer : heures, prix, stocks,
  numéros de jour, compteurs.
- Les titres de ligne et les méta sont tronqués à l'ellipse sur une ligne (`text-overflow:ellipsis`) :
  une liste ne doit jamais se déformer verticalement.

---

## 4. Espacement

Fichier de référence : `tokens.css`.

- **Rythme 8px** pour toute la mise en page. Échelle utilisée : 4 · 8 · 12 · 16 · 20 · 24 · 28 · 32.
- Gouttière horizontale : **20px** sur iOS (`.pad`), **16px** sur Android.
- En-tête d'écran : `12px 20px 10px`, réduit à `8px 8px 6px 16px` sur Android (le bouton icône assure la marge optique).
- Groupe de liste : `28px` au-dessus, `8px` en dessous ; `16px` pour le premier. Un index alphabétique
  respire moins : `18px / 2px`.
- Bas de contenu défilant : `104px` (iOS) / `128px` (Android) pour dégager barre d'onglets et FAB.
- Rayons : `8px` par défaut, `16px` pour une feuille iOS, `999px` pour avatar / FAB iOS / points.
  Sur Android : `12px` par défaut, `28px` pour une feuille, `16px` pour le FAB.
- Ombres : trois seulement — `--shadow-sheet`, `--shadow-raise`, `--shadow-fab` — toutes teintées
  `oklch(… 285)` ou `oklch(… 300)`, jamais noires.
- Cibles tactiles : **44px minimum** sur iOS, **48px** sur Android. Le token `--tap` pilote la hauteur
  de bouton, de bouton icône, de champ, de jour du bandeau et d'onglet.

---

## 5. Mise en page & composition

### Coquille d'écran (`.app`)

Colonne en trois zones fixes : en-tête `.hd` (non défilant) → `.scroll` (défilant, `overscroll-behavior:contain`,
barre de défilement masquée) → barre d'onglets `.tabs`. Le FAB et les feuilles sont en position absolue
dans `.app`, jamais dans le flux.

L'en-tête révèle un filet d'un pixel dès que le contenu défile (`.hd[data-scrolled="true"]`, piloté par
`Souris.stickyHeader()`). C'est la seule séparation qui apparaît en cours de lecture.

### Hiérarchie sans cartes — règle structurante

**Ne pas transformer une section en carte.** La hiérarchie se fait d'abord par la typographie, l'espace
et les filets d'un pixel. Les seules vraies surfaces du produit sont : la feuille modale, l'événement
d'agenda, le toast et la pastille d'icône. Les listes, les groupes, le résumé de journée et les paires
clé/valeur sont des filets et des graisses — pas des conteneurs.

### Grille de l'Agenda

- Journée affichée **8 h → 20 h**, **1 heure = 68px**, colonne d'heures de 62px à gauche.
- Les rendez-vous simultanés sont répartis en **colonnes calculées** par un algorithme de placement
  (`layout()` dans `assets/agenda-view.js`) : jamais de superposition accidentelle.
- La ligne « maintenant » est rose, avec pastille et heure alignée à droite dans la gouttière.
- Le temps de pose est un calque interne à l'événement (`.ev__pose`), pas un événement séparé.
- Une légende explicite les motifs (prestation / temps de pose / indisponible).

### Navigation

Quatre onglets, dans cet ordre, définis une seule fois dans `assets/souris.js` :
**Agenda · Clientes · Produits · Plus**. Agenda est l'écran d'accueil.

« Plus » est organisé par usage, pas comme un écran Réglages : **Gestion** (Prestations & tarifs,
Remises, Réservation en ligne) · **Salon** (Informations, Horaires & disponibilités, Équipe) ·
**Préférences** (Notifications, Préférences Agenda) · **Compte** (Profil, Sécurité, Aide).
« Prestations & tarifs » est une fonction métier et possède son propre écran.

### Deux plateformes, un seul jeu de tokens

L'adaptation Android est un basculement d'attribut `body[data-platform="android"]` : densité 48dp,
rayons Material, boutons en pilule à graisse 500, barre de navigation Material 3 avec indicateur
lavande sous l'icône active, FAB carré arrondi, feuilles à 28dp. Aucun fichier CSS séparé.

### Hors frame

Au-delà de 520px, `.app` reste à `max-width:430px`, centré, bordé d'un filet : un écran ouvert seul
garde une largeur de téléphone. Le système ne produit pas de dashboard responsive.

---

## 6. Composants

Tous définis dans `assets/souris.css` ; démonstration appliquée dans `ui_kits/app/`.

### Boutons — une seule action primaire par écran

| Variante | Défaut | Hover | Usage |
| --- | --- | --- | --- |
| `.btn--primary` | fond `--accent`, texte `--bg` | fond `--lav-700`, texte `--bg` | L'unique engagement de l'écran ou de la feuille |
| `.btn--ghost` | fond `--bg`, filet `--border` | fond `--surface`, filet `--muted` | Annuler, action secondaire |
| `.btn--quiet` | texte `--accent`, sans fond | fond `--lav-050`, texte `--lav-700` | Lien d'action, « Passer » |
| `.btn--danger` | texte `--rose-600`, filet `--rose-200` | fond `--rose-050`, filet `--rose-600` | Supprimer, marquer absente |

Hauteur minimale `--tap`, rayon `--r`, enfoncement `scale(.985)` à l'activation.
Le bouton désactivé est le **seul** état autorisé à baisser le contraste.

- `.ibtn` — bouton icône, carré `--tap` garanti, icône 22px, fond transparent → `--surface` au survol.
- `.fab` — action primaire de l'écran ; 56px, ancré au-dessus de la barre d'onglets.
  Rond sur iOS, carré arrondi 16px sur Android.

### Listes

`.row` : hauteur minimale 60px, filet inférieur, hover `--lav-025`, actif `--lav-050`.
Structure : `avatar/pastille` → `.row__body` (`.row__title` + `.row__meta`, tronqués) → `.row__side`
ou `.row__chev`. Le dernier élément d'un groupe perd son filet.

`.avatar` : 40px, initiales en 700, trois teintes (lavande par défaut, rose, pêche) pour différencier
sans jamais coder une information par la seule couleur.

`.chip` : puce d'état 11.5px, rayon `--r` (jamais une pilule), quatre teintes + point optionnel.

### Champs

`.input` : hauteur `--tap`, filet `--border`, focus = contour `--accent` 2px + bordure `--accent`.
État invalide : bordure `--rose-600` + fond `--rose-050` + `.field__error` explicite avec icône.
`.search` : champ sur fond `--surface` sans bordure, icône à 12px à gauche, redevient blanc au focus.
`.seg` : contrôle segmenté — **le seul contrôle en pilule/onglets du système**, un par écran maximum.

### Feuille modale (`.sheet`)

Toute création, tout détail et toute édition passent par une feuille ancrée en bas, jamais par une
nouvelle page. Poignée, en-tête avec titre et fermeture, corps défilant, pied fixe avec au plus
**un** bouton plein. Ouverture en `.28s cubic-bezier(.32,.72,0,1)`, scrim `oklch(0.25 0.05 285 / 0.34)`.
Accessibilité gérée par `Souris.sheets()` : `role="dialog"`, `aria-modal`, fermeture par Échap et par
le scrim, focus placé à l'ouverture et restitué à la fermeture.

### États

- **Vide / erreur** (`.state`) : pastille ronde 56px, titre 17px, texte ≤ 30ch, **une seule sortie**.
- **Chargement** (`.skel`) : shimmer 1.4s calé sur la grille réelle, pas un spinner.
- **Confirmation** (`.toast`) : fond `--fg`, texte `--bg`, icône de validation, 2.6s, `aria-live="polite"`.

### Composants métier

- `.ev` — événement d'agenda, avec `.ev__pose` (rayures pêche) et `.ev--sm` pour les créneaux courts.
- `.daystrip` / `.day` — bandeau de semaine ; la barre `.day__load` indique la charge (0/1/2).
- `.sum` — résumé de journée en typographie pure (valeur 20px + libellé capitales).
- `.phase` — déroulé d'une prestation dans la feuille : heure, nom, qualification
  (« Vous êtes occupée » / « Vous êtes libre »), barre de couleur.
- `.stepper` (Produits) — ajustement au pas de un, boutons 36px.
- `.bar` (Prestations) — répartition phases actives / temps de pose d'une prestation.

### Iconographie

24 icônes, grille 24, trait 1.6, extrémités et jonctions arrondies, `fill:none`, `currentColor`.
Source unique : la map `ICONS` de `assets/souris.js`. Export réutilisable dans `build/icons/*.svg`,
sprite `build/souris-icons.svg`, index `build/icons.json`.
**Aucun emoji n'est utilisé comme icône fonctionnelle.**

### Marque

`assets/brand/logo-mark.png` (tête de souris : deux oreilles ouvertes, oreilles internes rose,
nez rose, sourire) · `logo-wordmark.png` (mot « souris » en bas de casse avec le sourire sous le mot,
point du i rose) · `logo-lockup.png` (marque + wordmark + baseline « GESTION DE RENDEZ-VOUS SALON »).
Le nom évoque le sourire, pas la mascotte : la tête apparaît en petite taille (46px en onboarding),
le wordmark en tête du launcher. Les PNG sont posés en `mix-blend-mode:multiply` sur fond clair.
**Ne pas multiplier les souris illustrées.**

---

## 7. Motion & interaction

- Couleur et fond : `.15s ease`. Enfoncement : `.08s`. Feuille et panneau : `.28s cubic-bezier(.32,.72,0,1)`.
- Le mouvement sert l'orientation (d'où vient la feuille, quel panneau est actif), jamais la décoration.
- **Hover :** le fond bouge, jamais le texte. Un survol n'éclaircit jamais le texte et ne le passe
  jamais en `--muted`. Sur bouton plein, fond et texte sont inversés dans la même règle.
- **Focus :** `:focus-visible` global — contour `--accent` 2px, décalage 2px, sur tous les liens,
  boutons, onglets, champs et éléments `tabindex`. Les lignes de liste utilisent un décalage intérieur.
- **Actif :** `scale(.985)` sur bouton, `.94` sur FAB, `.99` sur événement ; sur Android, un fond
  `--lav-100` remplace l'échelle (ripple discret).
- **Chargement :** squelettes calés sur la grille réelle ; l'action primaire reste inactive pendant le chargement.
- `prefers-reduced-motion: reduce` neutralise toutes les durées à `.01ms`.
- Contraste : ≥ 4.5:1 pour le texte courant, ≥ 3:1 pour le texte large et les icônes, dans tous les états.

---

## 8. Voix & marque

Concise, humaine, directe. Peu de mots. Les actions sont formulées simplement et complètement :
« Créer le rendez-vous », « Ajouter une prestation », « Ajouter le produit », « Marquer comme absence »,
« Rendez-vous créé ».

- Pas de jargon logiciel, pas de phrase administrative, pas de ton marketing.
- Le produit s'adresse à une professionnelle : féminin par défaut (« la cliente », « vous êtes libre »).
- Le vocabulaire métier est fixe : **rendez-vous · prestation · phase · temps de pose · cliente ·
  réserve · seuil d'alerte · remise**.
- Les intertitres sont des noms courts en capitales : Gestion, Salon, Préférences, Compte, Déroulé, Phases.
- Capitalisation à la française : première lettre seule en majuscule, sauf intertitres en capitales.
- Un état explique ce qui marche encore avant de proposer une sortie (« Clientes — erreur »).
- Le contenu de démonstration est signalé comme tel : « Contenu de démonstration — noms, tarifs et
  volumes sont fictifs. » **Ne jamais présenter des données inventées comme réelles.**

---

## 9. Anti-patterns

À ne jamais produire avec ce système :

1. **Une carte par section.** Typographie, espace et filets d'abord ; le conteneur est un dernier recours.
2. Des cartes dans des cartes dans des cartes.
3. Un dashboard SaaS générique, ou une grille responsive desktop : Souris est une application mobile native.
4. Des dégradés violets omniprésents, du glassmorphism, des blobs décoratifs, des ombres lourdes.
5. Tous les contrôles transformés en pilules. Le segmenté est le seul contrôle arrondi ; sur Android
   la pilule est réservée aux boutons, par convention Material.
6. Le violet `--accent` en aplat large ou plus de deux fois par écran.
7. Deux boutons pleins pour la même action dans le même viewport.
8. Un hover qui grise ou éclaircit le texte.
9. Des graphiques inutiles, des métriques inventées, du texte de remplissage.
10. De grosses illustrations générées, des personnages 3D, des photos stock de salon, des souris illustrées partout.
11. Des emoji en guise d'icônes.
12. Des titres géants qui gaspillent la hauteur d'un écran mobile.
13. Un écran « Réglages » fourre-tout : « Plus » est rangé par usage, et Prestations & tarifs n'est pas un réglage.
14. Un panneau de contrôle de démonstration destiné au designer plutôt qu'à l'utilisatrice.
15. Masquer un débordement avec `overflow:hidden` au lieu de corriger le contenant.

Ordre de priorité en cas d'arbitrage — issu du brief produit :
**1. compréhension immédiate · 2. rapidité · 3. confort tactile · 4. précision · 5. esthétique.**
Si un élément est beau mais ralentit la professionnelle, il est simplifié.

---

## Blocages / preuves manquantes

- **Fichiers de police :** aucun `.woff2` n'existe dans le projet source ; Inter est chargée depuis
  Google Fonts dans chaque écran. Le dossier `fonts/` n'est donc pas livré, et la pile de repli
  déclarée doit être conservée telle quelle.
- **Icônes d'application / tray :** le projet source ne contient aucune icône d'app exportée.
  `build/` contient les 24 icônes d'interface réellement présentes dans le code, pas un jeu d'icônes
  de plateforme.
- **Mode sombre :** absent du prototype. Aucun token sombre n'est inventé ici.
- **Le launcher `index.html` référence `/frames/iphone-15-pro.html` et `/frames/android-pixel.html`,**
  fournis par le runtime du projet source. Hors de ce runtime, les cadres restent vides ; les écrans
  s'ouvrent normalement en direct depuis `preview/applied-ui-surfaces.html` et `ui_kits/app/`.
