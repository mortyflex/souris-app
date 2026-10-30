// BeautIzzy — onboarding (behavioural, no pixel tests)

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AuthProvider } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway, fakeUser } from '@/features/auth/testing/fake-auth-gateway';
import { CommunicationsGatewayProvider } from '@/features/communications/session/CommunicationsGatewayProvider';
import { createFakeCommunicationsGateway } from '@/features/communications/testing/fake-communications-gateway';
import { readBusinessProfile } from '@/persistence/stores/business-profile';
import { loadServices } from '@/persistence/stores/services';
import { loadSyncOutbox } from '@/persistence/sync/outbox';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { createFirstRunSeed } from '@/providers/first-run-seed';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';
import { haptics } from '@/shared/lib/haptics';
import { isUuidV4 } from '@/shared/lib/uuid';

import { BusinessSessionProvider, useBusinessSession } from '../../session/BusinessSessionProvider';
import { createFakeBusinessGateway } from '../../testing/fake-business-gateway';
import { BusinessSetupScreen } from '../BusinessSetupScreen';
import { COMING_SOON_LABEL } from '../activity-options';
import { getStarterServices } from '../starter-services';
import { REMINDER_OPTION_TITLE } from '../components/ReminderOptionCard';

jest.mock('react-native-reanimated', () =>
  jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'),
);
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

/** Every interaction runs inside an awaited act: React 19 flushes updates asynchronously. */
const press = (element: unknown) =>
  act(async () => {
    fireEvent.press(element as Parameters<typeof fireEvent.press>[0]);
  });
const type = (element: unknown, text: string) =>
  act(async () => {
    fireEvent.changeText(element as Parameters<typeof fireEvent.changeText>[0], text);
  });

/** The root-gate signal: onboarding ends exactly when the session turns ready. */
function SessionStatusProbe() {
  const { state } = useBusinessSession();
  return <Text testID="business-session-status">{state.status}</Text>;
}

async function renderSetup() {
  const database = openTestDatabase();
  const business = createFakeBusinessGateway();
  const communications = createFakeCommunicationsGateway();
  const auth = createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) });
  const view = await render(
    <TestPersistenceProvider createSeed={createFirstRunSeed} database={database}>
      <AuthProvider gateway={auth}>
        <BusinessSessionProvider gateway={business}>
          <CommunicationsGatewayProvider gateway={communications}>
            <BusinessSetupScreen />
            <SessionStatusProbe />
          </CommunicationsGatewayProvider>
        </BusinessSessionProvider>
      </AuthProvider>
    </TestPersistenceProvider>,
  );
  await act(async () => {});
  return { view, database, business, communications };
}

type View = Awaited<ReturnType<typeof renderSetup>>['view'];

const status = (view: View) => view.getByTestId('business-session-status').props.children as string;
const isDisabled = (view: View, testID: string) =>
  view.getByTestId(testID).props.accessibilityState.disabled as boolean;

/** activity → details → reminders, with a valid draft. */
async function reachReminders(view: View, activity = 'HAIRDRESSING', name = 'Maison Sofia') {
  await press(view.getByTestId(`activity-${activity}`));
  await press(view.getByTestId('continue-activity'));
  await type(view.getByTestId('owner-first-name-input'), 'Sofia');
  await type(view.getByTestId('business-name-input'), name);
  await press(view.getByTestId('continue-details'));
}

/** …then « Je préfère configurer ça plus tard »: the Business is created, reminders stay OFF. */
async function reachServices(view: View, activity = 'HAIRDRESSING') {
  await reachReminders(view, activity);
  await press(view.getByTestId('skip-reminders'));
  await waitFor(() => expect(view.getByTestId('onboarding-services')).toBeTruthy());
}

