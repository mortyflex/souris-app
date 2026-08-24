import { AppText } from '@/shared/ui/AppText';
import { Screen } from '@/shared/ui/Screen';

export default function PlusScreen() {
  return (
    <Screen>
      <AppText variant="screenTitle" accessibilityRole="header">
        Plus
      </AppText>
    </Screen>
  );
}
