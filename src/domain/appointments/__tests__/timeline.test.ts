import {
  calculateAppointmentTimeline,
  getAppointmentEndAt,
  getElapsedDurationMinutes,
  getProcessingDurationMinutes,
  getStaffActiveDurationMinutes,
  type Appointment,
  type AppointmentItem,
  type AppointmentPhase,
} from "../index";

function phase(
  id: string,
  name: string,
  durationMinutes: number,
  requiresStaff: boolean,
): AppointmentPhase {
  return { id, name, durationMinutes, requiresStaff };
}

function item(
  id: string,
  order: number,
  serviceName: string,
  serviceType: AppointmentItem["serviceType"],
  phases: AppointmentPhase[],
): AppointmentItem {
  return {
    id,
    serviceId: `service-${id}`,
    order,
    serviceName,
    serviceType,
    price: 50,
    phases,
  };
}

function appointment(items: AppointmentItem[]): Appointment {
  return {
    id: "apt-1",
    businessId: "biz-1",
    clientId: "client-1",
    staffMemberId: "staff-1",
    startAt: new Date("2026-08-24T09:00:00.000Z"),
    status: "SCHEDULED",
    items,
  };
}

describe("canonical appointment timeline", () => {
  // Couleur racines (TECHNIQUE): Application 15 (staff) → Temps de pose 35 (unattended) → Rinçage 10 (staff)
  // Coupe (SERVICE): Coupe 30 (staff)
  const couleur = item("item-couleur", 0, "Couleur racines", "TECHNIQUE", [
    phase("ph-application", "Application", 15, true),
    phase("ph-pose", "Temps de pose", 35, false),
    phase("ph-rincage", "Rinçage", 10, true),
  ]);
  const coupe = item("item-coupe", 1, "Coupe", "SERVICE", [
    phase("ph-coupe", "Coupe", 30, true),
  ]);

  it("places every phase sequentially from the appointment start, in item order", () => {
    const timeline = calculateAppointmentTimeline(appointment([couleur, coupe]));

    const phases = timeline.items.flatMap((entry) => entry.phases);
    expect(phases.map((entry) => entry.phaseName)).toEqual([
      "Application",
      "Temps de pose",
      "Rinçage",
      "Coupe",
    ]);

    expect(phases[0]?.startAt.toISOString()).toBe("2026-08-24T09:00:00.000Z");
    expect(phases[0]?.endAt.toISOString()).toBe("2026-08-24T09:15:00.000Z");
    expect(phases[1]?.startAt.toISOString()).toBe("2026-08-24T09:15:00.000Z");
    expect(phases[1]?.endAt.toISOString()).toBe("2026-08-24T09:50:00.000Z");
    expect(phases[2]?.startAt.toISOString()).toBe("2026-08-24T09:50:00.000Z");
    expect(phases[2]?.endAt.toISOString()).toBe("2026-08-24T10:00:00.000Z");
    expect(phases[3]?.startAt.toISOString()).toBe("2026-08-24T10:00:00.000Z");
    expect(phases[3]?.endAt.toISOString()).toBe("2026-08-24T10:30:00.000Z");
  });

  it("exposes the item-level start and end times derived from the phases", () => {
    const timeline = calculateAppointmentTimeline(appointment([couleur, coupe]));

    expect(timeline.items[0]?.startAt.toISOString()).toBe("2026-08-24T09:00:00.000Z");
    expect(timeline.items[0]?.endAt.toISOString()).toBe("2026-08-24T10:00:00.000Z");
    expect(timeline.items[1]?.startAt.toISOString()).toBe("2026-08-24T10:00:00.000Z");
    expect(timeline.items[1]?.endAt.toISOString()).toBe("2026-08-24T10:30:00.000Z");
    expect(timeline.endAt.toISOString()).toBe("2026-08-24T10:30:00.000Z");
  });

  it("distinguishes elapsed, staff-active and processing durations", () => {
    const apt = appointment([couleur, coupe]);

    expect(getElapsedDurationMinutes(apt)).toBe(90);
    expect(getStaffActiveDurationMinutes(apt)).toBe(55);
    expect(getProcessingDurationMinutes(apt)).toBe(35);
    expect(getAppointmentEndAt(apt).toISOString()).toBe("2026-08-24T10:30:00.000Z");
  });

  it("keeps requiresStaff visible on every timeline phase", () => {
    const timeline = calculateAppointmentTimeline(appointment([couleur, coupe]));

    const phases = timeline.items.flatMap((entry) => entry.phases);
    expect(phases.map((entry) => entry.requiresStaff)).toEqual([
      true,
      false,
      true,
      true,
    ]);
  });

  it("does not mutate the source appointment", () => {
    const apt = appointment([couleur, coupe]);
    const itemsBefore = apt.items;
    const phasesBefore = couleur.phases;

    calculateAppointmentTimeline(apt);

    expect(apt.items).toBe(itemsBefore);
    expect(apt.items[0]?.phases).toBe(phasesBefore);
    expect(apt.items).toEqual([couleur, coupe]);
  });
});

