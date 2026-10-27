// BeautIzzy — onboarding preview (behavioural): the real five steps, in memory only
//
// The preview is rendered with NO provider at all — no persistence, no auth,
// no Business session, no communications gateway — which is itself the proof
// that it depends on none of them. The session, persistence and store
// modules are spied on top, so a regression that reached for them would fail
// loudly here.

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import * as businessSession from '@/features/business/session/BusinessSessionProvider';
import { getStarterServices } from '@/features/business/setup/starter-services';
import * as servicesStore from '@/persistence/stores/services';
import * as persistence from '@/providers/PersistenceProvider';

import { isPlaygroundAvailable } from '../availability';
import { PlaygroundOnboardingPreviewScreen } from '../PlaygroundOnboardingPreviewScreen';
import { createPreviewSetupActions, PREVIEW_ACCOUNT_EMAIL, PREVIEW_BUSINESS_ID } from '../preview-actions';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockCanGoBack = true;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack, canGoBack: () => mockCanGoBack }),
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-reanimated', () =>
  jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'),
);
jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});
jest.mock('../availability', () => ({ isPlaygroundAvailable: jest.fn(() => true) }));

const press = (element: unknown) =>
  act(async () => {
    fireEvent.press(element as Parameters<typeof fireEvent.press>[0]);
  });
const type = (element: unknown, text: string) =>
  act(async () => {
    fireEvent.changeText(element as Parameters<typeof fireEvent.changeText>[0], text);
  });

const useBusinessSessionSpy = jest.spyOn(businessSession, 'useBusinessSession');
const usePersistenceSpy = jest.spyOn(persistence, 'usePersistence');
const insertServiceSpy = jest.spyOn(servicesStore, 'insertService');

async function renderPreview(activityType: 'HAIRDRESSING' | 'NAILS' | 'ESTHETICS') {
  const view = await render(<PlaygroundOnboardingPreviewScreen activityType={activityType} />);
  await act(async () => {});
  return view;
}

type View = Awaited<ReturnType<typeof renderPreview>>;
const isDisabled = (view: View, testID: string) => view.getByTestId(testID).props.accessibilityState.disabled as boolean;

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  mockBack.mockClear();
  mockCanGoBack = true;
  useBusinessSessionSpy.mockClear();
  usePersistenceSpy.mockClear();
  insertServiceSpy.mockClear();
  jest.mocked(isPlaygroundAvailable).mockReturnValue(true);
});

