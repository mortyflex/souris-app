// BeautIzzy — client import: review one candidate
//
// The correction drawer of the review. It edits STAGING state only: saving
// hands the new values back to the review, which re-runs validation, issues,
// duplicate classification and selection eligibility at once. Nothing is
// written to the database here — the Client form (ClientFormSheet) persists
// immediately, so it is deliberately not reused; its field components are.
//
// Satin material (the default): the drawer quotes the pasted source text and
// readability wins over the glass pilot (DESIGN_OVERRIDES.md §40).

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  toClientImportCandidateValues,
  validateClientImportCandidate,
  editClientImportCandidate,
  type ClientImportCandidate,
  type ClientImportCandidateValues,
} from '@/domain/clients/import';
import { BirthdayField } from '@/features/clients/creation/components/BirthdayField';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { GroupedSurface } from '@/shared/ui/GroupedSurface';
import { SheetActionBar } from '@/shared/ui/SheetActionBar';
import { SheetEditingHeader } from '@/shared/ui/SheetEditingHeader';
import { TextField } from '@/shared/ui/TextField';
import { spacing } from '@/shared/ui/theme';

import { issueLabel } from '../presentation';

const EMPTY_VALUES: ClientImportCandidateValues = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  birthday: undefined,
};

interface ClientImportCandidateSheetProps {
  /** The candidate under review; undefined closes the drawer. */
  readonly candidate: ClientImportCandidate | undefined;
  readonly onClose: () => void;
  readonly onSave: (edited: ClientImportCandidate) => void;
}

export function ClientImportCandidateSheet({ candidate, onClose, onSave }: ClientImportCandidateSheetProps) {
  // Every opening starts from the candidate's current values (a cancelled
  // correction is gone); the drawer keeps showing it while it slides away.
  const [openedWith, setOpenedWith] = useState<ClientImportCandidate | undefined>(undefined);
  const [shown, setShown] = useState<ClientImportCandidate | undefined>(undefined);
  const [values, setValues] = useState<ClientImportCandidateValues>(EMPTY_VALUES);
  if (candidate !== openedWith) {
    setOpenedWith(candidate);
    if (candidate !== undefined) {
      setShown(candidate);
      setValues(toClientImportCandidateValues(candidate));
    }
  }

  const update = <Key extends keyof ClientImportCandidateValues>(
    field: Key,
    value: ClientImportCandidateValues[Key],
  ) => setValues((current) => ({ ...current, [field]: value }));

  const draft = shown ? editClientImportCandidate(shown, values) : undefined;
  const codes = new Set(draft ? validateClientImportCandidate(draft).map((issue) => issue.code) : []);
  // Extraction warnings describe the pasted text: shown until the professional saves a review.
  const extractionIssues = shown?.issues ?? [];

  return (
    <BottomSheet
      backdropLabel="Fermer la vérification"
      dismissOnPanDown={false}
      footer={
        <SheetActionBar testID="client-import-candidate-actions">
          <AppButton
            onPress={() => draft && onSave(draft)}
            testID="client-import-candidate-save"
            title="Enregistrer"
          />
        </SheetActionBar>
      }
      header={
        <SheetEditingHeader
          cancelAccessibilityLabel="Annuler les corrections"
          onCancel={onClose}
          title="Vérifier le client"
        />
      }
      keyboardAvoiding
      onClose={onClose}
      scrollable
      testID="client-import-candidate-sheet"
      visible={candidate !== undefined}
    >
      <View style={styles.body}>
        {shown?.raw ? (
          <GroupedSurface style={styles.source} testID="client-import-candidate-source">
            <AppText variant="eyebrow">
              {shown.sourceRef ? `Texte d’origine · ligne ${shown.sourceRef}` : 'Texte d’origine'}
            </AppText>
            <AppText selectable variant="metadata">
              {shown.raw}
            </AppText>
            {extractionIssues.map((issue, index) => (
              <AppText key={`${issue.code}-${index}`} variant="metadata">
                {`• ${issueLabel(issue)}`}
              </AppText>
            ))}
          </GroupedSurface>
        ) : null}
        <TextField
          accessibilityLabel="Prénom"
          error={codes.has('MISSING_FIRST_NAME') ? 'Le prénom est requis.' : undefined}
          label="Prénom"
          onChangeText={(text) => update('firstName', text)}
          placeholder="Prénom"
          value={values.firstName}
        />
        <TextField
          accessibilityLabel="Nom"
          label="Nom"
          onChangeText={(text) => update('lastName', text)}
          placeholder="Optionnel"
          value={values.lastName}
        />
        <TextField
          accessibilityLabel="Téléphone"
          error={codes.has('UNRECOGNIZED_PHONE') ? 'Numéro non reconnu : vérifiez-le.' : undefined}
          keyboardType="phone-pad"
          label="Téléphone"
          onChangeText={(text) => update('phone', text)}
          placeholder="Optionnel"
          value={values.phone}
        />
        <TextField
          accessibilityLabel="Email"
          autoCapitalize="none"
          error={codes.has('INVALID_EMAIL') ? 'Adresse email invalide : corrigez-la ou effacez-la.' : undefined}
          keyboardType="email-address"
          label="Email"
          onChangeText={(text) => update('email', text)}
          placeholder="Optionnel"
          value={values.email}
        />
        <BirthdayField onChange={(birthday) => update('birthday', birthday)} value={values.birthday} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md, paddingBottom: spacing.base, paddingTop: spacing.xs },
  source: { gap: spacing.xs, padding: spacing.md },
});
