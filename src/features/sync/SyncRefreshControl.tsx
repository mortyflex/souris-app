// BeautIzzy — SyncRefreshControl
//
// The native pull-to-refresh control of every product list and summary that
// may show data another device changed: Agenda, Caisse, Ventes, a Sale,
// Produits, Clientes and the client histories. ONE component, ONE behaviour
// (use-sync-refresh.ts): the gesture runs a real synchronization and the
// platform indicator lasts as long as it does.
//
// It is the platform control, in the brand accent, nothing drawn by hand:
// iOS keeps its spinner, Android its circular progress. Pass it as the
// `refreshControl` of a ScrollView, FlatList or SectionList — every prop the
// host hands it (Android wraps the list in it) is forwarded.

import { RefreshControl, type RefreshControlProps } from 'react-native';

import { semanticColors } from '@/shared/ui/theme';

import { useSyncRefresh } from './use-sync-refresh';

export const SYNC_REFRESH_CONTROL_TEST_ID = 'sync-refresh-control';
export const SYNC_REFRESH_LABEL = 'Actualiser et synchroniser';

type SyncRefreshControlProps = Omit<RefreshControlProps, 'refreshing' | 'onRefresh'>;

export function SyncRefreshControl(props: SyncRefreshControlProps) {
  const { refreshing, onRefresh } = useSyncRefresh();
  return (
    <RefreshControl
      accessibilityLabel={SYNC_REFRESH_LABEL}
      colors={[semanticColors.accent]}
      progressBackgroundColor={semanticColors.surfaceElevated}
      testID={SYNC_REFRESH_CONTROL_TEST_ID}
      tintColor={semanticColors.accent}
      {...props}
      onRefresh={onRefresh}
      refreshing={refreshing}
    />
  );
}
