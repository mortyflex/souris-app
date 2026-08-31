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
