// BeautIzzy — Prestations & tarifs (management list)
//
// Gestion › Prestations & tarifs: the pushed-screen top bar, the title, then
// the Services / Techniques segment (the category taxonomy, with the SAME
// options as the appointment prestation picker: category colour when
// selected, live count), the search, and the chosen category's Prestations in
// grouped surfaces — the active ones first, then « Inactives » when there are
// any, so nothing that was reachable before is hidden.
//
// - Search reuses the picker's `filterServicesOfType` (accent-insensitive,
//   inside the chosen category). Like the picker, the query survives a
//   segment switch, and an empty result offers the other category's matches.
// - Every row leads with the Prestation's automatic family pictogram
//   (PrestationIcon — the ONE mapping, shared with Prestation Details), keeps
//   the name in primary navy, the duration (and « dont … de pose » when
//   there is one) secondary, the price aligned before the chevron. The whole
//   row opens Prestation Details; management actions live there.
// - One SectionList carries everything (no nested scroll); its bottom
//   clearance keeps the last row above the floating « + ».
// - The « + » opens the shared floating menu: « Nouvelle prestation » (the
//   Prestation form) and « Nouvelle catégorie » (the Catégories screen, its
//   creation card already open — `?create=1`).
//
// Profession-aware (catalogue-presentation.ts). SERVICE_TYPES keeps all of
// the above; when the professional created categories and assigned some, the
// active Prestations of a segment are subdivided by category. CATEGORIES
// (nails, esthetics) drops the segment: one « Prestations » list, search over
// everything, grouped by the professional's categories, then « Sans
// catégorie », then « Inactives ». Both offer « Catégories », the
// management screen.

import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  View,
  type SectionListData,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Service, ServiceType } from '@/domain/appointments';
import { filterCatalogServices } from '@/features/appointments/editor/filter-services';
import { filterServicesOfType } from '@/features/appointments/editor/selection-sections';
import { PrestationIcon } from '@/features/services/components/PrestationIcon';
import {
  formatServiceDuration,
  formatServicePrice,
  getServiceDurationMinutes,
  getServiceProcessingMinutes,
} from '@/features/services/presentation';
import { useServiceCatalog } from '@/features/services/session/ServiceCatalogProvider';
import { useCatalogueView } from '@/features/services/use-catalogue-view';
import { AppText } from '@/shared/ui/AppText';
import { FloatingCreateButton } from '@/shared/ui/FloatingCreateButton';
import { GlassIconButton, glassIconButtonSize, glassIcons } from '@/shared/ui/GlassIconButton';
import { SearchField } from '@/shared/ui/SearchField';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { SegmentedControl, type SegmentedControlOption } from '@/shared/ui/SegmentedControl';
import {
  bottomClearance,
  foregroundSoft,
  gutter,
  interaction,
  radii,
  semanticColors,
  serviceCategoryColors,
  spacing,
} from '@/shared/ui/theme';

import {
  buildCatalogSections,
  buildCategoryCatalogSections,
  hasCategorizedServices,
  type CatalogListSection,
} from './catalog-sections';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

const categoryLabels: Readonly<Record<ServiceType, string>> = {
  SERVICE: 'Services',
  TECHNIQUE: 'Techniques',
};

const emptyCategoryTitles: Readonly<Record<ServiceType, string>> = {
  SERVICE: 'Aucun service',
  TECHNIQUE: 'Aucune technique',
};

const ROW_ICON_SIZE = 44;
/** Separators start under the names: row padding + pictogram + gap. */
const ROW_SEPARATOR_INSET = spacing.base + ROW_ICON_SIZE + spacing.md;

