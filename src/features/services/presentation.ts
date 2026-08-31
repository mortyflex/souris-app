import type { Service } from '@/domain/appointments';

export function formatServiceDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining === 0 ? `${hours} h` : `${hours} h ${remaining} min`;
}

export function formatServicePrice(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    currency: 'EUR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(value);
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