describe('BusinessSetupScreen — the five steps', () => {
  it('starts at the primary activity (no second Welcome), walks to the recap, and offers back only before the creation', async () => {
    const { view, business } = await renderSetup();

    // 1. Activity: the first thing seen after authentication — no Welcome, no back, progress 1/5.
    expect(view.getByTestId('onboarding-activity')).toBeTruthy();
    expect(view.queryByText('Votre activité beauté, c’est easy.')).toBeNull();
    expect(view.queryByTestId('onboarding-welcome')).toBeNull();
    expect(view.queryByTestId('start-onboarding')).toBeNull();
    expect(view.getByText('Quelle est votre activité principale ?')).toBeTruthy();
    expect(view.queryByTestId('onboarding-back')).toBeNull();
    expect(view.getByTestId('onboarding-progress').props.accessibilityValue).toEqual({
      min: 0,
      max: 5,
      now: 1,
      text: 'Étape 1 sur 5',
    });
    await press(view.getByTestId('activity-HAIRDRESSING'));
    await press(view.getByTestId('continue-activity'));

    // 2. Details: progress 2/5, back returns to the activity, the selection kept.
    expect(view.getByText('Parlez-nous un peu de vous')).toBeTruthy();
    expect(view.getByTestId('onboarding-progress').props.accessibilityValue.text).toBe('Étape 2 sur 5');
    await press(view.getByTestId('onboarding-back'));
    expect(view.getByTestId('activity-HAIRDRESSING').props.accessibilityState.selected).toBe(true);
    await press(view.getByTestId('continue-activity'));
    await type(view.getByTestId('owner-first-name-input'), 'Léa');
    await type(view.getByTestId('business-name-input'), 'Maison Léa');
    await press(view.getByTestId('continue-details'));

    // 3. Reminders: back returns to the details, the draft kept.
    expect(view.getByText('Moins d’oublis, plus de tranquillité')).toBeTruthy();
    await press(view.getByTestId('onboarding-back'));
    expect(view.getByTestId('business-name-input').props.value).toBe('Maison Léa');
    await press(view.getByTestId('continue-details'));
    expect(business.calls.create).toBe(0);
    await press(view.getByTestId('skip-reminders'));

    // 4. Services: the Business exists — no way back to the steps before it.
    await waitFor(() => expect(view.getByTestId('onboarding-services')).toBeTruthy());
    expect(business.calls.create).toBe(1);
    expect(view.queryByTestId('onboarding-back')).toBeNull();
    expect(view.getByTestId('onboarding-progress').props.accessibilityValue.now).toBe(4);
    await press(view.getByTestId('skip-starter-services'));

    // 5. Complete: progress 5/5, no back either; the app is entered from here only.
    expect(view.getByTestId('onboarding-complete')).toBeTruthy();
    expect(view.getByTestId('onboarding-progress').props.accessibilityValue.text).toBe('Étape 5 sur 5');
    expect(view.queryByTestId('onboarding-back')).toBeNull();
    expect(status(view)).toBe('setup-required');
    await press(view.getByTestId('enter-app'));
    expect(status(view)).toBe('ready');
  });
});

describe('BusinessSetupScreen — activity', () => {
  it('offers the four professions in French, all selectable, and requires one before continuing', async () => {
    const { view } = await renderSetup();

    for (const label of ['Coiffure', 'Onglerie', 'Esthétique', 'Bien-être']) {
      expect(view.getByText(label)).toBeTruthy();
    }
    // The activities onboarding does not offer are not shown at all.
    for (const label of ['Cils & sourcils', 'Maquillage', 'Barbier', 'Autre']) {
      expect(view.queryByText(label)).toBeNull();
    }
    expect(view.getAllByRole('radio')).toHaveLength(4);
    // Nothing is announced « Bientôt disponible » any more.
    expect(view.queryByText(COMING_SOON_LABEL)).toBeNull();
    expect(isDisabled(view, 'continue-activity')).toBe(true);

    for (const activity of ['HAIRDRESSING', 'NAILS', 'ESTHETICS', 'WELLNESS']) {
      expect(view.queryByTestId(`activity-${activity}-coming-soon`)).toBeNull();
      await press(view.getByTestId(`activity-${activity}`));
      expect(view.getByTestId(`activity-${activity}`).props.accessibilityState).toEqual({
        selected: true,
        checked: true,
        disabled: false,
      });
      expect(view.getByTestId(`activity-${activity}`).props.accessibilityLabel).not.toMatch(/bientôt disponible/);
      expect(isDisabled(view, 'continue-activity')).toBe(false);
    }
    // Single selection: the last choice wins.
    expect(view.getByTestId('activity-HAIRDRESSING').props.accessibilityState.selected).toBe(false);
    expect(view.getByTestId('activity-WELLNESS').props.accessibilityState.selected).toBe(true);
  });
});

