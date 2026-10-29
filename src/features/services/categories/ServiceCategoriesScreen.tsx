// BeautIzzy — Prestations & tarifs › Catégories
//
// THE place where the professional manages her own categories
// (src/domain/services/categories.ts): create, rename, describe, reorder and
// delete. The Prestation form only chooses among them. Free names — the
// profession's example is a placeholder, never a proposal written for her —
// and no category exists until she creates one.
//
// - The categories form ONE grouped list, in the order of the catalogue and
//   the appointment picker. Each row: the shared drag handle, the category
//   pictogram, the name, the optional description and how many prestations
//   it holds. The interaction is the app's list management, never a separate
//   tool: press and hold the handle → drag → release reorders
//   (SortableRowList, with its haptics and adjustable accessibility actions);
//   a swipe to the right deletes (SwipeToDeleteRow, with its one-time hint).
// - Tapping a row edits it in place: name, description, « Enregistrer »,
//   « Supprimer » (the path that never needs a gesture). One row is edited at
//   a time; while a category is edited or created, the list neither drags nor
//   swipes.
// - Deleting — by swipe or from the edit card — asks first and says what
//   happens: the prestations of the category become « Sans catégorie »; no
//   prestation, appointment or price is touched. The swiped row closes again
//   until the confirmation.
// - The « + » opens the inline « Nouvelle catégorie » card at the top of the
//   list at once (scrolled into view; pressing it again never opens a second
//   card). Prestations are created from Prestations & tarifs, whose « + »
//   also offers « Nouvelle catégorie »: it lands here with the card already
//   open (`startCreating`). Cancelling closes the card and stays here.
// Every mutation goes through the catalogue session (write guard, SQLite,
// outbox); a refusal is reported by the canonical persistence alert.

