import {
  calculateAppointmentTimeline,
  getElapsedDurationMinutes,
  getProcessingDurationMinutes,
  getStaffActiveDurationMinutes,
  reorderAppointmentItems,
  updateAppointmentItemPhaseDurations,
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

describe("updateAppointmentItemPhaseDurations", () => {
  const balayageService: Service = {
    id: "service-balayage",
    businessId: "biz-1",
    name: "Balayage",
    type: "TECHNIQUE",
    price: 95,
    active: true,
    phases: [
      phase("bal-application", "Application", 45, true),
      phase("bal-pose", "Temps de pose", 40, false),
    ],
  };

  function snapshotFromCatalog(itemId: string, order: number): AppointmentItem {
    return {
      id: itemId,
      serviceId: balayageService.id,
      order,
      serviceName: balayageService.name,
      serviceType: balayageService.type,
      price: balayageService.price,
      phases: balayageService.phases.map((entry) => ({ ...entry })),
    };
  }

  it("changes only the targeted Appointment snapshot; the catalog and later snapshots keep 40", () => {
    const appointmentA = appointment([snapshotFromCatalog("item-a", 0)]);

    const adjusted = updateAppointmentItemPhaseDurations(appointmentA, "item-a", [
      { phaseId: "bal-pose", durationMinutes: 5 },
    ]);

    expect(adjusted.items[0].phases[1].durationMinutes).toBe(5);
    expect(appointmentA.items[0].phases[1].durationMinutes).toBe(40);
    expect(balayageService.phases[1].durationMinutes).toBe(40);

    // A new Appointment B created afterwards still starts from the catalog.
    const appointmentB = { ...appointment([snapshotFromCatalog("item-b", 0)]), id: "apt-2" };
    expect(appointmentB.items[0].phases[1].durationMinutes).toBe(40);
    expect(getElapsedDurationMinutes(adjusted)).toBe(50);
    expect(getElapsedDurationMinutes(appointmentB)).toBe(85);
  });

  it("keeps a zero-minute phase in the snapshot instead of removing it", () => {
    const source = appointment([snapshotFromCatalog("item-a", 0)]);

    const adjusted = updateAppointmentItemPhaseDurations(source, "item-a", [
      { phaseId: "bal-pose", durationMinutes: 0 },
    ]);

    expect(adjusted.items[0].phases).toHaveLength(2);
    expect(adjusted.items[0].phases[1]).toEqual(phase("bal-pose", "Temps de pose", 0, false));
    expect(getProcessingDurationMinutes(adjusted)).toBe(0);
    expect(getElapsedDurationMinutes(adjusted)).toBe(45);
    const timeline = calculateAppointmentTimeline(adjusted);
    expect(timeline.items[0].phases[1].startAt).toEqual(timeline.items[0].phases[1].endAt);
  });

  it("applies several phases of one item at once and leaves the other items untouched by reference", () => {
    const coupe = item("item-coupe", 0, "Coupe", "SERVICE", [phase("coupe", "Coupe", 30, true)]);
    const balayage = snapshotFromCatalog("item-balayage", 1);
    const brushing = item("item-brushing", 2, "Brushing", "SERVICE", [
      phase("brushing", "Brushing", 25, true),
    ]);
    const source = appointment([coupe, balayage, brushing]);

    const adjusted = updateAppointmentItemPhaseDurations(source, "item-balayage", [
      { phaseId: "bal-application", durationMinutes: 30 },
      { phaseId: "bal-pose", durationMinutes: 5 },
    ]);

    expect(adjusted.items[0]).toBe(coupe);
    expect(adjusted.items[2]).toBe(brushing);
    expect(adjusted.items[1].phases.map((entry) => entry.durationMinutes)).toEqual([30, 5]);
    expect(source.items[1].phases.map((entry) => entry.durationMinutes)).toEqual([45, 40]);
    expect(getStaffActiveDurationMinutes(adjusted)).toBe(85);
  });

  it("rejects an invalid duration or an unknown phase without touching the Appointment", () => {
    const source = appointment([snapshotFromCatalog("item-a", 0)]);

    expect(() =>
      updateAppointmentItemPhaseDurations(source, "item-a", [
        { phaseId: "bal-pose", durationMinutes: -5 },
      ]),
    ).toThrow(RangeError);
    expect(() =>
      updateAppointmentItemPhaseDurations(source, "item-a", [
        { phaseId: "bal-pose", durationMinutes: 10 },
        { phaseId: "missing", durationMinutes: 10 },
      ]),
    ).toThrow(/not found/);
    expect(source.items[0].phases[1].durationMinutes).toBe(40);
  });
});
