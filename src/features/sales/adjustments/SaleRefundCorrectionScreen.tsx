// BeautIzzy — « Corriger un remboursement » (a SETTLED refund)
//
// A refund marked as paid is never cancelled by a tap. This screen asks what
// REALLY happened, in plain words, and records the matching compensation
// (docs/domain/SALES.md §15) — or nothing:
//
//   « Je l’ai saisi par erreur : l’argent n’a jamais été rendu »
//        → a « Correction de saisie » mirroring the refund ON THE SAME DAY, so that
//          day's Caisse reads what really happened; recorded today, both visible
//   « L’argent du remboursement m’a été rendu depuis »
//        → a « Remboursement rendu »: the whole refunded amount comes back on the
//          day it did, by the method(s) it ACTUALLY came back with — chosen here,
//          never assumed from the refund
//   « Le remboursement a bien eu lieu et reste acquis »
//        → nothing to record; the screen says so
//
// An ADDITIONAL refund (money really returned after a server refusal) never
// offers « saisi par erreur »: the professional already confirmed the money left.
//
// Two steps (what happened, then the review of every consequence), one explicit
// confirmation, one record id per presentation (a retry never duplicates).

import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { canReverseSaleAdjustment, getSaleAdjustmentAmountCents, isSaleRefundOutflow } from '@/domain/sales';
import { haptics } from '@/shared/lib/haptics';
import { formatEuroCents, parseEuroInputToCents } from '@/shared/lib/money';
import { createUuidV4 } from '@/shared/lib/uuid';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { GroupedSeparator, GroupedSurface } from '@/shared/ui/GroupedSurface';
import { GROUPED_READ_ROW_SEPARATOR_INSET, GroupedReadRow } from '@/shared/ui/GroupedReadRow';
import { MonthCalendarSheet } from '@/shared/ui/MonthCalendarSheet';
import { NavigationChevron } from '@/shared/ui/NavigationChevron';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { TextField } from '@/shared/ui/TextField';
import { bottomClearance, foregroundSoft, gutter, radii, rose, semanticColors, spacing } from '@/shared/ui/theme';

import { formatSaleQuantity } from '../presentation';
import { useSaleSession } from '../session/SaleSessionProvider';
import { SaleHistoryTopBar } from '../history/SaleHistoryTopBar';
import { getRefundInstant } from './form';
import {
  formatSaleAdjustmentDay,
  formatSaleAdjustmentMethods,
  REFUND_CORRECTION_MEANING_LABELS,
  REFUND_METHOD_LABELS,
  REFUND_METHOD_REQUIRED,
  REFUND_REALLY_PAID_NOTE,
  REFUND_SPLIT_MISMATCH,
  type RefundCorrectionMeaning,
  type RefundMethodChoice,
} from './presentation';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;
const MEANINGS: readonly RefundCorrectionMeaning[] = ['RECORDED_IN_ERROR', 'REFUND_RETURNED', 'REALLY_PAID'];
/**
 * An additional refund (money really returned after a server refusal) is never
 * « saisi par erreur »: the professional already confirmed the money left. Only
 * the client giving it back can compensate it.
 */
const ADDITIONAL_REFUND_MEANINGS: readonly RefundCorrectionMeaning[] = ['REFUND_RETURNED', 'REALLY_PAID'];
const METHODS: readonly RefundMethodChoice[] = ['CARD', 'CASH', 'MIXED'];

