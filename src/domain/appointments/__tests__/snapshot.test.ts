import {
  createAppointmentItemSnapshot,
  type Service,
} from "../index";

function couleurRacinesService(overrides: {
  readonly price: number;
  readonly processingMinutes: number;
}): Service {
  return {
    id: "service-couleur-racines",
    businessId: "biz-1",
    name: "Couleur racines",
    type: "TECHNIQUE",
    price: overrides.price,
    active: true,
    phases: [
      {
        id: "service-ph-application",
        name: "Application",
        durationMinutes: 15,
        requiresStaff: true,
      },
      {
        id: "service-ph-pose",
        name: "Temps de pose",
        durationMinutes: overrides.processingMinutes,
        requiresStaff: false,
      },
      {
        id: "service-ph-rincage",
        name: "Rinçage",
        durationMinutes: 10,
        requiresStaff: true,
      },
    ],
  };
}

describe("appointment item snapshot", () => {
  it("preserves the booked price and phases when the catalog service later changes", () => {
    // Booking time: the catalog service costs 55 with 35 minutes of processing.
    const bookedService = couleurRacinesService({ price: 55, processingMinutes: 35 });
    const snapshot = createAppointmentItemSnapshot({
      id: "item-1",
      service: bookedService,
      order: 0,
    });

    // Later: the catalog evolves — new price and new processing duration.
    // A catalog edit produces a new representation; the snapshot must not follow it.
    couleurRacinesService({ price: 60, processingMinutes: 45 });

    expect(snapshot.price).toBe(55);
    expect(snapshot.phases.map((phase) => phase.durationMinutes)).toEqual([
      15, 35, 10,
    ]);
    expect(snapshot.serviceName).toBe("Couleur racines");
    expect(snapshot.serviceType).toBe("TECHNIQUE");
  });

  it("holds no reference to catalog service structures", () => {
    const service = couleurRacinesService({ price: 55, processingMinutes: 35 });
    const snapshot = createAppointmentItemSnapshot({
      id: "item-1",
      service,
      order: 0,
    });

    expect(snapshot.phases).not.toBe(service.phases);
    snapshot.phases.forEach((snapshotPhase, index) => {
      expect(snapshotPhase).not.toBe(service.phases[index]);
      expect(snapshotPhase).toEqual(service.phases[index]);
    });
  });

  it("uses the externally provided identity and order without inventing values", () => {
    const service = couleurRacinesService({ price: 55, processingMinutes: 35 });
    const snapshot = createAppointmentItemSnapshot({
      id: "item-from-outer-boundary",
      service,
      order: 3,
      serviceOptionId: "option-1",
    });

    expect(snapshot.id).toBe("item-from-outer-boundary");
    expect(snapshot.order).toBe(3);
    expect(snapshot.serviceOptionId).toBe("option-1");
    expect(snapshot.serviceId).toBe("service-couleur-racines");
  });
});
