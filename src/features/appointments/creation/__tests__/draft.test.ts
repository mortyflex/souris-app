import type { Service } from '@/domain/appointments';

import {
  createSelectedServiceDraft,
  formatPriceInput,
  getProcessingPhases,
  isValidPhaseDuration,
  isValidPrice,
  parsePriceInput,
  reorderDrafts,
  updateDraftPhaseDuration,
  updateDraftPrice,
} from '../draft';

const colorService: Service = {
  id: 'technique-balayage-1',
  businessId: 'fixture-business',
  name: 'Balayage 1',
  type: 'TECHNIQUE',
  price: 45,
  active: true,
  phases: [
    { id: 'balayage-active', name: 'Balayage 1', durationMinutes: 90, requiresStaff: true },
    { id: 'balayage-pose', name: 'Temps de pose', durationMinutes: 60, requiresStaff: false },
  ],
};

const cutService: Service = {
  id: 'service-coupe',
  businessId: 'fixture-business',
  name: 'Coupe',
  type: 'SERVICE',
  price: 25,
  active: true,
  phases: [{ id: 'coupe-phase', name: 'Coupe', durationMinutes: 30, requiresStaff: true }],
};

describe('createSelectedServiceDraft', () => {
  it('initializes with catalog defaults', () => {
    const draft = createSelectedServiceDraft(colorService);

    expect(draft.serviceId).toBe('technique-balayage-1');
    expect(draft.price).toBe(45);
    expect(draft.phaseDurationOverrides).toEqual({});
  });
});

describe('updateDraftPrice', () => {
  it('records an appointment-specific price and leaves the catalog untouched', () => {
    const draft = createSelectedServiceDraft(colorService);
    const updated = updateDraftPrice(draft, 50);

    expect(updated.price).toBe(50);
    expect(draft.price).toBe(45);
    expect(colorService.price).toBe(45);
  });

  it('rejects invalid prices without mutating the draft', () => {
    const draft = createSelectedServiceDraft(colorService);

    expect(updateDraftPrice(draft, Number.NaN)).toBe(draft);
    expect(updateDraftPrice(draft, -1)).toBe(draft);
    expect(updateDraftPrice(draft, Number.POSITIVE_INFINITY)).toBe(draft);
  });
});

describe('updateDraftPhaseDuration', () => {
  it('records a processing duration override and leaves the catalog untouched', () => {
    const draft = createSelectedServiceDraft(colorService);
    const updated = updateDraftPhaseDuration(draft, 'balayage-pose', 45);

    expect(updated.phaseDurationOverrides['balayage-pose']).toBe(45);
    expect(draft.phaseDurationOverrides).toEqual({});
    expect(colorService.phases[1].durationMinutes).toBe(60);
  });

  it('supports a zero-minute processing override', () => {
    const draft = createSelectedServiceDraft(colorService);
    const updated = updateDraftPhaseDuration(draft, 'balayage-pose', 0);

    expect(updated.phaseDurationOverrides['balayage-pose']).toBe(0);
  });

  it('rejects invalid durations without mutating the draft', () => {
    const draft = createSelectedServiceDraft(colorService);

    expect(updateDraftPhaseDuration(draft, 'balayage-pose', -5)).toBe(draft);
    expect(updateDraftPhaseDuration(draft, 'balayage-pose', 2.5)).toBe(draft);
  });
});

describe('getProcessingPhases', () => {
  it('returns phases with requiresStaff === false only', () => {
    expect(getProcessingPhases(colorService).map((phase) => phase.id)).toEqual(['balayage-pose']);
  });

  it('returns nothing for a SERVICE', () => {
    expect(getProcessingPhases(cutService)).toEqual([]);
  });
});

describe('parsePriceInput', () => {
  it('parses decimal and comma notation', () => {
    expect(parsePriceInput('45')).toBe(45);
    expect(parsePriceInput('45,00')).toBe(45);
    expect(parsePriceInput('45.5')).toBe(45.5);
    expect(parsePriceInput(' 12 345,67 ')).toBe(12345.67);
  });

  it('returns undefined for invalid input instead of NaN', () => {
    expect(parsePriceInput('')).toBeUndefined();
    expect(parsePriceInput('abc')).toBeUndefined();
    expect(parsePriceInput('-5')).toBeUndefined();
    expect(parsePriceInput(',')).toBeUndefined();
  });
});

describe('formatPriceInput', () => {
  it('formats values for the editable field without a currency symbol', () => {
    expect(formatPriceInput(45)).toBe('45,00');
    expect(formatPriceInput(50.5)).toBe('50,50');
  });
});

describe('validators', () => {
  it('accepts zero values', () => {
    expect(isValidPrice(0)).toBe(true);
    expect(isValidPhaseDuration(0)).toBe(true);
  });
});

describe('reorderDrafts', () => {
  const balayage = createSelectedServiceDraft(colorService);
  const coupe = createSelectedServiceDraft(cutService);
  const brushing = createSelectedServiceDraft({
    ...cutService,
    id: 'service-brushing',
    name: 'Brushing',
  });

  it('moves a draft from one position to another', () => {
    const drafts = [balayage, coupe, brushing];
    const reordered = reorderDrafts(drafts, 1, 0);

    expect(reordered.map((draft) => draft.serviceId)).toEqual([
      'service-coupe',
      'technique-balayage-1',
      'service-brushing',
    ]);
    expect(drafts.map((draft) => draft.serviceId)).toEqual([
      'technique-balayage-1',
      'service-coupe',
      'service-brushing',
    ]);
  });

  it('preserves custom prices and phase overrides with the moved draft', () => {
    const customized = updateDraftPhaseDuration(updateDraftPrice(balayage, 50), 'balayage-pose', 45);
    const reordered = reorderDrafts([customized, coupe], 0, 1);

    expect(reordered[1]).toBe(customized);
    expect(reordered[1].price).toBe(50);
    expect(reordered[1].phaseDurationOverrides['balayage-pose']).toBe(45);
  });

  it('moves a draft to the end', () => {
    const reordered = reorderDrafts([balayage, coupe, brushing], 0, 2);

    expect(reordered.map((draft) => draft.serviceId)).toEqual([
      'service-coupe',
      'service-brushing',
      'technique-balayage-1',
    ]);
  });

  it('does not touch the catalog service the draft refers to', () => {
    const customized = updateDraftPrice(balayage, 50);
    reorderDrafts([customized, coupe], 0, 1);

    expect(colorService.price).toBe(45);
    expect(colorService.phases[1].durationMinutes).toBe(60);
  });

  it('rejects out-of-range indices', () => {
    const drafts = [balayage, coupe];
    expect(() => reorderDrafts(drafts, -1, 0)).toThrow(RangeError);
    expect(() => reorderDrafts(drafts, 0, 2)).toThrow(RangeError);
  });
});
