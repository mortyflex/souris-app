// BeautIzzy — SheetScreen
//
// The shell of a sheet ROUTE, so a workflow presented as a route reads exactly
// like a drawer presented by state. Two presentations, chosen by `fit` and
// paired with the route options of `src/providers/sheet-route-options.ts`:
//
// `fit="fill"` (workflowSheet) — a NATIVE form sheet on the system's large
//   detent: Appointment creation / editing, Sale creation. Long keyboard-heavy
//   workflows keep the platform sheet; the large detent is the one iOS 26
//   leaves attached to the screen edges. This shell only draws the satin
//   material, the grabber, the bottom safe area and the keyboard strategy.
//
// `fit="content"` (contentSheet / editorSheet) — the shared SheetPresentation
//   hosted in a TRANSPARENT-MODAL route: Appointment details, Product and
//   Service details / creation. A native sheet sized to its content sits below
//   the large detent, and iOS 26 floats those as an inset card (side margins,
//   gap below, four rounded corners) with no UIKit opt-out. Drawing the sheet
//   ourselves keeps it full width, flush with the bottom and identical to every
//   BottomSheet on every iOS version.
//
//   The route is left like any other: `router.back()`, a push over it, a
//   hardware back. `usePreventRemove` holds the removal while the sheet slides
//   down and the scrim fades, then lets the very same navigation action through —
//   screens need no special close call, and the route never vanishes instantly.
//   `dismissible` is the swipe / outside-tap policy (off while a draft is
//   edited); leaving through « Annuler » / « Fermer » always works. A screen
//   that guards a draft passes `onLeaveAttempt` instead of its own
//   `usePreventRemove`: two guards on one route would both fire, and the sheet
//   would slide away under the screen's confirmation. A route that is not the
//   focused one (another sheet route presented over it: « Vendre ce produit »
//   over Product details) ignores the keyboard of the route above it.

import { useIsFocused, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { SheetMaterial } from './sheet-material';
import { SheetLayer, useSheetLayer } from './sheet-layers';
import { SheetGrabber, SheetPresentation } from './SheetPresentation';
import { SurfaceGloss } from './SurfaceGloss';
import { overlayMaterial, radii } from './theme';

interface SheetScreenProps {
  readonly children: ReactNode;
  readonly fit?: 'fill' | 'content';
  /** Lifts fixed actions above the keyboard (forms and text entry). */
  readonly keyboardAvoiding?: boolean;
  /**
   * `fit="content"` only: swipe-down and outside-tap may dismiss the sheet.
   * Turn off while a draft is being edited.
   */
  readonly dismissible?: boolean;
  /**
   * `fit="content"` only: identity of what the sheet shows. A change (details →
   * edit, type chooser → form) arrives as a new sheet sliding up over the
   * previous one instead of an instant swap.
   */
  readonly contentKey?: string;
  /**
   * `fit="content"` only: a draft is at stake. A way out the screen did not
   * start itself (hardware back, a reset) calls this INSTEAD of closing the
   * sheet — the screen confirms, then leaves with `router.back()`.
   */
  readonly onLeaveAttempt?: () => void;
  /**
   * Surface material: the approved satin (default) or the EXPERIMENTAL glass of
   * the Glass Sheet Pilot (DESIGN_OVERRIDES.md §40) — explicit opt-in only.
   * `fit="content"` only: a native `fill` form sheet always stays satin, the
   * system presentation giving the glass no page to sample (§40).
   */
  readonly material?: SheetMaterial;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

export function SheetScreen({ fit = 'fill', ...props }: SheetScreenProps) {
  return fit === 'fill' ? <NativeSheetShell {...props} /> : <RouteSheet {...props} />;
}

type ShellProps = Omit<SheetScreenProps, 'fit'>;

function NativeSheetShell({
  children,
  keyboardAvoiding = false,
  style,
  testID,
}: Omit<ShellProps, 'dismissible' | 'contentKey' | 'onLeaveAttempt' | 'material'>) {
  const Body = keyboardAvoiding ? KeyboardAvoidingView : View;
  // A drawer presented from this sheet takes the keyboard: the sheet stays put.
  const layer = useSheetLayer(true);

  return (
    <SheetLayer cover={layer.cover}>
      <SafeAreaView edges={['bottom']} style={[styles.root, styles.fill, style]} testID={testID}>
        <SurfaceGloss shape={styles.shape} testID="sheet-screen-gloss" />
        <SheetGrabber />
        <Body
          behavior={keyboardAvoiding && !layer.covered && Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.fill}
        >
          {children}
        </Body>
      </SafeAreaView>
    </SheetLayer>
  );
}

function RouteSheet({
  children,
  keyboardAvoiding = false,
  dismissible = true,
  contentKey,
  onLeaveAttempt,
  material,
  style,
  testID,
}: ShellProps) {
  const router = useRouter();
  const navigation = useNavigation();
  const focused = useIsFocused();
  type RemovalAction = Parameters<typeof navigation.dispatch>[0];
  // held → the close transition plays → released → the action goes through.
  const [removal, setRemoval] = useState<{ action: RemovalAction; released: boolean }>();

  // Every way out of the route (back, a reset, hardware back) first plays the
  // close transition; the held action then goes through untouched.
  usePreventRemove(!removal?.released, ({ data }) => {
    if (onLeaveAttempt) {
      onLeaveAttempt();
      return;
    }
    setRemoval({ action: data.action, released: false });
  });

  useEffect(() => {
    if (removal?.released) navigation.dispatch(removal.action);
  }, [navigation, removal]);

  const release = () => {
    setRemoval((held) => held && { ...held, released: true });
  };

  return (
    <SheetPresentation
      backdropLabel="Fermer la fiche"
      contentKey={contentKey}
      contentStyle={style}
      covered={!focused}
      dismissOnBackdropPress={dismissible}
      dismissOnPanDown={dismissible}
      keyboardAvoiding={keyboardAvoiding}
      material={material}
      onClose={() => router.back()}
      onCloseTransitionEnd={release}
      padded={false}
      scrimTestID="sheet-screen-scrim"
      surfaceTestID="sheet-screen-surface"
      testID={testID}
      visible={removal === undefined}
    >
      {children}
    </SheetPresentation>
  );
}

const styles = StyleSheet.create({
  // Same top corners as `sheetCornerRadius`, so the top light follows them.
  root: {
    backgroundColor: overlayMaterial.surface,
    borderCurve: 'continuous',
    borderTopLeftRadius: radii.ios.sheet,
    borderTopRightRadius: radii.ios.sheet,
    overflow: 'hidden',
  },
  shape: {
    borderTopLeftRadius: radii.ios.sheet,
    borderTopRightRadius: radii.ios.sheet,
  },
  fill: { flex: 1 },
});
