// BeautIzzy — client import review
//
// The shared review of every import source:
//
//   47 clients détectés
//   [ Nouveaux 42 | Doublons 3 | À corriger 2 ]
//   ☑ Sophie Martin            06 12 34 56 78
//   ☑ Nadia                    ⚠ Nom à vérifier
//
// One white card per candidate on the app background (DESIGN_OVERRIDES.md
// §39). NEW candidates carry a checkbox (ticked by default); possible
// duplicates are skipped until « Importer quand même »; exact duplicates are
// folded into « N doublons détectés — ignorés » and can be inspected, never
// imported; candidates to fix only open their correction drawer. Tapping a
// card opens that drawer. The fixed footer names the exact number imported.

import { useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

import { formatClientBirthday, type Client } from '@/domain/clients';
import type { ClassifiedClientImportCandidate, ClientImportCandidate } from '@/domain/clients/import';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { GroupedSurface } from '@/shared/ui/GroupedSurface';
import { NavigationChevron } from '@/shared/ui/NavigationChevron';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { radii, rose, semanticColors, spacing, touchTarget } from '@/shared/ui/theme';

import {
  candidateDisplayName,
  detectedTitle,
  exactDuplicatesSummary,
  importButtonTitle,
  issueLabel,
  matchLabel,
  unreadLinesLabel,
} from '../presentation';
import {
  countBySegment,
  isCandidateSelected,
  segmentOfStatus,
  type ClientImportChoices,
  type ClientImportSegment,
} from '../review-selection';

type ReviewItem =
  | { readonly kind: 'candidate'; readonly entry: ClassifiedClientImportCandidate }
  | { readonly kind: 'exactSummary'; readonly count: number };

interface ClientImportReviewStepProps {
  readonly classified: readonly ClassifiedClientImportCandidate[];
  readonly choices: ClientImportChoices;
  readonly segment: ClientImportSegment;
  readonly onSegmentChange: (segment: ClientImportSegment) => void;
  readonly onChoice: (key: string, selected: boolean) => void;
  readonly onEdit: (key: string) => void;
  readonly existingClients: readonly Client[];
  readonly ignoredColumns: readonly string[];
  /** Source lines with nothing to import (no name, number, email or date). */
  readonly unreadLines: readonly string[];
  readonly selectedCount: number;
  /** The stored clients changed since the review opened: selection was refreshed. */
  readonly refreshed: boolean;
  readonly onImport: () => void;
}

const minimumTouch = touchTarget[Platform.OS === 'android' ? 'android' : 'ios'];

export function ClientImportReviewStep({
  classified,
  choices,
  segment,
  onSegmentChange,
  onChoice,
  onEdit,
  existingClients,
  ignoredColumns,
  unreadLines,
  selectedCount,
  refreshed,
  onImport,
}: ClientImportReviewStepProps) {
  const [exactExpanded, setExactExpanded] = useState(false);
  const counts = countBySegment(classified);
  const clientsById = useMemo(
    () => new Map(existingClients.map((client) => [client.id, client])),
    [existingClients],
  );
  const candidatesByKey = useMemo(
    () => new Map(classified.map((entry) => [entry.candidate.key, entry.candidate])),
    [classified],
  );

  const items: readonly ReviewItem[] = useMemo(() => {
    const inSegment = classified.filter((entry) => segmentOfStatus(entry.status) === segment);
    if (segment !== 'DUPLICATES') return inSegment.map((entry) => ({ kind: 'candidate', entry }));
    const possible = inSegment.filter((entry) => entry.status === 'POSSIBLE_DUPLICATE');
    const exact = inSegment.filter((entry) => entry.status === 'EXACT_DUPLICATE');
    return [
      ...possible.map((entry) => ({ kind: 'candidate' as const, entry })),
      ...(exact.length > 0 ? [{ kind: 'exactSummary' as const, count: exact.length }] : []),
      ...(exactExpanded ? exact.map((entry) => ({ kind: 'candidate' as const, entry })) : []),
    ];
  }, [classified, segment, exactExpanded]);

  const header = (
    <View style={styles.header}>
      <AppText accessibilityRole="header" testID="client-import-detected" variant="sectionTitle">
        {detectedTitle(classified.length)}
      </AppText>
      <SegmentedControl
        density="compact"
        onChange={onSegmentChange}
        options={[
          { value: 'NEW', label: 'Nouveaux', count: counts.NEW, testID: 'client-import-segment-new' },
          {
            value: 'DUPLICATES',
            label: 'Doublons',
            count: counts.DUPLICATES,
            testID: 'client-import-segment-duplicates',
          },
          { value: 'TO_FIX', label: 'À corriger', count: counts.TO_FIX, testID: 'client-import-segment-to-fix' },
        ]}
        stretch
        testID="client-import-segments"
        value={segment}
      />
      {refreshed ? (
        <AppText style={styles.notice} testID="client-import-refreshed" variant="metadata">
          Votre clientèle a changé pendant la vérification : la sélection a été mise à jour.
        </AppText>
      ) : null}
      {ignoredColumns.length > 0 ? (
        <AppText testID="client-import-ignored-columns" variant="metadata">
          {`Colonnes ignorées : ${ignoredColumns.join(', ')}`}
        </AppText>
      ) : null}
      {unreadLines.length > 0 ? (
        <AppText testID="client-import-unread-lines" variant="metadata">
          {unreadLinesLabel(unreadLines)}
        </AppText>
      ) : null}
    </View>
  );

  return (
    <View style={styles.fill}>
      <FlatList
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        ListEmptyComponent={
          <AppText style={styles.empty} variant="metadata">
            {segment === 'TO_FIX' ? 'Rien à corriger.' : 'Aucun client ici.'}
          </AppText>
        }
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        data={items}
        keyExtractor={(item) => (item.kind === 'candidate' ? item.entry.candidate.key : 'exact-summary')}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) =>
          item.kind === 'exactSummary' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: exactExpanded }}
              onPress={() => setExactExpanded((current) => !current)}
              style={({ pressed }) => [styles.summary, pressed && styles.pressed]}
              testID="client-import-exact-summary"
            >
              <AppText style={styles.summaryText} variant="control">
                {exactDuplicatesSummary(item.count)}
              </AppText>
              <AppText variant="metadata">{exactExpanded ? 'Masquer' : 'Voir'}</AppText>
            </Pressable>
          ) : (
            <CandidateRow
              entry={item.entry}
              matchText={matchLabel(item.entry, clientsById, candidatesByKey)}
              onChoice={onChoice}
              onEdit={onEdit}
              selected={isCandidateSelected(item.entry, choices)}
            />
          )
        }
        showsVerticalScrollIndicator={false}
      />
      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <AppButton
          disabled={selectedCount === 0}
          onPress={onImport}
          testID="client-import-confirm"
          title={importButtonTitle(selectedCount)}
        />
      </SafeAreaView>
    </View>
  );
}