describe('PlaygroundOnboardingPreviewScreen', () => {
  it('walks the real five steps for an announced profession and ends by leaving — never by entering anything', async () => {
    const view = await renderPreview('NAILS');

    // 1. Activity — preselected, still changeable, announced professions selectable, the mention on every step.
    expect(view.getByTestId('onboarding-activity')).toBeTruthy();
    expect(view.getByText('Mode démonstration')).toBeTruthy();
    expect(view.getByTestId('playground-leave-preview')).toBeTruthy();
    expect(view.getByTestId('activity-NAILS').props.accessibilityState.selected).toBe(true);
    expect(view.getByTestId('activity-NAILS-coming-soon')).toBeTruthy();
    expect(isDisabled(view, 'activity-ESTHETICS')).toBe(false);
    expect(isDisabled(view, 'continue-activity')).toBe(false);
    expect(view.getByTestId('onboarding-progress').props.accessibilityValue.text).toBe('Étape 1 sur 5');
    await press(view.getByTestId('continue-activity'));

    // 2. Details — the announced profession is recalled and accepted here (preview only).
    expect(view.getByTestId('onboarding-details')).toBeTruthy();
    expect(view.getByLabelText('Activité principale : Onglerie')).toBeTruthy();
    expect(view.getByText('Mode démonstration')).toBeTruthy();
    expect(isDisabled(view, 'continue-details')).toBe(true);
    await type(view.getByTestId('owner-first-name-input'), 'Sofia');
    await type(view.getByTestId('business-name-input'), 'Nails by Sofia');
    expect(isDisabled(view, 'continue-details')).toBe(false);
    // Back and forth keeps the draft, like the product.
    await press(view.getByTestId('onboarding-back'));
    expect(view.getByTestId('activity-NAILS').props.accessibilityState.selected).toBe(true);
    await press(view.getByTestId('continue-activity'));
    expect(view.getByTestId('business-name-input').props.value).toBe('Nails by Sofia');
    await press(view.getByTestId('continue-details'));

    // 3. Reminders — the Reply-To is the preview's placeholder; the opt-in is accepted in memory.
    expect(view.getByTestId('onboarding-reminders')).toBeTruthy();
    expect(view.getByTestId('reminder-reply-to-input').props.value).toBe(PREVIEW_ACCOUNT_EMAIL);
    await press(view.getByTestId('continue-reminders'));

    // 4. Services — the NAILS starter base, from the in-memory « Business ».
    await waitFor(() => expect(view.getByTestId('onboarding-services')).toBeTruthy());
    expect(view.queryByTestId('onboarding-back')).toBeNull();
    const starters = getStarterServices('NAILS');
    expect(starters.length).toBeGreaterThan(0);
    for (const starter of starters) expect(view.getByTestId(`starter-${starter.key}`)).toBeTruthy();
    expect(view.getByText('Ajouter ces prestations')).toBeTruthy();
    await press(view.getByTestId('add-starter-services'));

    // 5. Complete — the recap reads the preview choices; the action ends the preview.
    expect(view.getByTestId('onboarding-complete')).toBeTruthy();
    expect(view.getByLabelText('Votre activité principale : Onglerie')).toBeTruthy();
    expect(view.getByLabelText('Rappels par e-mail : Rappels activés')).toBeTruthy();
    expect(view.getByLabelText(`Prestations & tarifs : ${starters.length} prestations prêtes`)).toBeTruthy();
    expect(view.getByText('Terminer l’aperçu')).toBeTruthy();
    expect(view.queryByText('Continuer')).toBeNull();
    expect(mockBack).not.toHaveBeenCalled();
    await press(view.getByTestId('enter-app'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();

    // Nothing real was ever touched.
    expect(useBusinessSessionSpy).not.toHaveBeenCalled();
    expect(usePersistenceSpy).not.toHaveBeenCalled();
    expect(insertServiceSpy).not.toHaveBeenCalled();
  });

  it('previews ESTHETICS the same way, with its own starter base', async () => {
    const esthetics = await renderPreview('ESTHETICS');
    expect(esthetics.getByTestId('activity-ESTHETICS').props.accessibilityState.selected).toBe(true);
    await press(esthetics.getByTestId('continue-activity'));
    expect(esthetics.getByLabelText('Activité principale : Esthétique')).toBeTruthy();
    await type(esthetics.getByTestId('owner-first-name-input'), 'Inès');
    await type(esthetics.getByTestId('business-name-input'), 'Institut Inès');
    await press(esthetics.getByTestId('continue-details'));
    await press(esthetics.getByTestId('skip-reminders'));
    await waitFor(() => expect(esthetics.getByTestId('onboarding-services')).toBeTruthy());
    expect(esthetics.getByTestId('starter-facial')).toBeTruthy();
    expect(esthetics.queryByTestId('starter-gel-full-set')).toBeNull();
  });

  it('starts every mounted preview from a fresh scenario: nothing of a previous one survives', async () => {
    const hair = await renderPreview('HAIRDRESSING');
    expect(hair.getByTestId('activity-HAIRDRESSING').props.accessibilityState.selected).toBe(true);
    await press(hair.getByTestId('continue-activity'));
    expect(hair.getByTestId('owner-first-name-input').props.value).toBe('');
    expect(hair.getByTestId('business-name-input').props.value).toBe('');
  });

  it('lets the developer switch profession inside the preview, and « Quitter » leaves at any step', async () => {
    const view = await renderPreview('NAILS');
    await press(view.getByTestId('activity-ESTHETICS'));
    expect(view.getByTestId('activity-ESTHETICS').props.accessibilityState.selected).toBe(true);
    expect(view.getByTestId('activity-NAILS').props.accessibilityState.selected).toBe(false);
    await press(view.getByTestId('continue-activity'));
    expect(view.getByLabelText('Activité principale : Esthétique')).toBeTruthy();

    await press(view.getByTestId('playground-leave-preview'));
    expect(mockBack).toHaveBeenCalledTimes(1);

    mockCanGoBack = false;
    await press(view.getByTestId('playground-leave-preview'));
    expect(mockReplace).toHaveBeenCalledWith('/playground');
  });

  it('renders nothing when the Playground is unavailable', async () => {
    jest.mocked(isPlaygroundAvailable).mockReturnValue(false);
    const view = await renderPreview('NAILS');
    expect(view.toJSON()).toBeNull();
  });
});

describe('preview actions', () => {
  it('answer every effect from memory, count the calls, and finish by handing back control', async () => {
    const onFinish = jest.fn();
    const now = new Date('2026-10-27T10:00:00.000Z');
    const actions = createPreviewSetupActions({ onFinish, now: () => now });

    const outcome = await actions.createBusiness({ ownerFirstName: 'Sofia', name: 'Nails by Sofia', activityType: 'NAILS' });
    expect(outcome).toEqual({
      kind: 'created',
      business: {
        id: PREVIEW_BUSINESS_ID,
        ownerUserId: 'playground-preview-owner',
        ownerFirstName: 'Sofia',
        name: 'Nails by Sofia',
        activityType: 'NAILS',
        createdAt: now,
        updatedAt: now,
      },
    });
    if (outcome.kind !== 'created') throw new Error('unreachable');

    await expect(actions.activateReminders!(outcome.business.id, 'sofia@exemple.fr')).resolves.toEqual({
      status: 'UPDATED',
      preferences: { emailRemindersEnabled: true, replyToEmail: 'sofia@exemple.fr' },
    });
    const kept = getStarterServices('NAILS').slice(0, 2);
    expect(actions.writeStarterServices(outcome.business, kept)).toBe(2);
    expect(onFinish).not.toHaveBeenCalled();
    actions.enterBusiness(outcome.business);
    expect(onFinish).toHaveBeenCalledTimes(1);

    expect(actions.calls).toEqual({
      createBusiness: [{ ownerFirstName: 'Sofia', name: 'Nails by Sofia', activityType: 'NAILS' }],
      activateReminders: [{ businessId: PREVIEW_BUSINESS_ID, replyToEmail: 'sofia@exemple.fr' }],
      writeStarterServices: [{ businessId: PREVIEW_BUSINESS_ID, keptKeys: kept.map((starter) => starter.key) }],
      enterBusiness: [outcome.business],
    });
  });
});
