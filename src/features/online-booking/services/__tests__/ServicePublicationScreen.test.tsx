// BeautIzzy — « Prestations proposées en ligne »
//
// The real screen against the fake server (its catalogue view, THE
// eligibility rule, all-or-nothing changes per Business), with fictional
// data: the server's list is the source of truth, a change is shown as
// saved only once the server confirmed it, a failure puts the server's state
// back, what becomes public is visible before it is, and nothing of it goes
// through the offline sync.

import { act, fireEvent, render, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import type { Service } from '@/domain/appointments';
import type { BusinessProfile } from '@/domain/business';
import { ServiceCatalogProvider } from '@/features/services/session/ServiceCatalogProvider';
import { createTestSeed } from '@/persistence/testing/fixtures';
import { testBusiness, TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';
import { haptics } from '@/shared/lib/haptics';

import { OnlineBookingGatewayProvider } from '../../session/OnlineBookingGatewayProvider';
import {
  createFakeOnlineBookingGateway,
  type FakeCatalogueService,
  type FakeOnlineBookingGateway,
} from '../../testing/fake-online-booking-gateway';
import { ServicePublicationScreen } from '../ServicePublicationScreen';

const successHaptic = jest.spyOn(haptics, 'success').mockImplementation();
const warningHaptic = jest.spyOn(haptics, 'warning').mockImplementation();
jest.spyOn(haptics, 'selection').mockImplementation();

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockFocused = true;
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useIsFocused: () => mockFocused,
}));

jest.mock('expo-symbols', () => {
  const React = jest.requireActual('react') as typeof import('react');
  return { SymbolView: () => React.createElement(React.Fragment, null) };
});

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

// The shared sheet is simply there or not; once it closes it reports its
// dismissal, as the real one does after its transition.
jest.mock('@/shared/ui/BottomSheet', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  function MockBottomSheet(props: {
    readonly visible: boolean;
    readonly header?: React.ReactNode;
    readonly children?: React.ReactNode;
    readonly testID?: string;
    readonly onDismissed?: () => void;
  }) {
    const { visible, onDismissed } = props;
    const wasVisible = React.useRef(visible);
    React.useEffect(() => {
      if (wasVisible.current && !visible) onDismissed?.();
      wasVisible.current = visible;
    }, [visible, onDismissed]);
    return visible ? React.createElement(View, { testID: props.testID }, props.header, props.children) : null;
  }
  return { BottomSheet: MockBottomSheet };
});

// ---------------------------------------------------------------------------
// Fictional data
// ---------------------------------------------------------------------------
const BUSINESS_ID = testBusiness.id;
const OTHER_BUSINESS_ID = 'business-voisine';
const COUPE_DESCRIPTION = 'Shampooing et coiffage inclus.\nSéchage naturel sur demande.';

const CATALOGUE: readonly FakeCatalogueService[] = [
  { id: 'svc-coupe', name: 'Coupe femme', priceCents: 4500, durationMinutes: 45, description: COUPE_DESCRIPTION },
  { id: 'svc-brushing', name: 'Brushing', priceCents: 0, durationMinutes: 30 },
  {
    id: 'tech-couleur',
    name: 'Couleur',
    type: 'TECHNIQUE',
    priceCents: 6500,
    durationMinutes: 90,
    description: 'Application, temps de pose et rinçage.',
  },
  { id: 'svc-chignon', name: 'Chignon', active: false, priceCents: 5000, durationMinutes: 60 },
  { id: 'svc-vide', name: 'Forfait sans durée', priceCents: 1000, durationMinutes: 0 },
  { id: 'svc-mariage', name: 'Journée mariage', priceCents: 90000, durationMinutes: 780 },
  { id: 'svc-ancienne', name: 'Ancienne prestation', deleted: true, durationMinutes: 30 },
];
/** Chosen before any screen existed (the operator's SQL Editor): one available, one inactive. */
const SELECTED = ['tech-couleur', 'svc-chignon'];

