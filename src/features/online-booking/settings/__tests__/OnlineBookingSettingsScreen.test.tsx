// BeautIzzy — Réservation en ligne settings screen
//
// The real screen against the fake gateway: the draft the server returns,
// saving, the address refusals, publication decided by the server alone, and
// the connectivity rule — no server answer, no form; a failed save changes
// nothing and is never retried behind the professional's back.

import { act, fireEvent, render } from '@testing-library/react-native';

import { haptics } from '@/shared/lib/haptics';
import { testBusiness, TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

import { OnlineBookingGatewayProvider } from '../../session/OnlineBookingGatewayProvider';
import {
  createFakeOnlineBookingGateway,
  type FakeOnlineBookingGateway,
} from '../../testing/fake-online-booking-gateway';
import { OnlineBookingSettingsScreen } from '../OnlineBookingSettingsScreen';

jest.spyOn(haptics, 'success').mockImplementation();
jest.spyOn(haptics, 'warning').mockImplementation();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
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

// The photo flow has its own tests; here it only has to stay out of the way.
jest.mock('@/shared/ui/PhotoSourceFlow', () => ({ PhotoSourceFlow: () => null }));

type View = Awaited<ReturnType<typeof renderSettings>>;

async function renderSettings(gateway: FakeOnlineBookingGateway | undefined) {
  const view = await render(
    <TestPersistenceProvider>
      <OnlineBookingGatewayProvider gateway={gateway}>
        <OnlineBookingSettingsScreen />
      </OnlineBookingGatewayProvider>
    </TestPersistenceProvider>,
  );
  await act(async () => {});
  return view;
}

const type = (view: View, testID: string, text: string) =>
  act(async () => {
    fireEvent.changeText(view.getByTestId(testID), text);
  });
const press = (view: View, testID: string) =>
  act(async () => {
    fireEvent.press(view.getByTestId(testID));
  });
const toggle = (view: View, testID: string, value: boolean) =>
  act(async () => {
    fireEvent(view.getByTestId(`${testID}-switch`), 'valueChange', value);
  });
const isDisabled = (view: View, testID: string) =>
  view.getByTestId(testID).props.accessibilityState?.disabled === true;

function publishableGateway() {
  const gateway = createFakeOnlineBookingGateway(testBusiness.name);
  gateway.setPublicationRule({ publicationOpen: true, plusAccess: true });
  gateway.seedProfile(testBusiness.id, { slug: 'maison-lea' });
  return gateway;
}

describe('OnlineBookingSettingsScreen — draft', () => {
  it('shows the empty draft the server returns, with the Business name as the public name', async () => {
    const view = await renderSettings(createFakeOnlineBookingGateway(testBusiness.name));

    expect(view.getByText('Brouillon')).toBeTruthy();
    expect(view.getByTestId('online-booking-preview-name').props.children).toBe('Maison Léa');
    expect(view.getByTestId('online-booking-public-name').props.value).toBe('');
    expect(view.getByTestId('online-booking-publish-switch').props.value).toBe(false);
    expect(view.getByTestId('online-booking-bookings-switch').props.value).toBe(false);
    expect(isDisabled(view, 'online-booking-save')).toBe(true);
  });

  it('saves the draft without any subscription and reflects the server answer', async () => {
    const gateway = createFakeOnlineBookingGateway(testBusiness.name);
    const view = await renderSettings(gateway);

    await type(view, 'online-booking-public-name', 'Chez Léa');
    await type(view, 'online-booking-slug', 'Chez Léa');
    await type(view, 'online-booking-email', 'lea@example.test');
    expect(view.getByTestId('online-booking-slug').props.value).toBe('chez-lea');
    expect(view.getByTestId('online-booking-url').props.children).toBe('/r/chez-lea');
    await press(view, 'online-booking-save');

    expect(gateway.updates).toEqual([
      expect.objectContaining({ slug: 'chez-lea', publicName: 'Chez Léa', publicEmail: 'lea@example.test' }),
    ]);
    expect(view.getByText('Modifications enregistrées.')).toBeTruthy();
    expect(view.getByTestId('online-booking-preview-name').props.children).toBe('Chez Léa');
    expect(view.getByText('Brouillon')).toBeTruthy();
    expect(isDisabled(view, 'online-booking-save')).toBe(true);
    expect(gateway.calls.setState).toBe(0);
  });

  it('proposes an address from the name', async () => {
    const view = await renderSettings(createFakeOnlineBookingGateway(testBusiness.name));
    await press(view, 'online-booking-slug-suggestion');
    expect(view.getByTestId('online-booking-slug').props.value).toBe('maison-lea');
  });

  it('refuses a malformed address or e-mail before calling the server', async () => {
    const gateway = createFakeOnlineBookingGateway(testBusiness.name);
    const view = await renderSettings(gateway);

    await type(view, 'online-booking-slug', 'ab');
    await press(view, 'online-booking-save');
    expect(view.getByText(/3 à 60 caractères/)).toBeTruthy();

    await type(view, 'online-booking-slug', 'maison-lea');
    await type(view, 'online-booking-email', 'lea@');
    await press(view, 'online-booking-save');
    expect(view.getByText('Cette adresse e-mail n’est pas valide.')).toBeTruthy();
    expect(gateway.calls.update).toBe(0);
  });

  it('explains an address already used by another professional and keeps the draft', async () => {
    const gateway = createFakeOnlineBookingGateway(testBusiness.name);
    gateway.takenSlugs.add('salon-chic');
    const view = await renderSettings(gateway);

    await type(view, 'online-booking-slug', 'salon-chic');
    await press(view, 'online-booking-save');

    expect(view.getByText('Cette adresse est déjà utilisée. Choisissez-en une autre.')).toBeTruthy();
    expect(view.getByTestId('online-booking-slug').props.value).toBe('salon-chic');
    expect(gateway.updates).toHaveLength(0);
    expect(isDisabled(view, 'online-booking-save')).toBe(false);
  });
});

describe('OnlineBookingSettingsScreen — publication', () => {
  it('publishes when the server allows it, then opens and pauses bookings', async () => {
    const gateway = publishableGateway();
    const view = await renderSettings(gateway);
    expect(view.getByTestId('online-booking-bookings-switch').props.disabled).toBe(true);

    await toggle(view, 'online-booking-publish', true);
    expect(view.getByText('En ligne')).toBeTruthy();
    expect(view.getByTestId('online-booking-publish-switch').props.value).toBe(true);
    expect(view.getByTestId('online-booking-bookings-switch').props.value).toBe(false);

    await toggle(view, 'online-booking-bookings', true);
    expect(view.getByTestId('online-booking-bookings-switch').props.value).toBe(true);

    await toggle(view, 'online-booking-publish', false);
    expect(view.getByText('Brouillon')).toBeTruthy();
    expect(view.getByTestId('online-booking-bookings-switch').props.value).toBe(false);
  });

  it('leaves the page a draft when the server holds no verified Plus access', async () => {
    const gateway = publishableGateway();
    gateway.setPublicationRule({ publicationOpen: true, plusAccess: false });
    const view = await renderSettings(gateway);

    await toggle(view, 'online-booking-publish', true);

    expect(gateway.calls.setState).toBe(1);
    expect(view.getByText(/incluse dans BeautIzzy Plus/)).toBeTruthy();
    expect(view.getByTestId('online-booking-publish-switch').props.value).toBe(false);
    expect(view.getByText('Brouillon')).toBeTruthy();
  });

  it('leaves the page a draft while publication is not open on the server', async () => {
    const gateway = publishableGateway();
    gateway.setPublicationRule({ publicationOpen: false, plusAccess: true });
    const view = await renderSettings(gateway);

    await toggle(view, 'online-booking-publish', true);

    expect(view.getByTestId('online-booking-notice').props.children).toMatch(/publication des pages n’est pas encore ouverte/);
    expect(view.getByTestId('online-booking-publish-switch').props.value).toBe(false);
  });

  it('asks for an address, and for a saved draft, before publishing — without calling the server', async () => {
    const gateway = createFakeOnlineBookingGateway(testBusiness.name);
    gateway.setPublicationRule({ publicationOpen: true, plusAccess: true });
    const view = await renderSettings(gateway);

    await toggle(view, 'online-booking-publish', true);
    expect(view.getByText('Choisissez l’adresse de votre page avant de la publier.')).toBeTruthy();

    await type(view, 'online-booking-slug', 'maison-lea');
    await toggle(view, 'online-booking-publish', true);
    expect(view.getByText('Enregistrez vos modifications avant de publier.')).toBeTruthy();
    expect(gateway.calls.setState).toBe(0);
  });

  it('shows a published page whose subscription lapsed as offline; unpublishing still works', async () => {
    const gateway = publishableGateway();
    gateway.seedProfile(testBusiness.id, { published: true });
    gateway.setPublicationRule({ publicationOpen: true, plusAccess: false });
    const view = await renderSettings(gateway);

    expect(view.getByText('Hors ligne')).toBeTruthy();
    expect(view.queryByTestId('online-booking-open-page')).toBeNull();

    await toggle(view, 'online-booking-publish', false);
    expect(view.getByText('Brouillon')).toBeTruthy();
  });
});

describe('OnlineBookingSettingsScreen — connectivity', () => {
  it('shows no form without a server answer, and loads on « Réessayer »', async () => {
    const gateway = createFakeOnlineBookingGateway(testBusiness.name);
    gateway.failNext('NETWORK');
    const view = await renderSettings(gateway);

    expect(view.getByText('Connexion nécessaire pour afficher et modifier votre page publique.')).toBeTruthy();
    expect(view.queryByTestId('online-booking-save')).toBeNull();
    expect(view.queryByTestId('online-booking-publish')).toBeNull();

    await press(view, 'online-booking-retry');
    expect(view.getByTestId('online-booking-save')).toBeTruthy();
    expect(gateway.calls.read).toBe(2);
  });

  it('reads as unavailable when Supabase is not configured', async () => {
    const view = await renderSettings(undefined);
    expect(view.getByTestId('online-booking-offline')).toBeTruthy();
    expect(view.queryByTestId('online-booking-retry')).toBeNull();
  });

  it('a save that fails offline says so, keeps the draft, and is never sent again on its own', async () => {
    const gateway = createFakeOnlineBookingGateway(testBusiness.name);
    const view = await renderSettings(gateway);

    await type(view, 'online-booking-slug', 'maison-lea');
    gateway.failNext('NETWORK');
    await press(view, 'online-booking-save');

    expect(view.getByText(/n’ont pas été enregistrées/)).toBeTruthy();
    expect(view.getByTestId('online-booking-slug').props.value).toBe('maison-lea');
    expect(isDisabled(view, 'online-booking-save')).toBe(false);
    await act(async () => {});
    expect(gateway.calls.update).toBe(1);
    expect(gateway.updates).toHaveLength(0);
    expect((await gateway.readProfile(testBusiness.id)).slug).toBeUndefined();

    // Only an explicit second tap sends it.
    await press(view, 'online-booking-save');
    expect(gateway.updates).toHaveLength(1);
  });

  it('a publication change that fails offline leaves the switch where the server has it', async () => {
    const gateway = publishableGateway();
    const view = await renderSettings(gateway);

    gateway.failNext('NETWORK');
    await toggle(view, 'online-booking-publish', true);

    expect(view.getByText(/n’a pas été pris en compte/)).toBeTruthy();
    expect(view.getByTestId('online-booking-publish-switch').props.value).toBe(false);
  });
});
