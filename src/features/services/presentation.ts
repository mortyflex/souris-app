import type { Service } from '@/domain/appointments';
import { formatEuros } from '@/shared/lib/money';

export function formatServiceDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining === 0 ? `${hours} h` : `${hours} h ${remaining} min`;
}

export function formatServicePrice(value: number): string {
  return formatEuros(value);
}

export function getServiceDurationMinutes(
  service: Pick<Service, 'phases'>,
  phaseDurationOverrides: Readonly<Record<string, number>> = {},
): number {
  return service.phases.reduce(
    (total, phase) => total + (phaseDurationOverrides[phase.id] ?? phase.durationMinutes),
    0,
  );
}

export function getServiceProcessingMinutes(
  service: Pick<Service, 'phases'>,
  phaseDurationOverrides: Readonly<Record<string, number>> = {},
): number {
  return service.phases.reduce(
    (total, phase) =>
      total + (phase.requiresStaff ? 0 : phaseDurationOverrides[phase.id] ?? phase.durationMinutes),
    0,
  );
}