/** The device's own catalogue: two of the server's services. */
const localService = (id: string, name: string): Service => ({
  id,
  businessId: BUSINESS_ID,
  name,
  type: 'SERVICE',
  price: 45,
  active: true,
  phases: [{ id: `${id}-phase`, name, durationMinutes: 45, requiresStaff: true }],
});
const deviceSeed = (services: readonly Service[] = [localService('svc-coupe', 'Coupe femme'), localService('tech-couleur', 'Couleur')]) =>
  () => createTestSeed({ clients: [], services: [...services], products: [], appointments: [] });

function seededGateway() {
  const gateway = createFakeOnlineBookingGateway(testBusiness.name);
  gateway.seedServicePublication(BUSINESS_ID, { services: CATALOGUE, selected: SELECTED });
  gateway.seedServicePublication(OTHER_BUSINESS_ID, {
    services: [{ id: 'svc-voisine', name: 'Soin voisin', priceCents: 3000, durationMinutes: 30 }],
    selected: ['svc-voisine'],
  });
  return gateway;
}

interface RenderOptions {
  readonly business?: BusinessProfile;
  readonly seed?: ReturnType<typeof deviceSeed>;
}

function tree(gateway: FakeOnlineBookingGateway | undefined, options: RenderOptions = {}): ReactElement {
  return (
    <TestPersistenceProvider business={options.business ?? testBusiness} createSeed={options.seed ?? deviceSeed()}>
      <ServiceCatalogProvider>
        <OnlineBookingGatewayProvider gateway={gateway}>
          <ServicePublicationScreen />
        </OnlineBookingGatewayProvider>
      </ServiceCatalogProvider>
    </TestPersistenceProvider>
  );
}

type View = Awaited<ReturnType<typeof render>>;

async function renderScreen(gateway: FakeOnlineBookingGateway | undefined, options: RenderOptions = {}) {
  const view = await render(tree(gateway, options));
  await act(async () => {});
  return view;
}

const press = (view: View, testID: string) =>
  act(async () => {
    fireEvent.press(view.getByTestId(testID));
  });
const flip = (view: View, serviceId: string, value: boolean) =>
  act(async () => {
    fireEvent(view.getByTestId(`service-publication-switch-${serviceId}`), 'valueChange', value);
  });
const switchOf = (view: View, serviceId: string) => view.getByTestId(`service-publication-switch-${serviceId}`);
const rowIds = (view: View) =>
  view.getAllByTestId(/^service-publication-row-/).map((node) => String(node.props.testID).replace('service-publication-row-', ''));
const sectionRowIds = (view: View, key: string) =>
  within(view.getByTestId(`service-publication-section-${key}`))
    .getAllByTestId(/^service-publication-row-/)
    .map((node) => String(node.props.testID).replace('service-publication-row-', ''));
const notice = (view: View) => view.queryByTestId('service-publication-notice')?.props.children as string | undefined;
/** Leaves the screen and comes back (the editor, another tab): the list is read again. */
async function refocus(view: View, gateway: FakeOnlineBookingGateway, options?: RenderOptions) {
  mockFocused = false;
  await act(async () => view.rerender(tree(gateway, options)));
  mockFocused = true;
  await act(async () => view.rerender(tree(gateway, options)));
  await act(async () => {});
}

beforeEach(() => {
  mockFocused = true;
  mockPush.mockReset();
  mockBack.mockReset();
  successHaptic.mockClear();
  warningHaptic.mockClear();
});

