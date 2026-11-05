// BeautIzzy — multi-profession Step 3 in the catalogue screens: the profession decides the
// organisation (Services / Techniques for hairdressing, categories for nails and esthetics),
// and the professional's categories organise the list and the appointment picker. The
// categories screen has its own suite (categories/__tests__).

import { act, fireEvent, render, within } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

import type { Service } from '@/domain/appointments';
import { BUSINESS_ACTIVITY_TYPES } from '@/domain/business';
import type { ServiceCategory } from '@/domain/services';
import { ServiceCatalogPicker } from '@/features/appointments/editor/components/ServiceCatalogPicker';
import { buildCategoryCatalogSections, hasCategorizedServices } from '@/features/services/catalog/catalog-sections';
import { ServiceCatalogScreen } from '@/features/services/catalog/ServiceCatalogScreen';
import { getCataloguePresentation } from '@/features/services/catalogue-presentation';
import { ServiceCatalogProvider, useServiceCatalog } from '@/features/services/session/ServiceCatalogProvider';
import type { ServiceCatalogSessionValue } from '@/features/services/session/types';
import type { FirstRunSeed } from '@/persistence/seed';
import { TestPersistenceProvider, testBusiness } from '@/providers/testing/TestPersistenceProvider';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = jest.requireActual('react') as typeof import('react');
    React.useEffect(effect, [effect]);
  },
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));
// The glyph is exposed by name so the icon a row resolves can be checked.
jest.mock('expo-symbols', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SymbolView: ({ name }: { readonly name: string | { readonly ios: string } }) =>
      React.createElement(View, { testID: `symbol-${typeof name === 'string' ? name : name.ios}` }),
  };
});
// The appointment service card (quantity badge) imports Reanimated, which cannot load under Jest.
jest.mock('react-native-reanimated', () =>
  jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'),
);

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  const MockModal = ({ visible, children }: { readonly visible?: boolean; readonly children?: React.ReactNode }) =>
    visible ? React.createElement(View, null, children) : null;
  return { __esModule: true, default: MockModal };
});

const BUSINESS = testBusiness.id;
const service = (id: string, name: string, extra: Partial<Service> = {}): Service => ({
  id,
  businessId: BUSINESS,
  name,
  type: 'SERVICE',
  price: 40,
  phases: [{ id: `${id}-phase`, name, durationMinutes: 45, requiresStaff: true }],
  active: true,
  ...extra,
});
const category = (id: string, name: string, position: number, description?: string): ServiceCategory => ({
  id,
  businessId: BUSINESS,
  name,
  position,
  ...(description !== undefined && { description }),
});

const NAIL_CATEGORIES = [category('cat-gel', 'Extensions et poses en gel', 0), category('cat-feet', 'Beauté des pieds', 1)];
const NAIL_SERVICES = [
  service('gel-set', 'Pose complète gel', { categoryId: 'cat-gel' }),
  service('feet', 'Semi-permanent pieds', { categoryId: 'cat-feet' }),
  service('repair', 'Réparation d’un ongle'),
  service('removal', 'Dépose', { categoryId: 'cat-deleted-elsewhere' }),
  service('old', 'Ancienne pose', { categoryId: 'cat-gel', active: false }),
  service('wait', 'Pose avec séchage', {
    categoryId: 'cat-gel',
    type: 'TECHNIQUE',
    phases: [
      { id: 'w1', name: 'Application', durationMinutes: 30, requiresStaff: true },
      { id: 'w2', name: 'Temps de pose', durationMinutes: 20, requiresStaff: false },
    ],
  }),
];

const seed = (services: readonly Service[], serviceCategories: readonly ServiceCategory[]) => (): FirstRunSeed => ({
  clients: [],
  services,
  serviceCategories,
  products: [],
  appointments: [],
  sales: [],
});

const session: { current?: ServiceCatalogSessionValue } = {};
function SessionProbe() {
  const value = useServiceCatalog();
  useEffect(() => {
    session.current = value;
  });
  return <Text testID="probe-categories">{value.categories.map((entry) => entry.name).join('|')}</Text>;
}

function renderWith(
  activityType: (typeof BUSINESS_ACTIVITY_TYPES)[number],
  screen: React.ReactNode,
  services: readonly Service[] = NAIL_SERVICES,
  categories: readonly ServiceCategory[] = NAIL_CATEGORIES,
) {
  return render(
    <TestPersistenceProvider business={{ ...testBusiness, activityType }} createSeed={seed(services, categories)}>
      <ServiceCatalogProvider>
        {screen}
        <SessionProbe />
      </ServiceCatalogProvider>
    </TestPersistenceProvider>,
  );
}

