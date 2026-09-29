// Souris — sheet material (Glass Sheet Pilot, DESIGN_OVERRIDES.md §40)
//
// EXPERIMENTAL and opt-in. Every sheet shell keeps the approved satin material
// (`overlayMaterial.surface`, §20) unless its consumer passes
// `material="glass"` — on the shared `SheetPresentation` path only (drawers and
// transparent-modal content sheets), where the glass samples the dimmed page
// beneath. Native `fill` form sheets stay satin. The glass material is an
// enhancement OVER that surface, never the source of readability:
//
// - iOS with Liquid Glass (and its API really present), Reduce Transparency
//   off: the surface becomes transparent and draws the system glass
//   (`expo-glass-effect`, passive and native — no snapshot, no JS per frame)
//   under a milky lav025 veil (`overlayMaterial.glassTint`), so the dimmed page
//   is only suggested and the sheet still reads as its usual colour;
// - everywhere else (Android, earlier iOS, Reduce Transparency, the API
//   missing): the opaque satin surface, exactly as today.
//
// Both keep the softer, wider glass sheen of `SurfaceGloss`. Cards, fields and
// text inside the sheet are untouched: they stay opaque and crisp.

import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform, StyleSheet, View } from "react-native";

import { overlayMaterial } from "./theme";

/** `satin` is the approved default; `glass` is the §40 pilot. */
export type SheetMaterial = "satin" | "glass";

function nativeGlassAvailable(): boolean {
  if (Platform.OS !== "ios") return false;
  try {
    return isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  } catch {
    // A binary without the native module: the satin surface stands in.
    return false;
  }
}

function useReduceTransparency(enabled: boolean): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void AccessibilityInfo.isReduceTransparencyEnabled().then((value) => {
      if (active) setReduced(value);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      setReduced,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, [enabled]);

  return reduced;
}

/**
 * Whether this sheet really draws the native glass. `false` for every satin
 * sheet, and for a glass sheet wherever the system glass is unavailable or
 * transparency is reduced.
 */
export function useSheetGlass(material: SheetMaterial): boolean {
  const requested = material === "glass";
  const [available] = useState(() => requested && nativeGlassAvailable());
  const reduced = useReduceTransparency(requested && available);
  return requested && available && !reduced;
}

/** The surface fill: transparent only while the glass is drawn beneath the content. */
export function sheetSurfaceStyle(glass: boolean) {
  return glass ? styles.glassSurface : undefined;
}

/**
 * The glass layers, first child of the surface (under the gloss and the
 * content). Renders nothing unless the glass is active.
 */
export function SheetGlassBackdrop({ active }: { readonly active: boolean }) {
  if (!active) return null;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      testID="sheet-glass-backdrop"
    >
      <GlassView
        colorScheme="light"
        glassEffectStyle="regular"
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.veil} />
    </View>
  );
}

const styles = StyleSheet.create({
  glassSurface: { backgroundColor: "transparent" },
  veil: {
    ...StyleSheet.absoluteFill,
    backgroundColor: overlayMaterial.glassTint,
  },
});
