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
  success() {
    trigger(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  },
} as const;
