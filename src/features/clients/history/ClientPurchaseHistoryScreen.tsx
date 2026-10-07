// BeautIzzy — Client purchase history
//
// Every completed Sale of one Client, newest first, pushed from the profile
// « Voir les N achats ». Same source as the profile preview (getClientSales
// over the Sale session): nothing is copied. Each Sale reads its snapshots
// and spells out its lines; there is no Sale detail screen, so rows stay
// read-only. A virtualized grouped list keeps long histories cheap.

import { FlatList, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getClientDisplayName } from '@/domain/clients';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { getClientSales } from '@/features/sales/presentation';
import { useSaleSession } from '@/features/sales/session/SaleSessionProvider';
import { AppText } from '@/shared/ui/AppText';
import { GroupedSeparator } from '@/shared/ui/GroupedSurface';
import { bottomClearance, foregroundSoft, gutter, semanticColors, spacing } from '@/shared/ui/theme';

import { ClientHistoryHeader } from './ClientHistoryHeader';
import { ClientHistoryNotFound } from './ClientHistoryNotFound';
import { ClientSaleRow } from './ClientSaleRow';
import { groupedListItemStyle } from './grouped-list';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

interface ClientPurchaseHistoryScreenProps {
  readonly clientId?: string;
}

export function ClientPurchaseHistoryScreen({ clientId }: ClientPurchaseHistoryScreenProps) {
  const { getClientById } = useClientSession();
  const { sales } = useSaleSession();
  const client = getClientById(clientId);

  if (!client) return <ClientHistoryNotFound title="Produits achetés" />;

  const purchases = getClientSales(sales, client.id);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ClientHistoryHeader clientName={getClientDisplayName(client)} title="Produits achetés" />
      <FlatList
        contentContainerStyle={styles.content}
        data={purchases}
        initialNumToRender={20}
        keyExtractor={(sale) => sale.id}
        ListEmptyComponent={
          <AppText variant="metadata" style={styles.empty}>
            Aucun achat enregistré.
          </AppText>
        }
        renderItem={({ item, index }) => (
          <View style={groupedListItemStyle(index, purchases.length)}>
            {index > 0 && <GroupedSeparator inset={spacing.base} />}
            <ClientSaleRow sale={item} showLines />
          </View>
        )}
        showsVerticalScrollIndicator={false}
        testID="client-purchase-history"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.screenWarm, flex: 1 },
  content: {
    paddingBottom: bottomClearance[Platform.OS === 'android' ? 'android' : 'ios'],
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.base,
  },
  empty: { color: foregroundSoft, paddingTop: spacing.xl, textAlign: 'center' },
});
