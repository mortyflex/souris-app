import { act, fireEvent, render } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { useState } from 'react';

import {
  createAppointmentItemSnapshot,
  type AppointmentItem,
  type Service,
} from '@/domain/appointments';

import { createInitialServiceCatalog } from '../../data/initial-services';
import { ServiceCatalogProvider, useServiceCatalog } from '../ServiceCatalogProvider';

const addedService: Service = {
  id: 'service-created',
  businessId: 'fixture-business',
  name: 'Coupe enfant',
  type: 'SERVICE',
  price: 25,
  phases: [
    {
      id: 'service-created-phase',
      name: 'Coupe enfant',
      durationMinutes: 30,
      requiresStaff: true,
    },
  ],
  active: true,
};

function Probe() {
  const {
    services,
    activeServices,
    getServiceById,
    addService,
    updateService,
    setServiceActive,
    deleteService,
  } = useServiceCatalog();
  const created = getServiceById(addedService.id);

  return (
    <>
      <Text>{`count:${services.length}`}</Text>
      <Text>{`active:${activeServices.length}`}</Text>
      <Text>{created ? `${created.name}:${created.price}:${created.active}` : 'missing'}</Text>
      <Text>{created ? `identity:${created.id}:${created.businessId}` : ''}</Text>
      <Pressable testID="add" onPress={() => addService(addedService)} />
      <Pressable
        testID="update"
        onPress={() =>
          created &&
          updateService({
            ...created,
            businessId: 'replacement-business-is-ignored',
            name: 'Coupe enfant premium',
            price: 28,
            phases: created.phases.map((phase) => ({
              ...phase,
              durationMinutes: 35,
            })),
          })
        }
      />
      <Pressable
        testID="deactivate"
        onPress={() => setServiceActive(addedService.id, false)}
      />
      <Pressable
        testID="reactivate"
        onPress={() => setServiceActive(addedService.id, true)}
      />
      <Pressable testID="delete-added" onPress={() => deleteService(addedService.id)} />
      <Pressable testID="delete-unknown" onPress={() => deleteService('unknown-id')} />
    </>
  );
}

describe('ServiceCatalogProvider', () => {
  it('seeds the real canonical import and exposes lookup', async () => {
    const view = await render(
      <ServiceCatalogProvider>
        <Probe />
      </ServiceCatalogProvider>,
    );

    expect(view.getByText(`count:${createInitialServiceCatalog().length}`)).toBeTruthy();
    expect(view.getByText(`active:${createInitialServiceCatalog().length}`)).toBeTruthy();
    expect(view.getByText('missing')).toBeTruthy();
  });

  it('adds, updates, deactivates, and reactivates without mutating the seed', async () => {
    const initial = createInitialServiceCatalog();
    const initialSnapshot = JSON.stringify(initial);
    const view = await render(
      <ServiceCatalogProvider>
        <Probe />
      </ServiceCatalogProvider>,
    );

    await act(async () => fireEvent.press(view.getByTestId('add')));
    expect(view.getByText('Coupe enfant:25:true')).toBeTruthy();

    await act(async () => fireEvent.press(view.getByTestId('update')));
    expect(view.getByText('Coupe enfant premium:28:true')).toBeTruthy();
    expect(view.getByText('identity:service-created:fixture-business')).toBeTruthy();

    await act(async () => fireEvent.press(view.getByTestId('deactivate')));
    expect(view.getByText('Coupe enfant premium:28:false')).toBeTruthy();
    expect(view.getByText(`active:${initial.length}`)).toBeTruthy();

    await act(async () => fireEvent.press(view.getByTestId('reactivate')));
    expect(view.getByText(`active:${initial.length + 1}`)).toBeTruthy();
    expect(JSON.stringify(initial)).toBe(initialSnapshot);
  });

  it('deletes the exact Service immutably and keeps everything else', async () => {
    const initial = createInitialServiceCatalog();
    const initialSnapshot = JSON.stringify(initial);
    const view = await render(
      <ServiceCatalogProvider>
        <Probe />
      </ServiceCatalogProvider>,
    );

    await act(async () => fireEvent.press(view.getByTestId('add')));
    expect(view.getByText(`count:${initial.length + 1}`)).toBeTruthy();

    await act(async () => fireEvent.press(view.getByTestId('delete-added')));
    expect(view.getByText(`count:${initial.length}`)).toBeTruthy();
    expect(view.getByText(`active:${initial.length}`)).toBeTruthy();
    expect(view.getByText('missing')).toBeTruthy();

    // Unknown ids are a consistent no-op.
    await act(async () => fireEvent.press(view.getByTestId('delete-unknown')));
    expect(view.getByText(`count:${initial.length}`)).toBeTruthy();

    expect(JSON.stringify(initial)).toBe(initialSnapshot);
  });

  it('deletes an inactive Service without a prior reactivation', async () => {
    const initial = createInitialServiceCatalog();
    const view = await render(
      <ServiceCatalogProvider>
        <Probe />
      </ServiceCatalogProvider>,
    );

    await act(async () => fireEvent.press(view.getByTestId('add')));
    await act(async () => fireEvent.press(view.getByTestId('deactivate')));
    await act(async () => fireEvent.press(view.getByTestId('delete-added')));

    expect(view.getByText(`count:${initial.length}`)).toBeTruthy();
    expect(view.getByText(`active:${initial.length}`)).toBeTruthy();
    expect(view.getByText('missing')).toBeTruthy();
  });
});