// ---------------------------------------------------------------------------
describe('ServicePublicationScreen — the server’s list', () => {
  it('lists every live service of the server, never the device’s catalogue, with what is already chosen', async () => {
    const gateway = seededGateway();
    const view = await renderScreen(gateway);

    expect(gateway.calls.readServices).toBe(1);
    expect(view.getByText('Prestations proposées en ligne')).toBeTruthy();
    expect(view.getByText(/Choisissez les prestations de votre catalogue/)).toBeTruthy();
    expect(view.getByText(/restent dans votre catalogue privé/)).toBeTruthy();
    // Six live services; the deleted one is not listed.
    expect(rowIds(view).sort()).toEqual(
      ['svc-brushing', 'svc-chignon', 'svc-coupe', 'svc-mariage', 'svc-vide', 'tech-couleur'].sort(),
    );
    expect(view.queryByText('Ancienne prestation')).toBeNull();
    // The choices the server holds.
    expect(switchOf(view, 'tech-couleur').props.value).toBe(true);
    expect(switchOf(view, 'svc-chignon').props.value).toBe(true);
    expect(switchOf(view, 'svc-coupe').props.value).toBe(false);
    expect(switchOf(view, 'svc-brushing').props.value).toBe(false);
    expect(view.queryByTestId('service-publication-unsynced')).toBeNull();
  });

  it('groups like the hairdressing catalogue: Services, Techniques, then the unavailable ones with their reason', async () => {
    const view = await renderScreen(seededGateway());

    expect(sectionRowIds(view, 'type:SERVICE')).toEqual(['svc-brushing', 'svc-coupe']);
    expect(sectionRowIds(view, 'type:TECHNIQUE')).toEqual(['tech-couleur']);
    expect(sectionRowIds(view, 'unavailable')).toEqual(['svc-chignon', 'svc-vide', 'svc-mariage']);
    expect(rowIds(view)).toEqual(['svc-brushing', 'svc-coupe', 'tech-couleur', 'svc-chignon', 'svc-vide', 'svc-mariage']);
    expect(within(view.getByTestId('service-publication-section-unavailable')).getByText('Indisponibles en ligne')).toBeTruthy();
  });

  it('groups by her own categories, in her order, for a nails professional', async () => {
    const gateway = createFakeOnlineBookingGateway(testBusiness.name);
    gateway.seedServicePublication(BUSINESS_ID, {
      categories: [
        { id: 'cat-poses', name: 'Poses en gel', position: 1 },
        { id: 'cat-mains', name: 'Beauté des mains', position: 0 },
      ],
      services: [
        { id: 'svc-pose', name: 'Pose complète gel', durationMinutes: 90, priceCents: 5500, categoryId: 'cat-poses' },
        { id: 'svc-remplissage', name: 'Remplissage gel', durationMinutes: 75, priceCents: 4500, categoryId: 'cat-poses' },
        { id: 'svc-manucure', name: 'Manucure', durationMinutes: 30, priceCents: 2500, categoryId: 'cat-mains' },
        { id: 'svc-libre', name: 'Nail art', durationMinutes: 15, priceCents: 1000 },
      ],
    });
    const view = await renderScreen(gateway, { business: { ...testBusiness, activityType: 'NAILS' }, seed: deviceSeed([]) });

    expect(sectionRowIds(view, 'category:cat-mains')).toEqual(['svc-manucure']);
    expect(sectionRowIds(view, 'category:cat-poses')).toEqual(['svc-pose', 'svc-remplissage']);
    expect(sectionRowIds(view, 'uncategorized')).toEqual(['svc-libre']);
    expect(rowIds(view)).toEqual(['svc-manucure', 'svc-pose', 'svc-remplissage', 'svc-libre']);
    expect(view.queryByText('Services')).toBeNull();
    expect(view.queryByText('Techniques')).toBeNull();
  });

  it('shows the duration and the configured price — « Tarif à confirmer » for a price of 0, never free', async () => {
    const view = await renderScreen(seededGateway());

    expect(String(view.getByTestId('service-publication-facts-svc-coupe').props.children).replace(/[  ]/g, ' ')).toBe(
      '45 min · 45,00 €',
    );
    expect(view.getByTestId('service-publication-facts-svc-brushing').props.children).toBe('30 min · Tarif à confirmer');
    expect(view.getByTestId('service-publication-facts-svc-vide').props.children).toMatch(/^Sans durée · /);
    // No price reads as free: neither the word, nor a standalone « 0,00 € ».
    expect(view.queryByText(/Gratuit/)).toBeNull();
    expect(view.queryByText(/(^|[^0-9])0,00/)).toBeNull();
  });

  it('shows an empty catalogue as such, with the way to it', async () => {
    const gateway = createFakeOnlineBookingGateway(testBusiness.name);
    const view = await renderScreen(gateway, { seed: deviceSeed([]) });

    expect(view.getByTestId('service-publication-empty')).toBeTruthy();
    expect(view.queryByTestId('service-publication-select-all')).toBeNull();
    await press(view, 'service-publication-open-catalogue');
    expect(mockPush).toHaveBeenCalledWith('/services');
  });

  it('says when services of this device are not on the server yet', async () => {
    const view = await renderScreen(seededGateway(), {
      seed: deviceSeed([localService('svc-coupe', 'Coupe femme'), localService('svc-locale', 'Création du jour')]),
    });
    expect(view.getByTestId('service-publication-unsynced').props.children).toMatch(
      /^1 prestation de cet appareil n’apparaît pas encore ici/,
    );
    expect(view.queryByText('Création du jour')).toBeNull();
  });

  it('never confuses chosen with visible: one line says what the page shows now', async () => {
    const gateway = seededGateway();
    const view = await renderScreen(gateway);
    expect(within(view.getByTestId('service-publication-context')).getByText(/pas encore publiée : vos choix sont enregistrés/)).toBeTruthy();
  });

  it('reads the list again when the screen comes back into focus (back from the editor)', async () => {
    const gateway = seededGateway();
    const view = await renderScreen(gateway);
    // The description was edited in the catalogue (another screen, then the sync).
    gateway.updateCatalogueService(BUSINESS_ID, 'svc-brushing', { description: 'Brushing lisse ou wavy.' });
    await refocus(view, gateway);
    expect(gateway.calls.readServices).toBe(2);
    expect(view.getByTestId('service-publication-description-svc-brushing').props.children).toBe('Brushing lisse ou wavy.');
  });
});