import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, type ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  isValidServiceCategoryName,
  isValidServiceDescription,
  SERVICE_CATEGORY_NAME_MAX_LENGTH,
  SERVICE_DESCRIPTION_MAX_LENGTH,
  type ServiceCategory,
} from '@/domain/services';
import { LEADING_DRAG_HANDLE_WIDTH, SortableRowList } from '@/features/appointments/editor/components/SortableRowList';
import { ServiceCategoryIcon } from '@/features/services/components/PrestationIcon';
import { useServiceCatalog } from '@/features/services/session/ServiceCatalogProvider';
import { useCatalogueView } from '@/features/services/use-catalogue-view';
import { alertPersistenceFailure } from '@/providers/persistence-failure';
import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { ConfirmationDialog } from '@/shared/ui/ConfirmationDialog';
import { FloatingCreateButton } from '@/shared/ui/FloatingCreateButton';
import { FormScrollView } from '@/shared/ui/FormScrollView';
import { GlassIconButton, glassIconButtonSize, glassIcons } from '@/shared/ui/GlassIconButton';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { SwipeToDeleteRow, useSwipeHintTarget } from '@/shared/ui/SwipeToDeleteRow';
import { TextField } from '@/shared/ui/TextField';
import {
  bottomClearance,
  foregroundSoft,
  gutter,
  radii,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;
const ROW_ICON_SIZE = 44;

interface CategoryDraft {
  readonly name: string;
  readonly description: string;
}

const EMPTY_DRAFT: CategoryDraft = { name: '', description: '' };

export const NEW_CATEGORY_ACTION_LABEL = 'Nouvelle catégorie';
export const CATEGORY_DESCRIPTION_LABEL = 'Description de la catégorie (facultative)';

function prestationCount(count: number): string {
  return count === 0 ? 'Aucune prestation' : `${count} prestation${count > 1 ? 's' : ''}`;
}

function isValidDraft(draft: CategoryDraft): boolean {
  return isValidServiceCategoryName(draft.name) && isValidServiceDescription(draft.description);
}

interface ServiceCategoriesScreenProps {
  /** Opens the « Nouvelle catégorie » card on arrival (the Prestations & tarifs « + »). */
  readonly startCreating?: boolean;
}

export function ServiceCategoriesScreen({ startCreating: createOnArrival = false }: ServiceCategoriesScreenProps) {
  const router = useRouter();
  const { presentation } = useCatalogueView();
  const { categories, addCategory, updateCategory, moveCategory, deleteCategory, countServicesInCategory } =
    useServiceCatalog();
  const [editingId, setEditingId] = useState<string>();
  const [editDraft, setEditDraft] = useState<CategoryDraft>(EMPTY_DRAFT);
  const [creating, setCreating] = useState(createOnArrival);
  const scrollView = useRef<ScrollView>(null);
  const [createDraft, setCreateDraft] = useState<CategoryDraft>(EMPTY_DRAFT);
  const [attempted, setAttempted] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState<ServiceCategory>();
  // ONE swipe hint per screen instance, on the first category present at mount.
  const swipeHintTarget = useSwipeHintTarget(categories[0]?.id);
  const managing = editingId === undefined && !creating;

  const run = (mutation: () => void): boolean => {
    try {
      mutation();
      return true;
    } catch (error) {
      alertPersistenceFailure(error);
      return false;
    }
  };

  const startEditing = (category: ServiceCategory) => {
    haptics.selection();
    setCreating(false);
    setAttempted(false);
    setEditingId(category.id);
    setEditDraft({ name: category.name, description: category.description ?? '' });
  };

  const saveEdit = () => {
    if (editingId === undefined) return;
    setAttempted(true);
    if (!isValidDraft(editDraft)) return;
    if (!run(() => updateCategory(editingId, editDraft))) return;
    haptics.success();
    setEditingId(undefined);
    setAttempted(false);
  };

  const startCreating = () => {
    // The card sits at the top of the list: bring it into view.
    scrollView.current?.scrollTo({ y: 0, animated: true });
    // Already open: keep what was typed, never a second card.
    if (creating) return;
    setEditingId(undefined);
    setAttempted(false);
    setCreateDraft(EMPTY_DRAFT);
    setCreating(true);
  };

  const cancelCreating = () => {
    setCreating(false);
    setCreateDraft(EMPTY_DRAFT);
    setAttempted(false);
  };

  const create = () => {
    setAttempted(true);
    if (!isValidDraft(createDraft)) return;
    if (!run(() => addCategory(createDraft))) return;
    haptics.success();
    cancelCreating();
  };

  // A drop of the shared drag-and-drop list; `false` puts the rows back.
  const reorder = (fromIndex: number, toIndex: number): boolean => {
    const category = categories[fromIndex];
    if (!category) return false;
    return run(() => moveCategory(category.id, toIndex));
  };

  // The swipe never deletes by itself: it asks, and the row closes meanwhile.
  const requestDeletion = (category: ServiceCategory): boolean => {
    setPendingDeletion(category);
    return false;
  };

  const confirmDeletion = () => {
    const category = pendingDeletion;
    setPendingDeletion(undefined);
    if (!category) return;
    if (!run(() => deleteCategory(category.id))) return;
    haptics.warning();
    setEditingId(undefined);
  };

  const pendingCount = pendingDeletion ? countServicesInCategory(pendingDeletion.id) : 0;

  const renderRow = (category: ServiceCategory, dragHandle: ReactNode, separated: boolean) => {
    if (editingId === category.id) {
      return (
        <View style={styles.editingRow} testID={`service-category-edit-${category.id}`}>
          {separated && <View style={[styles.separator, styles.separatorFull]} />}
          <View style={styles.editingCard}>
            <CategoryFields
              attempted={attempted}
              draft={editDraft}
              namePlaceholder={presentation.categoryNameExample}
              onChange={setEditDraft}
              testIDPrefix="service-category-edit"
            />
            <View style={styles.actions}>
              <AppButton
                onPress={() => setPendingDeletion(category)}
                testID="service-category-delete"
                title="Supprimer"
                variant="tertiary"
              />
              <View style={styles.actionsEnd}>
                <AppButton
                  onPress={() => setEditingId(undefined)}
                  testID="service-category-edit-cancel"
                  title="Annuler"
                  variant="tertiary"
                />
                <AppButton onPress={saveEdit} testID="service-category-save" title="Enregistrer" variant="secondary" />
              </View>
            </View>
          </View>
        </View>
      );
    }

    const count = prestationCount(countServicesInCategory(category.id));
    const row = (
      <View style={styles.row}>
        {separated && (
          <View
            style={[
              styles.separator,
              { marginLeft: (dragHandle ? LEADING_DRAG_HANDLE_WIDTH : spacing.base) + ROW_ICON_SIZE + spacing.md },
            ]}
          />
        )}
        <View style={styles.rowLine}>
          {dragHandle}
          <Pressable
            accessibilityHint="Modifier la catégorie"
            accessibilityLabel={`${category.name}, ${count}`}
            accessibilityRole="button"
            disabled={!managing}
            onPress={() => startEditing(category)}
            style={({ pressed }) => [
              styles.rowMain,
              dragHandle !== undefined && styles.rowMainWithHandle,
              pressed && styles.rowPressed,
            ]}
            testID={`service-category-${category.id}`}
          >
            <ServiceCategoryIcon category={category} testID={`service-category-icon-${category.id}`} />
            <View style={styles.rowCopy}>
              <AppText numberOfLines={2} style={styles.rowTitle} variant="rowTitle">
                {category.name}
              </AppText>
              {category.description !== undefined && (
                <AppText numberOfLines={2} style={styles.meta} variant="metadata">
                  {category.description}
                </AppText>
              )}
              <AppText style={styles.meta} variant="metadata">
                {count}
              </AppText>
            </View>
            <SymbolView
              name={{ ios: 'chevron.right', android: 'chevron_right' }}
              size={14}
              tintColor={semanticColors.foregroundMuted}
            />
          </Pressable>
        </View>
      </View>
    );
    if (!managing) return row;
    return (
      <SwipeToDeleteRow
        borderRadius={0}
        deleteAccessibilityLabel={`Supprimer la catégorie ${category.name}`}
        deleteTestID={`delete-service-category-${category.id}`}
        hint={swipeHintTarget === category.id}
        onDelete={() => requestDeletion(category)}
        surfaceColor={semanticColors.surfaceElevated}
        testID={`service-category-row-${category.id}`}
      >
        {row}
      </SwipeToDeleteRow>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea} testID="service-categories-screen">
      <View style={styles.topBar}>
        <GlassIconButton accessibilityLabel="Retour" icon={glassIcons.back} onPress={() => router.back()} />
        <AppText style={styles.eyebrow} variant="eyebrow">
          PRESTATIONS & TARIFS
        </AppText>
        <View style={styles.topBarSpacer} />
      </View>

      <FormScrollView
        ref={scrollView}
        contentContainerStyle={styles.content}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.intro}>
          <AppText accessibilityRole="header" variant="screenTitle">
            Catégories
          </AppText>
          <AppText style={styles.introText} variant="metadata">
            Regroupez vos prestations comme vous les présentez. Une prestation peut rester sans catégorie.
          </AppText>
        </View>

        {creating && (
          <View style={styles.creationCard} testID="service-category-new">
            <AppText style={styles.creationTitle} variant="control">
              {NEW_CATEGORY_ACTION_LABEL}
            </AppText>
            <CategoryFields
              attempted={attempted}
              draft={createDraft}
              namePlaceholder={presentation.categoryNameExample}
              onChange={setCreateDraft}
              testIDPrefix="service-category-new"
            />
            <View style={[styles.actions, styles.actionsEndOnly]}>
              <AppButton onPress={cancelCreating} testID="service-category-new-cancel" title="Annuler" variant="tertiary" />
              <AppButton onPress={create} testID="service-category-new-save" title="Ajouter" variant="secondary" />
            </View>
          </View>
        )}

        {categories.length === 0 ? (
          !creating && (
            <View style={styles.empty} testID="service-categories-empty">
              <AppText variant="stateTitle">Aucune catégorie</AppText>
              <AppText style={styles.introText} variant="metadata">
                {`Créez votre première catégorie avec le bouton +, par exemple « ${presentation.categoryNameExample.replace(/^Ex\. /, '')} ».`}
              </AppText>
            </View>
          )
        ) : (
          <View style={styles.section}>
            <SectionHeader count={categories.length} title="Vos catégories" />
            {categories.length > 1 && managing && (
              <AppText style={styles.introText} variant="metadata">
                Maintenez la poignée pour réordonner, balayez vers la droite pour supprimer.
              </AppText>
            )}
            <View style={styles.group} testID="service-categories-list">
              <SortableRowList
                entries={categories}
                gap={0}
                getKey={(category) => category.id}
                getLabel={(category) => category.name}
                onReorder={reorder}
                renderRow={(category, { dragHandle }) =>
                  renderRow(category, dragHandle, categories.indexOf(category) > 0)
                }
                sortable={managing}
              />
            </View>
          </View>
        )}
      </FormScrollView>

      <FloatingCreateButton
        accessibilityLabel="Nouvelle catégorie"
        onPress={startCreating}
        testID="service-categories-add"
      />

      <ConfirmationDialog
        body={
          pendingCount === 0
            ? 'Elle ne contient aucune prestation. Rien d’autre ne change.'
            : `Ses ${pendingCount > 1 ? `${pendingCount} prestations deviendront` : 'prestation deviendra'} « Sans catégorie ». Aucune prestation, aucun rendez-vous ni aucun prix n’est supprimé.`
        }
        cancelLabel="Retour"
        cancelTestID="cancel-service-category-deletion"
        confirmLabel="Supprimer"
        confirmTestID="confirm-service-category-deletion"
        eyebrow="CATÉGORIE"
        onCancel={() => setPendingDeletion(undefined)}
        onConfirm={confirmDeletion}
        testID="service-category-deletion-dialog"
        title={pendingDeletion ? `Supprimer « ${pendingDeletion.name} » ?` : 'Supprimer la catégorie ?'}
        visible={pendingDeletion !== undefined}
      />
    </SafeAreaView>
  );
}

