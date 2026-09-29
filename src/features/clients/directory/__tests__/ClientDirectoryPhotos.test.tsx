// Souris — Client photos in the Clientèle directory
//
// Each mounted row resolves its own `photoPath` through the shared Client
// photo cache (useClientPhotoUri → ClientAvatar): initials at once in the
// rounded-square list thumbnail shared with the Produits list, the photo in
// the SAME frame once resolved, and back to the
// initials when the photo is removed — in place, the row never remounts.

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Pressable, StyleSheet } from 'react-native';

import type { Client } from '@/domain/clients';
import { getMediaCacheUri } from '@/persistence/media/business-media';
import { createFakeBusinessMediaRemote } from '@/persistence/testing/fake-business-media-remote';
import { createTestSeed } from '@/persistence/testing/fixtures';
import { createMemoryLocalFiles, type MemoryLocalFiles } from '@/persistence/testing/memory-local-files';
import { BusinessMediaProvider } from '@/providers/BusinessMediaProvider';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';
import { ProductImage } from '@/features/products/components/ProductImage';
import { foregroundSoft, listThumbnail, semanticColors } from '@/shared/ui/theme';

import { CLIENT_PHOTO_CACHE_DIRECTORY } from '../../photo/client-photo-storage';
import { ClientSessionProvider, useClientSession } from '../../session/ClientSessionProvider';
import { ClientDirectoryScreen } from '../ClientDirectoryScreen';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = jest.requireActual('react') as typeof import('react');
    React.useEffect(effect, [effect]);
  },
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-image', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return { Image: (props: object) => React.createElement(View, props) };
});
jest.mock('@expo/ui/community/datetime-picker', () => ({ DateTimePicker: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

const PATH_A = 'business/clients/client-audrey/photo-a.jpg';
const PATH_B = 'business/clients/client-audrey/photo-b.jpg';
const PATH_C = 'business/clients/client-chloe/photo-c.jpg';
const PATH_E = 'business/clients/client-elise/photo-e.jpg';

const audrey: Client = {
  id: 'client-audrey',
  firstName: 'Audrey',
  lastName: 'Tarmis',
  phone: '06 11 22 33 44',
  photoPath: PATH_A,
};
const bea: Client = { id: 'client-bea', firstName: 'Béa', lastName: 'Noel' };
const chloe: Client = { id: 'client-chloe', firstName: 'Chloé', lastName: 'Roux', photoPath: PATH_C };
const ARCHIVED_AT = new Date('2026-09-01T10:00:00.000Z');
const dora: Client = { id: 'client-dora', firstName: 'Dora', lastName: 'Petit', archivedAt: ARCHIVED_AT };
const elise: Client = {
  id: 'client-elise',
  firstName: 'Élise',
  lastName: 'Morel',
  photoPath: PATH_E,
  archivedAt: ARCHIVED_AT,
};

const thumbnailGeometry = {
  borderRadius: listThumbnail.radius,
  height: listThumbnail.size,
  width: listThumbnail.size,
};

const cacheUri = (files: MemoryLocalFiles, path: string) =>
  getMediaCacheUri(files, CLIENT_PHOTO_CACHE_DIRECTORY, path);

/** Another device changed Audrey's photo: the session is updated in place. */
function PhotoSyncProbe() {
  const { setClientPhoto } = useClientSession();
  return (
    <>
      <Pressable testID="replace-audrey-photo" onPress={() => setClientPhoto(audrey.id, PATH_B)} />
      <Pressable testID="remove-audrey-photo" onPress={() => setClientPhoto(audrey.id, undefined)} />
    </>
  );
}

function renderDirectory(files: MemoryLocalFiles = createMemoryLocalFiles()) {
  const remote = createFakeBusinessMediaRemote(files);
  remote.objects.set(PATH_A, 'photo A');
  remote.objects.set(PATH_B, 'photo B');
  remote.objects.set(PATH_C, 'photo C');
  remote.objects.set(PATH_E, 'photo E');
  const view = render(
    <TestPersistenceProvider
      files={files}
      createSeed={() => createTestSeed({ clients: [chloe, elise, audrey, dora, bea], appointments: [] })}
    >
      <BusinessMediaProvider remote={remote}>
        <ClientSessionProvider>
          <ClientDirectoryScreen />
          <PhotoSyncProbe />
        </ClientSessionProvider>
      </BusinessMediaProvider>
    </TestPersistenceProvider>,
  );
  return { files, remote, view };
}

describe('ClientDirectoryScreen — client photos', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('shows the photo of A and C, the initials of B, in the unchanged alphabetical order', async () => {
    const { files, view: rendering } = renderDirectory();
    const view = await rendering;

    await waitFor(() =>
      expect(view.getByTestId('client-directory-avatar-client-audrey-photo').props.source).toEqual({
        uri: cacheUri(files, PATH_A),
      }),
    );
    await waitFor(() =>
      expect(view.getByTestId('client-directory-avatar-client-chloe-photo').props.source).toEqual({
        uri: cacheUri(files, PATH_C),
      }),
    );
    expect(view.queryByTestId('client-directory-avatar-client-audrey-initials')).toBeNull();
    expect(view.getByTestId('client-directory-avatar-client-bea-initials')).toHaveTextContent('BN');
    expect(view.queryByTestId('client-directory-avatar-client-bea-photo')).toBeNull();

    const rowIds = view
      .getAllByTestId(/^client-row-client-/)
      .map((row) => row.props.testID as string);
    expect(rowIds).toEqual([
      'client-row-client-audrey',
      'client-row-client-bea',
      'client-row-client-chloe',
    ]);
    expect(view.getByText('Audrey Tarmis')).toBeTruthy();
    expect(view.getByText('Béa Noel')).toBeTruthy();
    expect(view.getByText('Chloé Roux')).toBeTruthy();
  });

  it('shows the initials while a photo downloads, then the photo in the same frame', async () => {
    const files = createMemoryLocalFiles();
    const { remote, view: rendering } = renderDirectory(files);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const download = remote.download;
    remote.download = async (objectPath, destinationUri) => {
      await held;
      await download(objectPath, destinationUri);
    };
    const view = await rendering;

    // No spinner, no blank: the initials hold the frame while unresolved.
    expect(view.getByTestId('client-directory-avatar-client-audrey-initials')).toHaveTextContent('AT');
    expect(view.queryByTestId('client-directory-avatar-client-audrey-photo')).toBeNull();
    const frame = view.getByTestId('client-directory-avatar-client-audrey');
    expect(frame).toHaveStyle(thumbnailGeometry);

    await act(async () => {
      release();
    });
    await waitFor(() =>
      expect(view.getByTestId('client-directory-avatar-client-audrey-photo').props.source).toEqual({
        uri: cacheUri(files, PATH_A),
      }),
    );
    expect(view.queryByTestId('client-directory-avatar-client-audrey-initials')).toBeNull();
    // Only the content changed: the same frame, same bounds.
    expect(view.getByTestId('client-directory-avatar-client-audrey')).toBe(frame);
    expect(frame).toHaveStyle(thumbnailGeometry);
  });

  it('draws photo and initials in the SAME rounded-square thumbnail, silent inside the spoken row', async () => {
    const { view: rendering } = renderDirectory();
    const view = await rendering;
    const photoFrame = () => view.getByTestId('client-directory-avatar-client-audrey');
    const initialsFrame = view.getByTestId('client-directory-avatar-client-bea');

    await waitFor(() => expect(view.getByTestId('client-directory-avatar-client-audrey-photo')).toBeTruthy());
    expect(photoFrame()).toHaveStyle({ ...thumbnailGeometry, overflow: 'hidden' });
    expect(initialsFrame).toHaveStyle(thumbnailGeometry);
    expect(view.getByTestId('client-directory-avatar-client-audrey-photo').props.contentFit).toBe('cover');
    expect(view.getByTestId('client-directory-avatar-client-bea-initials')).toHaveTextContent('BN');

    // The row speaks for the Client; the avatar adds nothing to it.
    expect(photoFrame().props.accessible).toBe(false);
    expect(photoFrame().props.accessibilityLabel).toBeUndefined();
    expect(view.getByTestId('client-row-client-audrey').props.accessibilityLabel).toBe(
      'Ouvrir la fiche de Audrey Tarmis',
    );
  });

  it('matches the Produits list thumbnail geometry exactly', async () => {
    const { view: rendering } = renderDirectory();
    const view = await rendering;
    const product = await render(<ProductImage variant="thumbnail" testID="product-thumbnail" />);

    const geometry = (style: unknown) => {
      const { borderRadius, height, width } = StyleSheet.flatten(style as never);
      return { borderRadius, height, width };
    };
    expect(geometry(view.getByTestId('client-directory-avatar-client-bea').props.style)).toEqual(
      geometry(product.getByTestId('product-thumbnail').props.style),
    );
  });

  it('mutes the initials of an archived Client, never her photo', async () => {
    const { files, view: rendering } = renderDirectory();
    const view = await rendering;
    await act(async () => {
      fireEvent.press(view.getByTestId('client-tab-archived'));
    });

    const muted = view.getByTestId('client-directory-avatar-client-dora');
    expect(muted).toHaveStyle({ ...thumbnailGeometry, backgroundColor: semanticColors.surface });
    expect(view.getByTestId('client-directory-avatar-client-dora-initials')).toHaveStyle({
      color: foregroundSoft,
    });

    await waitFor(() =>
      expect(view.getByTestId('client-directory-avatar-client-elise-photo').props.source).toEqual({
        uri: cacheUri(files, PATH_E),
      }),
    );
    const photo = view.getByTestId('client-directory-avatar-client-elise-photo');
    expect(photo.props.tintColor).toBeUndefined();
    expect(StyleSheet.flatten(photo.props.style).opacity).toBeUndefined();
  });

  it('shows an already cached photo at once, without another download', async () => {
    const files = createMemoryLocalFiles();
    files.addFile(cacheUri(files, PATH_A), 'photo A');
    const { remote, view: rendering } = renderDirectory(files);
    const view = await rendering;

    expect(view.getByTestId('client-directory-avatar-client-audrey-photo').props.source).toEqual({
      uri: cacheUri(files, PATH_A),
    });
    await waitFor(() => expect(view.getByTestId('client-directory-avatar-client-chloe-photo')).toBeTruthy());
    // Only Chloé's uncached photo was fetched: never Audrey's (cached), never
    // Élise's (archived: her row is not mounted while Actifs is shown).
    expect(remote.downloadCount).toBe(1);
  });

  it('follows a photo replaced then removed while the list stays mounted', async () => {
    const { files, view: rendering } = renderDirectory();
    const view = await rendering;
    await waitFor(() => expect(view.getByTestId('client-directory-avatar-client-audrey-photo')).toBeTruthy());
    const row = view.getByTestId('client-row-client-audrey');

    await act(async () => {
      fireEvent.press(view.getByTestId('replace-audrey-photo'));
    });
    await waitFor(() =>
      expect(view.getByTestId('client-directory-avatar-client-audrey-photo').props.source).toEqual({
        uri: cacheUri(files, PATH_B),
      }),
    );

    await act(async () => {
      fireEvent.press(view.getByTestId('remove-audrey-photo'));
    });
    expect(view.queryByTestId('client-directory-avatar-client-audrey-photo')).toBeNull();
    expect(view.getByTestId('client-directory-avatar-client-audrey-initials')).toHaveTextContent('AT');
    // Updated in place: the same row, never remounted.
    expect(view.getByTestId('client-row-client-audrey')).toBe(row);
  });

  it('opens the same Client Profile when a row with a photo is tapped', async () => {
    const { view: rendering } = renderDirectory();
    const view = await rendering;
    await waitFor(() => expect(view.getByTestId('client-directory-avatar-client-audrey-photo')).toBeTruthy());

    await act(async () => {
      fireEvent.press(view.getByTestId('client-row-client-audrey'));
    });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/clients/[clientId]',
      params: { clientId: 'client-audrey' },
    });
  });
});
