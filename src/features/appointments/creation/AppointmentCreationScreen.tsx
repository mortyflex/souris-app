// Souris — Appointment Creation screen
//
// Three-step creation flow: Cliente → Prestations → Résumé.
// The draft (client, selected services, appointment-specific price and
// processing overrides) lives in this screen's state and survives every
// step transition. The Agenda startAt is shown as appointment context on
// every step and is never recalculated or replaced.

import { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import type { Service } from '@/domain/appointments';
import { useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import { normalizedClients } from '@/features/clients/adapters/normalized-clients';
import { filterClients } from '@/features/clients/search/filter-clients';
import { catalog } from '@/features/services/adapters/catalog';
import { AppText } from '@/shared/ui/AppText';
import {
  agenda,
  colors,
  gutter,
  lavender,
  radii,
  spacing,
  touchTarget,
} from '@/shared/ui/theme';

import { buildAppointment, type BuildAppointmentItemInput } from './build-appointment';
import { AppointmentContextRow } from './components/AppointmentContextRow';
import { ClientPickerStep, getClientDisplayName } from './components/ClientPickerStep';
import { CreationStepper } from './components/CreationStepper';
import { ServiceCatalogStep } from './components/ServiceCatalogStep';
import { SummaryStep } from './components/SummaryStep';
import { createSelectedServiceDraft, reorderDrafts, updateDraftPhaseDuration, updateDraftPrice, type SelectedServiceDraft } from './draft';
import { stepStartAt, type StartTimeBounds } from './draft-start';
import { createAppointmentId, createAppointmentItemId } from './runtime-ids';
import { getAppointmentCreationSummary } from './presentation';
import { canNavigateTo, stepLabels, type CreationStep } from './steps';

interface AppointmentCreationScreenProps {
  readonly startAt: Date;
}

const businessId = 'fixture-business';
const staffMemberId = 'staff-amelie';
/**
 * Valid manual start times stay inside the operational Agenda day and
 * strictly before its end boundary. With ±5-minute steps the latest
 * visible start slot is 19:55.
 */
const startTimeBounds: StartTimeBounds = {
  minMinutes: agenda.dayStartHour * 60,
  maxMinutes: agenda.dayEndHour * 60 - 5,
};

export function AppointmentCreationScreen({ startAt }: AppointmentCreationScreenProps) {
  const router = useRouter();
  const { addAppointment } = useAppointmentSession();
  const [step, setStep] = useState<CreationStep>(0);
  const [clientQuery, setClientQuery] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string>();
  const [selectedDrafts, setSelectedDrafts] = useState<readonly SelectedServiceDraft[]>([]);
  const [draftStartAt, setDraftStartAt] = useState<Date>(() =>
    stepStartAt(new Date(startAt), 0, startTimeBounds),
  );

  const selectedClient = normalizedClients.find((client) => client.id === selectedClientId);
  const selectedClientName = selectedClient
    ? getClientDisplayName(selectedClient.firstName, selectedClient.lastName)
    : undefined;

  const selectedEntries = selectedDrafts
    .map((draft) => ({
      draft,
      service: catalog.services.find((service) => service.id === draft.serviceId),
    }))
    .filter((entry): entry is { draft: SelectedServiceDraft; service: Service } =>
      entry.service !== undefined,
    );

  const summaryItems: readonly BuildAppointmentItemInput[] = selectedEntries.map(
    ({ draft, service }) => ({
      service,
      price: draft.price,
      phaseDurationOverrides: draft.phaseDurationOverrides,
    }),
  );

  const summary =
    selectedEntries.length > 0
      ? getAppointmentCreationSummary(draftStartAt, summaryItems)
      : undefined;

  const canContinue =
    step === 0 ? selectedClient !== undefined : selectedEntries.length > 0;

  const visibleClients = filterClients(normalizedClients, clientQuery);

  const toggleService = (service: Service) => {
    setSelectedDrafts((current) => {
      if (current.some((draft) => draft.serviceId === service.id)) {
        return current.filter((draft) => draft.serviceId !== service.id);
      }
      return [...current, createSelectedServiceDraft(service)];
    });
  };

  const reorderSelectedDrafts = useCallback(
    (fromIndex: number, toIndex: number) => {
      setSelectedDrafts((current) => reorderDrafts(current, fromIndex, toIndex));
    },
    [],
  );

  const updateDraft = (
    serviceId: string,
    updater: (draft: SelectedServiceDraft) => SelectedServiceDraft,
  ) => {
    setSelectedDrafts((current) =>
      current.map((draft) => (draft.serviceId === serviceId ? updater(draft) : draft)),
    );
  };

  const navigateToStep = (target: number) => {
    if (canNavigateTo(step, target)) {
      setStep(target as CreationStep);
    }
  };

  const continueToNextStep = () => {
    if (!canContinue) return;
    setStep((current) => (current === 2 ? current : (current + 1) as CreationStep));
  };

  const stepDraftStartAt = (deltaMinutes: number) => {
    setDraftStartAt((current) => stepStartAt(current, deltaMinutes, startTimeBounds));
  };

  const create = () => {
    if (!selectedClient || selectedEntries.length === 0 || !summary) return;

    const appointmentId = createAppointmentId();
    const appointment = buildAppointment({
      appointmentId,
      businessId,
      clientId: selectedClient.id,
      itemIds: selectedEntries.map((_, index) => createAppointmentItemId(appointmentId, index)),
      items: summaryItems,
      staffMemberId,
      startAt: draftStartAt,
    });
    addAppointment({
      appointment,
      clientDisplayName: getClientDisplayName(
        selectedClient.firstName,
        selectedClient.lastName,
      ),
    });
    router.back();
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <AppText variant="eyebrow" style={styles.eyebrow}>
              NOUVEAU RENDEZ-VOUS
            </AppText>
            <AppText variant="sheetTitle" accessibilityRole="header">
              {stepLabels[step]}
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Annuler la création"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
          >
            <AppText variant="control" style={styles.cancelText}>
              Annuler
            </AppText>
          </Pressable>
        </View>

        <CreationStepper step={step} onStepPress={(target) => navigateToStep(target)} />

        <AppointmentContextRow
          startAt={draftStartAt}
          clientName={selectedClientName}
          onStartAtChange={stepDraftStartAt}
        />

        {step === 0 && (
          <ClientPickerStep
            clients={visibleClients}
            query={clientQuery}
            selectedClientId={selectedClientId}
            onChangeQuery={setClientQuery}
            onSelectClient={setSelectedClientId}
          />
        )}
        {step === 1 && (
          <ServiceCatalogStep
            selectedDrafts={selectedDrafts}
            onReorderDrafts={reorderSelectedDrafts}
            onToggleService={toggleService}
            onUpdatePhaseDuration={(serviceId, phaseId, durationMinutes) =>
              updateDraft(serviceId, (draft) =>
                updateDraftPhaseDuration(draft, phaseId, durationMinutes),
              )
            }
            onUpdatePrice={(serviceId, price) =>
              updateDraft(serviceId, (draft) => updateDraftPrice(draft, price))
            }
          />
        )}
        {step === 2 && selectedClient && summary && (
          <SummaryStep
            clientName={getClientDisplayName(
              selectedClient.firstName,
              selectedClient.lastName,
            )}
            services={selectedEntries.map(({ draft, service }) => ({
              serviceId: service.id,
              serviceName: service.name,
              price: draft.price,
            }))}
            startAt={draftStartAt}
            summary={summary}
            onEditClient={() => navigateToStep(0)}
            onEditServices={() => navigateToStep(1)}
          />
        )}

        <View style={styles.footer}>
          {step > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Étape précédente"
              onPress={() => navigateToStep(step - 1)}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            >
              <AppText variant="control" style={styles.secondaryButtonText}>
                Précédent
              </AppText>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canContinue }}
            disabled={!canContinue}
            onPress={step === 2 ? create : continueToNextStep}
            style={({ pressed }) => [
              styles.primaryButton,
              !canContinue && styles.disabledButton,
              pressed && canContinue && styles.pressedPrimary,
            ]}
          >
            <AppText variant="control" style={styles.primaryButtonText}>
              {step === 2 ? 'Créer le rendez-vous' : 'Continuer'}
            </AppText>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  keyboardContainer: { flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Platform.OS === 'android' ? gutter.android : gutter.ios,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  headerCopy: { flex: 1, gap: spacing.xs },
  eyebrow: { color: lavender.lav700 },
  cancelButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: touchTarget.ios,
    paddingLeft: spacing.md,
  },
  cancelText: { color: lavender.lav700 },
  pressed: { opacity: 0.72 },
  footer: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: Platform.OS === 'android' ? gutter.android : gutter.ios,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radii.ios.default,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: touchTarget.ios,
    paddingHorizontal: spacing.md,
  },
  secondaryButtonText: { color: colors.foreground },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.ios.default,
    flex: 1,
    justifyContent: 'center',
    minHeight: touchTarget.ios,
    paddingHorizontal: spacing.md,
  },
  primaryButtonText: { color: colors.background },
  pressedPrimary: { backgroundColor: lavender.lav700 },
  disabledButton: { backgroundColor: colors.border },
});
