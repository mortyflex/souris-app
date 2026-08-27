// Souris - Existing Appointment service editing screen
//
// The screen owns a draft until the explicit save action. Appointment
// metadata is shown as context only and is never editable in this phase.

import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  canRemoveAppointmentItem,
  updateAppointmentFromDrafts,
  type Service,
} from '@/domain/appointments';
import { useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import {
  gutter,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import { AppointmentContextRow } from '../creation/components/AppointmentContextRow';
import { createNewAppointmentItemId } from '../creation/runtime-ids';
import { ServiceCatalogEditor } from '../editor/components/ServiceCatalogEditor';
import {
  areDraftsEqual,
  createSelectedServiceDraft,
  getSelectedServiceDraftKey,
  hydrateAppointmentDrafts,
  reorderDrafts,
  toAppointmentItemEditDraft,
  updateDraftPhaseDuration,
  updateDraftPrice,
  type SelectedServiceDraft,
} from '../editor/draft';

interface AppointmentEditingScreenProps {
  readonly appointmentId?: string;
}

export function AppointmentEditingScreen({ appointmentId }: AppointmentEditingScreenProps) {
  const router = useRouter();
  const { getAppointmentById, updateAppointment } = useAppointmentSession();
  const entry = getAppointmentById(appointmentId);
  const appointment = entry?.appointment;
  const [initialDrafts] = useState<readonly SelectedServiceDraft[]>(() =>
    appointment ? hydrateAppointmentDrafts(appointment) : [],
  );
  const [drafts, setDrafts] = useState<readonly SelectedServiceDraft[]>(initialDrafts);
  const [isLeaving, setIsLeaving] = useState(false);
  const isDirty = !areDraftsEqual(drafts, initialDrafts);

  const requestDiscard = () => {
    Alert.alert(
      'Abandonner les modifications ?',
      'Les modifications non enregistrées seront perdues.',
      [
        { text: 'Continuer la modification', style: 'cancel' },
        { text: 'Abandonner', style: 'destructive', onPress: () => setIsLeaving(true) },
      ],
    );
  };

  usePreventRemove(isDirty && !isLeaving, requestDiscard);

  useEffect(() => {
    if (isLeaving) {
      router.back();
    }
  }, [isLeaving, router]);

  if (!entry || !appointment) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.notFound}>
          <AppText variant="stateTitle">Rendez-vous introuvable</AppText>
          <AppText variant="metadata" style={styles.notFoundText}>
            Ce rendez-vous n&apos;est plus disponible.
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  const addService = (service: Service) => {
    if (drafts.some((draft) => draft.serviceId === service.id)) return;
    haptics.selection();
    setDrafts((current) => [
      ...current,
      {
        ...createSelectedServiceDraft(service),
        appointmentItemId: createNewAppointmentItemId(appointment.id),
        order: current.length,
      },
    ]);
  };

  const removeDraft = (draftKey: string) => {
    if (!canRemoveAppointmentItem(drafts.length)) return;
    if (!drafts.some((draft) => getSelectedServiceDraftKey(draft) === draftKey)) return;
    haptics.selection();
    setDrafts((current) =>
      current.filter((draft) => getSelectedServiceDraftKey(draft) !== draftKey),
    );
  };

  const reorderSelectedDrafts = (fromIndex: number, toIndex: number) => {
    setDrafts((current) => reorderDrafts(current, fromIndex, toIndex));
  };

  const updateDraft = (
    draftKey: string,
    updater: (draft: SelectedServiceDraft) => SelectedServiceDraft,
  ) => {
    setDrafts((current) =>
      current.map((draft) =>
        getSelectedServiceDraftKey(draft) === draftKey ? updater(draft) : draft,
      ),
    );
  };

  const save = () => {
    if (!isDirty) return;

    const updatedAppointment = updateAppointmentFromDrafts(
      appointment,
      drafts.map((draft, index) => toAppointmentItemEditDraft(draft, index)),
    );
    updateAppointment({ ...entry, appointment: updatedAppointment });
    haptics.success();
    setIsLeaving(true);
  };

  const cancel = () => {
    if (isDirty) {
      requestDiscard();
      return;
    }
    setIsLeaving(true);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <AppText variant="eyebrow" accessibilityRole="header" style={styles.eyebrow}>
              MODIFIER LE RENDEZ-VOUS
            </AppText>
          </View>
          <AppButton
            accessibilityLabel="Annuler les modifications"
            onPress={cancel}
            style={styles.cancelButton}
            testID="cancel-appointment-edit"
            title="Annuler"
            variant="tertiary"
          />
        </View>

        <AppointmentContextRow
          clientName={entry.clientDisplayName}
          startAt={appointment.startAt}
        />

        <ServiceCatalogEditor
          catalogLabel="+ Ajouter une prestation"
          onRemoveDraft={removeDraft}
          onReorderDrafts={reorderSelectedDrafts}
          onToggleService={addService}
          onUpdatePhaseDuration={(draftKey, phaseId, durationMinutes) =>
            updateDraft(draftKey, (draft) =>
              updateDraftPhaseDuration(draft, phaseId, durationMinutes),
            )
          }
          onUpdatePrice={(draftKey, price) =>
            updateDraft(draftKey, (draft) => updateDraftPrice(draft, price))
          }
          preventRemovingFinalService
          selectedDrafts={drafts}
        />

        <View style={styles.footer}>
          <AppButton
            onPress={cancel}
            style={styles.secondaryButton}
            title="Annuler"
            variant="secondary"
          />
          <AppButton
            disabled={!isDirty}
            onPress={save}
            style={styles.primaryButton}
            testID="save-appointment-edit"
            title="Enregistrer les modifications"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.screenWarm, flex: 1 },
  keyboardContainer: { flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Platform.OS === 'android' ? gutter.android : gutter.ios,
    paddingBottom: spacing.xs,
    paddingTop: spacing.sm,
  },
  headerCopy: { flex: 1 },
  eyebrow: { color: semanticColors.accent },
  cancelButton: { paddingHorizontal: spacing.md },
  footer: {
    backgroundColor: semanticColors.surfaceElevated,
    borderTopColor: semanticColors.borderSubtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: Platform.OS === 'android' ? gutter.android : gutter.ios,
    paddingTop: spacing.md,
  },
  secondaryButton: { paddingHorizontal: spacing.base },
  primaryButton: { flex: 1 },
  notFound: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  notFoundText: { color: semanticColors.foregroundMuted, marginTop: spacing.sm, textAlign: 'center' },
});
