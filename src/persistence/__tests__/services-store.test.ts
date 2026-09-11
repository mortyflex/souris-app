import type { Service } from '@/domain/appointments';

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import { deleteService, insertService, loadServices, setServiceActive, updateService } from '../stores/services';
import { createTestSeed, serviceColor, serviceCut } from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

describe('Service store', () => {
  it('persists a Service with its ordered phases and restores the exact order', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, () => createTestSeed({ services: [], appointments: [] }));

    insertService(db, serviceColor);
    insertService(db, serviceCut);

    expect(loadSnapshot(db).services).toEqual([serviceColor, serviceCut]);
  });

  it('keeps price, duration, and reordered phases across a restart', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    const edited: Service = {
      ...serviceColor,
      price: 99,
      phases: [
        { ...serviceColor.phases[2]!, durationMinutes: 20 },
        serviceColor.phases[0]!,
        { id: 'color-gloss', name: 'Gloss', durationMinutes: 10, requiresStaff: false },
      ],
    };

    updateService(db, edited);

    const reloaded = loadServices(db).find((service) => service.id === serviceColor.id);
    expect(reloaded).toEqual(edited);
    expect(reloaded?.phases.map((phase) => [phase.id, phase.requiresStaff])).toEqual([
      ['color-rinse', true],
      ['color-application', true],
      ['color-gloss', false],
    ]);
  });

  it('keeps activation state across a restart', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);

    setServiceActive(db, serviceCut.id, false);

    expect(loadServices(db).map((service) => [service.id, service.active])).toEqual([
      ['service-color', true],
      ['service-cut', false],
    ]);
  });

  it('deleting a Service removes its phases but never an Appointment snapshot', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);

    deleteService(db, serviceColor.id);

    const snapshot = loadSnapshot(db);
    expect(snapshot.services.map((service) => service.id)).toEqual(['service-cut']);
    expect(
      db.getFirstSync<{ count: number }>(
        "SELECT COUNT(*) AS count FROM service_phases WHERE service_id = 'service-color'",
      )?.count,
    ).toBe(0);
    const item = snapshot.appointments[0]?.items[0];
    expect(item?.serviceId).toBe('service-color');
    expect(item?.serviceName).toBe('Coloration');
    expect(item?.phases).toHaveLength(3);
  });
});
