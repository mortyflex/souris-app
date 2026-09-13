# Souris app icon — Icon Composer layer sources

Canonical brand art stays `assets/brand/logo-mark.png`. These files are the layers of the Icon
Composer document `assets/brand/Souris.icon` (iOS Liquid Glass app icon, `ios.icon` in `app.json`).
They are derived outputs: regenerate them from the mark, never edit them by hand.

Direction (V3): lavender document background + canonical navy mouse + pink nose. Three visual
elements, nothing else. No glow, disc, plate, ring, halo or support artwork behind the mouse. The
dimensional interest comes only from the mouse and nose materials.

| Element (back → front) | File | Content |
| --- | --- | --- |
| Background | *(none — document fill)* | `lavender.lav200` `#E1D6F9`. Apple: keep background colours out of the artwork and set them in Icon Composer. |
| 02 Mouse | `02-mouse-mark.png` | The canonical navy strokes of `logo-mark.png`, pixels untouched, downsampled once. |
| 03 Nose | `03-mouse-nose.png` | The canonical pink nose of `logo-mark.png`, same render, split by region. |

Derivation (1024 × 1024 transparent canvas):

- the mark's artwork box (1254 px source: x 134–1118, y 298–962) is scaled so it spans **74 %** of
  the canvas width (758 × 512 px) and is centred on its own box (scale 0.7693);
- the nose layer is the source rectangle x 555–697, y 692–833 (nose box + 14 px margin, verified to
  contain no navy pixel); the mouse layer is everything else. Nothing is redrawn or traced;
- no shadow, highlight, gradient, glow, mask or rounded corner is baked into any layer.

Icon Composer settings (Style inspector, iOS / macOS shared):

| Target | Setting |
| --- | --- |
| Document fill | Solid `#E1D6F9`. Dark: the file carries no document-level dark fill (Icon Composer 1.4 drops that key on save); set it in the GUI if a navy `#19163F` dark background is wanted, otherwise the system's default dark treatment applies |
| 02 Mouse | group Shadow neutral 50 %; Translucency off (navy stays rich); Specular automatic; Dark variant fill solid `#E1D6F9` |
| 03 Nose | group Shadow neutral 55 %; Translucency on 15 % (small glass bead); Specular automatic |
| Mono / tinted | system default (silhouette from layer alpha), nothing customised |

Blur and refraction stay at their defaults. Never add a layer behind the mouse: if more separation
is wanted, adjust the mouse shadow or specular, not the background.

Manual workflow when rebuilding the document from scratch: open Icon Composer (Xcode > Open
Developer Tool), File > New, drag the two files from this folder into the sidebar (each becomes a
group named after its file, back to front by number), apply the settings above, set the document
platforms to iOS only, review Default / Dark / Mono at real Home Screen size, then Save As
`Souris.icon` over `assets/brand/Souris.icon`.

Before reopening this file after it has been changed on disk, quit Icon Composer completely: it
restores its autosaved window state on launch and will otherwise write the stale document back.