function SnapshotProbe() {
  const {
    getServiceById,
    updateService,
    setServiceActive,
    deleteService,
    activeServices,
  } = useServiceCatalog();
  const [existing, setExisting] = useState<AppointmentItem>();
  const [next, setNext] = useState<AppointmentItem>();
  const serviceId = 'technique-balayage-balayage-1';
  const current = getServiceById(serviceId);

  const takeSnapshot = (id: string) =>
    current
      ? createAppointmentItemSnapshot({ id, order: 0, service: current })
      : undefined;

  return (
    <>
      <Text>{`selectable:${activeServices.some((service) => service.id === serviceId)}`}</Text>
      <Text>{`lookup:${current ? 'present' : 'gone'}`}</Text>
      <Text>{`old:${existing?.price ?? '-'}:${existing?.phases[1]?.durationMinutes ?? '-'}`}</Text>
      <Text>{`new:${next?.price ?? '-'}:${next?.phases[1]?.durationMinutes ?? '-'}`}</Text>
      <Pressable testID="book-old" onPress={() => setExisting(takeSnapshot('item-old'))} />
      <Pressable
        testID="edit-catalog"
        onPress={() => {
          if (!current) return;
          updateService({
            ...current,
            price: 110,
            phases: current.phases.map((phase) =>
              phase.requiresStaff ? phase : { ...phase, durationMinutes: 55 },
            ),
          });
        }}
      />
      <Pressable testID="book-new" onPress={() => setNext(takeSnapshot('item-new'))} />
      <Pressable testID="deactivate-seed" onPress={() => setServiceActive(serviceId, false)} />
      <Pressable testID="reactivate-seed" onPress={() => setServiceActive(serviceId, true)} />
      <Pressable testID="delete-seed" onPress={() => deleteService(serviceId)} />
    </>
  );
}

describe('catalog and Appointment snapshot boundary', () => {
  it('keeps retained items unchanged while new additions use current catalog values', async () => {
    const view = await render(
      <ServiceCatalogProvider>
        <SnapshotProbe />
      </ServiceCatalogProvider>,
    );

    await act(async () => fireEvent.press(view.getByTestId('book-old')));
    expect(view.getByText('old:45:60')).toBeTruthy();

    await act(async () => fireEvent.press(view.getByTestId('edit-catalog')));
    expect(view.getByText('old:45:60')).toBeTruthy();

    await act(async () => fireEvent.press(view.getByTestId('book-new')));
    expect(view.getByText('new:110:55')).toBeTruthy();

    await act(async () => fireEvent.press(view.getByTestId('deactivate-seed')));
    expect(view.getByText('selectable:false')).toBeTruthy();
    expect(view.getByText('old:45:60')).toBeTruthy();

    await act(async () => fireEvent.press(view.getByTestId('reactivate-seed')));
    expect(view.getByText('selectable:true')).toBeTruthy();
  });

  it('deleting the catalog Service never touches retained Appointment snapshots', async () => {
    const view = await render(
      <ServiceCatalogProvider>
        <SnapshotProbe />
      </ServiceCatalogProvider>,
    );

    await act(async () => fireEvent.press(view.getByTestId('book-old')));
    expect(view.getByText('old:45:60')).toBeTruthy();

    await act(async () => fireEvent.press(view.getByTestId('delete-seed')));

    // The retained snapshot keeps every booked value and stays usable.
    expect(view.getByText('old:45:60')).toBeTruthy();
    // The catalog record is gone and can no longer be selected.
    expect(view.getByText('lookup:gone')).toBeTruthy();
    expect(view.getByText('selectable:false')).toBeTruthy();

    // New additions have nothing to copy from the deleted Service.
    await act(async () => fireEvent.press(view.getByTestId('book-new')));
    expect(view.getByText('new:-:-')).toBeTruthy();

    // Reactivation cannot resurrect a deleted record.
    await act(async () => fireEvent.press(view.getByTestId('reactivate-seed')));
    expect(view.getByText('lookup:gone')).toBeTruthy();
    expect(view.getByText('selectable:false')).toBeTruthy();
  });
});
