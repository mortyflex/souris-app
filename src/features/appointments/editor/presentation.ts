export {
  formatServiceDuration as formatCreationDuration,
  formatServicePrice as formatCreationPrice,
  getServiceDurationMinutes,
  getServiceProcessingMinutes,
} from '@/features/services/presentation';

/** Correct French pluralization for the shared selection counter. */
export function formatSelectionCountLabel(count: number): string {
  return `${count} prestation${count > 1 ? 's' : ''} sélectionnée${count > 1 ? 's' : ''}`;
}

/**
 * The selected Service names on one reminder line, in selection order:
 * `Balayage 3 · Coupe brushing ×2 · Reprise`. A Service selected several
 * times is named once, at its first position, with its quantity. Names only —
 * durations and prices belong to the cards and to the Résumé step.
 */
export function formatSelectedServiceNames(
  selection: readonly { readonly serviceName: string; readonly serviceId?: string }[],
  separator = ' · ',
): string {
  const groups = new Map<string, { name: string; quantity: number }>();
  for (const { serviceName, serviceId } of selection) {
    const key = serviceId ?? serviceName;
    const group = groups.get(key);
    if (group) group.quantity += 1;
    else groups.set(key, { name: serviceName, quantity: 1 });
  }
  return [...groups.values()]
    .map(({ name, quantity }) => (quantity > 1 ? `${name} ${formatServiceQuantity(quantity)}` : name))
    .join(separator);
}

/** `×2` — the quantity of one Service in the selection (card badge, summary). */
export function formatServiceQuantity(quantity: number): string {
  return `×${quantity}`;
}
