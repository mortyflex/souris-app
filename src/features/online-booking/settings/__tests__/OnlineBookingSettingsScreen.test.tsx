// BeautIzzy — Réservation en ligne settings screen
//
// The real screen against the fake gateway: the draft the server returns,
// saving, the address refusals, publication decided by the server alone, and
// the connectivity rule — no server answer, no form; a failed save changes
// nothing and is never retried behind the professional's back.

import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Dimensions, Linking, Platform, StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

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

const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
  // The « Prestations proposées en ligne » entry reads its count on focus.
  useIsFocused: () => true,
}));

// The latest removal guard of the screen: a test plays the iOS back gesture /
// the Android hardware back by calling it while it is enabled.
const mockRemovalGuard: { enabled: boolean; onPrevent: () => void } = { enabled: false, onPrevent: () => {} };
jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: (enabled: boolean, onPrevent: () => void) => {
    mockRemovalGuard.enabled = enabled;
    mockRemovalGuard.onPrevent = onPrevent;
  },
}));

/** A native back attempt: prevented (the callback runs) or let through (the route leaves). */
async function nativeBack() {
  await act(async () => {
    if (mockRemovalGuard.enabled) mockRemovalGuard.onPrevent();
    else mockBack();
  });
}

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

// The iOS Simulator unless a test says otherwise (public-page-url.ts reads it at every render).
let mockIsPhysicalDevice = false;
jest.mock('expo-device', () => ({
  __esModule: true,
  get isDevice() {
    return mockIsPhysicalDevice;
  },
}));

const mockSetStringAsync = jest.fn<Promise<boolean>, [string]>();
jest.mock('expo-clipboard', () => ({
  setStringAsync: (text: string) => mockSetStringAsync(text),
}));

// The shared sheet keeps its content mounted while it slides away; here it is
// simply there or not, so a test reads « open » and « closed » directly.
jest.mock('@/shared/ui/BottomSheet', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    BottomSheet: (props: {
      readonly visible: boolean;
      readonly header?: React.ReactNode;
      readonly children?: React.ReactNode;
      readonly testID?: string;
    }) => (props.visible ? React.createElement(View, { testID: props.testID }, props.header, props.children) : null),
  };
});

// The photo flow has its own tests; here it only hands the screen a picked image.
const mockPhotoFlows: Record<string, { onSelected: (uri: string) => void; onRemove: () => void }> = {};
jest.mock('@/shared/ui/PhotoSourceFlow', () => ({
  PhotoSourceFlow: (props: {
    readonly testID: string;
    readonly onSelected: (uri: string) => void;
    readonly onRemove: () => void;
  }) => {
    mockPhotoFlows[props.testID] = props;
    return null;
  },
}));
jest.mock('@/shared/lib/photo-normalization', () => ({
  normalizePhoto: (uri: string) => Promise.resolve(uri),
}));

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

const configuredWebUrl = process.env.EXPO_PUBLIC_WEB_URL;

beforeEach(() => {
  // No website configured unless a test says so, whatever the local .env holds.
  delete process.env.EXPO_PUBLIC_WEB_URL;
  mockSetStringAsync.mockReset().mockResolvedValue(true);
  mockBack.mockReset();
  mockPush.mockReset();
});

afterAll(() => {
  if (configuredWebUrl === undefined) delete process.env.EXPO_PUBLIC_WEB_URL;
  else process.env.EXPO_PUBLIC_WEB_URL = configuredWebUrl;
});

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

