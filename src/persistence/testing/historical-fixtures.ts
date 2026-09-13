// Souris — historical schema fixtures (never imported by app code)
//
// Migration tests build databases exactly as OLDER builds left them. The
// current stores write today's columns, so rows of historical schemas are
// inserted here with the column set those schemas actually had (v1 rows;
// every later column is added by the migrations under test).

import type { Appointment } from '@/domain/appointments';
import type { Sale } from '@/domain/sales';

import type { SourisDatabase } from '../database';
import { toSqlBoolean, toSqlInstant, toSqlOptional } from '../values';

/** Appointment row + items + phases with the schema v1 column set (no payment columns). */
export function insertHistoricalAppointment(db: SourisDatabase, appointment: Appointment): void {
  db.runSync(
    'INSERT INTO appointments (id, business_id, client_id, staff_member_id, start_at, status, notes, cancelled_at, cancelled_by, cancellation_reason, no_show_recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      appointment.id,
      appointment.businessId,
      appointment.clientId,
      appointment.staffMemberId,
      toSqlInstant(appointment.startAt),
      appointment.status,
      toSqlOptional(appointment.notes),
      appointment.cancellation ? toSqlInstant(appointment.cancellation.cancelledAt) : null,
      appointment.cancellation?.cancelledBy ?? null,
      toSqlOptional(appointment.cancellation?.reason),
      appointment.noShow ? toSqlInstant(appointment.noShow.recordedAt) : null,
    ],
  );
  for (const item of appointment.items) {
    db.runSync(
      'INSERT INTO appointment_items (appointment_id, id, item_order, service_id, service_option_id, service_name, service_type, price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        appointment.id,
        item.id,
        item.order,
        item.serviceId,
        toSqlOptional(item.serviceOptionId),
        item.serviceName,
        item.serviceType,
        item.price,
      ],
    );
    item.phases.forEach((phase, position) => {
      db.runSync(
        'INSERT INTO appointment_phases (appointment_id, appointment_item_id, position, id, name, duration_minutes, requires_staff) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          appointment.id,
          item.id,
          position,
          phase.id,
          phase.name,
          phase.durationMinutes,
          toSqlBoolean(phase.requiresStaff),
        ],
      );
    });
  }
}

/** Sale row + items with the schema v1 column set (no appointment_id column). */
export function insertHistoricalSale(db: SourisDatabase, sale: Sale): void {
  db.runSync('INSERT INTO sales (id, business_id, client_id, completed_at) VALUES (?, ?, ?, ?)', [
    sale.id,
    sale.businessId,
    toSqlOptional(sale.clientId),
    toSqlInstant(sale.completedAt),
  ]);
  sale.items.forEach((item, position) => {
    db.runSync(
      'INSERT INTO sale_items (sale_id, id, position, product_id, product_name, unit_price, quantity) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [sale.id, item.id, position, item.productId, item.productName, item.unitPrice, item.quantity],
    );
  });
}

/** Sale row + items with the schema v5 column set (appointment_id, no payment columns). */
export function insertSchemaV5Sale(db: SourisDatabase, sale: Sale): void {
  db.runSync(
    'INSERT INTO sales (id, business_id, client_id, appointment_id, completed_at) VALUES (?, ?, ?, ?, ?)',
    [
      sale.id,
      sale.businessId,
      toSqlOptional(sale.clientId),
      toSqlOptional(sale.appointmentId),
      toSqlInstant(sale.completedAt),
    ],
  );
  sale.items.forEach((item, position) => {
    db.runSync(
      'INSERT INTO sale_items (sale_id, id, position, product_id, product_name, unit_price, quantity) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [sale.id, item.id, position, item.productId, item.productName, item.unitPrice, item.quantity],
    );
  });
}
