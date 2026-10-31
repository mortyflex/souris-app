// BeautIzzy — correct or refund a Sale (two steps: enter, then review)
//
//   Sale « Actions » → « Rembourser » / « Corriger une erreur » / « Rembourser intégralement »
//   → 1. Saisie : why, which units (and whether they physically went back to
//        stock), how much money by which method, already given back (on which
//        day) or still to give back, an optional note
//   → 2. Vérification : every financial and stock consequence in words
//   → « Confirmer » → the Sale detail, which now lists the record
//
// Nothing is written before « Confirmer ». The record id is created ONCE per
// presentation of this screen, so a double tap or a retry can never record the
// same correction twice (the store refuses the second id). Everything shown is
// derived from the Sale snapshot and the domain rules — the same ones the store
// re-runs in its transaction. BeautIzzy records the refund; it never moves money.

import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getSaleAdjustmentEligibility,
  getSaleAdjustmentPosition,
  validateSaleAdjustmentDraft,
  type SaleAdjustmentIssue,
  type SaleAdjustmentLinePosition,
  type SaleAdjustmentReason,
} from '@/domain/sales';
import { getResolvedClientDisplayName } from '@/features/clients/presentation';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import { useProductCatalog } from '@/features/products/session/ProductCatalogProvider';
import { haptics } from '@/shared/lib/haptics';
import { formatEuroCents, formatEuros } from '@/shared/lib/money';
import { createUuidV4 } from '@/shared/lib/uuid';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { GroupedSeparator, GroupedSurface } from '@/shared/ui/GroupedSurface';
import { GROUPED_READ_ROW_SEPARATOR_INSET, GroupedReadRow } from '@/shared/ui/GroupedReadRow';
import { MonthCalendarSheet } from '@/shared/ui/MonthCalendarSheet';
import { NavigationChevron } from '@/shared/ui/NavigationChevron';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { TextField } from '@/shared/ui/TextField';
import { bottomClearance, foregroundSoft, gutter, radii, rose, semanticColors, spacing } from '@/shared/ui/theme';

import { formatSaleDate, formatSaleQuantity } from '../presentation';
import { useSaleSession } from '../session/SaleSessionProvider';
import { WALK_IN_SALE_LABEL } from '../history/SaleHistoryRow';
import { SaleHistoryTopBar } from '../history/SaleHistoryTopBar';
import {
  createAdjustmentForm,
  getAdjustmentAmounts,
  getOriginalPaymentMethods,
  getAmountText,
  getRefundInstant,
  toSaleAdjustmentDraft,
  updateLineQuantity,
  type AdjustmentForm,
} from './form';
import {
  describeOriginalPayment,
  describeSaleAdjustmentIssue,
  REFUND_METHOD_LABELS,
  REFUND_METHOD_REQUIRED,
  formatSaleAdjustmentDay,
  SALE_ADJUSTMENT_INTENT_REASONS,
  SALE_ADJUSTMENT_INTENT_TITLES,
  SALE_ADJUSTMENT_RESTOCK_NOTE,
  SALE_ADJUSTMENT_NO_MONEY_NOTE,
  SALE_ADJUSTMENT_NO_TRANSFER_NOTE,
  SALE_ADJUSTMENT_ORIGINAL_KEPT_NOTE,
  SALE_ADJUSTMENT_OTHER_DEVICE_NOTE,
  SALE_ADJUSTMENT_PENDING_NOTE,
  SALE_ADJUSTMENT_REASON_LABELS,
  SALE_ADJUSTMENT_REVENTE_NOTE,
  type SaleAdjustmentIntent,
} from './presentation';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

const REFUND_METHODS = ['CARD', 'CASH', 'MIXED'] as const;

const SETTLEMENT_OPTIONS = [
  { value: 'SETTLED', label: 'Déjà remboursé' },
  { value: 'PENDING', label: 'À rembourser' },
] as const;

