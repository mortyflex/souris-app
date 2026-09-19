# Souris app icon — Icon Composer document

The iOS app icon is the Icon Composer document `assets/brand/Souris.icon` (`ios.icon` in
`app.json`). Direction: flat, crisp and quiet — the approved symbol on clean white, nothing else.

| Element | Source | Setting |
| --- | --- | --- |
| Background | *(document fill)* | Solid white `#FFFFFF` |
| Mark | `assets/brand/logo-mark.png`, copied byte-identical to `Souris.icon/Assets/logo-mark.png` (1536 × 1024) | scale **1.05**, translation (**−15, −6**) pt: the artwork (ears, S, whiskers, calendar) spans ≈ 71 % of the canvas width and is centred on its own bounding box |

Material: **glass off, shadow none, translucency off**. No glow, halo, relief, specular or 3D
treatment; no dark specialization (the system's dark background applies and the purple artwork
reads on it); mono / tinted are the system default from the layer alpha. Never resize, recolour or
crop the PNG: sizing and position live in `Souris.icon/icon.json`.

## Layer files in this folder (not used by the icon)

`01-ambient-glow.png`, `02-mouse-mark.png` and `03-calendar-accent.png` are the layered sources of
an earlier, dimensional version of the icon. They are kept as supplied but are **not referenced by
`Souris.icon`**: `02-mouse-mark.png` carries a soft dark halo and gloss baked into its pixels, which
no Icon Composer setting can remove and which rendered blurry and swollen at Home Screen size. If a
layered icon is wanted again, it needs a clean (halo-free) export of the symbol first.

## Verification without opening the GUI (both tools ship with Xcode)

```bash
ICTOOL="/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool"
"$ICTOOL" assets/brand/Souris.icon --export-image --output-file /tmp/souris-icon.png \
  --platform iOS --rendition Default --width 1024 --height 1024 --scale 1   # also: Dark, TintedLight, ClearLight
xcrun actool assets/brand/Souris.icon --compile /tmp/souris-icon-out --platform iphoneos \
  --minimum-deployment-target 16.0 --app-icon Souris \
  --output-partial-info-plist /tmp/souris-icon-out/partial.plist
```

Before reopening the document in Icon Composer after it has been changed on disk, quit Icon
Composer completely: it restores its autosaved window state on launch and will otherwise write the
stale document back.

The native `ios/` folder is generated: after changing the document, run a fresh prebuild / native
build so `ios/Souris/Souris.icon` is refreshed.