const press = (element: Parameters<typeof fireEvent.press>[0]) =>
  act(async () => {
    fireEvent.press(element);
  });
const type = (element: Parameters<typeof fireEvent.changeText>[0], text: string) =>
  act(async () => {
    fireEvent.changeText(element, text);
  });

beforeEach(() => {
  mockPush.mockClear();
  mockBack.mockClear();
  session.current = undefined;
});

describe('catalogue presentation per profession', () => {
  it('unifies Prestations for nails, esthetics and wellness only; every other stored activity keeps Services / Techniques', () => {
    for (const activity of BUSINESS_ACTIVITY_TYPES) {
      const expected = ['NAILS', 'ESTHETICS', 'WELLNESS'].includes(activity) ? 'CATEGORIES' : 'SERVICE_TYPES';
      expect(getCataloguePresentation(activity).organization).toBe(expected);
      expect(getCataloguePresentation(activity).categoryNameExample.startsWith('Ex. ')).toBe(true);
    }
    expect(getCataloguePresentation('HAIRDRESSING').typeLabels).toEqual({ SERVICE: 'Service', TECHNIQUE: 'Technique' });
    expect(getCataloguePresentation('NAILS').typeLabels).toEqual({ SERVICE: 'Durée unique', TECHNIQUE: 'En plusieurs phases' });
  });

  it('builds category sections: categories in order, then Sans catégorie (unknown ids too), then Inactives', () => {
    const sections = buildCategoryCatalogSections(NAIL_SERVICES, NAIL_CATEGORIES);
    expect(sections.map((section) => [section.title, section.data.map((entry) => entry.id)])).toEqual([
      ['Extensions et poses en gel', ['gel-set', 'wait']],
      ['Beauté des pieds', ['feet']],
      ['Sans catégorie', ['repair', 'removal']],
      ['Inactives', ['old']],
    ]);
    expect(buildCategoryCatalogSections([], [])).toEqual([]);
    expect(hasCategorizedServices([service('x', 'X', { categoryId: 'ghost' })], NAIL_CATEGORIES)).toBe(false);
  });
});

describe('Prestations & tarifs', () => {
  it('nails: one Prestations list grouped by category, no Services / Techniques segment, long names kept', async () => {
    const long = service('long', 'Pose complète gel avec renforcement, french et nail art sur deux ongles', { categoryId: 'cat-gel' });
    const view = await renderWith('NAILS', <ServiceCatalogScreen />, [...NAIL_SERVICES, long]);

    expect(view.queryByTestId('catalog-category')).toBeNull();
    expect(view.queryByText('Techniques')).toBeNull();
    expect(view.getByText('Extensions et poses en gel')).toBeTruthy();
    expect(view.getByText('Beauté des pieds')).toBeTruthy();
    expect(view.getByText('Sans catégorie')).toBeTruthy();
    expect(view.getByText('Inactives')).toBeTruthy();
    expect(view.getByText(long.name)).toBeTruthy();
    // A phased prestation still reads with its waiting time — the neutral « d’attente »,
    // even though « Pose avec séchage » itself is named after the work.
    expect(view.getByText('50 min · dont 20 min d’attente')).toBeTruthy();
    expect(view.queryByText(/de pose/)).toBeNull();
    expect(within(view.getByTestId('catalog-manage-categories')).getByText('2 catégories')).toBeTruthy();

    await type(view.getByLabelText('Rechercher une prestation'), 'pieds');
    expect(view.getByText('Semi-permanent pieds')).toBeTruthy();
    expect(view.queryByText('Pose complète gel')).toBeNull();
    await type(view.getByLabelText('Rechercher une prestation'), 'zzz');
    expect(view.getByText('Aucune prestation trouvée')).toBeTruthy();

    await press(view.getByTestId('catalog-manage-categories'));
    expect(mockPush).toHaveBeenCalledWith('/services/categories');
  });

  it('esthetics without any category: every prestation under « Sans catégorie »', async () => {
    const view = await renderWith('ESTHETICS', <ServiceCatalogScreen />, [service('facial', 'Soin du visage')], []);
    expect(view.getByText('Sans catégorie')).toBeTruthy();
    expect(view.getByText('Soin du visage')).toBeTruthy();
    expect(within(view.getByTestId('catalog-manage-categories')).getByText('Organisez vos prestations')).toBeTruthy();
  });

  it('hairdressing without categories: exactly the established Services / Techniques list', async () => {
    const cut = service('cut', 'Coupe femme');
    const view = await renderWith('HAIRDRESSING', <ServiceCatalogScreen />, [cut], []);
    expect(view.getByTestId('catalog-category')).toBeTruthy();
    // The segment option and the section title, as before Step 3.
    expect(view.getAllByText('Services')).toHaveLength(2);
    expect(view.queryByText('Sans catégorie')).toBeNull();
  });

  it('hairdressing with assigned categories: the segment stays and subdivides by category', async () => {
    const view = await renderWith(
      'HAIRDRESSING',
      <ServiceCatalogScreen />,
      [service('cut', 'Coupe femme', { categoryId: 'cat-cuts' }), service('brushing', 'Brushing')],
      [category('cat-cuts', 'Coupes', 0)],
    );
    expect(view.getByTestId('catalog-category')).toBeTruthy();
    expect(view.getAllByText('Coupes').length).toBeGreaterThan(0);
    expect(view.getByText('Sans catégorie')).toBeTruthy();
    expect(view.queryByText('Services')).not.toBeNull(); // the segment option
  });
});

