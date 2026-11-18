// BeautIzzy — Prestations proposées en ligne (Plus › Réservation en ligne)
//
// The professional chooses which of her EXISTING catalogue services
// customers may book on her public page. There is no second catalogue: the
// list is the SERVER's view of her catalogue (online_booking_read_service_
// publication), each service with her choice, THE eligibility rule and what
// is offered (docs/architecture/ONLINE_BOOKING.md §12). The device's own
// catalogue is never what decides — it only tells which services can be
// opened in the editor and which are not synchronized yet.
//
// - Each switch saves at once (online_booking_set_service_publication). While
//   a change is in flight every switch waits; the switch shows the asked
//   value with a spinner, and nothing says « proposée » until the server
//   answered. A refusal or a failure puts the server's state back and says
//   why; the answer of a success IS the new list (another device's changes
//   included).
// - Transparency: what becomes public is shown before it is: the facts line
//   (duration, price — « Tarif à confirmer » for a price of 0, never
//   « free »), the first lines of the description and the « Aperçu en ligne »
//   sheet with the whole text exactly as the server will publish it, and a
//   way to the existing editor to change it. Nothing is stored here.
// - Unavailable services (inactive, no duration, longer than the limit) are
//   gathered last with their reason. A choice already made stays visible on
//   them and can be withdrawn; it comes back into effect on reactivation.
// - « Tout proposer » / « Tout retirer » ask first and send exactly the ids
//   the list shows, in ONE all-or-nothing change.
// - Server-owned, like the rest of Réservation en ligne: connectivity is
//   needed, nothing is queued in the offline sync, a failure changes nothing.
//   A project without the migration answers UNAVAILABLE: a notice, never a
//   fake state. No subscription is needed to prepare the selection.
//
// The list is read again whenever the screen regains focus (back from the
// editor, another tab), never over a change in flight. It reads no sync state
// (production-boundary.test.ts): a description just edited on this device
// appears here once its synchronization reached the server and the screen is
// focused again.