describe('BusinessSetupScreen — details', () => {
  it('requires the first name and the activity name only, and recalls the chosen activity', async () => {
    const { view } = await renderSetup();
    await press(view.getByTestId('activity-HAIRDRESSING'));
    await press(view.getByTestId('continue-activity'));

    expect(view.getByTestId('selected-activity-chip').props.accessibilityLabel).toBe('Activité principale : Coiffure');
    expect(isDisabled(view, 'continue-details')).toBe(true);
    // No error is shown before the professional typed anything.
    expect(view.queryByText('Votre prénom est requis.')).toBeNull();

    await type(view.getByTestId('owner-first-name-input'), 'Inès');
    expect(isDisabled(view, 'continue-details')).toBe(true);
    await type(view.getByTestId('business-name-input'), 'Regard Studio');
    expect(isDisabled(view, 'continue-details')).toBe(false);

    // The optional fields never gate the step; a cleared required one does, and says so.
    await type(view.getByTestId('owner-last-name-input'), '');
    await type(view.getByTestId('business-phone-input'), '');
    expect(isDisabled(view, 'continue-details')).toBe(false);
    await type(view.getByTestId('owner-first-name-input'), '');
    expect(view.getByText('Votre prénom est requis.')).toBeTruthy();
    expect(isDisabled(view, 'continue-details')).toBe(true);
  });

  it('creates the Business with trimmed values, the optional fields dropped when blank', async () => {
    const { view, business, database } = await renderSetup();
    await press(view.getByTestId('activity-HAIRDRESSING'));
    await press(view.getByTestId('continue-activity'));
    await type(view.getByTestId('owner-first-name-input'), ' Sofia ');
    await type(view.getByTestId('owner-last-name-input'), '  ');
    await type(view.getByTestId('business-name-input'), 'Maison Sofia');
    await type(view.getByTestId('business-phone-input'), ' 06 12 34 56 78 ');
    await press(view.getByTestId('continue-details'));
    await press(view.getByTestId('skip-reminders'));

    await waitFor(() => expect(business.calls.create).toBe(1));
    expect(business.rows[0]).toMatchObject({
      ownerUserId: 'user-lea',
      ownerFirstName: 'Sofia',
      name: 'Maison Sofia',
      activityType: 'HAIRDRESSING',
      phone: '06 12 34 56 78',
    });
    expect(business.rows[0]?.ownerLastName).toBeUndefined();
    expect(readBusinessProfile(database)?.name).toBe('Maison Sofia');
  });
});