describe('OnlineBookingSettingsScreen — page link', () => {
  const messageOf = (view: View) => view.getByTestId('online-booking-url-message').props.children;
  const copy = (view: View) => press(view, 'online-booking-copy-link');

  function onlineGateway() {
    const gateway = publishableGateway();
    gateway.seedProfile(testBusiness.id, { published: true });
    return gateway;
  }

  it('shows the complete production URL of an online page and copies it', async () => {
    process.env.EXPO_PUBLIC_WEB_URL = 'https://beautizzy.fr';
    const view = await renderSettings(onlineGateway());

    expect(view.getByTestId('online-booking-url').props.children).toBe('https://beautizzy.fr/r/maison-lea');
    expect(view.getByText('Lien public')).toBeTruthy();
    expect(messageOf(view)).toBe('Partagez ce lien avec vos clients.');

    await copy(view);

    expect(mockSetStringAsync).toHaveBeenCalledTimes(1);
    expect(mockSetStringAsync).toHaveBeenCalledWith('https://beautizzy.fr/r/maison-lea');
    expect(messageOf(view)).toBe('Lien copié.');
  });

  it('marks a local origin as a LOCAL test link, never as shareable (iOS Simulator: localhost)', async () => {
    process.env.EXPO_PUBLIC_WEB_URL = 'http://localhost:3000';
    const view = await renderSettings(onlineGateway());

    expect(view.getByTestId('online-booking-url').props.children).toBe('http://localhost:3000/r/maison-lea');
    expect(view.getByText('Lien de test local')).toBeTruthy();
    expect(view.queryByText('Lien public')).toBeNull();
    expect(messageOf(view)).toMatch(/Ne la partagez pas avec vos clients/);

    await copy(view);
    expect(mockSetStringAsync).toHaveBeenCalledWith('http://localhost:3000/r/maison-lea');
  });

  it('marks a Staging origin as a test link, never as shareable', async () => {
    process.env.EXPO_PUBLIC_WEB_URL = 'https://staging.beautizzy.fr';
    const view = await renderSettings(onlineGateway());

    expect(view.getByTestId('online-booking-url').props.children).toBe('https://staging.beautizzy.fr/r/maison-lea');
    expect(view.getByText('Lien de test')).toBeTruthy();
    expect(messageOf(view)).toMatch(/environnement de test/);
  });

  describe('on other runtimes', () => {
    let restorePlatform: (() => void) | undefined;
    const openURL = jest.spyOn(Linking, 'openURL');

    beforeEach(() => {
      openURL.mockReset().mockResolvedValue(true);
    });

    afterEach(() => {
      restorePlatform?.();
      restorePlatform = undefined;
      mockIsPhysicalDevice = false;
      delete process.env.EXPO_PUBLIC_WEB_DEVICE_URL;
    });

    const runOn = (os: 'ios' | 'android', physical: boolean) => {
      restorePlatform = jest.replaceProperty(Platform, 'OS', os).restore;
      mockIsPhysicalDevice = physical;
    };

    it('Android Emulator: shows, copies and opens the computer at 10.0.2.2', async () => {
      runOn('android', false);
      process.env.EXPO_PUBLIC_WEB_URL = 'http://localhost:3000';
      const view = await renderSettings(onlineGateway());

      expect(view.getByTestId('online-booking-url').props.children).toBe('http://10.0.2.2:3000/r/maison-lea');
      expect(view.getByText('Lien de test local')).toBeTruthy();
      await copy(view);
      expect(mockSetStringAsync).toHaveBeenCalledWith('http://10.0.2.2:3000/r/maison-lea');
      await press(view, 'online-booking-open-page');
      expect(openURL).toHaveBeenCalledWith('http://10.0.2.2:3000/r/maison-lea');
    });

    it('physical device without a device origin: no unreachable link, and says what to configure', async () => {
      runOn('android', true);
      process.env.EXPO_PUBLIC_WEB_URL = 'http://localhost:3000';
      const view = await renderSettings(onlineGateway());

      expect(view.getByTestId('online-booking-url').props.children).toBe('/r/maison-lea');
      expect(messageOf(view)).toMatch(/EXPO_PUBLIC_WEB_DEVICE_URL/);
      expect(view.queryByTestId('online-booking-copy-link')).toBeNull();
      expect(view.queryByTestId('online-booking-open-page')).toBeNull();
      expect(view.queryByText(/10\.0\.2\.2|localhost/)).toBeNull();
    });

    it('physical device with a device origin: shows, copies and opens that host', async () => {
      runOn('ios', true);
      process.env.EXPO_PUBLIC_WEB_URL = 'http://localhost:3000';
      process.env.EXPO_PUBLIC_WEB_DEVICE_URL = 'http://192.168.1.20:3000';
      const view = await renderSettings(onlineGateway());

      expect(view.getByTestId('online-booking-url').props.children).toBe('http://192.168.1.20:3000/r/maison-lea');
      expect(view.getByText('Lien de test local')).toBeTruthy();
      await copy(view);
      expect(mockSetStringAsync).toHaveBeenCalledWith('http://192.168.1.20:3000/r/maison-lea');
      await press(view, 'online-booking-open-page');
      expect(openURL).toHaveBeenCalledWith('http://192.168.1.20:3000/r/maison-lea');
    });

    it('production origin: the same public link on every runtime', async () => {
      runOn('android', true);
      process.env.EXPO_PUBLIC_WEB_URL = 'https://beautizzy.fr';
      process.env.EXPO_PUBLIC_WEB_DEVICE_URL = 'http://192.168.1.20:3000';
      const view = await renderSettings(onlineGateway());

      expect(view.getByTestId('online-booking-url').props.children).toBe('https://beautizzy.fr/r/maison-lea');
      expect(view.getByText('Lien public')).toBeTruthy();
      await press(view, 'online-booking-open-page');
      expect(openURL).toHaveBeenCalledWith('https://beautizzy.fr/r/maison-lea');
    });
  });

  it('explains instead of offering a copy while the page is a draft', async () => {
    process.env.EXPO_PUBLIC_WEB_URL = 'https://beautizzy.fr';
    const view = await renderSettings(publishableGateway());

    expect(view.getByTestId('online-booking-url').props.children).toBe('https://beautizzy.fr/r/maison-lea');
    expect(view.queryByTestId('online-booking-copy-link')).toBeNull();
    expect(messageOf(view)).toMatch(/publiez votre page/);

    await toggle(view, 'online-booking-publish', true);
    expect(view.getByTestId('online-booking-copy-link')).toBeTruthy();
  });

  it('explains instead of offering a copy while the page is offline', async () => {
    process.env.EXPO_PUBLIC_WEB_URL = 'https://beautizzy.fr';
    const gateway = onlineGateway();
    gateway.setPublicationRule({ publicationOpen: true, plusAccess: false });
    const view = await renderSettings(gateway);

    expect(view.queryByTestId('online-booking-copy-link')).toBeNull();
    expect(messageOf(view)).toMatch(/hors ligne/);
  });

  it('withdraws the copy while the address is being edited, and never copies an unsaved one', async () => {
    process.env.EXPO_PUBLIC_WEB_URL = 'https://beautizzy.fr';
    const view = await renderSettings(onlineGateway());

    await type(view, 'online-booking-slug', 'nouvelle-adresse');

    expect(view.getByTestId('online-booking-url').props.children).toBe('https://beautizzy.fr/r/nouvelle-adresse');
    expect(view.queryByTestId('online-booking-copy-link')).toBeNull();
    expect(messageOf(view)).toMatch(/Enregistrez vos modifications/);
    expect(mockSetStringAsync).not.toHaveBeenCalled();
  });

  it('offers no copy without a configured website, even online', async () => {
    const view = await renderSettings(onlineGateway());

    expect(view.getByTestId('online-booking-url').props.children).toBe('/r/maison-lea');
    expect(view.queryByTestId('online-booking-url-audience')).toBeNull();
    expect(view.queryByTestId('online-booking-copy-link')).toBeNull();
  });

  it('says so when the copy fails, and keeps the action', async () => {
    process.env.EXPO_PUBLIC_WEB_URL = 'https://beautizzy.fr';
    mockSetStringAsync.mockRejectedValue(new Error('clipboard unavailable'));
    const view = await renderSettings(onlineGateway());

    await copy(view);

    expect(messageOf(view)).toBe('Le lien n’a pas pu être copié. Réessayez.');
    expect(view.getByTestId('online-booking-copy-link')).toBeTruthy();
  });
});