export function ServiceCatalogScreen() {
  const router = useRouter();
  const { services } = useServiceCatalog();
  const { presentation, categories } = useCatalogueView();
  const unified = presentation.organization === 'CATEGORIES';
  const [category, setCategory] = useState<ServiceType>('SERVICE');
  const [query, setQuery] = useState('');
  const otherCategory: ServiceType = category === 'SERVICE' ? 'TECHNIQUE' : 'SERVICE';
  const searching = query.trim().length > 0;

  const categoryOptions = useMemo<readonly SegmentedControlOption<ServiceType>[]>(
    () =>
      (['SERVICE', 'TECHNIQUE'] as const).map((type) => ({
        value: type,
        label: categoryLabels[type],
        selectedColor: serviceCategoryColors[type].strong,
        count: services.filter((service) => service.type === type).length,
        testID: `catalog-category-${type}`,
      })),
    [services],
  );
  const sections = useMemo<readonly SectionListData<Service, CatalogListSection>[]>(() => {
    if (unified) {
      const matching = query.trim().length > 0 ? filterCatalogServices(services, query.trim()) : services;
      return buildCategoryCatalogSections(matching, categories);
    }
    const ofType = filterServicesOfType(services, category, query);
    return hasCategorizedServices(ofType, categories)
      ? buildCategoryCatalogSections(ofType, categories)
      : buildCatalogSections(ofType);
  }, [services, category, query, unified, categories]);
  const otherMatches = useMemo(
    () => (searching && !unified ? filterServicesOfType(services, otherCategory, query).length : 0),
    [services, otherCategory, query, searching, unified],
  );

  const categoriesMeta =
    categories.length === 0
      ? 'Organisez vos prestations'
      : `${categories.length} catégorie${categories.length > 1 ? 's' : ''}`;

  const openService = (serviceId: string) => {
    router.push({ pathname: '/services/[serviceId]', params: { serviceId } });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.topBar}>
        <GlassIconButton
          accessibilityLabel="Retour"
          icon={glassIcons.back}
          onPress={() => router.back()}
        />
        <AppText variant="eyebrow" style={styles.eyebrow}>
          GESTION
        </AppText>
        <View style={styles.topBarSpacer} />
      </View>

      <SectionList
        sections={sections}
        initialNumToRender={40}
        keyExtractor={(service) => service.id}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        testID="service-catalog-list"
        ListHeaderComponent={
          <View style={styles.intro}>
            <AppText variant="screenTitle" accessibilityRole="header">
              Prestations & tarifs
            </AppText>
            {!unified && (
              <SegmentedControl
                onChange={setCategory}
                options={categoryOptions}
                stretch
                testID="catalog-category"
                value={category}
              />
            )}
            <SearchField
              accessibilityLabel="Rechercher une prestation"
              onChangeText={setQuery}
              placeholder="Rechercher une prestation"
              placement="page"
              value={query}
            />
            <Pressable
              accessibilityLabel={`Catégories, ${categoriesMeta}`}
              accessibilityRole="button"
              onPress={() => router.push('/services/categories')}
              style={({ pressed }) => [styles.categoriesRow, pressed && styles.pressed]}
              testID="catalog-manage-categories"
            >
              <SymbolView
                name={{ ios: 'folder', android: 'folder' }}
                size={17}
                tintColor={semanticColors.accent}
              />
              <View style={styles.categoriesCopy}>
                <AppText variant="control">Catégories</AppText>
                <AppText variant="metadata" style={styles.categoriesMeta}>
                  {categoriesMeta}
                </AppText>
              </View>
              <SymbolView
                name={{ ios: 'chevron.right', android: 'chevron_right' }}
                size={14}
                tintColor={semanticColors.foregroundMuted}
              />
            </Pressable>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <SectionHeader
            count={section.data.length}
            style={styles.sectionHeader}
            // The segment already names the category: the active group
            // repeats it once as its title, the other one says « Inactives ».
            title={section.groupLabel === 'ACTIVES' ? section.title : 'Inactives'}
          />
        )}
        renderItem={({ item, index, section }) => (
          <ServiceCatalogRow
            first={index === 0}
            last={index === section.data.length - 1}
            onPress={() => openService(item.id)}
            service={item}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState} testID="catalog-empty">
            <AppText variant="stateTitle">
              {searching
                ? 'Aucune prestation trouvée'
                : unified
                  ? 'Aucune prestation'
                  : emptyCategoryTitles[category]}
            </AppText>
            {searching && otherMatches > 0 ? (
              <Pressable
                accessibilityRole="button"
                hitSlop={spacing.sm}
                onPress={() => setCategory(otherCategory)}
                style={({ pressed }) => [styles.switchAction, pressed && styles.pressed]}
                testID="catalog-show-other-category"
              >
                <AppText
                  variant="control"
                  style={{ color: serviceCategoryColors[otherCategory].strong }}
                >
                  {`Voir ${otherMatches} résultat${otherMatches > 1 ? 's' : ''} dans ${categoryLabels[otherCategory]}`}
                </AppText>
              </Pressable>
            ) : (
              <AppText variant="metadata" style={styles.emptyStateText}>
                {searching
                  ? 'Essayez un autre nom.'
                  : 'Ajoutez une prestation avec le bouton +.'}
              </AppText>
            )}
          </View>
        }
      />

      <FloatingCreateButton
        accessibilityLabel="Ajouter une prestation ou une catégorie"
        actions={[
          {
            icon: { ios: 'sparkles', android: 'auto_awesome' },
            label: 'Nouvelle prestation',
            onPress: () => router.push('/services/new'),
            testID: 'catalog-new-prestation',
          },
          // Categories are managed on their own screen: land there with the card open.
          {
            icon: { ios: 'folder.badge.plus', android: 'create_new_folder' },
            label: 'Nouvelle catégorie',
            onPress: () => router.push('/services/categories?create=1'),
            testID: 'catalog-new-category',
          },
        ]}
        testID="add-service"
      />
    </SafeAreaView>
  );
}