export const SALE_ADJUSTMENT_STORE_ERROR =
  'Cette correction n’a pas pu être enregistrée : la vente a changé entre-temps. Vérifiez-la puis recommencez.';

interface SaleAdjustmentScreenProps {
  readonly saleId?: string;
  readonly intent: SaleAdjustmentIntent;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function SaleAdjustmentScreen({ saleId, intent }: SaleAdjustmentScreenProps) {
  const router = useRouter();
  const { getSaleById, saleAdjustments, recordSaleAdjustment, isAppointmentSettled } = useSaleSession();
  const { products } = useProductCatalog();
  const { getClientById } = useClientSession();
  const { getAppointmentById, deposits } = useAppointmentSession();
  // ONE id per presentation: a second tap or a retry can never record twice.
  const [adjustmentId] = useState(createUuidV4);
  const sale = getSaleById(saleId);
  const productExists = (productId: string) => products.some((product) => product.id === productId);
  // The initial choices follow the Sale until the professional edits anything
  // (a Sale that arrives after the screen mounted — a pull — still opens prefilled).
  // How the original money reliably came in (never the refund method itself).
  const originalMethods = sale
    ? getOriginalPaymentMethods(
        sale,
        sale.appointmentId === undefined
          ? undefined
          : {
              payment: getAppointmentById(sale.appointmentId)?.appointment.payment,
              activeDepositMethods: deposits
                .filter((deposit) => deposit.appointmentId === sale.appointmentId && deposit.status === 'ACTIVE')
                .map((deposit) => deposit.paymentMethod),
            },
      )
    : undefined;
  const [editedForm, setForm] = useState<AdjustmentForm>();
  const form =
    editedForm ??
    (sale ? createAdjustmentForm(intent, sale, saleAdjustments, new Date(), originalMethods) : undefined);
  const [step, setStep] = useState<'edit' | 'review'>('edit');
  const [submitting, setSubmitting] = useState(false);
  const [storeError, setStoreError] = useState<string>();
  const [calendarVisible, setCalendarVisible] = useState(false);
  const now = new Date();

  const position = sale ? getSaleAdjustmentPosition(sale, saleAdjustments) : undefined;

  if (!sale || !form || !position) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea} testID="sale-adjustment-screen">
        <SaleHistoryTopBar />
        <View style={styles.notFound}>
          <AppText variant="stateTitle">Vente introuvable</AppText>
        </View>
      </SafeAreaView>
    );
  }

  const appointmentSettled = sale.appointmentId === undefined || isAppointmentSettled(sale.appointmentId);
  const eligibility = getSaleAdjustmentEligibility(sale, appointmentSettled);
  const amounts = getAdjustmentAmounts(form, sale, position);
  const draft = toSaleAdjustmentDraft(form, amounts, adjustmentId, sale, now);
  const issues: readonly SaleAdjustmentIssue[] = validateSaleAdjustmentDraft(
    { sale, adjustments: saleAdjustments, appointmentSettled, productExists, now },
    { ...draft, businessId: sale.businessId, staffMemberId: 'review' },
  );
  const amountCents = amounts.totalCents ?? 0;
  // The method issues, in words; the domain's « Montant invalide » is then redundant.
  const methodIssue = amounts.methodMissing
    ? REFUND_METHOD_REQUIRED
    : amounts.splitInvalid
      ? 'Indiquez les montants rendus par carte et en espèces.'
      : undefined;
  const shownIssues = methodIssue ? issues.filter((issue) => issue.kind !== 'INVALID_AMOUNT') : issues;
  const blocked = issues.length > 0 || methodIssue !== undefined;
  const noMoney = position.baseCents === 0;
  const nameOf = (saleItemId: string) => sale.items.find((item) => item.id === saleItemId)?.productName;
  const clientName =
    sale.clientId === undefined ? WALK_IN_SALE_LABEL : getResolvedClientDisplayName(getClientById(sale.clientId));
  const affected = position.lines.filter((line) => (form.lines[line.saleItemId]?.quantity ?? 0) > 0);
  const restocked = affected.filter((line) => form.lines[line.saleItemId]?.restock);
  const settled = form.settlement === 'SETTLED' || amountCents === 0;
  const refundInstant = getRefundInstant(form.refundDay, sale.completedAt, now);

  const update = (next: AdjustmentForm) => {
    setStoreError(undefined);
    setForm(next);
  };

  const confirm = () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = recordSaleAdjustment(sale.id, toSaleAdjustmentDraft(form, amounts, adjustmentId, sale, new Date()));
      if (!result.ok) {
        setStep('edit');
        setSubmitting(false);
        return;
      }
      haptics.success();
      router.back();
    } catch {
      setStoreError(SALE_ADJUSTMENT_STORE_ERROR);
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea} testID="sale-adjustment-screen">
      <SaleHistoryTopBar />
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleBlock}>
          <AppText accessibilityRole="header" variant="screenTitle">
            {SALE_ADJUSTMENT_INTENT_TITLES[intent]}
          </AppText>
          <AppText variant="metadata" style={styles.soft} testID="sale-adjustment-context">
            {`Vente du ${formatSaleDate(sale.completedAt)} · ${clientName}`}
          </AppText>
          <AppText variant="eyebrow" style={styles.step} testID="sale-adjustment-step">
            {step === 'edit' ? 'ÉTAPE 1 SUR 2 · SAISIE' : 'ÉTAPE 2 SUR 2 · VÉRIFICATION'}
          </AppText>
        </View>

        {!eligibility.ok ? (
          <Note testID="sale-adjustment-not-eligible">{describeSaleAdjustmentIssue({ kind: 'NOT_ELIGIBLE', reason: eligibility.reason })}</Note>
        ) : step === 'edit' ? (
          <>
            <View style={styles.section}>
              <SectionHeader title="Raison" />
              <GroupedSurface testID="sale-adjustment-reasons">
                {SALE_ADJUSTMENT_INTENT_REASONS[intent].map((reason, index) => (
                  <View key={reason}>
                    {index > 0 && <GroupedSeparator inset={spacing.base} />}
                    <ReasonRow
                      onSelect={() => update({ ...form, reason })}
                      reason={reason}
                      selected={form.reason === reason}
                    />
                  </View>
                ))}
              </GroupedSurface>
            </View>

            <View style={styles.section}>
              <SectionHeader title="Produits concernés" />
              <GroupedSurface testID="sale-adjustment-lines">
                {position.lines.map((line, index) => (
                  <View key={line.saleItemId}>
                    {index > 0 && <GroupedSeparator inset={spacing.base} />}
                    <LineEditor
                      line={line}
                      onQuantity={(quantity) =>
                        update(updateLineQuantity(form, line.saleItemId, quantity, productExists(line.item.productId)))
                      }
                      onRestock={(restock) =>
                        update({
                          ...form,
                          lines: { ...form.lines, [line.saleItemId]: { ...form.lines[line.saleItemId]!, restock } },
                        })
                      }
                      productAvailable={productExists(line.item.productId)}
                      quantity={form.lines[line.saleItemId]?.quantity ?? 0}
                      restock={form.lines[line.saleItemId]?.restock ?? false}
                    />
                  </View>
                ))}
              </GroupedSurface>
              <AppText variant="metadata" style={styles.soft} testID="sale-adjustment-restock-note">
                {SALE_ADJUSTMENT_RESTOCK_NOTE}
              </AppText>
            </View>

            <View style={styles.section}>
              <SectionHeader title="Montant remboursé" />
              {noMoney ? (
                <Note testID="sale-adjustment-no-money">{SALE_ADJUSTMENT_NO_MONEY_NOTE}</Note>
              ) : (
                <>
                  <AppText variant="metadata" style={styles.soft} testID="sale-adjustment-remaining">
                    {`Encore remboursable : ${formatEuroCents(position.remainingCents)} sur ${formatEuroCents(position.baseCents)}`}
                  </AppText>
                  {form.method !== 'MIXED' && (
                    <TextField
                      accessibilityLabel="Montant remboursé, en euros"
                      keyboardType="decimal-pad"
                      label="Montant remboursé"
                      onChangeText={(text) => update({ ...form, amountText: text })}
                      placeholder="0,00"
                      suffix="€"
                      testID="sale-adjustment-amount"
                      value={getAmountText(form.amountText, amounts.totalCents)}
                    />
                  )}
                  <AppText variant="control" style={styles.subheading}>
                    Mode de remboursement réellement utilisé
                  </AppText>
                  <AppText variant="metadata" style={styles.soft} testID="sale-adjustment-original-method">
                    {describeOriginalPayment(originalMethods)}
                  </AppText>
                  <GroupedSurface testID="sale-adjustment-methods">
                    {REFUND_METHODS.map((method, index) => (
                      <View key={method}>
                        {index > 0 && <GroupedSeparator inset={spacing.base} />}
                        <RadioRow
                          label={REFUND_METHOD_LABELS[method]}
                          onSelect={() =>
                            update({
                              ...form,
                              method,
                              ...(method === 'MIXED' ? { cardText: '', cashText: '' } : {}),
                            })
                          }
                          selected={form.method === method}
                          testID={`sale-adjustment-method-${method}`}
                        />
                      </View>
                    ))}
                  </GroupedSurface>
                  {form.method === 'MIXED' && (
                    <>
                      <TextField
                        accessibilityLabel="Remboursé par carte, en euros"
                        keyboardType="decimal-pad"
                        label="Carte"
                        onChangeText={(text) => update({ ...form, cardText: text })}
                        placeholder="0,00"
                        suffix="€"
                        testID="sale-adjustment-card"
                        value={form.cardText ?? ''}
                      />
                      <TextField
                        accessibilityLabel="Remboursé en espèces, en euros"
                        keyboardType="decimal-pad"
                        label="Espèces"
                        onChangeText={(text) => update({ ...form, cashText: text })}
                        placeholder="0,00"
                        suffix="€"
                        testID="sale-adjustment-cash"
                        value={form.cashText ?? ''}
                      />
                    </>
                  )}
                  {form.method === 'MIXED' ? null : amounts.suggested ? (
                    <AppText variant="metadata" style={styles.soft}>
                      Montant proposé d’après les produits choisis. Vous pouvez le modifier.
                    </AppText>
                  ) : (
                    <AppButton
                      onPress={() => update({ ...form, amountText: undefined })}
                      testID="sale-adjustment-suggested"
                      title="Reprendre le montant proposé"
                      variant="tertiary"
                    />
                  )}
                </>
              )}
            </View>

            {!noMoney && amountCents > 0 && (
              <View style={styles.section}>
                <SectionHeader title="L’argent a-t-il été rendu ?" />
                <SegmentedControl
                  onChange={(settlement) => update({ ...form, settlement })}
                  options={SETTLEMENT_OPTIONS}
                  stretch
                  testID="sale-adjustment-settlement"
                  value={form.settlement}
                />
                {form.settlement === 'SETTLED' ? (
                  <GroupedSurface>
                    <Pressable
                      accessibilityHint="Choisir le jour où l’argent a été rendu"
                      accessibilityLabel={`Remboursé le ${formatSaleAdjustmentDay(form.refundDay)}`}
                      accessibilityRole="button"
                      onPress={() => setCalendarVisible(true)}
                      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                      testID="sale-adjustment-refund-day"
                    >
                      <AppText variant="body" style={styles.rowLabel}>
                        Remboursé le
                      </AppText>
                      <AppText variant="control" style={styles.rowValue}>
                        {formatSaleAdjustmentDay(form.refundDay)}
                      </AppText>
                      <NavigationChevron />
                    </Pressable>
                  </GroupedSurface>
                ) : (
                  <Note testID="sale-adjustment-pending-note">{SALE_ADJUSTMENT_PENDING_NOTE}</Note>
                )}
              </View>
            )}

            <TextField
              accessibilityLabel="Note, facultative"
              label="Note (facultatif)"
              maxLength={500}
              multiline
              onChangeText={(note) => update({ ...form, note })}
              placeholder="Ex. : shampooing compté deux fois"
              testID="sale-adjustment-note"
              value={form.note}
            />

            {(shownIssues.length > 0 || methodIssue) && (
              <View accessibilityLiveRegion="polite" style={styles.issues} testID="sale-adjustment-issues">
                {methodIssue && amountCents > 0 && (
                  <AppText variant="metadata" style={styles.issue} testID="sale-adjustment-method-issue">
                    {methodIssue}
                  </AppText>
                )}
                {shownIssues
                  .filter((issue) => issue.kind !== 'EMPTY')
                  .map((issue, index) => (
                    <AppText key={`${issue.kind}-${index}`} variant="metadata" style={styles.issue}>
                      {describeSaleAdjustmentIssue(issue, nameOf)}
                    </AppText>
                  ))}
              </View>
            )}

            <AppButton
              disabled={blocked}
              onPress={() => setStep('review')}
              testID="sale-adjustment-review"
              title="Vérifier"
            />
          </>
        ) : (
          <>
            <GroupedSurface testID="sale-adjustment-summary">
              <GroupedReadRow label="Raison" value={SALE_ADJUSTMENT_REASON_LABELS[form.reason]} />
              <GroupedSeparator inset={GROUPED_READ_ROW_SEPARATOR_INSET} />
              <GroupedReadRow
                label="Produits"
                testID="sale-adjustment-summary-lines"
                value={
                  affected.length === 0
                    ? 'Aucune unité (remboursement seul)'
                    : affected
                        .map((line) => `${line.item.productName} ${formatSaleQuantity(form.lines[line.saleItemId]!.quantity)}`)
                        .join(', ')
                }
              />
              <GroupedSeparator inset={GROUPED_READ_ROW_SEPARATOR_INSET} />
              <GroupedReadRow
                label="Remboursement"
                testID="sale-adjustment-summary-amount"
                value={
                  amountCents === 0
                    ? 'Aucun'
                    : [
                        formatEuroCents(amountCents),
                        (amounts.cardCents ?? 0) > 0 ? `carte ${formatEuroCents(amounts.cardCents ?? 0)}` : '',
                        (amounts.cashCents ?? 0) > 0 ? `espèces ${formatEuroCents(amounts.cashCents ?? 0)}` : '',
                        'mode confirmé',
                      ]
                        .filter(Boolean)
                        .join(' · ')
                }
              />
              {amountCents > 0 && (
                <>
                  <GroupedSeparator inset={GROUPED_READ_ROW_SEPARATOR_INSET} />
                  <GroupedReadRow
                    label="Caisse"
                    testID="sale-adjustment-summary-cash"
                    value={
                      settled
                        ? `−${formatEuroCents(amountCents)} le ${formatSaleAdjustmentDay(refundInstant)}`
                        : 'Rien tant que le remboursement n’est pas effectué'
                    }
                  />
                </>
              )}
              <GroupedSeparator inset={GROUPED_READ_ROW_SEPARATOR_INSET} />
              <GroupedReadRow
                label="Stock"
                testID="sale-adjustment-summary-stock"
                value={
                  restocked.length === 0
                    ? 'Inchangé'
                    : restocked
                        .map((line) => `+${form.lines[line.saleItemId]!.quantity} ${line.item.productName}`)
                        .join(', ')
                }
              />
              {form.note.trim().length > 0 && (
                <>
                  <GroupedSeparator inset={GROUPED_READ_ROW_SEPARATOR_INSET} />
                  <GroupedReadRow label="Note" value={form.note.trim()} />
                </>
              )}
            </GroupedSurface>

            <View style={styles.notes}>
              <Note>{SALE_ADJUSTMENT_ORIGINAL_KEPT_NOTE}</Note>
              {sale.appointmentId !== undefined && amountCents > 0 && <Note>{SALE_ADJUSTMENT_REVENTE_NOTE}</Note>}
              {amountCents > 0 && <Note testID="sale-adjustment-no-transfer">{SALE_ADJUSTMENT_NO_TRANSFER_NOTE}</Note>}
              {amountCents > 0 && (
                <Note testID="sale-adjustment-other-device">{SALE_ADJUSTMENT_OTHER_DEVICE_NOTE}</Note>
              )}
            </View>

            {storeError && (
              <AppText accessibilityLiveRegion="assertive" variant="metadata" style={styles.issue} testID="sale-adjustment-error">
                {storeError}
              </AppText>
            )}

            <View style={styles.actions}>
              <AppButton
                disabled={submitting}
                onPress={confirm}
                testID="sale-adjustment-confirm"
                title={amountCents > 0 && settled ? `Confirmer le remboursement de ${formatEuroCents(amountCents)}` : 'Confirmer'}
              />
              <AppButton
                disabled={submitting}
                onPress={() => setStep('edit')}
                testID="sale-adjustment-back"
                title="Modifier"
                variant="secondary"
              />
            </View>
          </>
        )}
      </ScrollView>

      <MonthCalendarSheet
        day={form.refundDay}
        onClose={() => setCalendarVisible(false)}
        onSelect={(day) => {
          // Never before the Sale day, never after today.
          const earliest = startOfLocalDay(sale.completedAt).getTime();
          const latest = startOfLocalDay(new Date()).getTime();
          const chosen = Math.min(Math.max(startOfLocalDay(day).getTime(), earliest), latest);
          update({ ...form, refundDay: new Date(chosen) });
          setCalendarVisible(false);
        }}
        testID="sale-adjustment-calendar"
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
      <AppText variant="body" style={styles.reasonLabel}>
        {label}
      </AppText>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected && <SymbolView name={{ ios: 'checkmark', android: 'check' }} size={12} tintColor={semanticColors.onAccent} />}
      </View>
    </Pressable>
  );
}

