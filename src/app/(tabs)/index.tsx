import { AppText } from '@/shared/ui/AppText';
import { Screen } from '@/shared/ui/Screen';

export default function AgendaScreen() {
  return (
    <Screen>
      <AppText variant="screenTitle" accessibilityRole="header">
        Agenda
      </AppText>
    </Screen>
  );
}
