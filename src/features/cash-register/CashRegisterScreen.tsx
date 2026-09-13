// Souris — Caisse (Cash Register)
//
// In ONE glance: the money received on the selected local day or calendar
// month, split by card and cash. Derived on every render from the canonical
// sessions — explicit Appointment checkouts (`appointment.payment`) plus
// standalone Sale payments (`sale.payment`, Sales without Appointment).
// A Sale sold during an Appointment is never counted separately: the
// Appointment checkout already recorded that money. Nothing is stored,
// cached or charted.

import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getCashRegisterDaySummary,
  getCashRegisterMonthSummary,
  type CashRegisterSummary,
} from '@/domain/cash-register';
import { useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import { useSaleSession } from '@/features/sales/session/SaleSessionProvider';
import {
  paymentMethodIcons,
  paymentMethodLabels,
  type PaymentMethod,
} from '@/shared/icons/payment-method-icons';
import { formatEuroCents } from '@/shared/lib/money';
import { AppText } from '@/shared/ui/AppText';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import {
  foregroundSoft,
  gutter,
  interaction,
  lavender,
  radii,
  semanticColors,
  spacing,
  touchTarget,
} from '@/shared/ui/theme';

import { CashRegisterDayPicker } from './components/CashRegisterDayPicker';
import {
  formatCashRegisterCaption,
  formatCashRegisterDay,
  formatCashRegisterMonth,
  formatCheckoutCount,
  isSameLocalDay,
  isSameLocalMonth,
  shiftLocalDay,
  shiftLocalMonth,
  startOfLocalDay,
  startOfLocalMonth,
  type CashRegisterPeriod,
} from './presentation';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

const PERIOD_OPTIONS = [
  { value: 'day', label: 'Jour' },
  { value: 'month', label: 'Mois' },
] as const;

export function CashRegisterScreen() {
  const router = useRouter();
  const { appointments } = useAppointmentSession();
  const { sales } = useSaleSession();
  const [period, setPeriod] = useState<CashRegisterPeriod>('day');
  const [selectedDay, setSelectedDay] = useState(() => startOfLocalDay(new Date()));
  const [selectedMonth, setSelectedMonth] = useState(() => startOfLocalMonth(new Date()));
  const [dayPickerVisible, setDayPickerVisible] = useState(false);

  const now = new Date();
  const sources = { appointments: appointments.map(({ appointment }) => appointment), sales };
  const summary: CashRegisterSummary =
    period === 'day'
      ? getCashRegisterDaySummary(sources, selectedDay)
      : getCashRegisterMonthSummary(sources, selectedMonth);
  const periodLabel =
    period === 'day' ? formatCashRegisterDay(selectedDay) : formatCashRegisterMonth(selectedMonth);
  const isCurrentPeriod =
    period === 'day' ? isSameLocalDay(selectedDay, now) : isSameLocalMonth(selectedMonth, now);

  const shift = (amount: number) => {
    if (period === 'day') {
      setSelectedDay((current) => shiftLocalDay(current, amount));
    } else {
      setSelectedMonth((current) => shiftLocalMonth(current, amount));
    }
  };

  const goToCurrent = () => {
    if (period === 'day') {
      setSelectedDay(startOfLocalDay(new Date()));
    } else {
      setSelectedMonth(startOfLocalMonth(new Date()));
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea} testID="cash-register-screen">
      <View style={styles.topBar}>
        <Pressable
          accessibilityLabel="Retour"
          accessibilityRole="button"
          hitSlop={spacing.sm}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressedControl]}
        >
          <SymbolView
            name={{ ios: 'chevron.left', android: 'arrow_back' }}
            size={18}
            tintColor={semanticColors.foreground}
          />
        </Pressable>
        <AppText variant="eyebrow" style={styles.eyebrow}>
          GESTION
        </AppText>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppText accessibilityRole="header" variant="screenTitle">
          Caisse
        </AppText>

        <SegmentedControl
          onChange={setPeriod}
          options={PERIOD_OPTIONS}
          testID="cash-register-period"
          value={period}
        />

        <View style={styles.navigation}>
          <Pressable
            accessibilityLabel={period === 'day' ? 'Jour précédent' : 'Mois précédent'}
            accessibilityRole="button"
            hitSlop={6}
            onPress={() => shift(-1)}
            style={({ pressed }) => [styles.navControl, pressed && styles.pressedControl]}
            testID="cash-register-previous"
          >
            <SymbolView
              name={{ ios: 'chevron.left', android: 'chevron_left' }}
              size={16}
              tintColor={semanticColors.foreground}
            />
          </Pressable>
          <View style={styles.periodCopy}>
            {period === 'day' ? (
              <Pressable
                accessibilityHint="Choisir un autre jour"
                accessibilityLabel={periodLabel}
                accessibilityRole="button"
                onPress={() => setDayPickerVisible(true)}
                style={({ pressed }) => [styles.periodAction, pressed && styles.pressedControl]}
                testID="cash-register-pick-day"
              >
                <AppText variant="control" numberOfLines={1} style={styles.periodLabel} testID="cash-register-period-label">
                  {periodLabel}
                </AppText>
              </Pressable>
            ) : (
              <AppText variant="control" numberOfLines={1} style={styles.periodLabel} testID="cash-register-period-label">
                {periodLabel}
              </AppText>
            )}
            {!isCurrentPeriod && (
              <Pressable
                accessibilityLabel={period === 'day' ? "Aujourd'hui" : 'Ce mois-ci'}
                accessibilityRole="button"
                onPress={goToCurrent}
                style={({ pressed }) => [styles.currentShortcut, pressed && styles.pressedControl]}
                testID="cash-register-current"
              >
                <AppText variant="metadata" style={styles.currentShortcutText}>
                  {period === 'day' ? 'Aujourd’hui' : 'Ce mois-ci'}
                </AppText>
              </Pressable>
            )}
          </View>
          <Pressable
            accessibilityLabel={period === 'day' ? 'Jour suivant' : 'Mois suivant'}
            accessibilityRole="button"
            hitSlop={6}
            onPress={() => shift(1)}
            style={({ pressed }) => [styles.navControl, pressed && styles.pressedControl]}
            testID="cash-register-next"
          >
            <SymbolView
              name={{ ios: 'chevron.right', android: 'chevron_right' }}
              size={16}
              tintColor={semanticColors.foreground}
            />
          </Pressable>
        </View>

        <View style={styles.totalCard} testID="cash-register-total-card">
          <AppText
            accessibilityLabel={`${formatEuroCents(summary.totalCents)} ${formatCashRegisterCaption(period, isCurrentPeriod)}`}
            selectable
            style={styles.totalValue}
            testID="cash-register-total"
            variant="display"
          >
            {formatEuroCents(summary.totalCents)}
          </AppText>
          <AppText variant="control" style={styles.totalCaption} testID="cash-register-caption">
            {formatCashRegisterCaption(period, isCurrentPeriod)}
          </AppText>
          <AppText variant="metadata" style={styles.checkoutCount} testID="cash-register-count">
            {formatCheckoutCount(summary.checkoutCount)}
          </AppText>
        </View>

        <View style={styles.methods}>
          <MethodCard cents={summary.cardCents} method="CARD" />
          <MethodCard cents={summary.cashCents} method="CASH" />
        </View>
      </ScrollView>

      <CashRegisterDayPicker
        day={selectedDay}
        onClose={() => setDayPickerVisible(false)}
        onSelect={(day) => {
          setSelectedDay(day);
          setDayPickerVisible(false);
        }}
        visible={dayPickerVisible}
      />
    </SafeAreaView>
  );
}