describe("item ordering", () => {
  it("follows the explicit order field rather than the physical array order", () => {
    const brushing = item("item-brushing", 2, "Brushing", "SERVICE", [
      phase("ph-brushing", "Brushing", 45, true),
    ]);
    const couleur = item("item-couleur", 1, "Couleur", "SERVICE", [
      phase("ph-couleur", "Couleur", 60, true),
    ]);

    // Physical array order is Brushing first, but Couleur has order = 1.
    const timeline = calculateAppointmentTimeline(
      appointment([brushing, couleur]),
    );

    expect(timeline.items.map((entry) => entry.serviceName)).toEqual([
      "Couleur",
      "Brushing",
    ]);
    expect(timeline.items[0]?.startAt.toISOString()).toBe("2026-08-24T09:00:00.000Z");
    expect(timeline.items[1]?.startAt.toISOString()).toBe("2026-08-24T10:00:00.000Z");
  });
});

describe("TECHNIQUE flexibility", () => {
  it("preserves a five-phase active/processing alternation in order", () => {
    const technique = item("item-technique", 0, "Technique complète", "TECHNIQUE", [
      phase("ph-a", "Phase A", 10, true),
      phase("ph-b", "Phase B", 20, false),
      phase("ph-c", "Phase C", 15, true),
      phase("ph-d", "Phase D", 25, false),
      phase("ph-e", "Phase E", 5, true),
    ]);
    const apt = appointment([technique]);

    const timeline = calculateAppointmentTimeline(apt);
    const phases = timeline.items[0]?.phases ?? [];

    expect(phases.map((entry) => entry.phaseName)).toEqual([
      "Phase A",
      "Phase B",
      "Phase C",
      "Phase D",
      "Phase E",
    ]);
    expect(phases[1]?.startAt.toISOString()).toBe("2026-08-24T09:10:00.000Z");
    expect(phases[2]?.startAt.toISOString()).toBe("2026-08-24T09:30:00.000Z");
    expect(phases[4]?.endAt.toISOString()).toBe("2026-08-24T10:15:00.000Z");

    expect(getElapsedDurationMinutes(apt)).toBe(75);
    expect(getStaffActiveDurationMinutes(apt)).toBe(30);
    expect(getProcessingDurationMinutes(apt)).toBe(45);
  });
});

describe("SERVICE behavior", () => {
  it("counts the full duration as staff-active with no processing time", () => {
    const brushing = item("item-brushing", 0, "Brushing", "SERVICE", [
      phase("ph-brushing", "Brushing", 45, true),
    ]);
    const apt = appointment([brushing]);

    expect(getElapsedDurationMinutes(apt)).toBe(45);
    expect(getStaffActiveDurationMinutes(apt)).toBe(45);
    expect(getProcessingDurationMinutes(apt)).toBe(0);
    expect(getAppointmentEndAt(apt).toISOString()).toBe("2026-08-24T09:45:00.000Z");
  });
});

describe("zero-duration phases", () => {
  it("keeps a zero-minute processing phase in the timeline without occupying time", () => {
    const technique = item("item-technique", 0, "Soin express", "TECHNIQUE", [
      phase("ph-application", "Application", 10, true),
      phase("ph-pose", "Temps de pose", 0, false),
      phase("ph-finish", "Finition", 5, true),
    ]);
    const apt = appointment([technique]);

    const timeline = calculateAppointmentTimeline(apt);
    const phases = timeline.items[0]?.phases ?? [];

    expect(phases).toHaveLength(3);
    expect(phases[1]?.durationMinutes).toBe(0);
    expect(phases[1]?.requiresStaff).toBe(false);
    expect(phases[1]?.startAt.toISOString()).toBe("2026-08-24T09:10:00.000Z");
    expect(phases[1]?.endAt.toISOString()).toBe("2026-08-24T09:10:00.000Z");
    expect(phases[2]?.startAt.toISOString()).toBe("2026-08-24T09:10:00.000Z");

    expect(getElapsedDurationMinutes(apt)).toBe(15);
    expect(getProcessingDurationMinutes(apt)).toBe(0);
  });
});

describe("appointment without items", () => {
  it("produces an empty timeline ending at the appointment start", () => {
    const apt = appointment([]);

    const timeline = calculateAppointmentTimeline(apt);

    expect(timeline.items).toEqual([]);
    expect(timeline.endAt.toISOString()).toBe("2026-08-24T09:00:00.000Z");
    expect(getElapsedDurationMinutes(apt)).toBe(0);
    expect(getStaffActiveDurationMinutes(apt)).toBe(0);
    expect(getProcessingDurationMinutes(apt)).toBe(0);
  });
});
