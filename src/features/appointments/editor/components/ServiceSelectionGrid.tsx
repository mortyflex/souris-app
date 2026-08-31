// Souris — Service selection grid (shared Appointment service picker)
//
// Shared by NEW Appointment Creation and existing Appointment Editing: a
// compact wrapping two-column grid grouped by Services / Techniques, with
// search filtering both sections. Selection state is surface-based; no
// decorative borders.
//
// This is an embeddable content block: it renders every row without its own
// scroll container, so callers can place it inside their own scroll
// architecture (the catalog is small by design).

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import type { Service } from '@/domain/appointments';
import { AppText } from '@/shared/ui/AppText';
import { SearchField } from '@/shared/ui/SearchField';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import {
  foregroundSoft,
  interaction,
  lavender,
  peach,
  radii,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import {
  buildServiceSelectionSections,
  toServiceGridRows,
} from '../selection-sections';
import {
  formatCreationDuration,
  formatCreationPrice,
  getServiceDurationMinutes,
  getServiceProcessingMinutes,
} from '../presentation';

interface ServiceSelectionGridProps {
  /** Selectable catalog (active Services supplied by the parent use case). */
  readonly services: readonly Service[];
  readonly selectedServiceIds: readonly string[];
  readonly onToggleService: (service: Service) => void;
}

export function ServiceSelectionGrid({
  services,
  selectedServiceIds,
  onToggleService,
}: ServiceSelectionGridProps) {
  const [query, setQuery] = useState('');
  const trimmedQuery = query.trim();

  const sections = useMemo(
    () => buildServiceSelectionSections(services, trimmedQuery),
    [services, trimmedQuery],
  );

  const searching = trimmedQuery.length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.searchArea}>
        <SearchField
          accessibilityLabel="Rechercher une prestation"
          onChangeText={setQuery}
          placeholder="Rechercher une prestation"
          value={query}
        />
      </View>

      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <SectionHeader
            count={section.data.length}
            style={styles.sectionHeader}
            title={section.title}
          />
          {toServiceGridRows(section.data).map((row) => {
            const [first, second] = row;
            return (
              <View key={first.id} style={styles.gridRow}>
                <ServiceSelectionCard
                  selected={selectedServiceIds.includes(first.id)}
                  service={first}
                  onPress={() => onToggleService(first)}
                />
                {second ? (
                  <ServiceSelectionCard
                    selected={selectedServiceIds.includes(second.id)}
                    service={second}
                    onPress={() => onToggleService(second)}
                  />
                ) : (
                  <View style={styles.gridSpacer} />
                )}
              </View>
            );
          })}
        </View>
      ))}

      {sections.length === 0 && (
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
      )}
    </View>
  );
}

interface ServiceSelectionCardProps {
  readonly service: Service;
  readonly selected: boolean;
  readonly onPress: () => void;
}

function ServiceSelectionCard({ service, selected, onPress }: ServiceSelectionCardProps) {
  const duration = getServiceDurationMinutes(service);
  const processing = getServiceProcessingMinutes(service);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${service.name}, ${formatCreationDuration(duration)}, ${formatCreationPrice(service.price)}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        selected ? styles.cardSelected : styles.cardIdle,
        pressed && styles.cardPressed,
      ]}
    >
      {selected && (
        <View style={styles.checkBadge}>
          <SymbolView
            name={{ ios: 'checkmark', android: 'check' }}
            size={11}
            tintColor={semanticColors.surfaceElevated}
          />
        </View>
      )}
      <View style={styles.cardCopy}>
        <AppText variant="rowTitle" numberOfLines={1} style={styles.cardName}>
          {service.name}
        </AppText>
        <AppText variant="metadata" numberOfLines={1} style={styles.cardDuration}>
          {formatCreationDuration(duration)}
        </AppText>
        {processing > 0 && (
          <AppText variant="metadata" numberOfLines={1} style={styles.cardProcessing}>
            {`dont ${formatCreationDuration(processing)} de pose`}
          </AppText>
        )}
      </View>
      <AppText variant="control" style={styles.cardPrice}>
        {formatCreationPrice(service.price)}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: semanticColors.screenWarm },
  searchArea: {
    paddingBottom: spacing.base,
    paddingTop: spacing.base,
  },
  section: { paddingBottom: spacing.sm },
  sectionHeader: {
    paddingBottom: spacing.sm,
    paddingTop: spacing.base,
  },
  gridRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  gridSpacer: { flex: 1 },
  card: {
    borderCurve: 'continuous',
    borderRadius: radii.large,
    flex: 1,
    gap: 4,
    justifyContent: 'space-between',
    minHeight: 96,
    padding: spacing.md,
  },
  cardIdle: { backgroundColor: semanticColors.surfaceLavender },
  cardSelected: { backgroundColor: semanticColors.surfaceLavenderStrong },
  cardPressed: {
    opacity: interaction.pressedOpacity,
    transform: [{ scale: interaction.cardPressedScale }],
  },
  checkBadge: {
    alignItems: 'center',
    backgroundColor: semanticColors.accent,
    borderRadius: radii.pill,
    height: 20,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
    width: 20,
  },
  cardCopy: { gap: 2, paddingRight: spacing.sm },
  cardName: { color: lavender.lav700 },
  cardDuration: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  cardProcessing: { color: peach.peach700, fontVariant: ['tabular-nums'] },
  cardPrice: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  emptyState: { alignItems: 'center', padding: spacing.xl },
  emptyStateText: { color: foregroundSoft, marginTop: spacing.sm },
});
