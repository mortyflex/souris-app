import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import {
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  View,
  type SectionListData,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Service } from '@/domain/appointments';
import {
  formatServiceDuration,
  formatServicePrice,
  getServiceDurationMinutes,
  getServiceProcessingMinutes,
} from '@/features/services/presentation';
import { useServiceCatalog } from '@/features/services/session/ServiceCatalogProvider';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import {
  foregroundSoft,
  gutter,
  interaction,
  lavender,
  radii,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import { buildCatalogSections, type CatalogListSection } from './catalog-sections';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

export function ServiceCatalogScreen() {
  const router = useRouter();
  const { services } = useServiceCatalog();
  const sections: readonly SectionListData<Service, CatalogListSection>[] =
    buildCatalogSections(services);

  const openService = (serviceId: string) => {
    router.push({ pathname: '/services/[serviceId]', params: { serviceId } });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retour"
          hitSlop={spacing.sm}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressedControl]}
        >
          <SymbolView
            name={{ ios: 'chevron.left', android: 'arrow_back' }}
            size={18}
            tintColor={semanticColors.foreground}
          />
        </Pressable>
        <AppText variant="eyebrow" style={styles.eyebrow}>
          GESTION
        </AppText>
        <View style={styles.backButton} />
      </View>

      <SectionList
        sections={sections}
        initialNumToRender={40}
        keyExtractor={(service) => service.id}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.intro}>
            <AppText variant="screenTitle" accessibilityRole="header">
              Prestations & tarifs
            </AppText>
            <AppButton
              accessibilityLabel="Ajouter une prestation"
              onPress={() => router.push('/services/new')}
              style={styles.addButton}
              title="Ajouter une prestation"
            />
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeaderBlock}>
            {section.showGroupLabel && (
              <AppText variant="eyebrow" style={styles.groupEyebrow}>
                {section.groupLabel === 'ACTIVES' ? 'Actives' : 'Inactives'}
              </AppText>
            )}
            <SectionHeader count={section.data.length} title={section.title} />
          </View>
        )}
        renderItem={({ item }) => (
          <ServiceCatalogRow service={item} onPress={() => openService(item.id)} />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <AppText variant="stateTitle">Aucune prestation</AppText>
            <AppText variant="metadata" style={styles.emptyStateText}>
              Ajoutez votre première prestation pour alimenter les rendez-vous.
            </AppText>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function ServiceCatalogRow({
  service,
  onPress,
}: {
  readonly service: Service;
  readonly onPress: () => void;
}) {
  const duration = getServiceDurationMinutes(service);
  const processing = getServiceProcessingMinutes(service);
  const meta =
    service.type === 'TECHNIQUE' && processing > 0
      ? `${formatServiceDuration(duration)} · dont ${formatServiceDuration(processing)} de pose`
      : formatServiceDuration(duration);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${service.name}, ${formatServicePrice(service.price)}, ${meta}`}
      onPress={onPress}
      style={({ pressed }) => [styles.serviceRow, pressed && styles.serviceRowPressed]}
    >
      <View style={styles.serviceCopy}>
        <AppText variant="rowTitle" numberOfLines={1} style={styles.serviceName}>
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
  backButton: {
    alignItems: 'center',
    borderRadius: radii.small,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  pressedControl: {
    opacity: interaction.pressedOpacity,
    transform: [{ scale: interaction.pressedScale }],
  },
  eyebrow: { color: semanticColors.accent },
  content: { paddingBottom: spacing['3xl'] },
  intro: {
    gap: spacing.base,
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.base,
  },
  addButton: { alignSelf: 'stretch' },
  sectionHeaderBlock: {
    backgroundColor: semanticColors.screenWarm,
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing['2xl'],
  },
  groupEyebrow: { color: semanticColors.foregroundSoft },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing['2xl'],
  },
  emptyStateText: {
    color: foregroundSoft,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  serviceRow: {
    alignItems: 'center',
    borderBottomColor: semanticColors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    marginHorizontal: horizontalGutter,
    minHeight: 64,
    paddingVertical: spacing.sm,
  },
  serviceRowPressed: { backgroundColor: semanticColors.surfaceLavender },
  serviceCopy: { flex: 1, gap: 3, minWidth: 0 },
  serviceName: { color: lavender.lav700 },
  serviceMeta: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  price: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
});
