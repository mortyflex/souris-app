// BeautIzzy — Sale detail (read-only)
//
// ONE completed Product Sale, exactly as recorded: how it was sold (a direct
// Sale, or a Sale sold during an Appointment), its total, when it was
// validated, its Client, every line from its snapshots (name, quantity, unit
// price and line total as sold — never the current catalog), and how its
// money was recorded:
//
//   a direct Sale with a payment   the received total and its card / cash split,
//                                  and the day it was received when it differs
//   a Sale sold during an Appointment   « encaissée avec le rendez-vous », with the
//                                  way to that Appointment
//   a historical direct Sale without a payment record   said as such — no method is invented
//
// Nothing here edits, refunds or recomputes anything (docs/domain/SALES.md §11b).

import { useRouter } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getCashRegisterDayKey } from '@/domain/cash-register';
import { getSaleTotalCents } from '@/domain/appointments';
import { findSaleHistoryEntry, type SaleHistoryEntry, type SaleItem } from '@/domain/sales';
import { useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import { getResolvedClientDisplayName } from '@/features/clients/presentation';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { paymentMethodLabels } from '@/shared/icons/payment-method-icons';
import { formatEuroCents, formatEuros } from '@/shared/lib/money';
import { AppText } from '@/shared/ui/AppText';
import { GroupedSeparator, GroupedSurface } from '@/shared/ui/GroupedSurface';
import { GROUPED_READ_ROW_SEPARATOR_INSET, GroupedReadRow } from '@/shared/ui/GroupedReadRow';
import { NavigationChevron } from '@/shared/ui/NavigationChevron';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { bottomClearance, foregroundSoft, gutter, radii, semanticColors, spacing } from '@/shared/ui/theme';

import { useSaleSession } from '../session/SaleSessionProvider';
import {
  SALE_CHANNEL_EYEBROWS,
  SALE_PAID_WITH_APPOINTMENT_NOTE,
  SALE_PAYMENT_UNKNOWN_NOTE,
  formatSaleDateTime,
  formatSaleQuantity,
  formatSaleUnitCount,
} from '../presentation';
import { WALK_IN_SALE_LABEL } from './SaleHistoryRow';
import { SaleHistoryTopBar } from './SaleHistoryTopBar';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

export const SALE_DETAIL_TITLE = 'Détail de la vente';
export const SALE_NOT_FOUND_TITLE = 'Vente introuvable';
export const SALE_NOT_FOUND_COPY = 'Cette vente n’existe plus sur cet appareil.';
export const OPEN_APPOINTMENT_LABEL = 'Voir le rendez-vous';
export const APPOINTMENT_MISSING_LABEL = 'Rendez-vous introuvable sur cet appareil';

const paymentDayFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

interface SaleDetailScreenProps {
  readonly saleId?: string;
}

export function SaleDetailScreen({ saleId }: SaleDetailScreenProps) {
  const router = useRouter();
  const { sales } = useSaleSession();
  const { getClientById } = useClientSession();
  const { getAppointmentById } = useAppointmentSession();
  const entry = findSaleHistoryEntry(sales, saleId);

  if (!entry) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea} testID="sale-detail-screen">
        <SaleHistoryTopBar />
        <View style={styles.notFound} testID="sale-detail-not-found">
          <AppText variant="stateTitle">{SALE_NOT_FOUND_TITLE}</AppText>
          <AppText variant="metadata" style={styles.notFoundCopy}>
            {SALE_NOT_FOUND_COPY}
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  const { sale } = entry;
  const client = sale.clientId === undefined ? undefined : getClientById(sale.clientId);
  const clientName = sale.clientId === undefined ? WALK_IN_SALE_LABEL : getResolvedClientDisplayName(client);
  const appointment = sale.appointmentId === undefined ? undefined : getAppointmentById(sale.appointmentId);
  const total = formatEuroCents(entry.totalCents);
  const when = formatSaleDateTime(sale.completedAt);
  const units = formatSaleUnitCount(entry.unitCount);

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea} testID="sale-detail-screen">
      <SaleHistoryTopBar />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppText accessibilityRole="header" variant="screenTitle">
          {SALE_DETAIL_TITLE}
        </AppText>

        <View
          accessible
          accessibilityLabel={`${SALE_CHANNEL_EYEBROWS[entry.channel]}, ${total}, ${when}, ${units}`}
          style={styles.summary}
          testID="sale-detail-summary"
        >
          <AppText variant="eyebrow" style={styles.eyebrow} testID="sale-detail-channel">
            {SALE_CHANNEL_EYEBROWS[entry.channel]}
          </AppText>
          <AppText selectable style={styles.total} testID="sale-detail-total" variant="display">
            {total}
          </AppText>
          <AppText variant="metadata" style={styles.when} testID="sale-detail-when">
            {when}
          </AppText>
          <AppText variant="metadata" style={styles.when} testID="sale-detail-units">
            {units}
          </AppText>
        </View>

        <GroupedSurface testID="sale-detail-client">
          <ClientRow
            name={clientName}
            onPress={
              client === undefined
                ? undefined
                : () => router.push({ pathname: '/clients/[clientId]', params: { clientId: client.id } })
            }
          />
        </GroupedSurface>

        <View style={styles.section}>
          <SectionHeader count={entry.unitCount} title="Produits" testID="sale-detail-products" />
          <GroupedSurface testID="sale-detail-lines">
            {sale.items.map((item, index) => (
              <View key={item.id}>
                {index > 0 && <GroupedSeparator inset={spacing.base} />}
                <SaleLine item={item} />
              </View>
            ))}
          </GroupedSurface>
        </View>

        <View style={styles.section}>
          <SectionHeader title="Encaissement" testID="sale-detail-payment-header" />
          <PaymentSection
            appointmentFound={appointment !== undefined}
            entry={entry}
            onOpenAppointment={
              appointment === undefined
                ? undefined
                : () =>
                    router.push({
                      pathname: '/appointments/[appointmentId]',
                      params: { appointmentId: appointment.appointment.id },
                    })
            }
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ClientRow({ name, onPress }: { readonly name: string; readonly onPress: (() => void) | undefined }) {
  const content = (
    <>
      <AppText variant="body" style={styles.rowLabel}>
        Client
      </AppText>
      <AppText variant="control" numberOfLines={1} style={styles.rowValue} testID="sale-detail-client-name">
        {name}
      </AppText>
      {onPress && <NavigationChevron />}
    </>
  );
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={`Client, ${name}`} style={styles.row} testID="sale-detail-client-row">
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityHint="Ouvre la fiche du client"
      accessibilityLabel={`Client, ${name}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      testID="sale-detail-client-row"
    >
      {content}
    </Pressable>
  );
}

/** One snapshot line: name, « ×2 · 25,00 € », the line total — exactly as sold. */
function SaleLine({ item }: { readonly item: SaleItem }) {
  const quantity = formatSaleQuantity(item.quantity);
  const unit = formatEuros(item.unitPrice);
  const lineTotal = formatEuroCents(getSaleTotalCents({ items: [item] }));
  return (
    <View
      accessible
      accessibilityLabel={`${item.productName}, ${quantity} à ${unit}, ${lineTotal}`}
      style={styles.line}
      testID={`sale-detail-line-${item.id}`}
    >
      <View style={styles.lineCopy}>
        <AppText variant="rowTitle" numberOfLines={2} style={styles.lineName}>
          {item.productName}
        </AppText>
        <AppText variant="metadata" style={styles.lineMeta}>
          {quantity} · {unit}
        </AppText>
      </View>
      <AppText variant="control" style={styles.lineTotal}>
        {lineTotal}
      </AppText>
    </View>
  );
}

interface PaymentSectionProps {
  readonly entry: SaleHistoryEntry;
  readonly appointmentFound: boolean;
  readonly onOpenAppointment: (() => void) | undefined;
}

function PaymentSection({ entry, appointmentFound, onOpenAppointment }: PaymentSectionProps) {
  const { sale } = entry;
  if (entry.paymentRecord === 'SALE_PAYMENT' && sale.payment) {
    const { payment } = sale;
    const received = payment.cardAmountCents + payment.cashAmountCents;
    const methods = [
      { method: 'CARD' as const, cents: payment.cardAmountCents },
      { method: 'CASH' as const, cents: payment.cashAmountCents },
    ].filter(({ cents }) => cents > 0);
    const paidOnAnotherDay = getCashRegisterDayKey(payment.paidAt) !== getCashRegisterDayKey(sale.completedAt);
    return (
      <GroupedSurface testID="sale-detail-payment">
        <GroupedReadRow label="Total reçu" testID="sale-detail-payment-total" value={formatEuroCents(received)} />
        {methods.map(({ method, cents }) => (
          <View key={method}>
            <GroupedSeparator inset={GROUPED_READ_ROW_SEPARATOR_INSET} />
            <GroupedReadRow
              label={paymentMethodLabels[method]}
              testID={`sale-detail-payment-${method.toLowerCase()}`}
              value={formatEuroCents(cents)}
            />
          </View>
        ))}
        {paidOnAnotherDay && (
          <>
            <GroupedSeparator inset={GROUPED_READ_ROW_SEPARATOR_INSET} />
            <GroupedReadRow
              label="Encaissé le"
              testID="sale-detail-payment-day"
              value={paymentDayFormatter.format(payment.paidAt)}
            />
          </>
        )}
      </GroupedSurface>
    );
  }

  if (entry.paymentRecord === 'APPOINTMENT_CHECKOUT') {
    return (
      <GroupedSurface testID="sale-detail-payment">
        <View accessible style={styles.note} testID="sale-detail-payment-note">
          <AppText variant="metadata" style={styles.noteText}>
            {SALE_PAID_WITH_APPOINTMENT_NOTE}
          </AppText>
        </View>
        <GroupedSeparator inset={spacing.base} />
        {onOpenAppointment && appointmentFound ? (
          <Pressable
            accessibilityHint="Ouvre le détail du rendez-vous"
            accessibilityLabel={OPEN_APPOINTMENT_LABEL}
            accessibilityRole="button"
            onPress={onOpenAppointment}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            testID="sale-detail-open-appointment"
          >
            <AppText variant="control" style={styles.linkLabel}>
              {OPEN_APPOINTMENT_LABEL}
            </AppText>
            <NavigationChevron />
          </Pressable>
        ) : (
          <View accessible style={styles.row} testID="sale-detail-appointment-missing">
            <AppText variant="metadata" style={styles.noteText}>
              {APPOINTMENT_MISSING_LABEL}
            </AppText>
          </View>
        )}
      </GroupedSurface>
    );
  }

  return (
    <GroupedSurface testID="sale-detail-payment">
      <View accessible style={styles.note} testID="sale-detail-payment-note">
        <AppText variant="metadata" style={styles.noteText}>
          {SALE_PAYMENT_UNKNOWN_NOTE}
        </AppText>
      </View>
    </GroupedSurface>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.screenWarm, flex: 1 },
  content: {
    gap: spacing.lg,
    paddingBottom: bottomClearance[Platform.OS === 'android' ? 'android' : 'ios'],
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.sm,
  },
  // The lavender summary surface of the Appointment payment summary.
  summary: {
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    gap: spacing.xs,
    padding: spacing.base,
  },
  eyebrow: { color: semanticColors.accent },
  total: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  when: { color: foregroundSoft },
  section: { gap: spacing.md },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 50,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  rowPressed: { backgroundColor: semanticColors.surfaceLavender },
  rowLabel: { color: foregroundSoft, width: 112 },
  rowValue: { color: semanticColors.foreground, flex: 1 },
  linkLabel: { color: semanticColors.accent, flex: 1 },
  line: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  lineCopy: { flex: 1, gap: 2, minWidth: 0 },
  lineName: { color: semanticColors.foreground },
  lineMeta: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  lineTotal: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  note: { paddingHorizontal: spacing.base, paddingVertical: spacing.md },
  noteText: { color: foregroundSoft },
  notFound: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  notFoundCopy: { color: foregroundSoft, marginTop: spacing.sm, textAlign: 'center' },
});
