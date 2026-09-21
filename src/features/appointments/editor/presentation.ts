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
 * `Balayage 3 · Coupe brushing · Reprise`. Names only — durations and prices
 * belong to the cards and to the Résumé step.
 */
export function formatSelectedServiceNames(
  selection: readonly { readonly serviceName: string }[],
): string {
  return selection.map(({ serviceName }) => serviceName).join(' · ');
}
