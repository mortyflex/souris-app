// Souris — Appointment lifecycle sheets (cancellation, no-show)
//
// Both use the canonical Souris drawer with the danger-toned header, a
// keyboard-safe scrollable body and one fixed destructive action. The
// cancellation reason field never auto-focuses: the keyboard opens only
// when the professional taps it.

import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import type { AppointmentCancellationActor } from '@/domain/appointments';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { SheetActionBar } from '@/shared/ui/SheetActionBar';
import { SheetHeader } from '@/shared/ui/SheetHeader';
import { fontFamilies, radii, rose, semanticColors, spacing } from '@/shared/ui/theme';

interface AppointmentCancellationSheetProps {
  readonly clientName: string;
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onConfirm: (actor: AppointmentCancellationActor, reason?: string) => void;
}

export function AppointmentCancellationSheet({
  clientName,
  visible,
  onClose,
  onConfirm,
}: AppointmentCancellationSheetProps) {
  const [actor, setActor] = useState<AppointmentCancellationActor>();
  const [reason, setReason] = useState('');

  const reset = () => {
    setActor(undefined);
    setReason('');
  };

  const confirm = () => {
    if (!actor) return;
    onConfirm(actor, reason.trim() || undefined);
  };

  const close = () => {
    reset();
    onClose();
  };

  return (
    <LifecycleSheet
      confirmDisabled={!actor}
      confirmTestID="confirm-cancellation"
      confirmTitle="Confirmer l’annulation"
      description={`Le rendez-vous restera visible dans l’historique de ${clientName}.`}
      eyebrow="ANNULATION"
      onClose={close}
      onConfirm={confirm}
      testID="cancellation-sheet"
      title="Annuler ce rendez-vous ?"
      visible={visible}
    >
      <View style={styles.fieldGroup}>
        <AppText variant="metadata" style={styles.fieldLabel}>
          Qui annule ?
        </AppText>
        <View accessibilityRole="radiogroup" style={styles.actorOptions}>
          <ActorOption
            actor="CLIENT"
            label="La cliente"
            selected={actor === 'CLIENT'}
            onPress={() => setActor('CLIENT')}
          />
          <ActorOption
            actor="BUSINESS"
            label="Le salon"
            selected={actor === 'BUSINESS'}
            onPress={() => setActor('BUSINESS')}
          />
        </View>
      </View>

      <View style={styles.fieldGroup}>
        <AppText variant="metadata" style={styles.fieldLabel}>
          Motif (optionnel)
        </AppText>
        <TextInput
          accessibilityLabel="Motif de l’annulation"
          maxLength={240}
          multiline
          onChangeText={setReason}
          placeholder="Ajouter un motif"
          placeholderTextColor={semanticColors.foregroundMuted}
          style={styles.reasonInput}
          textAlignVertical="top"
          value={reason}
        />
      </View>
    </LifecycleSheet>
  );
}

interface AppointmentNoShowSheetProps {
  readonly clientName: string;
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}

export function AppointmentNoShowSheet({
  clientName,
  visible,
  onClose,
  onConfirm,
}: AppointmentNoShowSheetProps) {
  return (
    <LifecycleSheet
      confirmTestID="confirm-no-show"
      confirmTitle="Marquer comme absence"
      description={`Cette absence restera visible dans l’historique de ${clientName}.`}
      eyebrow="ABSENCE"
      onClose={onClose}
      onConfirm={onConfirm}
      testID="no-show-sheet"
      title="Marquer comme absence ?"
      visible={visible}
    />
  );
}

interface LifecycleSheetProps {
  readonly children?: ReactNode;
  readonly confirmDisabled?: boolean;
  readonly confirmTestID: string;
  readonly confirmTitle: string;
  readonly description: string;
  readonly eyebrow: string;
  readonly testID: string;
  readonly title: string;
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}

function LifecycleSheet({
  children,
  confirmDisabled = false,
  confirmTestID,
  confirmTitle,
  description,
  eyebrow,
  testID,
  title,
  visible,
  onClose,
  onConfirm,
}: LifecycleSheetProps) {
  return (
    <BottomSheet
      backdropLabel="Fermer la confirmation"
      footer={
        <SheetActionBar>
          <AppButton
            disabled={confirmDisabled}
            onPress={onConfirm}
            testID={confirmTestID}
            title={confirmTitle}
            variant="danger"
          />
        </SheetActionBar>
      }
      header={
        <SheetHeader
          action={{ label: 'Fermer', onPress: onClose }}
          eyebrow={eyebrow}
          title={title}
          tone="danger"
        />
      }
      keyboardAvoiding
      onClose={onClose}
      scrollable
      testID={testID}
      visible={visible}
    >
      <View style={styles.body}>
        <AppText variant="body" style={styles.description}>
          {description}
        </AppText>
        {children}
      </View>
    </BottomSheet>
  );
}

interface ActorOptionProps {
  readonly actor: AppointmentCancellationActor;
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
}

function ActorOption({ actor, label, selected, onPress }: ActorOptionProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actorOption,
        selected && styles.actorOptionSelected,
        pressed && styles.actorOptionPressed,
      ]}
      testID={`cancellation-actor-${actor.toLowerCase()}`}
    >
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected && <View style={styles.radioDot} />}
      </View>
      <AppText variant="control">{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg, paddingBottom: spacing.lg, paddingTop: spacing.xs },
  description: { color: semanticColors.foregroundSoft },
  fieldGroup: { gap: spacing.sm },
  fieldLabel: { color: semanticColors.foregroundSoft },
  actorOptions: { flexDirection: 'row', gap: spacing.sm },
  actorOption: {
    alignItems: 'center',
    backgroundColor: semanticColors.surface,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  actorOptionSelected: {
    backgroundColor: semanticColors.surfaceRose,
    borderColor: rose.rose600,
  },
  actorOptionPressed: { backgroundColor: semanticColors.surfaceRose },
  radio: {
    alignItems: 'center',
    borderColor: semanticColors.foregroundMuted,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    height: 18,
    justifyContent: 'center',
    width: 18,
  },
  radioSelected: { borderColor: rose.rose600 },
  radioDot: {
    backgroundColor: rose.rose600,
    borderRadius: radii.pill,
    height: 8,
    width: 8,
  },
  reasonInput: {
    backgroundColor: semanticColors.surface,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    borderWidth: StyleSheet.hairlineWidth,
    color: semanticColors.foreground,
    fontFamily: fontFamilies['400'],
    fontSize: 16,
    minHeight: 80,
    padding: spacing.md,
  },
});