function ReasonRow({
  reason,
  selected,
  onSelect,
}: {
  readonly reason: SaleAdjustmentReason;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={SALE_ADJUSTMENT_REASON_LABELS[reason]}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onSelect}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      testID={`sale-adjustment-reason-${reason}`}
    >
      <AppText variant="body" style={styles.reasonLabel}>
        {SALE_ADJUSTMENT_REASON_LABELS[reason]}
      </AppText>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected && <SymbolView name={{ ios: 'checkmark', android: 'check' }} size={12} tintColor={semanticColors.onAccent} />}
      </View>
    </Pressable>
  );
}

interface LineEditorProps {
  readonly line: SaleAdjustmentLinePosition;
  readonly quantity: number;
  readonly restock: boolean;
  readonly productAvailable: boolean;
  readonly onQuantity: (quantity: number) => void;
  readonly onRestock: (restock: boolean) => void;
}

function LineEditor({ line, quantity, restock, productAvailable, onQuantity, onRestock }: LineEditorProps) {
  const name = line.item.productName;
  const canDecrement = quantity > 0;
  const canIncrement = quantity < line.remainingQuantity;
  return (
    <View style={styles.line} testID={`sale-adjustment-line-${line.saleItemId}`}>
      <View style={styles.lineHeader}>
        <View style={styles.lineCopy}>
          <AppText variant="rowTitle" numberOfLines={2}>
            {name}
          </AppText>
          <AppText variant="metadata" style={styles.soft}>
            {`Vendu ${formatSaleQuantity(line.soldQuantity)} · ${formatEuros(line.item.unitPrice)}`}
            {line.adjustedQuantity > 0 ? ` · déjà corrigé ${formatSaleQuantity(line.adjustedQuantity)}` : ''}
          </AppText>
        </View>
        <View style={styles.stepper}>
          <Pressable
            accessibilityLabel={`Une unité de moins pour ${name}`}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canDecrement }}
            disabled={!canDecrement}
            hitSlop={spacing.xs}
            onPress={() => onQuantity(quantity - 1)}
            style={styles.stepButton}
            testID={`sale-adjustment-decrement-${line.saleItemId}`}
          >
            <AppText variant="control" style={[styles.stepGlyph, !canDecrement && styles.stepGlyphDisabled]}>
              −
            </AppText>
          </Pressable>
          <AppText
            accessibilityLabel={`${quantity} unité${quantity > 1 ? 's' : ''} concernée${quantity > 1 ? 's' : ''} sur ${line.remainingQuantity}`}
            style={styles.quantity}
            testID={`sale-adjustment-quantity-${line.saleItemId}`}
            variant="control"
          >
            {quantity}
          </AppText>
          <Pressable
            accessibilityLabel={`Une unité de plus pour ${name}`}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canIncrement }}
            disabled={!canIncrement}
            hitSlop={spacing.xs}
            onPress={() => onQuantity(quantity + 1)}
            style={styles.stepButton}
            testID={`sale-adjustment-increment-${line.saleItemId}`}
          >
            <AppText variant="control" style={[styles.stepGlyph, !canIncrement && styles.stepGlyphDisabled]}>
              +
            </AppText>
          </Pressable>
        </View>
      </View>
      {line.remainingQuantity === 0 && (
        <AppText variant="metadata" style={styles.soft}>
          Toutes les unités ont déjà été corrigées.
        </AppText>
      )}
      {quantity > 0 &&
        (productAvailable ? (
          <View style={styles.restock}>
            <AppText variant="body" style={styles.restockLabel}>
              Remis en stock
            </AppText>
            <Switch
              accessibilityLabel={`Remettre ${name} en stock`}
              onValueChange={onRestock}
              testID={`sale-adjustment-restock-${line.saleItemId}`}
              thumbColor={Platform.OS === 'android' ? semanticColors.surfaceElevated : undefined}
              trackColor={{ false: semanticColors.borderSubtle, true: semanticColors.accent }}
              value={restock}
            />
          </View>
        ) : (
          <AppText variant="metadata" style={styles.soft} testID={`sale-adjustment-missing-${line.saleItemId}`}>
            Ce produit n’est plus au catalogue : il ne peut pas être remis en stock.
          </AppText>
        ))}
    </View>
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
  subheading: { color: semanticColors.foreground, marginTop: spacing.xs },
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
  reasonLabel: { color: semanticColors.foreground, flex: 1 },
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
  line: { gap: spacing.sm, paddingHorizontal: spacing.base, paddingVertical: spacing.md },
  lineHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  lineCopy: { flex: 1, gap: 2, minWidth: 0 },
  stepper: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavender,
    borderRadius: radii.medium,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: 2,
  },
  stepButton: { alignItems: 'center', borderRadius: radii.small, height: 36, justifyContent: 'center', width: 44 },
  stepGlyph: { color: semanticColors.accent, fontSize: 18, lineHeight: 21 },
  stepGlyphDisabled: { color: semanticColors.foregroundMuted },
  quantity: { color: semanticColors.foreground, fontVariant: ['tabular-nums'], minWidth: 28, textAlign: 'center' },
  restock: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  restockLabel: { color: semanticColors.foreground, flexShrink: 1 },
  note: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  noteText: { color: foregroundSoft, flex: 1 },
  notes: { gap: spacing.sm },
  issues: { gap: spacing.xs },
  issue: { color: rose.rose600 },
  actions: { gap: spacing.sm },
  notFound: { alignItems: 'center', flex: 1, justifyContent: 'center' },
});
