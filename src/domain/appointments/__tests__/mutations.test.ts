import {
  calculateAppointmentTimeline,
  getElapsedDurationMinutes,
  getProcessingDurationMinutes,
  getStaffActiveDurationMinutes,
  reorderAppointmentItems,
  updateAppointmentPhaseDuration,
  type Appointment,
  type AppointmentItem,
  type AppointmentPhase,
  type Service,
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

function couleurItem(order: number): AppointmentItem {
  return item("item-couleur", order, "Couleur racines", "TECHNIQUE", [
    phase("ph-application", "Application", 15, true),
    phase("ph-pose", "Temps de pose", 35, false),
    phase("ph-rincage", "Rinçage", 10, true),
  ]);
}

function coupeItem(order: number): AppointmentItem {
  return item("item-coupe", order, "Coupe", "SERVICE", [
    phase("ph-coupe", "Coupe", 30, true),
  ]);
}

describe("reorderAppointmentItems", () => {
  it("recalculates item start times after Couleur and Coupe are swapped", () => {
    const apt = appointment([couleurItem(0), coupeItem(1)]);

    // Before: Couleur 09:00–10:00, Coupe 10:00–10:30.
    const before = calculateAppointmentTimeline(apt);
    expect(before.items.map((entry) => entry.serviceName)).toEqual([
      "Couleur racines",
      "Coupe",
    ]);

    // The professional moves Couleur after Coupe.
    const reordered = reorderAppointmentItems(apt, 0, 1);
    const after = calculateAppointmentTimeline(reordered);

    expect(after.items.map((entry) => entry.serviceName)).toEqual([
      "Coupe",
      "Couleur racines",
    ]);
    expect(after.items[0]?.startAt.toISOString()).toBe("2026-08-24T09:00:00.000Z");
    expect(after.items[0]?.endAt.toISOString()).toBe("2026-08-24T09:30:00.000Z");
    expect(after.items[1]?.startAt.toISOString()).toBe("2026-08-24T09:30:00.000Z");
    expect(after.items[1]?.endAt.toISOString()).toBe("2026-08-24T10:30:00.000Z");
  });

  it("normalizes the order values to a contiguous 0-based sequence", () => {
    const apt = appointment([couleurItem(0), coupeItem(1)]);

    const reordered = reorderAppointmentItems(apt, 0, 1);

    const coupe = reordered.items.find((entry) => entry.serviceName === "Coupe");
    const couleur = reordered.items.find(
      (entry) => entry.serviceName === "Couleur racines",
    );
    expect(coupe?.order).toBe(0);
    expect(couleur?.order).toBe(1);
  });

  it("operates on logical order positions, not the physical array order", () => {
    // The array stores Coupe first, but Couleur owns the logical order 0.
    const couleur = couleurItem(0);
    const coupe = coupeItem(1);
    const apt = appointment([coupe, couleur]);

    const reordered = reorderAppointmentItems(apt, 0, 1);

    expect(reordered.items.map((entry) => entry.serviceName)).toEqual([
      "Coupe",
      "Couleur racines",
    ]);
    expect(reordered.items[0]?.order).toBe(0);
    expect(reordered.items[1]?.order).toBe(1);
  });

  it("does not mutate the original appointment or its items", () => {
    const apt = appointment([couleurItem(0), coupeItem(1)]);
    const itemsBefore = apt.items;

    const reordered = reorderAppointmentItems(apt, 0, 1);

    expect(apt.items).toBe(itemsBefore);
    expect(apt.items[0]?.order).toBe(0);
    expect(apt.items[1]?.order).toBe(1);
    expect(reordered).not.toBe(apt);
    expect(reordered.items).not.toBe(itemsBefore);
  });

  it("rejects out-of-range positions", () => {
    const apt = appointment([couleurItem(0), coupeItem(1)]);

    expect(() => reorderAppointmentItems(apt, 0, 5)).toThrow(RangeError);
    expect(() => reorderAppointmentItems(apt, -1, 1)).toThrow(RangeError);
  });
});

describe("updateAppointmentPhaseDuration", () => {
  function techniqueAppointment(): Appointment {
    const technique = item("item-technique", 0, "Couleur racines", "TECHNIQUE", [
      phase("ph-application", "Application", 15, true),
      phase("ph-pose", "Temps de pose", 35, false),
      phase("ph-finish", "Finition", 10, true),
    ]);
    return appointment([technique, coupeItem(1)]);
  }

  it("extends the following phases and the appointment end when processing grows", () => {
    const apt = techniqueAppointment();

    const updated = updateAppointmentPhaseDuration(apt, "item-technique", "ph-pose", 45);

    // Processing 35 → 45: +10 minutes of unattended time.
    expect(getProcessingDurationMinutes(updated)).toBe(45);
    expect(getElapsedDurationMinutes(updated)).toBe(100);
    // Staff-active time is unchanged: only the unattended phase grew.
    expect(getStaffActiveDurationMinutes(updated)).toBe(55);

    const timeline = calculateAppointmentTimeline(updated);
    const phases = timeline.items[0]?.phases ?? [];
    expect(phases[0]?.startAt.toISOString()).toBe("2026-08-24T09:00:00.000Z");
    expect(phases[0]?.endAt.toISOString()).toBe("2026-08-24T09:15:00.000Z");
    expect(phases[1]?.startAt.toISOString()).toBe("2026-08-24T09:15:00.000Z");
    expect(phases[1]?.endAt.toISOString()).toBe("2026-08-24T10:00:00.000Z");
    // The following phase starts 10 minutes later than before.
    expect(phases[2]?.startAt.toISOString()).toBe("2026-08-24T10:00:00.000Z");
    expect(phases[2]?.endAt.toISOString()).toBe("2026-08-24T10:10:00.000Z");
    // The appointment end moves by 10 minutes.
    expect(timeline.endAt.toISOString()).toBe("2026-08-24T10:40:00.000Z");
  });

  it("does not mutate the original appointment and preserves unrelated items", () => {
    const apt = techniqueAppointment();
    const itemsBefore = apt.items;

    const updated = updateAppointmentPhaseDuration(apt, "item-technique", "ph-pose", 45);

    expect(apt.items).toBe(itemsBefore);
    expect(apt.items[0]?.phases[1]?.durationMinutes).toBe(35);
    expect(updated).not.toBe(apt);
    // The untouched Coupe item is preserved by reference.
    expect(updated.items[1]).toBe(apt.items[1]);
    // Unrelated phases of the edited item are preserved by reference.
    expect(updated.items[0]?.phases[0]).toBe(apt.items[0]?.phases[0]);
    expect(updated.items[0]?.phases[2]).toBe(apt.items[0]?.phases[2]);
  });

  it("never touches the catalog service the snapshot originated from", () => {
    const catalogService: Service = {
      id: "service-couleur-racines",
      businessId: "biz-1",
      name: "Couleur racines",
      type: "TECHNIQUE",
      price: 55,
      active: true,
      phases: [
        { id: "ph-application", name: "Application", durationMinutes: 15, requiresStaff: true },
        { id: "ph-pose", name: "Temps de pose", durationMinutes: 35, requiresStaff: false },
      ],
    };

    const apt = techniqueAppointment();
    updateAppointmentPhaseDuration(apt, "item-technique", "ph-pose", 45);

    expect(catalogService.phases[1]?.durationMinutes).toBe(35);
  });

  it("rejects unknown item or phase targets", () => {
    const apt = techniqueAppointment();

    expect(() =>
      updateAppointmentPhaseDuration(apt, "item-unknown", "ph-pose", 45),
    ).toThrow(/item-unknown/);
    expect(() =>
      updateAppointmentPhaseDuration(apt, "item-technique", "ph-unknown", 45),
    ).toThrow(/ph-unknown/);
  });
});
