import { calculateAppointmentTimeline, type Appointment, type TimelinePhase } from '@/domain/appointments';

export interface AgendaStaffSegment {
  readonly id: string;
  readonly appointmentId: string;
  readonly clientId: string;
  readonly status: Appointment['status'];
  readonly serviceName: string;
  readonly phaseNames: readonly string[];
  readonly startAt: Date;
  readonly endAt: Date;
  readonly isResume: boolean;
  readonly phases: readonly TimelinePhase[];
}

/**
 * Converts the complete appointment timeline into the professional's visible
 * occupancy. Unattended phases remain in the domain timeline but create gaps
 * between visible staff segments here.
 */
export function buildAgendaStaffSegments(
  appointment: Appointment,
): readonly AgendaStaffSegment[] {
  const timeline = calculateAppointmentTimeline(appointment);
  const segments: AgendaStaffSegment[] = [];
  let activePhases: TimelinePhase[] = [];
  let hasVisibleSegment = false;
  let wasInterrupted = false;

  const flush = () => {
    if (activePhases.length === 0) return;

    const startAt = activePhases[0].startAt;
    const endAt = activePhases[activePhases.length - 1].endAt;
    if (endAt.getTime() > startAt.getTime()) {
      const serviceNames = [...new Set(activePhases.map((phase) => phase.serviceName))];
      segments.push({
        id: `${appointment.id}:${activePhases[0].phaseId}`,
        appointmentId: appointment.id,
        clientId: appointment.clientId,
        status: appointment.status,
        serviceName: serviceNames.join(' · '),
        phaseNames: activePhases.map((phase) => phase.phaseName),
        startAt,
        endAt,
        isResume: hasVisibleSegment && wasInterrupted,
        phases: activePhases,
      });
      hasVisibleSegment = true;
    }
    activePhases = [];
    wasInterrupted = false;
  };

  for (const item of timeline.items) {
    for (const phase of item.phases) {
      if (phase.requiresStaff) {
        activePhases.push(phase);
      } else {
        flush();
        wasInterrupted = true;
      }
    }
  }
  flush();

  return segments;
}