describe('OnlineBookingSettingsScreen — live preview', () => {
  const previewName = (view: View) => view.getByTestId('online-booking-preview-name').props.children;
  const previewIsUnsaved = (view: View) => view.queryByTestId('online-booking-preview-unsaved') !== null;
  /** The URI the preview draws for an image; undefined when it draws none. */
  const imageOf = (view: View, testID: string): string | undefined => {
    const source = view.queryByTestId(`${testID}-image`)?.props.source as
      | { readonly uri: string }
      | readonly { readonly uri: string }[]
      | undefined;
    return source === undefined ? undefined : 'uri' in source ? source.uri : source[0]?.uri;
  };

  function storedGateway() {
    const gateway = publishableGateway();
    gateway.seedProfile(testBusiness.id, {
      publicName: 'Chez Léa',
      description: 'Coiffure sur rendez-vous.',
      logoPath: 'media/logo/stored.jpg',
    });
    return gateway;
  }

  it('shows the stored page, with no unsaved mark', async () => {
    const view = await renderSettings(storedGateway());

    expect(previewName(view)).toBe('Chez Léa');
    expect(view.getByTestId('online-booking-preview-description').props.children).toBe('Coiffure sur rendez-vous.');
    expect(previewIsUnsaved(view)).toBe(false);
  });

  it('follows the name and the presentation as they are typed, and writes nothing', async () => {
    const gateway = storedGateway();
    const view = await renderSettings(gateway);

    await type(view, 'online-booking-public-name', 'Maison Léa Paris');
    await type(view, 'online-booking-description', 'Couleur et soins.');

    expect(previewName(view)).toBe('Maison Léa Paris');
    expect(view.getByTestId('online-booking-preview-description').props.children).toBe('Couleur et soins.');
    expect(previewIsUnsaved(view)).toBe(true);
    expect(gateway.calls.update + gateway.calls.upload + gateway.calls.remove + gateway.calls.setState).toBe(0);
  });

  it('falls back to the Business name and drops an emptied presentation', async () => {
    const view = await renderSettings(storedGateway());

    await type(view, 'online-booking-public-name', '');
    await type(view, 'online-booking-description', '   ');

    expect(previewName(view)).toBe(testBusiness.name);
    expect(view.queryByTestId('online-booking-preview-description')).toBeNull();
  });

  it('sizes the name from the panel’s measured width and always shows it whole, in balanced lines', async () => {
    // The React Native jest preset reports an enlarged `fontScale: 2`: an
    // iPhone 17 Pro at the default text size instead.
    const device = Dimensions.get('window');
    Dimensions.set({ window: { ...device, width: 402, fontScale: 1 } });
    try {
      const view = await renderSettings(storedGateway());
      const nameNode = () => view.getByTestId('online-booking-preview-name');
      const nameStyle = () => StyleSheet.flatten(nameNode().props.style as StyleProp<TextStyle>);
      // Its 338pt panel: a 298pt text column.
      await act(async () => {
        fireEvent(view.getByTestId('online-booking-preview-panel'), 'layout', {
          nativeEvent: { layout: { x: 0, y: 0, width: 338, height: 300 } },
        });
      });

      await type(view, 'online-booking-public-name', 'Studio Esthetique Pro');
      expect(nameNode().props.children).toBe('Studio Esthetique Pro');
      expect(nameStyle().fontSize).toBe(28);

      const long =
        'Institut de beauté Cœur d’Ébène — soins du visage, onglerie, extensions de cils & maquillage permanent à Aix-en-Provence';
      await type(view, 'online-booking-public-name', long);
      expect(nameStyle().fontSize).toBe(20);
      expect(nameNode().props.numberOfLines).toBeUndefined();
      expect(String(nameNode().props.children).split('\n').length).toBeGreaterThan(1);
      expect(String(nameNode().props.children).replace(/\n/g, ' ')).toBe(long);
      // Read as one name, not as its visual lines.
      expect(nameNode().props.accessibilityLabel).toBe(long);
      // Room above the first line for « É » / « Å » (Fraunces: descender
      // 0.255em, accent 0.905em); any inset is taken from the gap above.
      const { fontSize, lineHeight, paddingTop, marginTop } = nameStyle() as {
        fontSize: number;
        lineHeight: number;
        paddingTop: number;
        marginTop: number;
      };
      expect(paddingTop + lineHeight - 0.255 * fontSize).toBeGreaterThanOrEqual(0.905 * fontSize);
      expect(marginTop).toBe(-paddingTop);
    } finally {
      await act(async () => {
        Dimensions.set({ window: device });
      });
    }
  });

  it('sets the screen title at the compact native size, not the iOS 30pt role', async () => {
    const view = await renderSettings(storedGateway());
    const title = view.getByRole('header', { name: 'Réservation en ligne' });
    const style = StyleSheet.flatten(title.props.style as StyleProp<TextStyle>);

    expect(Platform.OS).toBe('ios');
    expect(style.fontSize).toBe(27);
    expect(style.lineHeight).toBe(33);
  });

  it('shows a picked cover and logo at once, before any upload', async () => {
    const gateway = storedGateway();
    const view = await renderSettings(gateway);

    await act(async () => {
      mockPhotoFlows['online-booking-cover-photo'].onSelected('file:///cover.jpg');
    });
    await act(async () => {
      mockPhotoFlows['online-booking-logo-photo'].onSelected('file:///logo.jpg');
    });

    expect(imageOf(view, 'online-booking-cover')).toBe('file:///cover.jpg');
    expect(imageOf(view, 'online-booking-logo')).toBe('file:///logo.jpg');
    expect(previewIsUnsaved(view)).toBe(true);
    expect(gateway.calls.upload).toBe(0);
  });

  it('shows the monogram at once when the logo is removed, and keeps the stored file until saved', async () => {
    const gateway = storedGateway();
    const view = await renderSettings(gateway);
    expect(imageOf(view, 'online-booking-logo')).toBeDefined();

    await act(async () => {
      mockPhotoFlows['online-booking-logo-photo'].onRemove();
    });

    expect(imageOf(view, 'online-booking-logo')).toBeUndefined();
    expect(within(view.getByTestId('online-booking-logo')).getByText('C')).toBeTruthy();
    expect(previewIsUnsaved(view)).toBe(true);
    expect(gateway.calls.remove).toBe(0);
  });

  describe('the Nacre cover (web: public-profile-view.tsx — the photo wins, Nacre otherwise)', () => {
    /** The cover's images, bottom to top. */
    const coverLayers = (view: View) => [
      ...new Set(
        view.container
          .queryAll((node) => typeof node.props.testID === 'string' && /^online-booking-cover-(nacre|image)$/.test(node.props.testID))
          .map((node) => node.props.testID as string),
      ),
    ];
    const nacreSource = (view: View) => JSON.stringify(view.getByTestId('online-booking-cover-nacre').props.source);
    const coverStyle = (view: View) =>
      StyleSheet.flatten(view.getByTestId('online-booking-cover').props.style as StyleProp<ViewStyle>);

    function coveredGateway() {
      const gateway = storedGateway();
      gateway.seedProfile(testBusiness.id, { coverPath: 'media/cover/stored.jpg' });
      return gateway;
    }

    it('draws Nacre without a personalised cover: the web artwork, 16:10, never a blank band', async () => {
      const view = await renderSettings(storedGateway());

      expect(coverLayers(view)).toEqual(['online-booking-cover-nacre']);
      expect(nacreSource(view)).toContain('assets/brand/nacre-cover.webp');
      expect(coverStyle(view).aspectRatio).toBe(16 / 10);
      expect(within(view.getByTestId('online-booking-cover')).getByText('Photo de couverture')).toBeTruthy();
    });

    it('a personalised cover takes priority — drawn OVER Nacre, which stays under it while it loads or if it fails', async () => {
      const gateway = coveredGateway();
      const view = await renderSettings(gateway);

      expect(imageOf(view, 'online-booking-cover')).toBe(gateway.imageUrl('media/cover/stored.jpg'));
      expect(coverLayers(view)).toEqual(['online-booking-cover-nacre', 'online-booking-cover-image']);
      expect(coverStyle(view).aspectRatio).toBe(16 / 10); // same frame: nothing moves
      expect(within(view.getByTestId('online-booking-cover')).getByText('Modifier')).toBeTruthy();
    });

    it('removing the cover restores Nacre at once, in the same frame; the stored file stays until saved', async () => {
      const gateway = coveredGateway();
      const view = await renderSettings(gateway);

      await act(async () => {
        mockPhotoFlows['online-booking-cover-photo'].onRemove();
      });

      expect(imageOf(view, 'online-booking-cover')).toBeUndefined();
      expect(coverLayers(view)).toEqual(['online-booking-cover-nacre']);
      expect(coverStyle(view).aspectRatio).toBe(16 / 10);
      expect(previewIsUnsaved(view)).toBe(true);
      expect(gateway.calls.remove).toBe(0);
    });

    it('replacing the cover shows the new photo at once; removing it then shows Nacre — never the outdated stored photo', async () => {
      const gateway = coveredGateway();
      const view = await renderSettings(gateway);

      await act(async () => {
        mockPhotoFlows['online-booking-cover-photo'].onSelected('file:///new-cover.jpg');
      });
      expect(imageOf(view, 'online-booking-cover')).toBe('file:///new-cover.jpg');
      expect(coverLayers(view)).toEqual(['online-booking-cover-nacre', 'online-booking-cover-image']);

      await act(async () => {
        mockPhotoFlows['online-booking-cover-photo'].onRemove();
      });
      expect(imageOf(view, 'online-booking-cover')).toBeUndefined();
      expect(coverLayers(view)).toEqual(['online-booking-cover-nacre']);
      expect(gateway.calls.upload + gateway.calls.remove).toBe(0);
    });

    it('a cover picked on a page without one can be dropped again: Nacre, and nothing left to save', async () => {
      const view = await renderSettings(storedGateway());

      await act(async () => {
        mockPhotoFlows['online-booking-cover-photo'].onSelected('file:///cover.jpg');
      });
      await act(async () => {
        mockPhotoFlows['online-booking-cover-photo'].onRemove();
      });

      expect(coverLayers(view)).toEqual(['online-booking-cover-nacre']);
      expect(previewIsUnsaved(view)).toBe(false);
    });
  });

  describe('the identity card', () => {
    it('an accented initial is set upper-case in Fraunces, in the font’s own line box (its accent never clipped)', async () => {
      const view = await renderSettings(publishableGateway()); // no logo: the monogram
      await type(view, 'online-booking-public-name', 'élodie & co');

      const monogram = within(view.getByTestId('online-booking-logo')).getByText('É');
      const style = StyleSheet.flatten(monogram.props.style as StyleProp<TextStyle>);
      expect(style.lineHeight).toBeGreaterThanOrEqual(1.233 * (style.fontSize as number));
    });

    it('a name with an ampersand keeps it, whole, and is read as one name', async () => {
      const view = await renderSettings(storedGateway());
      const name = 'Institut Élégance & Sérénité — Beauté du regard à Saint-Étienne';
      await type(view, 'online-booking-public-name', name);

      const node = view.getByTestId('online-booking-preview-name');
      expect(String(node.props.children).replace(/\n/g, ' ')).toBe(name);
      expect(node.props.accessibilityLabel).toBe(name);
      expect(node.props.numberOfLines).toBeUndefined();
    });

    it('offers « Appeler » / « Écrire » exactly when the page publishes a phone / an e-mail — never their values, nor the address', async () => {
      const view = await renderSettings(storedGateway());
      const preview = () => within(view.getByTestId('online-booking-preview'));
      expect(view.queryByTestId('online-booking-preview-actions')).toBeNull();

      await type(view, 'online-booking-phone', '06 12 34 56 78');
      expect(preview().getByText('Appeler')).toBeTruthy();
      expect(preview().queryByText('Écrire')).toBeNull();
      expect(view.getByTestId('online-booking-preview-actions').props.accessibilityLabel).toBe('Sur votre page : Appeler');

      await type(view, 'online-booking-email', 'bonjour@chez-lea.test');
      await type(view, 'online-booking-address', '8 rue des Lilas\n69001 Lyon');
      expect(view.getByTestId('online-booking-preview-actions').props.accessibilityLabel).toBe('Sur votre page : Appeler et Écrire');

      // The preview shows what the page shows, and nothing private.
      for (const secret of ['06 12 34 56 78', 'bonjour@chez-lea.test', '8 rue des Lilas', 'Lyon']) {
        expect(preview().queryByText(secret, { exact: false })).toBeNull();
      }

      await type(view, 'online-booking-phone', '   ');
      await type(view, 'online-booking-email', '');
      expect(view.queryByTestId('online-booking-preview-actions')).toBeNull();
    });

    it('the presentation reads like the web page: aligned to the start, under a hairline', async () => {
      const view = await renderSettings(storedGateway());
      const style = StyleSheet.flatten(
        view.getByTestId('online-booking-preview-description').props.style as StyleProp<TextStyle>,
      );
      expect(style.textAlign).toBe('left');
      expect(style.borderTopWidth).toBe(StyleSheet.hairlineWidth);
    });
  });

  it('clears the unsaved mark once the changes are stored', async () => {
    const gateway = storedGateway();
    const view = await renderSettings(gateway);
    await type(view, 'online-booking-public-name', 'Maison Léa Paris');

    await press(view, 'online-booking-save');

    expect(previewIsUnsaved(view)).toBe(false);
    expect(previewName(view)).toBe('Maison Léa Paris');
  });

  it('shows the stored page again after leaving without saving', async () => {
    const gateway = storedGateway();
    const first = await renderSettings(gateway);
    await type(first, 'online-booking-public-name', 'Brouillon abandonné');
    await nativeBack();
    await press(first, 'online-booking-unsaved-discard');
    await act(async () => {
      first.unmount();
    });

    expect(gateway.calls.update).toBe(0);
    expect((await gateway.readProfile(testBusiness.id)).publicName).toBe('Chez Léa');
  });
});

