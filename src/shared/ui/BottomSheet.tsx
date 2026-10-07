// BeautIzzy — BottomSheet
//
// The ONE canonical bottom-anchored drawer opened by STATE
// (docs/design/DESIGN_OVERRIDES.md §16). Every small drawer — confirmations,
// pickers, action lists, forms — uses this primitive. It hosts the shared
// `SheetPresentation` (scrim, satin surface, transitions, gestures, header /
// body / action area, keyboard-safe layout) in a React Native Modal;
// `SheetScreen` hosts the very same presentation in a route, so a drawer and a
// sheet route are indistinguishable.
//
// What the Modal host adds:
//
// - the Modal stays mounted while the sheet slides down, THEN unmounts and
//   `onDismissed` fires — closing never makes the surface disappear instantly,
//   and chaining a second presentation from `onDismissed` is always safe;
// - `dismissOnHardwareBack`, next to the presentation's `dismissOnBackdropPress`
//   and `dismissOnPanDown`: the dismissal policy is explicit per drawer.

import { useEffect, useRef, useState } from 'react';
import { Modal, Platform } from 'react-native';

import { SheetPresentation, type SheetPresentationOptions } from './SheetPresentation';

export { SheetGrabber } from './SheetPresentation';

interface BottomSheetProps extends SheetPresentationOptions {
  readonly visible: boolean;
  /** Every dismissal request: backdrop, hardware back, pan-down, explicit close. */
  readonly onClose: () => void;
  /** Fired once the close transition ran and the Modal is completely gone. */
  readonly onDismissed?: () => void;
  readonly onShow?: () => void;
  readonly dismissOnHardwareBack?: boolean;
}

export function BottomSheet({
  visible,
  onClose,
  onDismissed,
  onShow,
  dismissOnHardwareBack = true,
  ...presentation
}: BottomSheetProps) {
  // The Modal stays mounted while the sheet slides down; `presented` drops
  // only once the close transition has finished.
  const [presented, setPresented] = useState(visible);
  if (visible && !presented) setPresented(true);

  // iOS reports the real dismissal through the Modal; other platforms hide
  // synchronously, so the callback runs as soon as the Modal unmounts.
  const wasPresented = useRef(presented);
  useEffect(() => {
    if (wasPresented.current && !presented && Platform.OS !== 'ios') onDismissed?.();
    wasPresented.current = presented;
  }, [presented, onDismissed]);

  return (
    <Modal
      animationType="none"
      onDismiss={Platform.OS === 'ios' ? onDismissed : undefined}
      onRequestClose={dismissOnHardwareBack ? onClose : undefined}
      onShow={onShow}
      transparent
      visible={presented}
    >
      <SheetPresentation
        {...presentation}
        onClose={onClose}
        onCloseTransitionEnd={() => setPresented(false)}
        visible={visible}
      />
    </Modal>
  );
}