function MethodCard({ method, cents }: { readonly method: PaymentMethod; readonly cents: number }) {
  const label = paymentMethodLabels[method];
  return (
    <View
      accessible
      accessibilityLabel={`${label} ${formatEuroCents(cents)}`}
      style={styles.methodCard}
      testID={`cash-register-${method.toLowerCase()}`}
    >
      <View style={styles.methodIcon}>
        <SymbolView name={paymentMethodIcons[method]} size={18} tintColor={semanticColors.accent} />
      </View>
      <AppText variant="metadata" style={styles.methodLabel}>
        {label}
      </AppText>
      <AppText variant="summaryValue" selectable style={styles.methodValue}>
        {formatEuroCents(cents)}
      </AppText>
    </View>
  );
}

const minimumTouchTarget = touchTarget[Platform.OS === 'android' ? 'android' : 'ios'];

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.screenWarm, flex: 1 },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: horizontalGutter,
    paddingVertical: spacing.sm,
  },
  backButton: {
    alignItems: 'center',
    height: minimumTouchTarget,
    justifyContent: 'center',
    width: minimumTouchTarget,
  },
  eyebrow: { color: semanticColors.accent },
  pressedControl: { opacity: interaction.pressedOpacity, transform: [{ scale: interaction.pressedScale }] },
  content: {
    gap: spacing.lg,
    paddingBottom: spacing['3xl'],
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.sm,
  },
  navigation: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  navControl: {
    alignItems: 'center',
    backgroundColor: semanticColors.surface,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    height: minimumTouchTarget,
    justifyContent: 'center',
    width: minimumTouchTarget,
  },
  periodCopy: { alignItems: 'center', flex: 1, gap: 2, minWidth: 0 },
  periodAction: { justifyContent: 'center', minHeight: minimumTouchTarget, paddingHorizontal: spacing.sm },
  periodLabel: { color: semanticColors.foreground, textAlign: 'center' },
  currentShortcut: { paddingHorizontal: spacing.sm, paddingVertical: 2 },
  currentShortcutText: { color: semanticColors.accent },
  totalCard: {
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  totalValue: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  totalCaption: { color: lavender.lav700 },
  checkoutCount: { color: foregroundSoft },
  methods: { flexDirection: 'row', gap: spacing.sm },
  methodCard: {
    backgroundColor: semanticColors.surface,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
    padding: spacing.base,
  },
  methodIcon: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    height: 36,
    justifyContent: 'center',
    marginBottom: spacing.xs,
    width: 36,
  },
  methodLabel: { color: foregroundSoft },
  methodValue: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
});
