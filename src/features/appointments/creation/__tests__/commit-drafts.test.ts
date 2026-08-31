import type { Service } from '@/domain/appointments';

import { createSelectedServiceDraft, updateDraftPhaseDuration, updateDraftPrice, type SelectedServiceDraft } from '../../editor/draft';
import { collectCatalogServiceUpdates } from '../commit-drafts';

function catalogService(): Service {
  return {
    id: 'technique-balayage',
    businessId: 'business-1',
    name: 'Balayage',
    type: 'TECHNIQUE',
    price: 95,
    phases: [
      { id: 'phase-active', name: 'Balayage', durationMinutes: 30, requiresStaff: true },
      { id: 'phase-pose', name: 'Temps de pose', durationMinutes: 45, requiresStaff: false },
      { id: 'phase-finish', name: 'Finition', durationMinutes: 30, requiresStaff: true },
    ],
    active: true,
  };
}

function makeCatalog(services: readonly Service[]) {
  return (serviceId: string | undefined) =>
    services.find((service) => service.id === serviceId);
}

describe('collectCatalogServiceUpdates', () => {
  it('returns nothing when drafts match the catalog', () => {
    const service = catalogService();
    const draft = createSelectedServiceDraft(service);

    expect(collectCatalogServiceUpdates([draft], makeCatalog([service]))).toEqual([]);
  });

  it('updates price and phase durations while preserving identity and order', () => {
    const service = catalogService();
    let draft: SelectedServiceDraft = createSelectedServiceDraft(service);
    draft = updateDraftPrice(draft, 110);
    draft = updateDraftPhaseDuration(draft, 'phase-active', 35);
    draft = updateDraftPhaseDuration(draft, 'phase-pose', 55);

    const updates = collectCatalogServiceUpdates([draft], makeCatalog([service]));

    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe(service.id);
    expect(updates[0].businessId).toBe(service.businessId);
    expect(updates[0].name).toBe(service.name);
    expect(updates[0].type).toBe(service.type);
    expect(updates[0].active).toBe(true);
    expect(updates[0].price).toBe(110);
    expect(updates[0].phases.map((phase) => phase.id)).toEqual([
      'phase-active',
      'phase-pose',
      'phase-finish',
    ]);
    expect(updates[0].phases.map((phase) => phase.durationMinutes)).toEqual([35, 55, 30]);
    expect(updates[0].phases[2]).toBe(service.phases[2]);
  });

  it('updates the single staff-required phase of a SERVICE', () => {
    const service: Service = {
      id: 'service-coupe',
      businessId: 'business-1',
      name: 'Coupe',
      type: 'SERVICE',
      price: 42,
      phases: [
        { id: 'service-coupe-phase', name: 'Coupe', durationMinutes: 45, requiresStaff: true },
      ],
      active: true,
    };
    let draft = createSelectedServiceDraft(service);
    draft = updateDraftPrice(draft, 48);
    draft = updateDraftPhaseDuration(draft, 'service-coupe-phase', 50);

    const updates = collectCatalogServiceUpdates([draft], makeCatalog([service]));

    expect(updates).toEqual([
      {
        ...service,
        price: 48,
        phases: [{ ...service.phases[0], durationMinutes: 50 }],
      },
    ]);
  });

  it('skips services no longer present in the catalog', () => {
    const service = catalogService();
    let draft = createSelectedServiceDraft(service);
    draft = updateDraftPrice(draft, 200);

    expect(collectCatalogServiceUpdates([draft], makeCatalog([]))).toEqual([]);
  });

  it('never mutates the draft or the catalog', () => {
    const service = catalogService();
    const draft = updateDraftPrice(createSelectedServiceDraft(service), 110);
    const catalogSnapshot = JSON.stringify(service);
    const draftSnapshot = JSON.stringify(draft);

    collectCatalogServiceUpdates([draft], makeCatalog([service]));

    expect(JSON.stringify(service)).toBe(catalogSnapshot);
    expect(JSON.stringify(draft)).toBe(draftSnapshot);
  });

  it('commits only services still selected at creation', () => {
    const balayage = catalogService();
    const brushing: Service = {
      id: 'service-brushing',
      businessId: 'business-1',
      name: 'Brushing',
      type: 'SERVICE',
      price: 20,
      phases: [
        { id: 'service-brushing-phase', name: 'Brushing', durationMinutes: 30, requiresStaff: true },
      ],
      active: true,
    };
    const modifiedBalayage = updateDraftPrice(createSelectedServiceDraft(balayage), 110);

    const updates = collectCatalogServiceUpdates(
      [modifiedBalayage],
      makeCatalog([balayage, brushing]),
    );

    expect(updates.map((service) => service.id)).toEqual(['technique-balayage']);
  });
});