function CategoryFields({
  draft,
  onChange,
  attempted,
  namePlaceholder,
  testIDPrefix,
}: {
  readonly draft: CategoryDraft;
  readonly onChange: (draft: CategoryDraft) => void;
  readonly attempted: boolean;
  readonly namePlaceholder: string;
  readonly testIDPrefix: string;
}) {
  return (
    <>
      <TextField
        accessibilityLabel="Nom de la catégorie"
        autoFocus
        error={attempted && !isValidServiceCategoryName(draft.name) ? 'Indiquez un nom de catégorie.' : undefined}
        label="Nom de la catégorie"
        maxLength={SERVICE_CATEGORY_NAME_MAX_LENGTH}
        onChangeText={(name) => onChange({ ...draft, name })}
        placeholder={namePlaceholder}
        testID={`${testIDPrefix}-name`}
        value={draft.name}
      />
      <TextField
        accessibilityLabel="Description de la catégorie, facultative"
        error={
          attempted && !isValidServiceDescription(draft.description)
            ? `${SERVICE_DESCRIPTION_MAX_LENGTH} caractères au maximum.`
            : undefined
        }
        label={CATEGORY_DESCRIPTION_LABEL}
        maxLength={SERVICE_DESCRIPTION_MAX_LENGTH}
        multiline
        onChangeText={(description) => onChange({ ...draft, description })}
        placeholder="Ce que regroupe cette catégorie"
        testID={`${testIDPrefix}-description`}
        value={draft.description}
      />
    </>
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
  eyebrow: { color: foregroundSoft },
  topBarSpacer: { width: glassIconButtonSize },
  content: {
    gap: spacing.lg,
    paddingBottom: bottomClearance[Platform.OS === 'android' ? 'android' : 'ios'],
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.lg,
  },
  intro: { gap: spacing.xs },
  introText: { color: foregroundSoft },
  empty: { alignItems: 'flex-start', gap: spacing.xs, paddingVertical: spacing.md },
  section: { gap: spacing.sm },
  // ONE grouped surface, like the Services of Appointment Details.
  group: {
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: { backgroundColor: semanticColors.surfaceElevated },
  rowLine: { alignItems: 'center', flexDirection: 'row' },
  rowMain: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 68,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  rowMainWithHandle: { paddingLeft: 0 },
  rowPressed: { backgroundColor: semanticColors.surfaceLavender },
  rowCopy: { flex: 1, gap: 2, minWidth: 0 },
  rowTitle: { color: semanticColors.foreground },
  meta: { color: foregroundSoft },
  separator: { backgroundColor: semanticColors.borderSubtle, height: StyleSheet.hairlineWidth },
  separatorFull: { marginLeft: spacing.base },
  editingRow: { backgroundColor: semanticColors.surfaceElevated },
  editingCard: { gap: spacing.md, padding: spacing.base },
  creationCard: {
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
    padding: spacing.base,
  },
  creationTitle: { color: semanticColors.foreground },
  actions: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  actionsEnd: { flexDirection: 'row', gap: spacing.sm },
  actionsEndOnly: { gap: spacing.sm, justifyContent: 'flex-end' },
});
