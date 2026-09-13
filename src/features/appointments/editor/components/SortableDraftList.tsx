// Souris — Sortable selected-services list (Appointment service editor)
//
// The draft-level adapter over the shared SortableRowList: creation Résumé
// and « Modifier le rendez-vous » render their SelectedServiceDrafts as
// editor cards, reorder them through the shared drag handle, and — when
// removal is allowed — wrap every card in the shared SwipeToDeleteRow
// (swipe right → « Retirer », draft state only; nothing is persisted until
// the edit is saved). The first removable row present when the list mounts
// plays the one-time swipe hint.
//
// serviceId is unique within a creation draft by product rule (the
// selection toggle prevents duplicates); editing drafts key on their
// AppointmentItem id, so duplicate retained snapshots stay distinct rows.

import type { ReactNode } from 'react';

import { SwipeToDeleteRow, useSwipeHintTarget } from '@/shared/ui/SwipeToDeleteRow';
import { radii, semanticColors } from '@/shared/ui/theme';

import { getSelectedServiceDraftKey, type SelectedServiceDraft } from '../draft';
import { AppointmentServiceEditorCard } from './AppointmentServiceEditorCard';
import { SortableRowList } from './SortableRowList';

export interface SortableDraftEntry {
  readonly draft: SelectedServiceDraft;
}

export interface SortableDraftCardProps {
  readonly draft: SelectedServiceDraft;
  readonly expanded: boolean;
  readonly onToggleExpanded: () => void;
  readonly onUpdatePrice: (price: number) => void;
  readonly onUpdatePhaseDuration: (phaseId: string, durationMinutes: number) => void;
  readonly dragHandle?: ReactNode;
}

interface SortableDraftListProps {
  readonly entries: readonly SortableDraftEntry[];
  readonly expandedDraftId: string | null;
  readonly onToggleExpanded: (draftKey: string) => void;
  readonly onReorder: (fromIndex: number, toIndex: number) => void;
  readonly onUpdatePrice: (draftKey: string, price: number) => void;
  readonly onUpdatePhaseDuration: (
    draftKey: string,
    phaseId: string,
    durationMinutes: number,
  ) => void;
  /** Draft-level removal (never persistence): invoked by the row swipe. */
  readonly onRemove: (draftKey: string) => void;
  /**
   * When true every row is wrapped in the shared SwipeToDeleteRow (swipe
   * right → « Retirer ») and the first row plays the one-time swipe hint;
   * when false (creation Résumé) rows carry no remove interaction at all.
   */
  readonly canRemove: boolean;
  /** Card renderer; defaults to the shared appointment editor card. */
  readonly renderCard?: (props: SortableDraftCardProps) => ReactNode;
}

function getDraftKey(entry: SortableDraftEntry): string {
  return getSelectedServiceDraftKey(entry.draft);
}

export function SortableDraftList({
  entries,
  expandedDraftId,
  onToggleExpanded,
  onReorder,
  onUpdatePrice,
  onUpdatePhaseDuration,
  onRemove,
  canRemove,
  renderCard,
}: SortableDraftListProps) {
  // The first removable row present when the list mounts plays the swipe
  // hint once; rows added or promoted later never replay it.
  const hintKey = useSwipeHintTarget(canRemove && entries[0] ? getDraftKey(entries[0]) : undefined);

  return (
    <SortableRowList
      entries={entries}
      getKey={getDraftKey}
      getLabel={(entry) => entry.draft.serviceName}
      onReorder={onReorder}
      renderRow={(entry, { dragHandle }) => {
        const draftKey = getDraftKey(entry);
        const cardProps: SortableDraftCardProps = {
          draft: entry.draft,
          expanded: expandedDraftId === draftKey,
          onToggleExpanded: () => onToggleExpanded(draftKey),
          onUpdatePrice: (price) => onUpdatePrice(draftKey, price),
          onUpdatePhaseDuration: (phaseId, durationMinutes) =>
            onUpdatePhaseDuration(draftKey, phaseId, durationMinutes),
          dragHandle,
        };
        const card = renderCard ? renderCard(cardProps) : <AppointmentServiceEditorCard {...cardProps} />;
        if (!canRemove) return card;

        // Draft-only removal: the swipe hands the key back to the screen, which
        // mutates its draft state; nothing is persisted until the edit is saved.
        return (
          <SwipeToDeleteRow
            borderRadius={radii.large}
            deleteAccessibilityLabel={`Retirer ${entry.draft.serviceName} du rendez-vous`}
            deleteTestID={`remove-appointment-draft-${draftKey}`}
            hint={draftKey === hintKey}
            onDelete={() => {
              onRemove(draftKey);
              return true;
            }}
            surfaceColor={semanticColors.surfaceLavender}
            testID={`appointment-draft-${draftKey}`}
          >
            {card}
          </SwipeToDeleteRow>
        );
      }}
    />
  );
}