// ---------------------------------------------------------------------------
describe('ServicePublicationScreen — what becomes public is visible first', () => {
  it('shows the description under the name, or a discreet « Description non renseignée »', async () => {
    const view = await renderScreen(seededGateway());

    const description = view.getByTestId('service-publication-description-svc-coupe');
    expect(description.props.children).toBe(COUPE_DESCRIPTION);
    expect(description.props.numberOfLines).toBe(2);
    expect(view.getByTestId('service-publication-description-svc-brushing').props.children).toBe('Description non renseignée');
  });

  it('opens the whole text exactly as customers read it, and says it is public', async () => {
    const view = await renderScreen(seededGateway());
    await press(view, 'service-publication-preview-svc-coupe');

    const sheet = within(view.getByTestId('service-publication-preview'));
    expect(sheet.getByText('APERÇU EN LIGNE')).toBeTruthy();
    expect(sheet.getByText('Coupe femme')).toBeTruthy();
    expect(sheet.getByTestId('service-publication-preview-description').props.children).toBe(COUPE_DESCRIPTION);
    expect(sheet.getByTestId('service-publication-preview-description').props.selectable).toBe(true);
    expect(sheet.getByText('DESCRIPTION VISIBLE EN LIGNE')).toBeTruthy();
    expect(sheet.getByText(/vérifiez qu’il ne contient rien de personnel/)).toBeTruthy();
  });

  it('explains a price of 0 in the preview, and never shows « Gratuit » as the price', async () => {
    const view = await renderScreen(seededGateway());
    await press(view, 'service-publication-preview-svc-brushing');

    const sheet = within(view.getByTestId('service-publication-preview'));
    expect(sheet.getByTestId('service-publication-preview-price').props.children).toBe('Tarif à confirmer');
    expect(sheet.getByTestId('service-publication-preview-price-note').props.children).toMatch(
      /affiche « Tarif à confirmer », jamais/,
    );
    expect(sheet.getByTestId('service-publication-preview-description').props.children).toBe('Description non renseignée');
  });

  it('chooses from the preview too, once the text was read', async () => {
    const gateway = seededGateway();
    const view = await renderScreen(gateway);
    await press(view, 'service-publication-preview-svc-coupe');
    await act(async () => {
      fireEvent(view.getByTestId('service-publication-preview-switch'), 'valueChange', true);
    });

    expect(gateway.serviceWrites).toEqual([{ businessId: BUSINESS_ID, serviceIds: ['svc-coupe'], selected: true }]);
    expect(view.getByTestId('service-publication-preview-switch').props.value).toBe(true);
    expect(switchOf(view, 'svc-coupe').props.value).toBe(true);
  });

  it('opens the existing editor once the sheet is gone, for a service on this device', async () => {
    const view = await renderScreen(seededGateway());
    await press(view, 'service-publication-preview-svc-coupe');
    expect(mockPush).not.toHaveBeenCalled();
    await press(view, 'service-publication-preview-edit');

    expect(view.queryByTestId('service-publication-preview')).toBeNull();
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/services/[serviceId]', params: { serviceId: 'svc-coupe' } });
  });

  it('offers no editor for a service this device does not hold yet', async () => {
    const view = await renderScreen(seededGateway());
    await press(view, 'service-publication-preview-svc-brushing');

    expect(view.queryByTestId('service-publication-preview-edit')).toBeNull();
    expect(view.getByTestId('service-publication-preview-not-on-device')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
describe('ServicePublicationScreen — one service at a time', () => {
  it('saves a choice at once, and a withdrawal, as the server confirms them', async () => {
    const gateway = seededGateway();
    const view = await renderScreen(gateway);

    await flip(view, 'svc-coupe', true);
    expect(gateway.serviceWrites).toEqual([{ businessId: BUSINESS_ID, serviceIds: ['svc-coupe'], selected: true }]);
    expect(gateway.selectedServiceIds(BUSINESS_ID)).toEqual(['svc-chignon', 'svc-coupe', 'tech-couleur']);
    expect(switchOf(view, 'svc-coupe').props.value).toBe(true);
    expect(notice(view)).toBe('« Coupe femme » est proposée en ligne.');
    expect(successHaptic).toHaveBeenCalledTimes(1);

    await flip(view, 'svc-coupe', false);
    expect(gateway.serviceWrites[1]).toEqual({ businessId: BUSINESS_ID, serviceIds: ['svc-coupe'], selected: false });
    expect(switchOf(view, 'svc-coupe').props.value).toBe(false);
    expect(notice(view)).toBe('« Coupe femme » n’est plus proposée en ligne.');
  });

  it('shows the asked value while the server has not answered — never as saved — and lets nothing else start', async () => {
    const gateway = seededGateway();
    const view = await renderScreen(gateway);
    const release = gateway.holdNext();

    await flip(view, 'svc-coupe', true);
    expect(switchOf(view, 'svc-coupe').props.value).toBe(true);
    expect(view.getByTestId('service-publication-pending-svc-coupe')).toBeTruthy();
    expect(notice(view)).toBeUndefined();
    expect(gateway.selectedServiceIds(BUSINESS_ID)).not.toContain('svc-coupe');
    // Every other switch and both bulk actions wait.
    expect(switchOf(view, 'svc-brushing').props.disabled).toBe(true);
    expect(view.getByTestId('service-publication-select-all').props.accessibilityState?.disabled).toBe(true);
    await flip(view, 'svc-brushing', true);
    expect(gateway.calls.setServices).toBe(1);

    await act(async () => release());
    await act(async () => {});
    expect(view.queryByTestId('service-publication-pending-svc-coupe')).toBeNull();
    expect(notice(view)).toBe('« Coupe femme » est proposée en ligne.');
    expect(switchOf(view, 'svc-brushing').props.disabled).toBe(false);
    expect(gateway.serviceWrites).toHaveLength(1);
  });

  it('puts the server’s state back when the change fails, says why, and never retries it alone', async () => {
    const gateway = seededGateway();
    const view = await renderScreen(gateway);
    gateway.failNext('NETWORK');

    await flip(view, 'svc-coupe', true);
    expect(switchOf(view, 'svc-coupe').props.value).toBe(false);
    expect(notice(view)).toBe('Le changement n’a pas été enregistré. Vérifiez votre connexion et réessayez.');
    expect(warningHaptic).toHaveBeenCalledTimes(1);
    expect(gateway.selectedServiceIds(BUSINESS_ID)).toEqual(['svc-chignon', 'tech-couleur']);
    await act(async () => {});
    expect(gateway.calls.setServices).toBe(1);
  });

  it.each([
    ['FORBIDDEN', /Reconnectez-vous/],
    ['UNAVAILABLE', /pas encore disponible/],
    ['UNKNOWN', /Réessayez dans un instant/],
  ] as const)('explains a %s failure in plain French and keeps the server’s state', async (code, message) => {
    const gateway = seededGateway();
    const view = await renderScreen(gateway);
    gateway.failNext(code);

    await flip(view, 'tech-couleur', false);
    expect(switchOf(view, 'tech-couleur').props.value).toBe(true);
    expect(notice(view)).toMatch(message);
  });

  it('reads a service deleted elsewhere as gone: nothing written, the list read again', async () => {
    const gateway = seededGateway();
    const view = await renderScreen(gateway);
    gateway.updateCatalogueService(BUSINESS_ID, 'svc-coupe', { deleted: true });

    await flip(view, 'svc-coupe', true);
    expect(gateway.serviceWrites).toEqual([]);
    expect(notice(view)).toBe('« Coupe femme » n’existe plus dans votre catalogue. La liste a été mise à jour.');
    await act(async () => {});
    expect(view.queryByTestId('service-publication-row-svc-coupe')).toBeNull();
  });

  it('reads a service deactivated elsewhere as not available: nothing written, the row moves', async () => {
    const gateway = seededGateway();
    const view = await renderScreen(gateway);
    gateway.updateCatalogueService(BUSINESS_ID, 'svc-coupe', { active: false });

    await flip(view, 'svc-coupe', true);
    expect(gateway.serviceWrites).toEqual([]);
    expect(notice(view)).toMatch(/^« Coupe femme » a été désactivée entre-temps/);
    await act(async () => {});
    expect(sectionRowIds(view, 'unavailable')).toContain('svc-coupe');
    expect(switchOf(view, 'svc-coupe').props.value).toBe(false);
  });

  it('shows the choices another device made meanwhile, as the server answers them', async () => {
    const gateway = seededGateway();
    const view = await renderScreen(gateway);
    // The professional's other phone.
    await gateway.setServicePublication(BUSINESS_ID, ['svc-brushing'], true);

    await flip(view, 'svc-coupe', true);
    expect(switchOf(view, 'svc-brushing').props.value).toBe(true);
    expect(switchOf(view, 'svc-coupe').props.value).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('ServicePublicationScreen — services that cannot be offered', () => {
  it('cannot newly choose an unavailable service, and says why', async () => {
    const gateway = seededGateway();
    const view = await renderScreen(gateway);

    expect(switchOf(view, 'svc-vide').props.disabled).toBe(true);
    expect(switchOf(view, 'svc-mariage').props.disabled).toBe(true);
    expect(view.getByTestId('service-publication-availability-svc-vide').props.children).toMatch(/^Sans durée/);
    expect(view.getByTestId('service-publication-availability-svc-mariage').props.children).toBe(
      'Plus de 12 h : trop longue pour être réservée en ligne.',
    );
    await flip(view, 'svc-vide', true);
    expect(gateway.calls.setServices).toBe(0);
  });

  it('keeps a chosen inactive service chosen, says it is not on the page and what brings it back', async () => {
    const view = await renderScreen(seededGateway());

    expect(switchOf(view, 'svc-chignon').props.value).toBe(true);
    expect(switchOf(view, 'svc-chignon').props.disabled).toBe(false);
    expect(view.getByTestId('service-publication-availability-svc-chignon').props.children).toBe(
      'Proposée, mais désactivée dans votre catalogue : elle n’apparaît pas sur votre page. Réactivez-la pour qu’elle soit de nouveau proposée.',
    );
  });

  it('offers it again on reactivation, without a new choice', async () => {
    const gateway = seededGateway();
    const view = await renderScreen(gateway);
    gateway.updateCatalogueService(BUSINESS_ID, 'svc-chignon', { active: true });
    await refocus(view, gateway);

    expect(sectionRowIds(view, 'type:SERVICE')).toContain('svc-chignon');
    expect(switchOf(view, 'svc-chignon').props.value).toBe(true);
    expect(view.queryByTestId('service-publication-availability-svc-chignon')).toBeNull();
    expect(gateway.serviceWrites).toEqual([]);
  });

  it('lets that choice be withdrawn; once withdrawn it cannot be chosen again while inactive', async () => {
    const gateway = seededGateway();
    const view = await renderScreen(gateway);

    await flip(view, 'svc-chignon', false);
    expect(gateway.serviceWrites).toEqual([{ businessId: BUSINESS_ID, serviceIds: ['svc-chignon'], selected: false }]);
    expect(switchOf(view, 'svc-chignon').props.value).toBe(false);
    expect(switchOf(view, 'svc-chignon').props.disabled).toBe(true);
    expect(view.getByTestId('service-publication-availability-svc-chignon').props.children).toMatch(
      /^Désactivée dans votre catalogue/,
    );
  });
});

// ---------------------------------------------------------------------------
describe('ServicePublicationScreen — « Tout proposer » and « Tout retirer »', () => {
  it('asks first, then proposes every available service of the list in ONE change', async () => {
    const gateway = seededGateway();
    const view = await renderScreen(gateway);

    await press(view, 'service-publication-select-all');
    const dialog = within(view.getByTestId('service-publication-bulk-dialog'));
    expect(dialog.getByText('Proposer toutes vos prestations ?')).toBeTruthy();
    expect(dialog.getByText(/^Les 3 prestations disponibles de cette liste seront proposées en ligne/)).toBeTruthy();
    expect(gateway.calls.setServices).toBe(0);

    await press(view, 'service-publication-bulk-confirm');
    expect(gateway.serviceWrites).toEqual([
      { businessId: BUSINESS_ID, serviceIds: ['svc-brushing', 'svc-coupe', 'tech-couleur'], selected: true },
    ]);
    expect(view.queryByTestId('service-publication-bulk-dialog')).toBeNull();
    expect(notice(view)).toBe('3 prestations proposées en ligne.');
    // The unavailable services were never sent.
    expect(gateway.selectedServiceIds(BUSINESS_ID)).toEqual(['svc-brushing', 'svc-chignon', 'svc-coupe', 'tech-couleur']);
    expect(view.queryByTestId('service-publication-select-all')).toBeNull();
  });

  it('changes nothing when the confirmation is cancelled', async () => {
    const gateway = seededGateway();
    const view = await renderScreen(gateway);
    await press(view, 'service-publication-select-all');
    await press(view, 'service-publication-bulk-cancel');

    expect(view.queryByTestId('service-publication-bulk-dialog')).toBeNull();
    expect(gateway.calls.setServices).toBe(0);
  });

  it('writes nothing at all when one service of the change was deactivated meanwhile', async () => {
    const gateway = seededGateway();
    const view = await renderScreen(gateway);
    await press(view, 'service-publication-select-all');
    gateway.updateCatalogueService(BUSINESS_ID, 'svc-brushing', { active: false });

    await press(view, 'service-publication-bulk-confirm');
    expect(gateway.serviceWrites).toEqual([]);
    expect(gateway.selectedServiceIds(BUSINESS_ID)).toEqual(['svc-chignon', 'tech-couleur']);
    expect(notice(view)).toMatch(/^« Brushing » a été désactivée entre-temps/);
    expect(switchOf(view, 'svc-coupe').props.value).toBe(false);
  });

  it('puts every switch back when the change fails', async () => {
    const gateway = seededGateway();
    const view = await renderScreen(gateway);
    await press(view, 'service-publication-select-all');
    gateway.failNext('NETWORK');

    await press(view, 'service-publication-bulk-confirm');
    expect(switchOf(view, 'svc-coupe').props.value).toBe(false);
    expect(switchOf(view, 'svc-brushing').props.value).toBe(false);
    expect(notice(view)).toMatch(/Vérifiez votre connexion/);
    expect(gateway.selectedServiceIds(BUSINESS_ID)).toEqual(['svc-chignon', 'tech-couleur']);
  });

  it('withdraws every chosen service of this Business only, the inactive one included', async () => {
    const gateway = seededGateway();
    const view = await renderScreen(gateway);

    await press(view, 'service-publication-withdraw-all');
    expect(within(view.getByTestId('service-publication-bulk-dialog')).getByText('Retirer toutes vos prestations ?')).toBeTruthy();
    await press(view, 'service-publication-bulk-confirm');

    expect(gateway.serviceWrites).toEqual([
      { businessId: BUSINESS_ID, serviceIds: ['svc-chignon', 'tech-couleur'], selected: false },
    ]);
    expect(gateway.selectedServiceIds(BUSINESS_ID)).toEqual([]);
    expect(gateway.selectedServiceIds(OTHER_BUSINESS_ID)).toEqual(['svc-voisine']);
    expect(notice(view)).toBe('Plus aucune prestation n’est proposée en ligne.');
    expect(view.queryByTestId('service-publication-withdraw-all')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('ServicePublicationScreen — server-owned, like the rest of Réservation en ligne', () => {
  it('needs no BeautIzzy Plus to prepare the selection, and never touches the page itself', async () => {
    const gateway = seededGateway();
    gateway.setPublicationRule({ publicationOpen: false, plusAccess: false });
    const view = await renderScreen(gateway);

    await flip(view, 'svc-coupe', true);
    expect(gateway.selectedServiceIds(BUSINESS_ID)).toContain('svc-coupe');
    expect(gateway.calls.setState).toBe(0);
    expect(gateway.calls.update).toBe(0);
  });

  it('works on the owner’s Business only: never shows nor changes another’s', async () => {
    const gateway = seededGateway();
    const view = await renderScreen(gateway);

    expect(view.queryByText('Soin voisin')).toBeNull();
    await flip(view, 'svc-coupe', true);
    expect(gateway.serviceWrites.every((write) => write.businessId === BUSINESS_ID)).toBe(true);
    expect(gateway.selectedServiceIds(OTHER_BUSINESS_ID)).toEqual(['svc-voisine']);
  });

  it('shows a project without the feature as not available yet — no spinner, no fake state — and retries', async () => {
    const gateway = seededGateway();
    gateway.setServicePublicationFailure('UNAVAILABLE');
    const view = await renderScreen(gateway);

    expect(view.getByTestId('service-publication-unavailable')).toBeTruthy();
    expect(view.getByText(/n’est pas encore disponible sur votre compte/)).toBeTruthy();
    expect(view.queryByTestId('service-publication-loading')).toBeNull();
    expect(view.queryAllByTestId(/^service-publication-switch-/)).toHaveLength(0);

    gateway.setServicePublicationFailure(undefined);
    await press(view, 'service-publication-retry');
    await act(async () => {});
    expect(switchOf(view, 'tech-couleur').props.value).toBe(true);
  });

  it('needs a connection to show the list, says so, and loads on « Réessayer »', async () => {
    const gateway = seededGateway();
    gateway.failNext('NETWORK');
    const view = await renderScreen(gateway);

    expect(view.getByText('Connexion nécessaire pour afficher et modifier vos prestations proposées en ligne.')).toBeTruthy();
    expect(view.queryAllByTestId(/^service-publication-switch-/)).toHaveLength(0);
    await press(view, 'service-publication-retry');
    await act(async () => {});
    expect(rowIds(view)).toHaveLength(6);
  });

  it('reads as unavailable when Supabase is not configured', async () => {
    const view = await renderScreen(undefined);
    expect(view.getByTestId('service-publication-unavailable')).toBeTruthy();
    expect(view.queryByTestId('service-publication-retry')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('ServicePublicationScreen — accessibility', () => {
  it('names each switch after its service, says what it does, and speaks each row', async () => {
    const view = await renderScreen(seededGateway());

    const coupe = switchOf(view, 'svc-coupe');
    expect(coupe.props.accessibilityLabel).toBe('Proposer « Coupe femme » en ligne');
    expect(coupe.props.accessibilityHint).toBe('Rend cette prestation visible et réservable sur votre page.');
    expect(switchOf(view, 'svc-vide').props.accessibilityHint).toMatch(/^Indisponible en ligne/);

    const row = view.getByTestId('service-publication-preview-svc-brushing');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toBe('Brushing, 30 min, Tarif à confirmer, Description non renseignée');
    expect(row.props.accessibilityHint).toBe('Affiche ce que vos clients verront en ligne');
    expect(view.getByText('Prestations proposées en ligne').props.accessibilityRole).toBe('header');
  });

  it('announces the outcome of a change politely', async () => {
    const view = await renderScreen(seededGateway());
    await flip(view, 'svc-coupe', true);
    expect(view.getByTestId('service-publication-notice').props.accessibilityLiveRegion).toBe('polite');
  });
});