import { useIsFocused, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCurrentBusiness } from '@/features/business/session/CurrentBusinessProvider';
import { getCataloguePresentation } from '@/features/services/catalogue-presentation';
import { PrestationIcon } from '@/features/services/components/PrestationIcon';
import type { PrestationVisualContext } from '@/features/services/prestation-visual';
import { useServiceCatalog } from '@/features/services/session/ServiceCatalogProvider';
import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { ConfirmationDialog } from '@/shared/ui/ConfirmationDialog';
import { FormScrollView } from '@/shared/ui/FormScrollView';
import { GlassIconButton, glassIcons } from '@/shared/ui/GlassIconButton';
import { GroupedSeparator, GroupedSurface } from '@/shared/ui/GroupedSurface';
import { SheetHeader } from '@/shared/ui/SheetHeader';
import {
  foregroundSoft,
  gutter,
  interaction,
  radii,
  rose,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import {
  OnlineBookingGatewayError,
  type BookingProfile,
  type OnlineBookingFailureCode,
  type PublishableService,
  type ServicePublication,
} from '../gateway';
import { useOnlineBookingGateway } from '../session/OnlineBookingGatewayProvider';

import {
  canToggleService,
  DESCRIPTION_MISSING,
  describePagePublicationContext,
  describeSelectAllConfirmation,
  describeServiceAvailability,
  describeServiceFacts,
  describeServicePublicationLoadFailure,
  describeServicePublicationRefusal,
  describeServicePublicationSaved,
  describeServicePublicationWriteFailure,
  describeServiceRowForAccessibility,
  describeUnsyncedServices,
  describeWithdrawAllConfirmation,
  formatPublicationDuration,
  formatPublicationPrice,
  SELECT_ALL_LABEL,
  SERVICE_PUBLICATION_INTRO,
  SERVICE_PUBLICATION_PRIVATE_NOTE,
  SERVICE_PUBLICATION_TITLE,
  UNAVAILABLE_SECTION_NOTE,
  WITHDRAW_ALL_LABEL,
} from './presentation';
import {
  buildServicePublicationSections,
  canSelectAll,
  canWithdrawAll,
  planSelectAll,
  planWithdrawAll,
} from './sections';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

type LoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready' }
  | { readonly status: 'failed'; readonly code?: OnlineBookingFailureCode };

type Notice = { readonly tone: 'failure' | 'success'; readonly text: string };

/** A change in flight: the ids and the value asked — shown, never confirmed. */
interface PendingChange {
  readonly serviceIds: readonly string[];
  readonly selected: boolean;
}

type BulkAction = 'select' | 'withdraw';

export function ServicePublicationScreen() {
  const router = useRouter();
  const gateway = useOnlineBookingGateway();
  const business = useCurrentBusiness();
  const { services: localServices, getServiceById } = useServiceCatalog();
  const focused = useIsFocused();
  const presentation = getCataloguePresentation(business.activityType);

  /** The last server-confirmed list; undefined until a read succeeds. */
  const [publication, setPublication] = useState<ServicePublication>();
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const [profile, setProfile] = useState<BookingProfile>();
  const [pending, setPending] = useState<PendingChange>();
  const [notice, setNotice] = useState<Notice>();
  const [previewId, setPreviewId] = useState<string>();
  const [previewVisible, setPreviewVisible] = useState(false);
  const [bulk, setBulk] = useState<BulkAction>();
  // Synchronous guards: a second tap in the same frame never starts a second
  // write, and a read that started before a write never overwrites its answer.
  const writing = useRef(false);
  const writeSerial = useRef(0);
  /** What to open once the preview sheet is completely gone. */
  const afterPreview = useRef<(() => void) | undefined>(undefined);

  // The server's list — when the screen is (again) focused, after a retry or
  // a refusal. Never over a write.
  useEffect(() => {
    if (gateway === undefined || !focused) return;
    let cancelled = false;
    const startedAt = writeSerial.current;
    gateway
      .readServicePublication(business.id)
      .then((next) => {
        if (cancelled || writing.current || writeSerial.current !== startedAt) return;
        setPublication(next);
        setLoad({ status: 'ready' });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const code = error instanceof OnlineBookingGatewayError ? error.code : undefined;
        // A list already shown stays: a background read that fails changes nothing.
        setLoad((current) => (current.status === 'ready' ? current : { status: 'failed', code }));
      });
    return () => {
      cancelled = true;
    };
  }, [business.id, focused, gateway, reloadToken]);

  // The page state, for ONE line of context. Optional: without it the line is generic.
  useEffect(() => {
    if (gateway === undefined) return;
    let cancelled = false;
    gateway
      .readProfile(business.id)
      .then((next) => {
        if (!cancelled) setProfile(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [business.id, gateway]);

  const header = (
    <View style={styles.topBar}>
      <GlassIconButton
        accessibilityLabel="Retour"
        icon={glassIcons.back}
        onPress={() => router.back()}
        testID="service-publication-back"
      />
      <AppText variant="eyebrow" style={styles.eyebrow}>
        RÉSERVATION EN LIGNE
      </AppText>
      <View style={styles.topBarSpacer} />
    </View>
  );

  if (gateway === undefined || publication === undefined) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']} testID="service-publication-screen">
        {header}
        <View style={styles.content}>
          <AppText variant="screenTitle" accessibilityRole="header">
            {SERVICE_PUBLICATION_TITLE}
          </AppText>
          {load.status === 'failed' || gateway === undefined ? (
            <View style={styles.offlineNotice} testID="service-publication-unavailable">
              <AppText variant="metadata" accessibilityLiveRegion="polite" style={styles.soft}>
                {describeServicePublicationLoadFailure(load.status === 'failed' ? load.code : undefined)}
              </AppText>
              {gateway !== undefined && (
                <AppButton
                  onPress={() => {
                    setLoad({ status: 'loading' });
                    setReloadToken((token) => token + 1);
                  }}
                  testID="service-publication-retry"
                  title="Réessayer"
                  variant="tertiary"
                />
              )}
            </View>
          ) : (
            <ActivityIndicator
              accessibilityLabel="Chargement de vos prestations"
              color={semanticColors.accent}
              style={styles.loading}
              testID="service-publication-loading"
            />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const nameOf = (serviceId: string) => publication.services.find((service) => service.id === serviceId)?.name;

  /** Resolves true only when the server stored the change. */
  const change = async (serviceIds: readonly string[], selected: boolean): Promise<boolean> => {
    if (writing.current || serviceIds.length === 0) return false;
    writing.current = true;
    writeSerial.current += 1;
    setPending({ serviceIds, selected });
    setNotice(undefined);
    try {
      const result = await gateway.setServicePublication(business.id, serviceIds, selected);
      if (result.status === 'UPDATED') {
        setPublication(result.publication);
        setNotice({
          tone: 'success',
          text: describeServicePublicationSaved(
            { selected, serviceIds },
            serviceIds.length === 1 ? nameOf(serviceIds[0]!) : undefined,
          ),
        });
        haptics.success();
        return true;
      }
      // The list was stale (deleted or deactivated elsewhere): nothing was
      // written; say what happened and read the server's list again.
      setNotice({
        tone: 'failure',
        text: describeServicePublicationRefusal(result, nameOf(result.serviceId), publication.maxServiceMinutes),
      });
      setReloadToken((token) => token + 1);
      haptics.warning();
      return false;
    } catch (error) {
      setNotice({
        tone: 'failure',
        text: describeServicePublicationWriteFailure(
          error instanceof OnlineBookingGatewayError ? error.code : undefined,
        ),
      });
      haptics.warning();
      return false;
    } finally {
      writing.current = false;
      setPending(undefined);
    }
  };

  const toggle = (service: PublishableService, selected: boolean) => {
    if (selected && !service.eligible) return;
    void change([service.id], selected);
  };

  const busy = pending !== undefined;
  const selectedValueOf = (service: PublishableService) =>
    pending !== undefined && pending.serviceIds.includes(service.id) ? pending.selected : service.selected;

  const sections = buildServicePublicationSections(publication, presentation.organization);
  const serverIds = new Set(publication.services.map((service) => service.id));
  const unsyncedNote = describeUnsyncedServices(
    localServices.filter((service) => !serverIds.has(service.id)).length,
  );
  const selectAll = planSelectAll(publication);
  const withdrawAll = planWithdrawAll(publication);
  const showSelectAll = canSelectAll(publication) && !selectAll.tooMany;
  const showWithdrawAll = canWithdrawAll(publication) && !withdrawAll.tooMany;
  const confirmation =
    bulk === 'select'
      ? describeSelectAllConfirmation(selectAll.serviceIds.length)
      : describeWithdrawAllConfirmation(withdrawAll.serviceIds.length);

  const confirmBulk = async () => {
    if (bulk === undefined) return;
    const plan = bulk === 'select' ? selectAll : withdrawAll;
    await change(plan.serviceIds, bulk === 'select');
    setBulk(undefined);
  };

  const preview = publication.services.find((service) => service.id === previewId);
  const openPreview = (serviceId: string) => {
    if (previewVisible) return;
    haptics.selection();
    setPreviewId(serviceId);
    setPreviewVisible(true);
  };
  const editInCatalogue = (serviceId: string) => {
    // Opened once the sheet is completely gone (a route over a closing Modal is never safe).
    afterPreview.current = () => router.push({ pathname: '/services/[serviceId]', params: { serviceId } });
    setPreviewVisible(false);
  };
  const visualContextOf = (service: PublishableService): PrestationVisualContext => ({
    activityType: business.activityType,
    ...(service.category !== undefined ? { category: { name: service.category.name } } : {}),
  });

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']} testID="service-publication-screen">
      {header}
      <FormScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppText variant="screenTitle" accessibilityRole="header">
          {SERVICE_PUBLICATION_TITLE}
        </AppText>
        <View style={styles.intro}>
          <AppText variant="metadata" style={styles.soft}>
            {SERVICE_PUBLICATION_INTRO}
          </AppText>
          <AppText variant="metadata" style={styles.soft}>
            {SERVICE_PUBLICATION_PRIVATE_NOTE}
          </AppText>
        </View>

        <View style={styles.context} testID="service-publication-context">
          <AppText variant="metadata" style={styles.contextText}>
            {describePagePublicationContext(profile)}
          </AppText>
        </View>

        {unsyncedNote !== undefined && (
          <AppText variant="metadata" style={styles.soft} testID="service-publication-unsynced">
            {unsyncedNote}
          </AppText>
        )}

        {(showSelectAll || showWithdrawAll) && (
          <View style={styles.bulkActions}>
            {showSelectAll && (
              <AppButton
                disabled={busy}
                onPress={() => setBulk('select')}
                testID="service-publication-select-all"
                title={SELECT_ALL_LABEL}
                variant="secondary"
              />
            )}
            {showWithdrawAll && (
              <AppButton
                disabled={busy}
                onPress={() => setBulk('withdraw')}
                testID="service-publication-withdraw-all"
                title={WITHDRAW_ALL_LABEL}
                variant="tertiary"
              />
            )}
          </View>
        )}

        {notice !== undefined && (
          <AppText
            variant="metadata"
            accessibilityLiveRegion="polite"
            style={notice.tone === 'failure' ? styles.failure : styles.soft}
            testID="service-publication-notice"
          >
            {notice.text}
          </AppText>
        )}

        {publication.services.length === 0 ? (
          <View style={styles.empty} testID="service-publication-empty">
            <AppText variant="stateTitle">Aucune prestation dans votre catalogue</AppText>
            <AppText variant="metadata" style={styles.soft}>
              Créez vos prestations dans Prestations & tarifs : vous pourrez ensuite choisir celles que vos clients
              réservent en ligne.
            </AppText>
            <AppButton
              onPress={() => router.push('/services')}
              testID="service-publication-open-catalogue"
              title="Ouvrir Prestations & tarifs"
              variant="secondary"
            />
          </View>
        ) : (
          sections.map((section) => (
            <View key={section.key} style={styles.section} testID={`service-publication-section-${section.key}`}>
              {section.groupLabel !== undefined && (
                <AppText variant="eyebrow" style={styles.groupLabel}>
                  {section.groupLabel.toUpperCase()}
                </AppText>
              )}
              <AppText variant="sectionTitle" accessibilityRole="header">
                {section.title}
              </AppText>
              {section.unavailable && (
                <AppText variant="metadata" style={styles.soft}>
                  {UNAVAILABLE_SECTION_NOTE}
                </AppText>
              )}
              <GroupedSurface>
                {section.services.map((service, index) => (
                  <View key={service.id}>
                    {index > 0 && <GroupedSeparator inset={spacing.base} />}
                    <ServicePublicationRow
                      busy={busy}
                      maxServiceMinutes={publication.maxServiceMinutes}
                      onPreview={() => openPreview(service.id)}
                      onToggle={(selected) => toggle(service, selected)}
                      pending={pending !== undefined && pending.serviceIds.includes(service.id)}
                      selected={selectedValueOf(service)}
                      service={service}
                      visualContext={visualContextOf(service)}
                    />
                  </View>
                ))}
              </GroupedSurface>
            </View>
          ))
        )}
      </FormScrollView>

      <BottomSheet
        backdropLabel="Fermer l’aperçu"
        header={
          preview !== undefined ? (
            <SheetHeader eyebrow="APERÇU EN LIGNE" title={preview.name} titleNumberOfLines={3} />
          ) : undefined
        }
        onClose={() => setPreviewVisible(false)}
        onDismissed={() => {
          const next = afterPreview.current;
          afterPreview.current = undefined;
          setPreviewId(undefined);
          next?.();
        }}
        scrollable
        testID="service-publication-preview"
        visible={previewVisible && preview !== undefined}
      >
        {preview !== undefined && (
          <ServicePublicationPreview
            busy={busy}
            editable={getServiceById(preview.id) !== undefined}
            maxServiceMinutes={publication.maxServiceMinutes}
            onEdit={() => editInCatalogue(preview.id)}
            onToggle={(selected) => toggle(preview, selected)}
            pending={pending !== undefined && pending.serviceIds.includes(preview.id)}
            selected={selectedValueOf(preview)}
            service={preview}
          />
        )}
      </BottomSheet>

      <ConfirmationDialog
        body={confirmation.body}
        busy={busy}
        cancelLabel="Annuler"
        cancelTestID="service-publication-bulk-cancel"
        confirmLabel={bulk === 'select' ? SELECT_ALL_LABEL : WITHDRAW_ALL_LABEL}
        confirmTestID="service-publication-bulk-confirm"
        eyebrow="RÉSERVATION EN LIGNE"
        onCancel={() => setBulk(undefined)}
        onConfirm={() => void confirmBulk()}
        testID="service-publication-bulk-dialog"
        title={confirmation.title}
        tone={bulk === 'withdraw' ? 'destructive' : 'neutral'}
        visible={bulk !== undefined}
      />
    </SafeAreaView>
  );
}

/**
 * The native switch, coloured like SwitchRow (Android gets an explicit white
 * thumb on the violet track; a disabled "on" track fades to lavender).
 */
function PublicationSwitch({
  value,
  disabled,
  onValueChange,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: {
  readonly value: boolean;
  readonly disabled: boolean;
  readonly onValueChange: (value: boolean) => void;
  readonly accessibilityLabel: string;
  readonly accessibilityHint?: string;
  readonly testID: string;
}) {
  const isAndroid = Platform.OS === 'android';
  return (
    <Switch
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onValueChange={onValueChange}
      testID={testID}
      thumbColor={isAndroid ? semanticColors.onAccent : undefined}
      trackColor={{
        true: isAndroid && disabled ? semanticColors.borderLavender : semanticColors.accent,
        false: undefined,
      }}
      value={value}
    />
  );
}

function switchHint(service: PublishableService): string | undefined {
  if (!canToggleService(service)) return 'Indisponible en ligne : cette prestation ne peut pas être proposée.';
  if (!service.eligible) return 'Retire ce choix ; la prestation reste dans votre catalogue.';
  return service.selected
    ? 'Retire cette prestation de votre page ; elle reste dans votre catalogue.'
    : 'Rend cette prestation visible et réservable sur votre page.';
}

function ServicePublicationRow({
  service,
  selected,
  pending,
  busy,
  maxServiceMinutes,
  visualContext,
  onToggle,
  onPreview,
}: {
  readonly service: PublishableService;
  /** The value shown: the server's, or the one asked while a change is in flight. */
  readonly selected: boolean;
  readonly pending: boolean;
  readonly busy: boolean;
  readonly maxServiceMinutes: number;
  readonly visualContext: PrestationVisualContext;
  readonly onToggle: (selected: boolean) => void;
  readonly onPreview: () => void;
}) {
  const availability = describeServiceAvailability(service, maxServiceMinutes);
  return (
    <View style={styles.row} testID={`service-publication-row-${service.id}`}>
      <Pressable
        accessibilityHint="Affiche ce que vos clients verront en ligne"
        accessibilityLabel={describeServiceRowForAccessibility(service, maxServiceMinutes)}
        accessibilityRole="button"
        onPress={onPreview}
        style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
        testID={`service-publication-preview-${service.id}`}
      >
        <PrestationIcon
          context={visualContext}
          prestation={service}
          size="row"
          testID={`service-publication-icon-${service.id}`}
        />
        <View style={styles.rowCopy}>
          <AppText variant="rowTitle" numberOfLines={2} style={!service.eligible && styles.unavailableName}>
            {service.name}
          </AppText>
          <AppText variant="metadata" style={styles.soft} testID={`service-publication-facts-${service.id}`}>
            {describeServiceFacts(service)}
          </AppText>
          {service.description !== undefined ? (
            <AppText
              variant="metadata"
              numberOfLines={2}
              style={styles.description}
              testID={`service-publication-description-${service.id}`}
            >
              {service.description}
            </AppText>
          ) : (
            <AppText variant="metadata" style={styles.missing} testID={`service-publication-description-${service.id}`}>
              {DESCRIPTION_MISSING}
            </AppText>
          )}
          {availability !== undefined && (
            <AppText
              variant="metadata"
              style={service.selected ? styles.attention : styles.soft}
              testID={`service-publication-availability-${service.id}`}
            >
              {availability}
            </AppText>
          )}
          <AppText variant="metadata" style={styles.previewLink}>
            Aperçu en ligne
          </AppText>
        </View>
      </Pressable>
      <View style={styles.switchColumn}>
        <PublicationSwitch
          accessibilityHint={switchHint(service)}
          accessibilityLabel={`Proposer « ${service.name} » en ligne`}
          disabled={busy || !canToggleService(service)}
          onValueChange={onToggle}
          testID={`service-publication-switch-${service.id}`}
          value={selected}
        />
        {pending && (
          <ActivityIndicator
            accessibilityLabel="Enregistrement en cours"
            color={semanticColors.accent}
            size="small"
            testID={`service-publication-pending-${service.id}`}
          />
        )}
      </View>
    </View>
  );
}

function ServicePublicationPreview({
  service,
  selected,
  pending,
  busy,
  editable,
  maxServiceMinutes,
  onToggle,
  onEdit,
}: {
  readonly service: PublishableService;
  readonly selected: boolean;
  readonly pending: boolean;
  readonly busy: boolean;
  /** The service is on this device, so the editor can open it. */
  readonly editable: boolean;
  readonly maxServiceMinutes: number;
  readonly onToggle: (selected: boolean) => void;
  readonly onEdit: () => void;
}) {
  const availability = describeServiceAvailability(service, maxServiceMinutes);
  return (
    <View style={styles.preview}>
      <AppText variant="metadata" style={styles.soft}>
        Ce que vos clients voient sur votre page lorsque cette prestation est proposée.
      </AppText>

      <GroupedSurface>
        <PreviewFact label="Durée" value={formatPublicationDuration(service.durationMinutes)} />
        <GroupedSeparator inset={spacing.base} />
        <PreviewFact label="Prix" testID="service-publication-preview-price" value={formatPublicationPrice(service.priceCents)} />
        {service.category !== undefined && (
          <>
            <GroupedSeparator inset={spacing.base} />
            <PreviewFact label="Catégorie" value={service.category.name} />
          </>
        )}
      </GroupedSurface>
      {service.priceCents === 0 && (
        <AppText variant="metadata" style={styles.soft} testID="service-publication-preview-price-note">
          Le prix de cette prestation est de 0 € dans votre catalogue : votre page affiche « Tarif à confirmer », jamais
          « Gratuit ». Indiquez son prix dans votre catalogue pour l’afficher.
        </AppText>
      )}

      <View style={styles.previewDescription}>
        <AppText variant="eyebrow" style={styles.groupLabel}>
          DESCRIPTION VISIBLE EN LIGNE
        </AppText>
        <View style={styles.descriptionBox}>
          <AppText
            selectable
            variant="body"
            style={service.description === undefined ? styles.missing : undefined}
            testID="service-publication-preview-description"
          >
            {service.description ?? DESCRIPTION_MISSING}
          </AppText>
        </View>
        <AppText variant="metadata" style={styles.soft}>
          {service.description === undefined
            ? 'Vous pouvez en ajouter une dans votre catalogue : elle apparaîtra sous le nom de la prestation.'
            : 'Ce texte vient de votre catalogue : vérifiez qu’il ne contient rien de personnel. Il est visible dès que la prestation est proposée et que votre page est en ligne.'}
        </AppText>
      </View>

      {availability !== undefined && (
        <AppText variant="metadata" style={service.selected ? styles.attention : styles.soft}>
          {availability}
        </AppText>
      )}

      <GroupedSurface>
        <View style={styles.previewSwitchRow}>
          <View style={styles.rowCopy}>
            <AppText variant="rowTitle">Proposer en ligne</AppText>
            <AppText variant="metadata" style={styles.soft}>
              {selected ? 'Visible sur votre page lorsqu’elle est en ligne.' : 'Reste dans votre catalogue privé.'}
            </AppText>
          </View>
          {pending && <ActivityIndicator color={semanticColors.accent} size="small" />}
          <PublicationSwitch
            accessibilityHint={switchHint(service)}
            accessibilityLabel={`Proposer « ${service.name} » en ligne`}
            disabled={busy || !canToggleService(service)}
            onValueChange={onToggle}
            testID="service-publication-preview-switch"
            value={selected}
          />
        </View>
      </GroupedSurface>

      {editable ? (
        <AppButton
          icon={{ ios: 'square.and.pencil', android: 'edit' }}
          onPress={onEdit}
          testID="service-publication-preview-edit"
          title="Modifier dans mon catalogue"
          variant="secondary"
        />
      ) : (
        <AppText variant="metadata" style={styles.soft} testID="service-publication-preview-not-on-device">
          Cette prestation n’est pas encore sur cet appareil : vous pourrez la modifier après la synchronisation.
        </AppText>
      )}
    </View>
  );
}

function PreviewFact({ label, value, testID }: { readonly label: string; readonly value: string; readonly testID?: string }) {
  return (
    <View style={styles.fact}>
      <AppText variant="metadata" style={styles.factLabel}>
        {label}
      </AppText>
      <AppText variant="control" style={styles.factValue} testID={testID}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.screenWarm, flex: 1 },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: horizontalGutter,
    paddingVertical: spacing.sm,
  },
  eyebrow: { color: foregroundSoft },
  topBarSpacer: { width: 44 },
  content: {
    gap: spacing.lg,
    paddingBottom: spacing['3xl'],
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.sm,
  },
  intro: { gap: spacing.xs },
  soft: { color: foregroundSoft },
  // Text on the app background: rose600 falls to ~4.3:1 there.
  failure: { color: rose.rose700 },
  attention: { color: rose.rose700 },
  loading: { alignSelf: 'flex-start', marginTop: spacing.base },
  offlineNotice: { alignItems: 'flex-start', gap: spacing.xs },
  context: {
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  contextText: { color: semanticColors.foreground },
  bulkActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  empty: { alignItems: 'flex-start', gap: spacing.sm },
  section: { gap: spacing.sm },
  groupLabel: { color: semanticColors.accent },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingRight: spacing.base,
  },
  rowMain: {
    alignItems: 'flex-start',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 72,
    minWidth: 0,
    paddingLeft: spacing.base,
    paddingVertical: spacing.md,
  },
  pressed: { backgroundColor: semanticColors.surfaceLavender, opacity: interaction.pressedOpacity },
  rowCopy: { flex: 1, gap: 2, minWidth: 0 },
  unavailableName: { color: foregroundSoft },
  description: { color: semanticColors.foreground },
  missing: { color: semanticColors.foregroundMuted, fontStyle: 'italic' },
  previewLink: { color: semanticColors.accent, fontWeight: '600', marginTop: 2 },
  switchColumn: { alignItems: 'center', gap: spacing.xs, minWidth: 52 },
  preview: { gap: spacing.base, paddingBottom: spacing.base },
  fact: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  factLabel: { color: foregroundSoft },
  factValue: { color: semanticColors.foreground, flexShrink: 1, textAlign: 'right' },
  previewDescription: { gap: spacing.sm },
  descriptionBox: {
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  previewSwitchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 60,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
});
