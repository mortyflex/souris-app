// BeautIzzy — « Actions de la vente » (shared by the Sale detail « ••• » and the history swipe)
//
// The shared DetailActionsSheet (the Client detail « ••• » drawer) listing the
// actions `getSaleActions` allows for ONE Sale. Choosing an action never
// writes anything: the drawer closes and, once it is gone (`onDismissed`), the
// existing flow is OPENED — its own review and confirmation do the rest.
// Closing the drawer changes nothing. A repeated tap while the drawer closes
// opens the flow once.

import { useRouter } from 'expo-router';
import { useRef } from 'react';

import type { Sale } from '@/domain/sales';
import { DetailActionsSheet, type DetailAction } from '@/shared/ui/DetailActionsSheet';

import { useSaleSession } from '../session/SaleSessionProvider';
import { getSaleActions, type SaleActionKey } from './sale-actions';

export const SALE_ACTIONS_TITLE = 'Actions de la vente';

/** Labels and glyphs of the three flows — the same wherever they are offered. */
export const SALE_ACTION_DEFINITIONS: Readonly<Record<SaleActionKey, Omit<DetailAction<SaleActionKey>, 'key'>>> = {
  refund: {
    label: 'Rembourser',
    icon: { ios: 'arrow.uturn.backward.circle', android: 'undo' },
    tone: 'normal',
    testID: 'sale-action-refund',
    accessibilityHint: 'Ouvre le remboursement, avec vérification avant confirmation',
  },
  correct: {
    label: 'Corriger une erreur',
    icon: { ios: 'pencil', android: 'edit' },
    tone: 'normal',
    testID: 'sale-action-correct',
    accessibilityHint: 'Ouvre la correction, avec vérification avant confirmation',
  },
  cancel: {
    label: 'Rembourser intégralement',
    icon: { ios: 'arrow.uturn.backward.circle.fill', android: 'settings_backup_restore' },
    tone: 'destructive',
    testID: 'sale-action-cancel',
    accessibilityHint:
      'Ouvre le remboursement de toute la vente ; le retour en stock se choisit produit par produit, à vérifier avant confirmation',
  },
};

/** The actions a Sale offers right now, from the live session (both entry points call it). */
export function useSaleActions(sale: Sale | undefined): readonly SaleActionKey[] {
  const { saleAdjustments, isAppointmentSettled } = useSaleSession();
  if (!sale) return [];
  return getSaleActions({
    sale,
    adjustments: saleAdjustments,
    appointmentSettled: sale.appointmentId === undefined || isAppointmentSettled(sale.appointmentId),
  });
}

interface SaleActionsSheetProps {
  /** The Sale whose actions are shown; undefined keeps the drawer closed. */
  readonly sale: Sale | undefined;
  readonly visible: boolean;
  readonly onClose: () => void;
}

export function SaleActionsSheet({ sale, visible, onClose }: SaleActionsSheetProps) {
  const router = useRouter();
  const actions = useSaleActions(sale);
  // The chosen action, opened once the drawer is gone; cleared as it runs.
  const chosen = useRef<{ readonly saleId: string; readonly action: SaleActionKey } | undefined>(undefined);

  const openChosen = () => {
    const pending = chosen.current;
    chosen.current = undefined;
    if (!pending) return;
    router.push({ pathname: '/sales/adjust/[saleId]', params: { saleId: pending.saleId, intent: pending.action } });
  };

  return (
    <DetailActionsSheet
      groups={actions.length === 0 ? [] : [actions.map((key) => ({ key, ...SALE_ACTION_DEFINITIONS[key] }))]}
      onClose={onClose}
      onDismissed={openChosen}
      onSelect={(action) => {
        if (!sale || chosen.current) return;
        chosen.current = { saleId: sale.id, action };
        onClose();
      }}
      testID="sale-actions-sheet"
      title={SALE_ACTIONS_TITLE}
      visible={visible && sale !== undefined && actions.length > 0}
    />
  );
}
