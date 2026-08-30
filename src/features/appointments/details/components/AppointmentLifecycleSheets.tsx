import { useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { AppointmentCancellationActor } from '@/domain/appointments';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import {
  gutter,
  radii,
  rose,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

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
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityLabel="Fermer la confirmation"
          onPress={onClose}
          style={styles.backdrop}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          pointerEvents="box-none"
          style={styles.sheetAnchor}
        >
          <SafeAreaView
            accessibilityViewIsModal
            edges={['bottom']}
            style={styles.sheet}
            testID={testID}
          >
            <View style={styles.grabber} />
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <AppText variant="eyebrow" style={styles.eyebrow}>
                  {eyebrow}
                </AppText>
                <AppText accessibilityRole="header" variant="sheetTitle">
                  {title}
                </AppText>
              </View>
              <AppButton
                accessibilityLabel="Fermer"
                onPress={onClose}
                style={styles.closeButton}
                title="Fermer"
                variant="tertiary"
              />
            </View>
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.scroll}
            >
              <AppText variant="body" style={styles.description}>
                {description}
              </AppText>
              {children && <View style={styles.body}>{children}</View>}
            </ScrollView>
            <View style={styles.footer}>
              <AppButton
                disabled={confirmDisabled}
                onPress={onConfirm}
                style={styles.confirmButton}
                testID={confirmTestID}
                title={confirmTitle}
                variant="danger"
              />
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
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

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(25, 22, 63, 0.24)',
  },
  sheetAnchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: semanticColors.surfaceElevated,
    borderCurve: 'continuous',
    borderTopLeftRadius: radii.ios.sheet,
    borderTopRightRadius: radii.ios.sheet,
    maxHeight: '100%',
    paddingHorizontal: horizontalGutter,
  },
  grabber: {
    alignSelf: 'center',
    backgroundColor: semanticColors.borderSubtle,
    borderRadius: radii.pill,
    height: 5,
    marginTop: spacing.sm,
    width: 40,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
    paddingTop: spacing.base,
  },
  headerCopy: { flex: 1, gap: spacing.xs },
  eyebrow: { color: rose.rose600 },
  closeButton: { paddingHorizontal: spacing.md },
  description: { color: semanticColors.foregroundSoft },
  scroll: { flexShrink: 1 },
  scrollContent: { gap: spacing.lg, paddingBottom: spacing.lg },
  body: { gap: spacing.base },
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
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    minHeight: 80,
    padding: spacing.md,
  },
  footer: {
    borderTopColor: semanticColors.borderSubtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.lg,
    paddingBottom: spacing.base,
    paddingTop: spacing.md,
  },
  confirmButton: { alignSelf: 'stretch' },
});
