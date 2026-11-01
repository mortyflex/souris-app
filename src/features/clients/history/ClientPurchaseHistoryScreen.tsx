// BeautIzzy — Client purchase history (« Achats »)
//
// Every completed Sale of one Client, newest first, pushed from the profile
// « Voir les N achats ». Same source as the profile preview (getClientSales
// over the Sale session): nothing is copied. Each Sale is ONE transaction that
// reads its snapshots and spells out its lines; a virtualized grouped list
// keeps long histories cheap.
//
// The SAME navigation and actions as the Caisse « Produits vendus »
// (DESIGN_OVERRIDES.md §48): the whole row opens the Sale detail; a Sale that
// offers actions (`getSaleActions`, the selector of the Sale detail « ••• »)
// reveals « Actions » when swiped — a reveal only — whose tap opens the SAME
// « Actions de la vente » drawer (one for the whole list): « Rembourser »,
// « Corriger une erreur », « Rembourser intégralement », each with its own
// review and confirmation. VoiceOver gets the same action on the row.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getClientDisplayName } from '@/domain/clients';
import type { Sale } from '@/domain/sales';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { SaleActionsSheet } from '@/features/sales/adjustments/SaleActionsSheet';
import { getSaleActions } from '@/features/sales/adjustments/sale-actions';
import { describeSaleRefundStatus, getSaleRefundSummary } from '@/features/sales/adjustments/summary';
import { getClientSales } from '@/features/sales/presentation';
import { useSaleSession } from '@/features/sales/session/SaleSessionProvider';
import { AppText } from '@/shared/ui/AppText';
import { GroupedSeparator } from '@/shared/ui/GroupedSurface';
import { SwipeActionRow, useSwipeActionHintTarget } from '@/shared/ui/SwipeActionRow';
import { bottomClearance, foregroundSoft, gutter, semanticColors, spacing } from '@/shared/ui/theme';

import { CLIENT_PURCHASES_TAB_LABEL } from '../profile/presentation';
import { ClientHistoryHeader } from './ClientHistoryHeader';
import { ClientHistoryNotFound } from './ClientHistoryNotFound';
import { ClientSaleRow } from './ClientSaleRow';
import { groupedListItemStyle } from './grouped-list';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

interface ClientPurchaseHistoryScreenProps {
  readonly clientId?: string;
}

export function ClientPurchaseHistoryScreen({ clientId }: ClientPurchaseHistoryScreenProps) {
  const router = useRouter();
  const { getClientById } = useClientSession();
  const { sales, saleAdjustments, isAppointmentSettled } = useSaleSession();
  // ONE drawer for the whole list: the Sale whose actions are shown.
  const [actionsSale, setActionsSale] = useState<Sale>();
  const [actionsVisible, setActionsVisible] = useState(false);
  const client = getClientById(clientId);
  const purchases = client ? getClientSales(sales, client.id) : [];
  // THE selection of the Sale detail « ••• »: a row is swipeable exactly when it offers actions.
  const adjustable = purchases.filter(
    (sale) =>
      getSaleActions({
        sale,
        adjustments: saleAdjustments,
        appointmentSettled: sale.appointmentId === undefined || isAppointmentSettled(sale.appointmentId),
      }).length > 0,
  );
  // ONE row per screen instance plays the peek: the first adjustable one present at mount.
  const hintTarget = useSwipeActionHintTarget(adjustable[0]?.id);

  if (!client) return <ClientHistoryNotFound title={CLIENT_PURCHASES_TAB_LABEL} />;

  const openSale = (sale: Sale) => router.push({ pathname: '/sales/[saleId]', params: { saleId: sale.id } });
  const openActions = (sale: Sale) => {
    if (actionsVisible) return;
    setActionsSale(sale);
    setActionsVisible(true);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ClientHistoryHeader clientName={getClientDisplayName(client)} title={CLIENT_PURCHASES_TAB_LABEL} />
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
        renderItem={({ item, index }) => {
          const row = (
            <ClientSaleRow
              onPress={() => openSale(item)}
              refundStatus={describeSaleRefundStatus(getSaleRefundSummary(item, saleAdjustments))}
              sale={item}
              showLines
            />
          );
          return (
            <View style={groupedListItemStyle(index, purchases.length)}>
              {index > 0 && <GroupedSeparator inset={spacing.base} />}
              {adjustable.includes(item) ? (
                <SwipeActionRow
                  actionIcon={{ ios: 'ellipsis.circle', android: 'more_horiz' }}
                  accessibilityActionLabel="Actions de la vente"
                  actionLabel="Actions"
                  actionTestID={`client-sale-actions-${item.id}`}
                  hint={item.id === hintTarget}
                  onAction={() => openActions(item)}
                  surfaceColor={semanticColors.surfaceElevated}
                  testID={`client-sale-swipe-${item.id}`}
                >
                  {row}
                </SwipeActionRow>
              ) : (
                row
              )}
            </View>
          );
        }}
        showsVerticalScrollIndicator={false}
        testID="client-purchase-history"
      />
      <SaleActionsSheet onClose={() => setActionsVisible(false)} sale={actionsSale} visible={actionsVisible} />
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
