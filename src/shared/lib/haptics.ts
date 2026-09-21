import * as Haptics from 'expo-haptics';

function trigger(effect: () => Promise<void>) {
  try {
    void effect().catch(() => {
      // Haptics enhance the interaction; they never gate the product flow.
    });
  } catch {
    // Unsupported native implementations may fail synchronously.
  }
}

export const haptics = {
  selection() {
    trigger(() => Haptics.selectionAsync());
  },
  dragStart() {
    trigger(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },
  dragEnd() {
    trigger(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  },
  /** A committed destructive-but-reversible action (a draft line removed by swipe). */
  destructive() {
    trigger(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  },
  /** The receipt printer starts feeding paper (« Résumé du jour »): one soft tick. */
  print() {
    trigger(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },
  success() {
    trigger(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  },
  warning() {
    trigger(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
  },
} as const;