describe('prestation icons in Prestations & tarifs', () => {
  const glyph = (view: Awaited<ReturnType<typeof render>>, serviceId: string, symbol: string) =>
    within(view.getByTestId(`catalog-service-icon-${serviceId}`, { includeHiddenElements: true })).queryByTestId(
      `symbol-${symbol}`,
      { includeHiddenElements: true },
    );

  it('nails: « French classique » takes its category’s palette; an unknown, uncategorised name the hand', async () => {
    const art = category('cat-art', 'Nail art et modèles', 0);
    const view = await renderWith(
      'NAILS',
      <ServiceCatalogScreen />,
      [
        service('french', 'French classique', { categoryId: 'cat-art' }),
        service('custom', 'Création sur mesure'),
        service('soak', 'Dépose par dissolution', { categoryId: 'cat-art' }),
      ],
      [art],
    );
    expect(glyph(view, 'french', 'paintpalette')).toBeTruthy();
    expect(glyph(view, 'french', 'scissors')).toBeNull();
    expect(glyph(view, 'custom', 'hand.raised')).toBeTruthy();
    // The name still decides first.
    expect(glyph(view, 'soak', 'eraser')).toBeTruthy();
  });

  it('hairdressing: an unknown name keeps the scissors, whatever its category', async () => {
    const view = await renderWith(
      'HAIRDRESSING',
      <ServiceCatalogScreen />,
      [service('ombre', 'Ombré', { categoryId: 'cat-art' })],
      [category('cat-art', 'Nail art et modèles', 0)],
    );
    expect(glyph(view, 'ombre', 'scissors')).toBeTruthy();
  });
});

describe('appointment prestation picker', () => {
  const actives = NAIL_SERVICES.filter((entry) => entry.active);

  it('unified: category-titled grids, no segment, same selection', async () => {
    const onSelect = jest.fn();
    const view = await render(
      <ServiceCatalogPicker
        categories={NAIL_CATEGORIES}
        onSelectService={onSelect}
        organization="CATEGORIES"
        selectedServiceIds={['feet']}
        services={actives}
      />,
    );
    expect(view.queryByTestId('catalog-category')).toBeNull();
    expect(view.getByTestId('catalog-list-category-cat-gel')).toBeTruthy();
    expect(view.getByTestId('catalog-list-category-uncategorized')).toBeTruthy();
    expect(view.getByText('Extensions et poses en gel')).toBeTruthy();
    expect(view.getByText('Sans catégorie')).toBeTruthy();
    await press(view.getByLabelText(/Réparation d’un ongle/));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'repair' }));
    await type(view.getByLabelText('Rechercher une prestation'), 'aucun résultat');
    expect(view.getByText('Aucune prestation trouvée')).toBeTruthy();
  });

  it('default: the established Services / Techniques segment', async () => {
    const view = await render(<ServiceCatalogPicker onSelectService={jest.fn()} selectedServiceIds={[]} services={actives} />);
    expect(view.getByTestId('catalog-category')).toBeTruthy();
    expect(view.queryByText('Sans catégorie')).toBeNull();
  });
});
