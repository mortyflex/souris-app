// Creation keeps this module as a feature-local import boundary while the
// actual service draft model is shared with existing Appointment editing.
export {
  areDraftsEqual,
  createSelectedServiceDraft,
  formatPriceInput,
  getDraftDurationMinutes,
  getDraftProcessingMinutes,
  getProcessingPhases,
  getSelectedServiceDraftKey,
  hydrateAppointmentDrafts,
  isValidPhaseDuration,
  isValidPrice,
  parsePriceInput,
  reorderDrafts,
  stepPhaseDuration,
  toAppointmentItemEditDraft,
  updateDraftPhaseDuration,
  updateDraftPrice,
} from '../editor/draft';

export type { SelectedServiceDraft } from '../editor/draft';
