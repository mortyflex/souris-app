// Souris — Service catalog step (Appointment Creation)
//
// Search + selected-services area + grouped catalog.
// Category headers are strongly distinct (eyebrow + count + hairline) and
// sticky on iOS. Selected draft cards live above the catalog and host the
// appointment-specific price / processing editors.

import { useMemo, useState } from 'react';
import {
  Platform,
  SectionList,
  StyleSheet,
  View,
  type SectionListData,
} from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { colors, foregroundSoft, lavender, radii, spacing } from '@/shared/ui/theme';
import type { Service } from '@/domain/appointments';

import { catalog } from '@/features/services/adapters/catalog';
import { filterCatalogServices } from '../filter-services';
import type { SelectedServiceDraft } from '../draft';
import { CatalogServiceRow } from './CatalogServiceRow';
import { SearchField } from './SearchField';
import { SelectedServiceCard } from './SelectedServiceCard';

const horizontalGutter = Platform.OS === 'android' ? 16 : 20;

interface CatalogSection {
  readonly key: string;
  readonly title: string;
  readonly data: readonly Service[];
}

interface ServiceCatalogStepProps {
  readonly selectedDrafts: readonly SelectedServiceDraft[];
  readonly onToggleService: (service: Service) => void;
  readonly onUpdatePrice: (serviceId: string, price: number) => void;
  readonly onUpdatePhaseDuration: (
    serviceId: string,
    phaseId: string,
    durationMinutes: number,
  ) => void;
}

export function ServiceCatalogStep({
  selectedDrafts,
  onToggleService,
  onUpdatePrice,
  onUpdatePhaseDuration,
}: ServiceCatalogStepProps) {
  const [query, setQuery] = useState('');
  const trimmedQuery = query.trim();

  const selectedEntries = selectedDrafts
    .map((draft) => ({
      draft,
      service: catalog.services.find((service) => service.id === draft.serviceId),
    }))
    .filter((entry): entry is { draft: SelectedServiceDraft; service: Service } =>
      entry.service !== undefined,
    );

  const sections = useMemo<readonly SectionListData<Service, CatalogSection>[]>(() => {
    if (trimmedQuery.length > 0) {
      const matches = filterCatalogServices(catalog.services, trimmedQuery);
      return [{ key: 'results', title: 'Résultats', data: matches }];
    }
    return catalog.groups.map((group) => ({
      key: group.category,
      title: group.category,
      data: group.services,
    }));
  }, [trimmedQuery]);

  const searching = trimmedQuery.length > 0;

  return (
    <SectionList
      sections={sections}
      keyExtractor={(service) => service.id}
      keyboardShouldPersistTaps="handled"
      stickySectionHeadersEnabled={Platform.OS === 'ios'}
      ListHeaderComponent={
        <View>
          <View style={styles.searchWrap}>
            <SearchField
              accessibilityLabel="Rechercher une prestation"
              onChangeText={setQuery}
              placeholder="Rechercher une prestation"
              value={query}
            />
          </View>

          {selectedEntries.length > 0 && (
            <View style={styles.selectedArea}>
              <SectionEyebrow label="Sélectionnées" count={selectedEntries.length} padded={false} />
              {selectedEntries.map(({ draft, service }) => (
                <SelectedServiceCard
                  key={draft.serviceId}
                  draft={draft}
                  onRemove={() => onToggleService(service)}
                  onUpdatePhaseDuration={(phaseId, durationMinutes) =>
                    onUpdatePhaseDuration(draft.serviceId, phaseId, durationMinutes)
                  }
                  onUpdatePrice={(price) => onUpdatePrice(draft.serviceId, price)}
                  service={service}
                />
              ))}
            </View>
          )}

          <AppText variant="eyebrow" style={styles.catalogLabel}>
            {searching ? 'Résultats' : 'Catalogue'}
          </AppText>
        </View>
      }
      renderSectionHeader={({ section }) =>
        section.key === 'results' ? null : (
          <SectionEyebrow label={section.title} count={section.data.length} />
        )
      }
      renderItem={({ item }) => (
        <CatalogServiceRow
          selected={selectedDrafts.some((draft) => draft.serviceId === item.id)}
          service={item}
          onPress={() => onToggleService(item)}
        />
      )}
      ListEmptyComponent={
        searching ? (
          <View style={styles.emptyState}>
            <AppText variant="stateTitle">Aucune prestation trouvée</AppText>
            <AppText variant="metadata" style={styles.emptyStateText}>
              Essayez un autre nom.
            </AppText>
          </View>
        ) : null
      }
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.listContent}
      style={styles.stepList}
    />
  );
}

function SectionEyebrow({
  label,
  count,
  padded = true,
}: {
  readonly label: string;
  readonly count: number;
  readonly padded?: boolean;
}) {
  return (
    <View style={[styles.sectionHeader, !padded && styles.sectionHeaderInset]}>
      <AppText variant="eyebrow" numberOfLines={1} style={styles.sectionTitle}>
        {label}
      </AppText>
      <AppText variant="chip" style={styles.sectionCount}>
        {count}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  stepList: { flex: 1 },
  listContent: { paddingBottom: spacing.xl },
  searchWrap: {
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.lg,
  },
  selectedArea: {
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.base,
  },
  catalogLabel: {
    color: foregroundSoft,
    marginHorizontal: horizontalGutter,
    marginTop: spacing.base,
  },
  sectionHeader: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    paddingBottom: spacing.xs,
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.base,
  },
  sectionHeaderInset: { backgroundColor: 'transparent', paddingHorizontal: 0 },
  sectionTitle: { color: colors.foreground, flexShrink: 1 },
  sectionCount: {
    backgroundColor: lavender.lav100,
    borderRadius: radii.ios.default,
    color: lavender.lav700,
    minWidth: 24,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    textAlign: 'center',
  },
  emptyState: { alignItems: 'center', padding: spacing.xl },
  emptyStateText: { color: foregroundSoft, marginTop: spacing.sm },
});