describe('OnlineBookingSettingsScreen — unsaved changes', () => {
  const sheetIsOpen = (view: View) => view.queryByText('Modifications non enregistrées') !== null;

  it('leaves at once, by every path, when nothing changed', async () => {
    const view = await renderSettings(publishableGateway());

    expect(mockRemovalGuard.enabled).toBe(false);
    await press(view, 'online-booking-back');
    await nativeBack();

    expect(mockBack).toHaveBeenCalledTimes(2);
    expect(sheetIsOpen(view)).toBe(false);
  });

  it('never asks about the publication switches: they are stored at once', async () => {
    const view = await renderSettings(publishableGateway());
    await toggle(view, 'online-booking-publish', true);
    await toggle(view, 'online-booking-bookings', true);

    expect(mockRemovalGuard.enabled).toBe(false);
    await nativeBack();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('asks before leaving an edited field — header button, back gesture and hardware back alike', async () => {
    const view = await renderSettings(publishableGateway());
    await type(view, 'online-booking-description', 'Coiffure et couleur.');

    await press(view, 'online-booking-back');
    expect(sheetIsOpen(view)).toBe(true);
    expect(view.getByText(/Souhaitez-vous enregistrer vos changements avant de quitter/)).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();

    await press(view, 'online-booking-unsaved-keep');
    expect(sheetIsOpen(view)).toBe(false);
    expect(view.getByTestId('online-booking-description').props.value).toBe('Coiffure et couleur.');

    await nativeBack();
    expect(sheetIsOpen(view)).toBe(true);
    // A second attempt while the sheet is open asks nothing more.
    await nativeBack();
    expect(view.getAllByText('Modifications non enregistrées')).toHaveLength(1);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('asks before leaving a picked image', async () => {
    const view = await renderSettings(publishableGateway());
    await act(async () => {
      mockPhotoFlows['online-booking-logo-photo'].onSelected('file:///logo.jpg');
    });

    expect(mockRemovalGuard.enabled).toBe(true);
    await nativeBack();
    expect(sheetIsOpen(view)).toBe(true);
  });

  it('stops asking once an edit is typed back to the stored value', async () => {
    const view = await renderSettings(publishableGateway());
    await type(view, 'online-booking-description', 'Brouillon');
    await type(view, 'online-booking-description', '');

    expect(mockRemovalGuard.enabled).toBe(false);
  });

  it('« Enregistrer et quitter » stores the changes, then leaves', async () => {
    const gateway = publishableGateway();
    const view = await renderSettings(gateway);
    await type(view, 'online-booking-description', 'Coiffure et couleur.');
    await nativeBack();

    await press(view, 'online-booking-unsaved-save');

    expect(gateway.updates).toEqual([expect.objectContaining({ description: 'Coiffure et couleur.' })]);
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(sheetIsOpen(view)).toBe(false);
  });

  it('a failed save keeps the screen, the edits and the reason', async () => {
    const gateway = publishableGateway();
    const view = await renderSettings(gateway);
    await type(view, 'online-booking-description', 'Coiffure et couleur.');
    await nativeBack();
    gateway.failNext('NETWORK');

    await press(view, 'online-booking-unsaved-save');

    expect(mockBack).not.toHaveBeenCalled();
    expect(sheetIsOpen(view)).toBe(false);
    expect(view.getByTestId('online-booking-description').props.value).toBe('Coiffure et couleur.');
    expect(view.getByText(/n’ont pas été enregistrées/)).toBeTruthy();
    expect(mockRemovalGuard.enabled).toBe(true);
  });

  it('a refused value keeps the screen and points at the field', async () => {
    const gateway = publishableGateway();
    const view = await renderSettings(gateway);
    await type(view, 'online-booking-email', 'lea@');
    await nativeBack();

    await press(view, 'online-booking-unsaved-save');

    expect(gateway.calls.update).toBe(0);
    expect(mockBack).not.toHaveBeenCalled();
    expect(view.getByText('Cette adresse e-mail n’est pas valide.')).toBeTruthy();
  });

  it('« Quitter sans enregistrer » leaves and writes nothing', async () => {
    const gateway = publishableGateway();
    const view = await renderSettings(gateway);
    await type(view, 'online-booking-description', 'Coiffure et couleur.');
    await nativeBack();

    await press(view, 'online-booking-unsaved-discard');

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(gateway.calls.update).toBe(0);
    expect(gateway.calls.upload).toBe(0);
    expect(gateway.calls.setState).toBe(0);
    expect(mockRemovalGuard.enabled).toBe(false);
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

describe('OnlineBookingSettingsScreen — « Prestations proposées en ligne »', () => {
  function gatewayWithServices() {
    const gateway = createFakeOnlineBookingGateway(testBusiness.name);
    gateway.seedServicePublication(testBusiness.id, {
      services: [
        { id: 'svc-coupe', name: 'Coupe femme', durationMinutes: 45, priceCents: 4500 },
        { id: 'svc-brushing', name: 'Brushing', durationMinutes: 30 },
        { id: 'tech-couleur', name: 'Couleur', type: 'TECHNIQUE', durationMinutes: 90, priceCents: 6500 },
        // Chosen but inactive: neither offered nor available.
        { id: 'svc-chignon', name: 'Chignon', durationMinutes: 60, active: false },
      ],
      selected: ['tech-couleur', 'svc-chignon'],
    });
    return gateway;
  }

  it('shows the server’s count and what it means, above the publication switches', async () => {
    const view = await renderSettings(gatewayWithServices());

    expect(view.getByText('Prestations proposées en ligne')).toBeTruthy();
    expect(view.getByTestId('online-booking-services-summary').props.children).toBe('1 sur 3 proposée en ligne');
    expect(
      view.getByText('Seules les prestations proposées et disponibles apparaissent sur votre page.'),
    ).toBeTruthy();
    const rendered = JSON.stringify(view.toJSON());
    expect(rendered.indexOf('online-booking-services-entry')).toBeGreaterThan(-1);
    expect(rendered.indexOf('online-booking-services-entry')).toBeLessThan(rendered.indexOf('online-booking-publication'));
    const entry = view.getByTestId('online-booking-services-open');
    expect(entry.props.accessibilityRole).toBe('button');
    expect(entry.props.accessibilityLabel).toBe('Prestations proposées en ligne, 1 sur 3 proposée en ligne');
  });

  it('opens the dedicated screen, and takes no part in the profile form or the page state', async () => {
    const gateway = gatewayWithServices();
    const view = await renderSettings(gateway);

    await press(view, 'online-booking-services-open');
    expect(mockPush).toHaveBeenCalledWith('/online-booking-services');
    expect(isDisabled(view, 'online-booking-save')).toBe(true);
    expect(mockRemovalGuard.enabled).toBe(false);
    expect(gateway.calls.update).toBe(0);
    expect(gateway.calls.setState).toBe(0);
    expect(gateway.calls.setServices).toBe(0);
  });

  it('reads « Bientôt disponible » where the server does not offer it yet — the page itself works as before', async () => {
    const gateway = publishableGateway();
    gateway.setServicePublicationFailure('UNAVAILABLE');
    const view = await renderSettings(gateway);

    expect(view.getByTestId('online-booking-services-summary').props.children).toBe('Bientôt disponible');
    await toggle(view, 'online-booking-publish', true);
    expect(view.getByTestId('online-booking-publish-switch').props.value).toBe(true);
    expect(view.getByText('En ligne')).toBeTruthy();
  });

  it('never stays a spinner when the count cannot be read', async () => {
    const gateway = gatewayWithServices();
    gateway.setServicePublicationFailure('NETWORK');
    const view = await renderSettings(gateway);
    expect(view.getByTestId('online-booking-services-summary').props.children).toBe(
      'Choisissez celles que vos clients peuvent réserver',
    );
  });
});
