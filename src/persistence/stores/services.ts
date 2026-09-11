// Souris — Service catalog store
//
// A Service and its ordered phases are written together. Phases are stored
// by position and reloaded in that exact order; a Service edit replaces the
// whole phase list atomically.

import type { Service, ServicePhase, ServiceType } from '@/domain/appointments';

import { runInTransaction, type SourisDatabase } from '../database';
import { fromSqlBoolean, toSqlBoolean } from '../values';

interface ServiceRow {
  readonly id: string;
  readonly business_id: string;
  readonly name: string;
  readonly type: ServiceType;
  readonly price: number;
  readonly active: number;
}

interface ServicePhaseRow {
  readonly service_id: string;
  readonly id: string;
  readonly name: string;
  readonly duration_minutes: number;
  readonly requires_staff: number;
}

function toServicePhase(row: ServicePhaseRow): ServicePhase {
  return {
    id: row.id,
    name: row.name,
    durationMinutes: row.duration_minutes,
    requiresStaff: fromSqlBoolean(row.requires_staff),
  };
}

export function loadServices(db: SourisDatabase): readonly Service[] {
  const phasesByService = new Map<string, ServicePhase[]>();
  for (const row of db.getAllSync<ServicePhaseRow>(
    'SELECT service_id, id, name, duration_minutes, requires_staff FROM service_phases ORDER BY service_id, position',
  )) {
    const phases = phasesByService.get(row.service_id) ?? [];
    phases.push(toServicePhase(row));
    phasesByService.set(row.service_id, phases);
  }

  return db
    .getAllSync<ServiceRow>(
      'SELECT id, business_id, name, type, price, active FROM services ORDER BY rowid',
    )
    .map((row) => ({
      id: row.id,
      businessId: row.business_id,
      name: row.name,
      type: row.type,
      price: row.price,
      phases: phasesByService.get(row.id) ?? [],
      active: fromSqlBoolean(row.active),
    }));
}

function writePhases(db: SourisDatabase, service: Service): void {
  service.phases.forEach((phase, position) => {
    db.runSync(
      'INSERT INTO service_phases (service_id, position, id, name, duration_minutes, requires_staff) VALUES (?, ?, ?, ?, ?, ?)',
      [
        service.id,
        position,
        phase.id,
        phase.name,
        phase.durationMinutes,
        toSqlBoolean(phase.requiresStaff),
      ],
    );
  });
}

export function insertService(db: SourisDatabase, service: Service): void {
  runInTransaction(db, () => {
    db.runSync(
      'INSERT INTO services (id, business_id, name, type, price, active) VALUES (?, ?, ?, ?, ?, ?)',
      [
        service.id,
        service.businessId,
        service.name,
        service.type,
        service.price,
        toSqlBoolean(service.active),
      ],
    );
    writePhases(db, service);
  });
}

/** Rewrites name/type/price/active and the whole phase list; id/businessId never change. */
export function updateService(db: SourisDatabase, service: Service): void {
  runInTransaction(db, () => {
    const result = db.runSync(
      'UPDATE services SET name = ?, type = ?, price = ?, active = ? WHERE id = ?',
      [service.name, service.type, service.price, toSqlBoolean(service.active), service.id],
    );
    if (result.changes !== 1) {
      throw new Error(`updateService: Service "${service.id}" not found`);
    }
    db.runSync('DELETE FROM service_phases WHERE service_id = ?', [service.id]);
    writePhases(db, service);
  });
}

export function setServiceActive(db: SourisDatabase, serviceId: string, active: boolean): void {
  db.runSync('UPDATE services SET active = ? WHERE id = ?', [toSqlBoolean(active), serviceId]);
}

/** Removes the catalog record and its phases; Appointment snapshots are untouched. */
export function deleteService(db: SourisDatabase, serviceId: string): void {
  db.runSync('DELETE FROM services WHERE id = ?', [serviceId]);
}