export const REFUND_CORRECTION_TITLE = 'Corriger un remboursement';
export const REFUND_CORRECTION_UNAVAILABLE = 'Ce remboursement ne peut plus être corrigé ici.';
export const REFUND_CORRECTION_ERROR =
  'La correction n’a pas pu être enregistrée : la vente ou le stock a changé entre-temps. Vérifiez puis recommencez.';

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function SaleRefundCorrectionScreen({ adjustmentId }: { readonly adjustmentId?: string }) {
  const router = useRouter();
  const { saleAdjustments, getSaleById, reverseSaleAdjustment } = useSaleSession();
  const [recordId] = useState(createUuidV4);
  const [meaning, setMeaning] = useState<RefundCorrectionMeaning>();
  const [method, setMethod] = useState<RefundMethodChoice>();
  const [cardText, setCardText] = useState('');
  const [cashText, setCashText] = useState('');
  const [returnDay, setReturnDay] = useState(() => startOfLocalDay(new Date()));
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [step, setStep] = useState<'edit' | 'review'>('edit');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const now = new Date();

  const target = saleAdjustments.find((candidate) => candidate.id === adjustmentId);
  const sale = target ? getSaleById(target.saleId) : undefined;
  const available =
    target !== undefined && target.refundedAt !== undefined && canReverseSaleAdjustment(target, saleAdjustments);

  if (!target || !sale || !available || !target.refundedAt) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea} testID="refund-correction-screen">
        <SaleHistoryTopBar />
        <View style={styles.unavailable} testID="refund-correction-unavailable">
          <AppText variant="metadata" style={styles.soft}>
            {REFUND_CORRECTION_UNAVAILABLE}
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  const refundedAt = target.refundedAt;
  const total = getSaleAdjustmentAmountCents(target);
  const additional = isSaleRefundOutflow(target);
  const meanings = additional ? ADDITIONAL_REFUND_MEANINGS : MEANINGS;
  const amounts =
    method === 'CARD'
      ? { card: total, cash: 0 }
      : method === 'CASH'
        ? { card: 0, cash: total }
        : method === 'MIXED'
          ? { card: parseEuroInputToCents(cardText), cash: parseEuroInputToCents(cashText) }
          : undefined;
  const splitValid =
    amounts !== undefined &&
    amounts.card !== undefined &&
    amounts.cash !== undefined &&
    amounts.card + amounts.cash === total;
  const returnedAt = getRefundInstant(returnDay, refundedAt, now);
  const restocked = target.items.filter((item) => item.restock);
  const issue =
    meaning === 'REFUND_RETURNED'
      ? method === undefined
        ? REFUND_METHOD_REQUIRED
        : !splitValid
          ? REFUND_SPLIT_MISMATCH
          : undefined
      : undefined;
  const canReview =
    (meaning === 'RECORDED_IN_ERROR' && !additional) || (meaning === 'REFUND_RETURNED' && issue === undefined);

  const confirm = () => {
    if (submitting || !meaning || meaning === 'REALLY_PAID') return;
    if (meaning === 'RECORDED_IN_ERROR' && additional) return;
    setSubmitting(true);
    setError(undefined);
    try {
      if (meaning === 'RECORDED_IN_ERROR') {
        reverseSaleAdjustment(target.id, { id: recordId, reason: 'RECORDED_IN_ERROR' });
      } else {
        reverseSaleAdjustment(target.id, {
          id: recordId,
          reason: 'REFUND_RETURNED',
          returnedAt,
          cardCents: amounts?.card ?? 0,
          cashCents: amounts?.cash ?? 0,
        });
      }
      haptics.success();
      router.back();
    } catch {
      setError(REFUND_CORRECTION_ERROR);
      setSubmitting(false);
    }
  };

  const stockSummary =
    restocked.length === 0
      ? 'Inchangé'
      : `${restocked.map((item) => `−${item.quantity} ${item.productName}`).join(', ')} : le produit est de nouveau compté comme vendu`;

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea} testID="refund-correction-screen">
      <SaleHistoryTopBar />
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleBlock}>
          <AppText accessibilityRole="header" variant="screenTitle">
            {REFUND_CORRECTION_TITLE}
          </AppText>
          <AppText variant="metadata" style={styles.soft} testID="refund-correction-context">
            {`${additional ? 'Remboursement supplémentaire' : 'Remboursement'} de ${formatEuroCents(total)} (${formatSaleAdjustmentMethods(target)}) le ${formatSaleAdjustmentDay(refundedAt)}`}
          </AppText>
          {target.items.length > 0 && (
            <AppText variant="metadata" style={styles.soft}>
              {target.items.map((item) => `${item.productName} ${formatSaleQuantity(item.quantity)}`).join(', ')}
            </AppText>
          )}
          <AppText variant="eyebrow" style={styles.step} testID="refund-correction-step">
            {step === 'edit' ? 'ÉTAPE 1 SUR 2 · QUE S’EST-IL PASSÉ ?' : 'ÉTAPE 2 SUR 2 · VÉRIFICATION'}
          </AppText>
        </View>

        {step === 'edit' ? (
          <>
            <GroupedSurface testID="refund-correction-meanings">
              {meanings.map((option, index) => (
                <View key={option}>
                  {index > 0 && <GroupedSeparator inset={spacing.base} />}
                  <RadioRow
                    label={REFUND_CORRECTION_MEANING_LABELS[option]}
                    onSelect={() => setMeaning(option)}
                    selected={meaning === option}
                    testID={`refund-correction-meaning-${option}`}
                  />
                </View>
              ))}
            </GroupedSurface>

            {meaning === 'REALLY_PAID' && (
              <Note testID="refund-correction-really-paid">{REFUND_REALLY_PAID_NOTE}</Note>
            )}

            {meaning === 'REFUND_RETURNED' && (
              <>
                <View style={styles.section}>
                  <SectionHeader title="Rendu comment ?" />
                  <AppText variant="metadata" style={styles.soft}>
                    {`Le montant entier, ${formatEuroCents(total)}. Indiquez le mode réellement utilisé, sans supposer qu’il est celui du remboursement.`}
                  </AppText>
                  <GroupedSurface testID="refund-correction-methods">
                    {METHODS.map((option, index) => (
                      <View key={option}>
                        {index > 0 && <GroupedSeparator inset={spacing.base} />}
                        <RadioRow
                          label={REFUND_METHOD_LABELS[option]}
                          onSelect={() => setMethod(option)}
                          selected={method === option}
                          testID={`refund-correction-method-${option}`}
                        />
                      </View>
                    ))}
                  </GroupedSurface>
                  {method === 'MIXED' && (
                    <>
                      <TextField
                        accessibilityLabel="Rendu par carte, en euros"
                        keyboardType="decimal-pad"
                        label="Carte"
                        onChangeText={setCardText}
                        placeholder="0,00"
                        suffix="€"
                        testID="refund-correction-card"
                        value={cardText}
                      />
                      <TextField
                        accessibilityLabel="Rendu en espèces, en euros"
                        keyboardType="decimal-pad"
                        label="Espèces"
                        onChangeText={setCashText}
                        placeholder="0,00"
                        suffix="€"
                        testID="refund-correction-cash"
                        value={cashText}
                      />
                    </>
                  )}
                </View>
                <GroupedSurface>
                  <Pressable
                    accessibilityHint="Choisir le jour où l’argent a été rendu"
                    accessibilityLabel={`Rendu le ${formatSaleAdjustmentDay(returnDay)}`}
                    accessibilityRole="button"
                    onPress={() => setCalendarVisible(true)}
                    style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                    testID="refund-correction-day"
                  >
                    <AppText variant="body" style={styles.rowLabel}>
                      Rendu le
                    </AppText>
                    <AppText variant="control" style={styles.rowValue}>
                      {formatSaleAdjustmentDay(returnDay)}
                    </AppText>
                    <NavigationChevron />
                  </Pressable>
                </GroupedSurface>
                {issue && (
                  <AppText variant="metadata" style={styles.issue} testID="refund-correction-issue">
                    {issue}
                  </AppText>
                )}
              </>
            )}

            {meaning !== 'REALLY_PAID' && (
              <AppButton
                disabled={!canReview}
                onPress={() => setStep('review')}
                testID="refund-correction-review"
                title="Vérifier"
              />
            )}
          </>
        ) : (
          <>
            <GroupedSurface testID="refund-correction-summary">
              <GroupedReadRow
                label="Enregistré"
                testID="refund-correction-summary-record"
                value={
                  meaning === 'RECORDED_IN_ERROR'
                    ? `Correction de saisie +${formatEuroCents(total)}, datée du ${formatSaleAdjustmentDay(refundedAt)}`
                    : `Remboursement rendu +${formatEuroCents(total)}`
                }
              />
              <GroupedSeparator inset={GROUPED_READ_ROW_SEPARATOR_INSET} />
              <GroupedReadRow
                label="Caisse"
                testID="refund-correction-summary-cash"
                value={
                  meaning === 'RECORDED_IN_ERROR'
                    ? `Le ${formatSaleAdjustmentDay(refundedAt)} ne compte plus ce remboursement : les deux écritures restent visibles et s’annulent`
                    : `+${formatEuroCents(total)} le ${formatSaleAdjustmentDay(returnedAt)} (${formatSaleAdjustmentMethods({
                        refundCardCents: amounts?.card ?? 0,
                        refundCashCents: amounts?.cash ?? 0,
                      })})`
                }
              />
              <GroupedSeparator inset={GROUPED_READ_ROW_SEPARATOR_INSET} />
              <GroupedReadRow label="Stock" testID="refund-correction-summary-stock" value={stockSummary} />
            </GroupedSurface>
            <Note>Le remboursement d’origine reste visible avec ses dates.</Note>
            {error && (
              <AppText accessibilityLiveRegion="assertive" variant="metadata" style={styles.issue} testID="refund-correction-error">
                {error}
              </AppText>
            )}
            <View style={styles.actions}>
              <AppButton
                disabled={submitting}
                onPress={confirm}
                testID="refund-correction-confirm"
                title={meaning === 'RECORDED_IN_ERROR' ? 'Confirmer la correction de saisie' : 'Confirmer l’argent rendu'}
              />
              <AppButton
                disabled={submitting}
                onPress={() => setStep('edit')}
                testID="refund-correction-back"
                title="Modifier"
                variant="secondary"
              />
            </View>
          </>
        )}
      </ScrollView>

      <MonthCalendarSheet
        day={returnDay}
        onClose={() => setCalendarVisible(false)}
        onSelect={(day) => {
          const earliest = startOfLocalDay(refundedAt).getTime();
          const latest = startOfLocalDay(new Date()).getTime();
          setReturnDay(new Date(Math.min(Math.max(startOfLocalDay(day).getTime(), earliest), latest)));
          setCalendarVisible(false);
        }}
        testID="refund-correction-calendar"
        today={startOfLocalDay(now)}
        visible={calendarVisible}
      />
    </SafeAreaView>
  );
}