describe('BusinessSetupScreen — reminders and the creation point', () => {
  it('the recommended opt-in is preselected; « Continuer » activates ONLY once the server accepted it', async () => {
    const { view, business, communications } = await renderSetup();
    await reachReminders(view);

    // The title carries a zero-width word joiner after « e- » so it never breaks there.
    expect(view.getByText(REMINDER_OPTION_TITLE)).toBeTruthy();
    expect(REMINDER_OPTION_TITLE.replaceAll('\u2060', '')).toBe('Activer les rappels par e-mail');
    expect(view.getByText('Recommandé')).toBeTruthy();
    expect(view.getByTestId('reminder-option').props.accessibilityState.checked).toBe(true);
    // Prefilled from the signed-in account email, editable.
    expect(view.getByTestId('reminder-reply-to-input').props.value).toBe(fakeUser.email);
    await type(view.getByTestId('reminder-reply-to-input'), 'salon@example.fr');
    await press(view.getByTestId('continue-reminders'));

    await waitFor(() => expect(view.getByTestId('onboarding-services')).toBeTruthy());
    expect(business.calls.create).toBe(1);
    expect(communications.calls.update).toBe(1);
    expect(communications.updates[0]).toEqual({
      businessId: business.rows[0]!.id,
      preferences: { emailRemindersEnabled: true, smsRemindersEnabled: false, replyToEmail: 'salon@example.fr' },
    });
    // The Business exists but the app is NOT entered yet.
    expect(status(view)).toBe('setup-required');

    await press(view.getByTestId('skip-starter-services'));
    expect(view.getByTestId('setup-recap-reminders').props.accessibilityLabel).toBe('Rappels par e-mail : Rappels activés');
  });

  it('« Je préfère configurer ça plus tard » creates the Business and saves nothing (the OFF default stands)', async () => {
    const { view, business, communications } = await renderSetup();
    await reachReminders(view);

    await press(view.getByTestId('skip-reminders'));

    await waitFor(() => expect(view.getByTestId('onboarding-services')).toBeTruthy());
    expect(business.calls.create).toBe(1);
    expect(communications.calls.update).toBe(0);
    expect(status(view)).toBe('setup-required');

    await press(view.getByTestId('skip-starter-services'));
    expect(view.getByTestId('setup-recap-reminders').props.accessibilityLabel).toBe('Rappels par e-mail : À configurer plus tard');
  });

  it('an unchecked opt-in followed by « Continuer » also keeps reminders OFF', async () => {
    const { view, business, communications } = await renderSetup();
    await reachReminders(view);

    await press(view.getByTestId('reminder-option'));
    expect(view.getByTestId('reminder-option').props.accessibilityState.checked).toBe(false);
    expect(view.queryByTestId('reminder-reply-to-input')).toBeNull();
    await press(view.getByTestId('continue-reminders'));

    await waitFor(() => expect(view.getByTestId('onboarding-services')).toBeTruthy());
    expect(business.calls.create).toBe(1);
    expect(communications.calls.update).toBe(0);
  });

  it('a failed activation shows the calm notice, keeps the created Business, never claims ON, and retries without a duplicate', async () => {
    const { view, database, business, communications } = await renderSetup();
    await reachReminders(view);
    communications.failNext('NETWORK');

    await press(view.getByTestId('continue-reminders'));

    // The Business exists (never rolled back)…
    expect(business.calls.create).toBe(1);
    expect(readBusinessProfile(database)?.name).toBe('Maison Sofia');
    // …but the professional has NOT moved on believing reminders are on.
    expect(view.getByText('Impossible d’activer les rappels pour le moment.')).toBeTruthy();
    expect(view.getByText(/rappels restent désactivés/)).toBeTruthy();
    expect(view.getByTestId('onboarding-reminders')).toBeTruthy();
    expect(view.queryByTestId('onboarding-back')).toBeNull();
    expect(communications.updates).toHaveLength(0);

    // Réessayer: no duplicate Business, the preference lands, the flow goes on.
    await press(view.getByTestId('retry-activate-reminders'));
    await waitFor(() => expect(communications.updates).toHaveLength(1));
    expect(business.calls.create).toBe(1);
    expect(view.getByTestId('onboarding-services')).toBeTruthy();
  });

  it('after a failed activation, « Continuer sans les rappels » goes on with reminders OFF', async () => {
    const { view, business, communications } = await renderSetup();
    await reachReminders(view);
    communications.failNext('NETWORK');

    await press(view.getByTestId('continue-reminders'));
    await press(view.getByTestId('continue-without-reminders'));

    expect(view.getByTestId('onboarding-services')).toBeTruthy();
    expect(business.calls.create).toBe(1);
    expect(communications.updates).toHaveLength(0);
  });

  it('refuses to activate with an invalid Reply-To and creates nothing', async () => {
    const { view, business, communications } = await renderSetup();
    await reachReminders(view);

    await type(view.getByTestId('reminder-reply-to-input'), 'not-an-email');
    await press(view.getByTestId('continue-reminders'));

    expect(view.getByText('Adresse e-mail invalide.')).toBeTruthy();
    expect(business.calls.create).toBe(0);
    expect(communications.calls.update).toBe(0);
  });

  it('keeps the whole draft when the remote creation fails, and creates exactly once on retry', async () => {
    const { view, database, business } = await renderSetup();
    business.failNext('NETWORK');
    await reachReminders(view, 'HAIRDRESSING', 'Maison Léa');

    await press(view.getByTestId('skip-reminders'));

    expect(view.getByText(/Une connexion internet est nécessaire/)).toBeTruthy();
    expect(readBusinessProfile(database)).toBeUndefined();

    // Nothing was created: the details are still reachable, with the draft intact.
    await press(view.getByTestId('onboarding-back'));
    expect(view.getByTestId('owner-first-name-input').props.value).toBe('Sofia');
    expect(view.getByTestId('business-name-input').props.value).toBe('Maison Léa');
    await press(view.getByTestId('continue-details'));
    await press(view.getByTestId('skip-reminders'));

    await waitFor(() => expect(readBusinessProfile(database)?.name).toBe('Maison Léa'));
    expect(business.rows).toHaveLength(1);
    expect(business.calls.create).toBe(2);
  });
});

