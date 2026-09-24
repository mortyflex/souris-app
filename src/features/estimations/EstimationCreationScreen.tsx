// Souris — Estimation tarifaire (creation sheet)
//
// A lightweight, recipient-agnostic price estimation based on the
// professional's configured Services. Opened from the Agenda + menu
// (« Estimation »). It belongs to nobody: no Client is chosen, named, created
// or attached anywhere in this flow, so the generated image can be shared
// with anyone.
//
// Two steps, in the sheet and stepper language of « Nouveau rendez-vous »:
//   Prestations → Résumé
// reusing only its generic pieces — the shared editing header, the creation
// stepper (given its two labels) and its step rules, the shared prestation
// catalogue (Services / Techniques cards, a tap toggles), the selection
// footer, and the grouped-row Résumé family. The eyebrow stays
// « ESTIMATION » throughout: never a person's name.
//
// What the estimate is made of: the selected catalog Services, in selection
// order, at their CURRENT catalog price. A Technique stays one commercial
// line; its phases are scheduling details and never shown. No appointment
// schedule, deposit, discount, product, payment, validity or tax wording.
//
// « Générer l’estimation » prints the document through the shared receipt
// printer (EstimationTicket). NOTHING is written: no Client, Appointment,
// Sale, payment, deposit, stock movement or Client history — and no
// estimation record either. Fermer closes the printer, then the sheet, back
// to the Agenda. « Annuler » leaves at any step, equally without a write.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import type { Service } from '@/domain/appointments';
import { CreationStepper } from '@/features/appointments/creation/components/CreationStepper';
import { canNavigateTo, type CreationStep } from '@/features/appointments/creation/steps';
import { ServiceCatalogPicker } from '@/features/appointments/editor/components/ServiceCatalogPicker';
import {
  formatSelectedServiceNames,
  formatSelectionCountLabel,
} from '@/features/appointments/editor/presentation';
import { useCurrentBusiness } from '@/features/business/session/CurrentBusinessProvider';
import { useServiceCatalog } from '@/features/services/session/ServiceCatalogProvider';
import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { SheetActionBar } from '@/shared/ui/SheetActionBar';
import { SheetEditingHeader } from '@/shared/ui/SheetEditingHeader';
import { SheetScreen } from '@/shared/ui/SheetScreen';
import { foregroundSoft, gutter, lavender, receiptPrint, spacing } from '@/shared/ui/theme';

import { EstimationSummaryStep } from './EstimationSummaryStep';
import { EstimationTicket } from './EstimationTicket';
import { buildEstimationDocument, type EstimationDocumentModel } from './estimation-document';

export const ESTIMATION_SHEET_TITLE = 'Estimation';
export const ESTIMATION_GENERATE_LABEL = 'Générer l’estimation';
export const ESTIMATION_STEP_LABELS = ['Prestations', 'Résumé'] as const;

/** 0 = Prestations, 1 = Résumé: the first two positions of the shared step rules. */
type EstimationStep = Extract<CreationStep, 0 | 1>;
const SUMMARY_STEP: EstimationStep = 1;

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

