import {
  createAppointmentItemSnapshot,
  type Appointment,
  type ServiceSnapshotSource,
} from '@/domain/appointments';

export interface BuildAppointmentItemInput {
  readonly service: ServiceSnapshotSource;
  /**
   * Appointment-specific price override. Falls back to the catalog price.
   * The catalog service itself is never modified.
   */
  readonly price?: number;
  /**
   * Appointment-specific phase duration overrides keyed by catalog phase id.
   * The catalog service itself is never modified.
   */
  readonly phaseDurationOverrides?: Readonly<Record<string, number>>;
}

export interface BuildAppointmentInput {
  readonly appointmentId: string;
  readonly businessId: string;
  readonly clientId: string;
  readonly staffMemberId: string;
  readonly startAt: Date;
  readonly items: readonly BuildAppointmentItemInput[];
  readonly itemIds: readonly string[];
}

/**
 * Creates an Appointment from ordered creation drafts.
 * IDs are supplied by the feature boundary; the domain snapshot function
 * owns the historical service copy. Overrides apply to the snapshot only —
 * the catalog Service the item originated from is never touched.
 */
export function buildAppointment(input: BuildAppointmentInput): Appointment {
  if (input.items.length === 0) {
    throw new Error('An appointment requires at least one service');
  }
  if (input.itemIds.length !== input.items.length) {
    throw new Error('Each selected service requires one appointment item id');
  }
  for (const item of input.items) {
    if (item.price !== undefined && (!Number.isFinite(item.price) || item.price < 0)) {
      throw new Error(`Invalid appointment-specific price for "${item.service.name}"`);
    }
    for (const [phaseId, durationMinutes] of Object.entries(item.phaseDurationOverrides ?? {})) {
      if (!Number.isInteger(durationMinutes) || durationMinutes < 0) {
        throw new Error(
          `Invalid phase duration override for phase "${phaseId}" of "${item.service.name}"`,
        );
      }
    }
  }

  return {
    id: input.appointmentId,
    businessId: input.businessId,
    clientId: input.clientId,
    staffMemberId: input.staffMemberId,
    startAt: new Date(input.startAt),
    status: 'SCHEDULED',
    items: input.items.map((item, index) =>
      createAppointmentItemSnapshot({
        id: input.itemIds[index],
        order: index,
        service: item.service,
        price: item.price,
        phaseDurationOverrides: item.phaseDurationOverrides,
      }),
    ),
  };
}
