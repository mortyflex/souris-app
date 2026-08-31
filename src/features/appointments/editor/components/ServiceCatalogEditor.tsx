// Souris — Service catalog editor (Appointment Creation and Appointment editing)
//
// Sticky composer + active catalog. The search field and the selected
// services stay pinned at the top so the composition in progress is always
// visible; the scrollable catalog lives below. Selected draft cards live in
// the composer and host the appointment-specific price / processing editors.

import { useMemo, useState } from 'react';
import {
  Platform,
  SectionList,
  StyleSheet,
  View,
  type SectionListData,
} from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { foregroundSoft, gutter, semanticColors, spacing } from '@/shared/ui/theme';
import type { Service } from '@/domain/appointments';

import { useServiceCatalog } from '@/features/services/session/ServiceCatalogProvider';
import { filterCatalogServices } from '../filter-services';
import { getSelectedServiceDraftKey, type SelectedServiceDraft } from '../draft';
import { CatalogServiceRow } from './CatalogServiceRow';
import { SearchField } from '@/shared/ui/SearchField';
import { SelectedServicesComposer } from './SelectedServicesComposer';
import type { SortableDraftEntry } from './SortableDraftList';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

interface CatalogSection {
  readonly key: string;
  readonly title: string;
  readonly data: readonly Service[];
}

interface ServiceCatalogEditorProps {
  readonly selectedDrafts: readonly SelectedServiceDraft[];
  readonly onToggleService: (service: Service) => void;
  readonly onRemoveDraft: (draftKey: string) => void;
  readonly onReorderDrafts: (fromIndex: number, toIndex: number) => void;
  readonly onUpdatePrice: (draftKey: string, price: number) => void;
  readonly onUpdatePhaseDuration: (
    draftKey: string,
    phaseId: string,
    durationMinutes: number,
  ) => void;
  readonly catalogLabel?: string;
  /** Existing appointments keep one final service in the editor. */
  readonly preventRemovingFinalService?: boolean;
}

export function ServiceCatalogEditor({
  selectedDrafts,
  onToggleService,
  onRemoveDraft,
  onReorderDrafts,
  onUpdatePrice,
  onUpdatePhaseDuration,
  catalogLabel = 'Catalogue',
  preventRemovingFinalService = false,
}: ServiceCatalogEditorProps) {
  const [query, setQuery] = useState('');
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);
  const { activeServices } = useServiceCatalog();
  const trimmedQuery = query.trim();

  const removeDraft = (draftKey: string) => {
    setExpandedDraftId((current) => (current === draftKey ? null : current));
    onRemoveDraft(draftKey);
  };

  const toggleService = (service: Service) => {
    const selectedDraft = selectedDrafts.find((draft) => draft.serviceId === service.id);
    if (selectedDraft) {
      removeDraft(getSelectedServiceDraftKey(selectedDraft));
      return;
    }
    onToggleService(service);
  };

  const toggleExpandedDraft = (draftKey: string) => {
    setExpandedDraftId((current) => (current === draftKey ? null : draftKey));
  };

  const selectedEntries: readonly SortableDraftEntry[] = selectedDrafts.map((draft) => ({ draft }));

  const sections = useMemo<readonly SectionListData<Service, CatalogSection>[]>(() => {
    const services =
      trimmedQuery.length > 0
        ? filterCatalogServices(activeServices, trimmedQuery)
        : activeServices;
    return services.length > 0
      ? [{ key: 'catalog', title: catalogLabel, data: services }]
      : [];
  }, [activeServices, catalogLabel, trimmedQuery]);

  const searching = trimmedQuery.length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.composer}>
        <SearchField
          accessibilityLabel="Rechercher une prestation"
          onChangeText={setQuery}
          placeholder="Rechercher une prestation"
          value={query}
        />
        {selectedEntries.length > 0 && (
          <SelectedServicesComposer
            canRemove={!preventRemovingFinalService || selectedEntries.length > 1}
            entries={selectedEntries}
            expandedDraftId={expandedDraftId}
            onRemove={removeDraft}
            onReorder={onReorderDrafts}
            onToggleExpanded={toggleExpandedDraft}
            onUpdatePhaseDuration={onUpdatePhaseDuration}
            onUpdatePrice={onUpdatePrice}
          />
        )}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(service) => service.id}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <SectionHeader
            style={styles.catalogLabel}
            title={searching ? 'Résultats' : catalogLabel}
          />
        }
        renderSectionHeader={() => null}
        renderItem={({ item }) => (
          <CatalogServiceRow
            selected={selectedDrafts.some((draft) => draft.serviceId === item.id)}
            service={item}
            onPress={() => toggleService(item)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <AppText variant="stateTitle">
              {searching ? 'Aucune prestation trouvée' : 'Aucune prestation disponible'}
            </AppText>
            <AppText variant="metadata" style={styles.emptyStateText}>
              {searching
                ? 'Essayez un autre nom.'
                : 'Activez une prestation depuis Prestations & tarifs.'}
            </AppText>
          </View>
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        style={styles.stepList}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: semanticColors.screenWarm, flex: 1 },
  composer: {
    gap: spacing.md,
    paddingBottom: spacing.base,
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.base,
  },
  stepList: { backgroundColor: semanticColors.screenWarm, flex: 1 },
  listContent: { paddingBottom: spacing.xl },
  catalogLabel: {
    marginHorizontal: horizontalGutter,
  },
  emptyState: { alignItems: 'center', padding: spacing.xl },
  emptyStateText: { color: foregroundSoft, marginTop: spacing.sm },
});