interface CandidateRowProps {
  readonly entry: ClassifiedClientImportCandidate;
  readonly selected: boolean;
  readonly matchText: string | undefined;
  readonly onChoice: (key: string, selected: boolean) => void;
  readonly onEdit: (key: string) => void;
}

function contactLine(candidate: ClientImportCandidate): string {
  return [candidate.phone, candidate.email].filter(Boolean).join(' · ');
}

function CandidateRow({ entry, selected, matchText, onChoice, onEdit }: CandidateRowProps) {
  const { candidate, status, issues } = entry;
  const key = candidate.key;
  const name = candidateDisplayName(candidate);
  const contact = contactLine(candidate);

  return (
    <GroupedSurface testID={`client-import-row-${key}`}>
      <View style={styles.row}>
        {status === 'NEW' ? (
          <Pressable
            accessibilityLabel={`Importer ${name}`}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            hitSlop={spacing.xs}
            onPress={() => onChoice(key, !selected)}
            style={styles.check}
            testID={`client-import-check-${key}`}
          >
            <SymbolView
              name={
                selected
                  ? { ios: 'checkmark.circle.fill', android: 'check_circle' }
                  : { ios: 'circle', android: 'radio_button_unchecked' }
              }
              size={24}
              tintColor={selected ? semanticColors.accent : semanticColors.foregroundMuted}
            />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityHint="Ouvre la vérification de cette ligne"
          accessibilityLabel={`Vérifier ${name}`}
          accessibilityRole="button"
          onPress={() => onEdit(key)}
          style={({ pressed }) => [styles.rowBody, pressed && styles.pressed]}
          testID={`client-import-edit-${key}`}
        >
          <View style={styles.rowCopy}>
            <AppText
              numberOfLines={1}
              style={status === 'INVALID' && !candidate.firstName ? styles.missing : undefined}
              variant="rowTitle"
            >
              {name}
            </AppText>
            {contact ? (
              <AppText numberOfLines={1} variant="metadata">
                {contact}
              </AppText>
            ) : null}
            {candidate.birthday ? (
              <AppText variant="metadata">{`Anniversaire : ${formatClientBirthday(candidate.birthday)}`}</AppText>
            ) : null}
            {matchText ? (
              <AppText testID={`client-import-match-${key}`} variant="metadata">
                {matchText}
              </AppText>
            ) : null}
            {issues.map((issue, index) => (
              <AppText
                key={`${issue.code}-${index}`}
                numberOfLines={2}
                style={status === 'INVALID' && index === 0 ? styles.blocking : styles.warning}
                variant="metadata"
              >
                {`⚠︎ ${issueLabel(issue)}`}
              </AppText>
            ))}
          </View>
          <NavigationChevron />
        </Pressable>
      </View>
      {status === 'POSSIBLE_DUPLICATE' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected }}
          onPress={() => onChoice(key, !selected)}
          style={({ pressed }) => [styles.forceImport, pressed && styles.pressed]}
          testID={`client-import-force-${key}`}
        >
          <AppText style={styles.forceImportText} variant="control">
            {selected ? 'Ne pas importer' : 'Importer quand même'}
          </AppText>
          {selected ? <AppText variant="metadata">Sera importé</AppText> : null}
        </Pressable>
      ) : null}
    </GroupedSurface>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { gap: spacing.md, paddingBottom: spacing.md, paddingTop: spacing.sm },
  notice: { color: semanticColors.accent },
  list: { paddingBottom: spacing.xl },
  gap: { height: spacing.sm },
  empty: { paddingVertical: spacing.xl, textAlign: 'center' },
  summary: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: minimumTouch,
    paddingHorizontal: spacing.base,
  },
  summaryText: { color: semanticColors.foreground, flex: 1 },
  row: { alignItems: 'stretch', flexDirection: 'row' },
  check: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: spacing.md,
    width: minimumTouch + spacing.xs,
  },
  rowBody: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  rowCopy: { flex: 1, gap: 2, minWidth: 0 },
  pressed: { backgroundColor: semanticColors.surfaceLavender },
  missing: { color: rose.rose700 },
  blocking: { color: rose.rose700 },
  warning: { color: semanticColors.foregroundSoft },
  forceImport: {
    alignItems: 'center',
    borderTopColor: semanticColors.borderSubtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: minimumTouch,
    paddingHorizontal: spacing.base,
  },
  forceImportText: { color: semanticColors.accent, flex: 1 },
  footer: { paddingBottom: spacing.base, paddingTop: spacing.md },
});