export function EstimationCreationScreen() {
  const router = useRouter();
  const business = useCurrentBusiness();
  const { activeServices } = useServiceCatalog();
  const [step, setStep] = useState<EstimationStep>(0);
  const [selectedServiceIds, setSelectedServiceIds] = useState<readonly string[]>([]);
  // The document as it was generated: the printed paper never moves under it.
  const [generated, setGenerated] = useState<EstimationDocumentModel>();
  const [ticketVisible, setTicketVisible] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(leaveTimer.current), []);

  // Current catalog values, looked up on every render: always today's prices.
  const selectedServices = useMemo(
    () =>
      selectedServiceIds
        .map((id) => activeServices.find((service) => service.id === id))
        .filter((service): service is Service => service !== undefined),
    [selectedServiceIds, activeServices],
  );

  const model =
    selectedServices.length > 0
      ? buildEstimationDocument({
          businessName: business.name,
          services: selectedServices,
          // Today's local day, read at render: the Résumé shows the generation date.
          date: new Date(),
        })
      : undefined;

  const canContinue = selectedServices.length > 0;

  const toggleService = (service: Service) => {
    haptics.selection();
    setSelectedServiceIds((current) =>
      current.includes(service.id)
        ? current.filter((id) => id !== service.id)
        : [...current, service.id],
    );
  };

  const navigateToStep = (target: number) => {
    if (canNavigateTo(step, target)) setStep(target as EstimationStep);
  };

  const continueToSummary = () => {
    if (canContinue) setStep(SUMMARY_STEP);
  };

  // Read-only: the document is worded from the review, nothing else happens.
  // The date is the generation day — document metadata, never a booking.
  const generate = () => {
    if (!model || ticketVisible) return;
    setGenerated(
      buildEstimationDocument({
        businessName: business.name,
        services: selectedServices,
        date: new Date(),
      }),
    );
    setTicketVisible(true);
  };

  // The paper leaves first, then the sheet: back to the Agenda as it was.
  const closeTicket = () => {
    if (!ticketVisible) return;
    setTicketVisible(false);
    leaveTimer.current = setTimeout(() => router.back(), receiptPrint.dismiss);
  };

  return (
    <SheetScreen keyboardAvoiding testID="estimation-creation-sheet">
      <View style={styles.headerZone}>
        <SheetEditingHeader
          cancelAccessibilityLabel="Annuler l’estimation"
          cancelTestID="estimation-cancel"
          onCancel={() => router.back()}
          title={ESTIMATION_SHEET_TITLE}
        />
      </View>

      <CreationStepper
        labels={ESTIMATION_STEP_LABELS}
        onStepPress={(target) => navigateToStep(target)}
        step={step}
      />

      {step === 0 && (
        <ScrollView
          contentContainerStyle={styles.catalogContent}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.catalogScroll}
        >
          <AppText
            style={styles.eyebrow}
            testID="estimation-context-heading"
            variant="eyebrow"
          >
            ESTIMATION
          </AppText>
          <ServiceCatalogPicker
            onSelectService={toggleService}
            selectedHint="Retirer de l’estimation"
            selectedServiceIds={selectedServiceIds}
            services={activeServices}
          />
        </ScrollView>
      )}
      {step === SUMMARY_STEP && model && (
        <EstimationSummaryStep model={model} onEditServices={() => navigateToStep(0)} />
      )}

      <SheetActionBar testID="estimation-creation-actions">
        {step === 0 && (
          <View style={styles.selectionFooter}>
            <AppText style={styles.selectionFooterCount} testID="estimation-selection-count" variant="control">
              {formatSelectionCountLabel(selectedServices.length)}
            </AppText>
            {selectedServices.length > 0 && (
              <AppText
                accessibilityLabel={selectedServices.map((service) => service.name).join(', ')}
                numberOfLines={2}
                style={styles.selectionFooterNames}
                testID="estimation-selection-names"
                variant="metadata"
              >
                {formatSelectedServiceNames(
                  selectedServices.map((service) => ({ serviceName: service.name })),
                )}
              </AppText>
            )}
          </View>
        )}
        <View style={styles.footerButtons}>
          {step === SUMMARY_STEP && (
            <AppButton
              accessibilityLabel="Étape précédente"
              onPress={() => navigateToStep(0)}
              style={styles.secondaryButton}
              title="Précédent"
              variant="secondary"
            />
          )}
          <AppButton
            disabled={!canContinue}
            onPress={step === SUMMARY_STEP ? generate : continueToSummary}
            style={styles.primaryButton}
            testID="estimation-primary"
            title={step === SUMMARY_STEP ? ESTIMATION_GENERATE_LABEL : 'Continuer'}
          />
        </View>
      </SheetActionBar>

      <EstimationTicket model={generated} onClose={closeTicket} visible={ticketVisible} />
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  headerZone: { gap: spacing.xs, paddingHorizontal: horizontalGutter },
  eyebrow: { color: foregroundSoft },
  footerButtons: { flexDirection: 'row', gap: spacing.sm },
  catalogScroll: { flex: 1 },
  catalogContent: {
    gap: spacing.lg,
    paddingBottom: spacing.xl,
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.lg,
  },
  selectionFooter: { gap: spacing.xs },
  selectionFooterNames: { color: foregroundSoft },
  selectionFooterCount: { color: lavender.lav700, fontVariant: ['tabular-nums'] },
  secondaryButton: { paddingHorizontal: spacing.base },
  primaryButton: { flex: 1 },
});
