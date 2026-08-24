import { AppText } from '@/shared/ui/AppText';
import { Screen } from '@/shared/ui/Screen';

export default function ClientesScreen() {
  return (
    <Screen>
      <AppText variant="screenTitle" accessibilityRole="header">
        Clientes
      </AppText>
    </Screen>
  );
}