function ServiceCatalogRow({
  service,
  first,
  last,
  onPress,
}: {
  readonly service: Service;
  readonly first: boolean;
  readonly last: boolean;
  readonly onPress: () => void;
}) {
  const duration = getServiceDurationMinutes(service);
  const processing = getServiceProcessingMinutes(service);
  const meta =
    service.type === 'TECHNIQUE' && processing > 0
      ? `${formatServiceDuration(duration)} · dont ${formatServiceDuration(processing)} de pose`
      : formatServiceDuration(duration);

  // Consecutive rows form ONE grouped surface (the GroupedSurface language),
  // drawn per row so the SectionList keeps virtualising.
  return (
    <View
      style={[styles.groupedRow, first && styles.groupedRowFirst, last && styles.groupedRowLast]}
    >
      {!first && <View style={styles.separator} />}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${service.name}, ${formatServicePrice(service.price)}, ${meta}`}
        onPress={onPress}
        style={({ pressed }) => [styles.serviceRow, pressed && styles.serviceRowPressed]}
        testID={`catalog-service-${service.id}`}
      >
        <PrestationIcon
          prestation={service}
          size="row"
          testID={`catalog-service-icon-${service.id}`}
        />
        <View style={styles.serviceCopy}>
          <AppText variant="rowTitle" numberOfLines={2} style={styles.serviceName}>
            {service.name}
          </AppText>
          <AppText variant="metadata" numberOfLines={1} style={styles.serviceMeta}>
            {meta}
          </AppText>
        </View>
        <AppText variant="control" style={styles.price}>
          {formatServicePrice(service.price)}
        </AppText>
        <SymbolView
          name={{ ios: 'chevron.right', android: 'chevron_right' }}
          size={14}
          tintColor={semanticColors.foregroundMuted}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.screenWarm, flex: 1 },
  topBar: {
    alignItems: 'center',
    borderBottomColor: semanticColors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: horizontalGutter,
    paddingVertical: spacing.sm,
  },
  // Mirrors the back button so the eyebrow stays centred.
  topBarSpacer: { height: glassIconButtonSize, width: glassIconButtonSize },
  eyebrow: { color: semanticColors.accent },
  content: { paddingBottom: bottomClearance[Platform.OS === 'android' ? 'android' : 'ios'] },
  categoriesRow: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceElevated,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  categoriesCopy: { flex: 1, gap: 2, minWidth: 0 },
  categoriesMeta: { color: foregroundSoft },
  intro: {
    gap: spacing.md,
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.base,
  },
  sectionHeader: {
    paddingBottom: spacing.sm,
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.xl,
  },
  emptyState: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing['2xl'],
  },
  emptyStateText: { color: foregroundSoft, textAlign: 'center' },
  switchAction: { justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.sm },
  pressed: { opacity: interaction.pressedOpacity },
  groupedRow: {
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    marginHorizontal: horizontalGutter,
    overflow: 'hidden',
  },
  groupedRowFirst: {
    borderTopLeftRadius: radii.large,
    borderTopRightRadius: radii.large,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  groupedRowLast: {
    borderBottomLeftRadius: radii.large,
    borderBottomRightRadius: radii.large,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  separator: {
    backgroundColor: semanticColors.borderSubtle,
    height: StyleSheet.hairlineWidth,
    marginLeft: ROW_SEPARATOR_INSET,
  },
  serviceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 68,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  serviceRowPressed: { backgroundColor: semanticColors.surfaceLavender },
  serviceCopy: { flex: 1, gap: 3, minWidth: 0 },
  serviceName: { color: semanticColors.foreground },
  serviceMeta: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  price: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
});