function Note({ children, testID }: { readonly children: string; readonly testID?: string }) {
  return (
    <View style={styles.note} testID={testID}>
      <SymbolView name={{ ios: 'info.circle', android: 'info' }} size={14} tintColor={foregroundSoft} />
      <AppText variant="metadata" style={styles.noteText}>
        {children}
      </AppText>
    </View>
  );
}

function RadioRow({
  label,
  selected,
  onSelect,
  testID,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly testID: string;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onSelect}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      testID={testID}
    >
      <AppText variant="body" style={styles.radioLabel}>
        {label}
      </AppText>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected && <SymbolView name={{ ios: 'checkmark', android: 'check' }} size={12} tintColor={semanticColors.onAccent} />}
      </View>
    </Pressable>
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
  titleBlock: { gap: spacing.xs },
  step: { color: semanticColors.accent, marginTop: spacing.xs },
  soft: { color: foregroundSoft },
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
  radioLabel: { color: semanticColors.foreground, flex: 1 },
  radio: {
    alignItems: 'center',
    borderColor: semanticColors.borderLavender,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  radioSelected: { backgroundColor: semanticColors.accent, borderColor: semanticColors.accent },
  note: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  noteText: { color: foregroundSoft, flex: 1 },
  issue: { color: rose.rose600 },
  actions: { gap: spacing.sm },
  unavailable: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
});