describe('BusinessSetupScreen — starter prestations', () => {
  it('proposes the profession’s base, writes only the kept ones, once, through the Service store', async () => {
    const { view, database, business } = await renderSetup();
    await reachServices(view, 'HAIRDRESSING');

    const rows = view.getAllByRole('checkbox');
    expect(rows.map((row) => row.props.testID)).toEqual([
      'starter-cut-women',
      'starter-blow-dry',
      'starter-cut-blow-dry',
      'starter-color',
      'starter-balayage',
      'starter-gloss',
      'starter-cut-men',
      'starter-care',
    ]);
    expect(rows.every((row) => row.props.accessibilityState.checked)).toBe(true);
    expect(view.getByText('Ajouter ces prestations')).toBeTruthy();
    expect(loadServices(database)).toHaveLength(0);

    // Two removed before anything is written.
    await press(view.getByTestId('starter-gloss'));
    await press(view.getByTestId('starter-care'));
    expect(view.getByTestId('starter-gloss').props.accessibilityState.checked).toBe(false);
    await press(view.getByTestId('add-starter-services'));

    const services = loadServices(database);
    expect(services.map((service) => service.name)).toEqual([
      'Coupe femme',
      'Brushing',
      'Coupe + brushing',
      'Coloration',
      'Balayage',
      'Coupe homme',
    ]);
    const businessId = business.rows[0]!.id;
    expect(services.every((service) => service.businessId === businessId)).toBe(true);
    expect(services.every((service) => isUuidV4(service.id))).toBe(true);
    expect(services.every((service) => service.price === 0 && service.active)).toBe(true);
    expect(services.find((service) => service.name === 'Coloration')?.phases.map((phase) => phase.requiresStaff)).toEqual([true, false, true]);
    // They sync like hand-made prestations: one SERVICE outbox entry each.
    const outbox = loadSyncOutbox(database, businessId);
    expect(outbox.filter((entry) => entry.aggregateType === 'SERVICE')).toHaveLength(6);

    // The recap counts them; the app is entered only from there.
    expect(view.getByTestId('setup-recap-services').props.accessibilityLabel).toBe('Prestations & tarifs : 6 prestations prêtes');
    expect(status(view)).toBe('setup-required');
    await press(view.getByTestId('enter-app'));
    expect(status(view)).toBe('ready');
    expect(loadServices(database)).toHaveLength(6);
  });

  it('« Je préfère ajouter mes prestations moi-même » writes nothing', async () => {
    const { view, database } = await renderSetup();
    await reachServices(view);

    expect(view.getAllByRole('checkbox')).toHaveLength(8);
    await press(view.getByTestId('skip-starter-services'));

    expect(loadServices(database)).toHaveLength(0);
    expect(view.getByTestId('setup-recap-services').props.accessibilityLabel).toBe('Prestations & tarifs : Prestations à ajouter plus tard');
  });

  it('deselecting everything turns the action into « Continuer sans prestations »', async () => {
    const { view, database } = await renderSetup();
    await reachServices(view);

    for (const key of ['cut-women', 'blow-dry', 'cut-blow-dry', 'color', 'balayage', 'gloss', 'cut-men', 'care']) {
      await press(view.getByTestId(`starter-${key}`));
    }
    expect(view.queryByTestId('add-starter-services')).toBeNull();
    await press(view.getByTestId('continue-without-services'));

    expect(loadServices(database)).toHaveLength(0);
    expect(view.getByTestId('onboarding-complete')).toBeTruthy();
  });

  it.each([
    ['NAILS', 'Onglerie', 8, 'Pose complète gel'],
    ['ESTHETICS', 'Esthétique', 8, 'Épilation jambes complètes'],
    ['WELLNESS', 'Bien-être', 7, 'Massage relaxant 1 h'],
  ] as const)('a %s pilot creates her Business with that activity and receives its own base', async (activity, label, count, sample) => {
    const { view, business, database } = await renderSetup();
    await reachServices(view, activity);

    expect(business.rows[0]?.activityType).toBe(activity);
    expect(readBusinessProfile(database)?.activityType).toBe(activity);
    const proposed = getStarterServices(activity);
    expect(proposed).toHaveLength(count);
    for (const starter of proposed) expect(view.getByText(starter.name)).toBeTruthy();
    // Never the hairdressing base.
    expect(view.queryByText('Coupe femme')).toBeNull();

    await press(view.getByTestId('add-starter-services'));

    const services = loadServices(database);
    expect(services.map((service) => service.name)).toEqual(proposed.map((starter) => starter.name));
    expect(services.map((service) => service.name)).toContain(sample);
    expect(services.every((service) => service.businessId === business.rows[0]!.id && service.price === 0)).toBe(true);
    expect(view.getByTestId('setup-recap-activity').props.accessibilityLabel).toBe(`Votre activité principale : ${label}`);
    expect(view.getByTestId('setup-recap-services').props.accessibilityLabel).toBe(
      `Prestations & tarifs : ${count} prestations prêtes`,
    );
  });

  // « Autre » (no preset) cannot be chosen in onboarding. The empty-base
  // branch stays covered by starter-services.test.ts (`getStarterServices('OTHER')` → []).
});

describe('BusinessSetupScreen — setup complete', () => {
  it('shows the personalised recap and celebrates once', async () => {
    const success = jest.spyOn(haptics, 'success');
    const { view } = await renderSetup();
    await reachServices(view);
    success.mockClear();

    await press(view.getByTestId('add-starter-services'));

    expect(view.getByText('Votre espace BeautIzzy est prêt ✨')).toBeTruthy();
    expect(view.getByTestId('setup-recap-activity').props.accessibilityLabel).toBe('Votre activité principale : Coiffure');
    expect(view.getByTestId('setup-recap-services').props.accessibilityLabel).toBe('Prestations & tarifs : 8 prestations prêtes');
    expect(view.getByText('Continuer')).toBeTruthy();
    expect(view.queryByText('Accéder à BeautIzzy')).toBeNull();
    // One success haptic on the first appearance, none on a re-render.
    await act(async () => {});
    expect(success).toHaveBeenCalledTimes(1);
    success.mockRestore();
  });
});
