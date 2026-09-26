// Souris — « Rappel cliente » status line of Appointment Details (Lot B)
//
// The row against the fake gateway: every projection status renders its
// French line, NONE and every failure render NOTHING (fail safe, no
// technical language), and the projection is re-read when a communication-
// relevant fact of the appointment changes.

import { act, render } from '@testing-library/react-native';

import type { Appointment } from '@/domain/appointments';
import { CurrentBusinessProvider } from '@/features/business/session/CurrentBusinessProvider';
import { CommunicationPreferencesProvider } from '@/features/communications/preferences/CommunicationPreferencesProvider';
import { CommunicationsGatewayProvider } from '@/features/communications/session/CommunicationsGatewayProvider';
import {
  createFakeCommunicationsGateway,
  type FakeCommunicationsGateway,
} from '@/features/communications/testing/fake-communications-gateway';
import { testBusiness, TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

import { AppointmentReminderRow } from '../components/AppointmentReminderRow';

jest.mock('expo-symbols', () => {
  const React = jest.requireActual('react') as typeof import('react');
  return {
    SymbolView: () => React.createElement(React.Fragment, null),
  };
});

const appointment: Appointment = {
  id: 'apt-1',
  businessId: testBusiness.id,
  clientId: 'client-lea',
  staffMemberId: 'staff-amelie',
  startAt: new Date('2027-03-26T13:30:00.000Z'),
  status: 'SCHEDULED',
  items: [],
};

async function renderRow(
  gateway: FakeCommunicationsGateway | undefined,
  subject: Appointment = appointment,
) {
  const view = await render(
    <CurrentBusinessProvider business={testBusiness}>
      <CommunicationsGatewayProvider gateway={gateway}>
        <AppointmentReminderRow appointment={subject} />
      </CommunicationsGatewayProvider>
    </CurrentBusinessProvider>,
  );
  await act(async () => {});
  return view;
}

describe('status rendering', () => {
  it('SCHEDULED renders « Programmé » with the local instant', async () => {
    const gateway = createFakeCommunicationsGateway();
    gateway.setReminderStatus('apt-1', {
      status: 'SCHEDULED',
      scheduledFor: new Date(2026, 8, 26, 14, 30),
    });
    const view = await renderRow(gateway);
    expect(view.getByText('Rappel cliente · Programmé · 26 septembre à 14:30')).toBeTruthy();
  });

  it('SENT renders « Envoyé » — never a delivery or read claim', async () => {
    const gateway = createFakeCommunicationsGateway();
    gateway.setReminderStatus('apt-1', { status: 'SENT', sentAt: new Date() });
    const view = await renderRow(gateway);
    expect(view.getByText('Rappel cliente · Envoyé')).toBeTruthy();
    expect(view.queryByText(/Lu|Ouvert|Reçu/)).toBeNull();
  });

  // One render per test: a second render inside the same `it` overlaps act scopes.
  it.each([
    ['DISABLED', 'Rappel cliente · Désactivé'],
    ['MISSING_EMAIL', 'Rappel cliente · Aucune adresse e-mail'],
    ['TOO_LATE', 'Rappel cliente · Non programmé · rendez-vous créé trop tard'],
    ['FAILED', 'Rappel cliente · Échec de l’envoi'],
  ] as const)('%s renders its French line', async (status, label) => {
    const gateway = createFakeCommunicationsGateway();
    gateway.setReminderStatus('apt-1', { status });
    const view = await renderRow(gateway);
    expect(view.getByText(label)).toBeTruthy();
  });

  it('NONE renders nothing', async () => {
    const view = await renderRow(createFakeCommunicationsGateway());
    expect(view.queryByTestId('appointment-reminder-status')).toBeNull();
  });

  it('a gateway failure renders nothing instead of a technical error', async () => {
    const gateway = createFakeCommunicationsGateway();
    gateway.failNext('NETWORK');
    const view = await renderRow(gateway);
    expect(view.queryByTestId('appointment-reminder-status')).toBeNull();
    expect(view.toJSON()).toBeNull();
  });

  it('no gateway (unconfigured Supabase) renders nothing', async () => {
    const view = await renderRow(undefined);
    expect(view.queryByTestId('appointment-reminder-status')).toBeNull();
  });
});

// Lot C1: with the SMS preference known, the row reads the per-channel
// projection. While SMS is globally OFF — every real user in C1 — the row
// renders EXACTLY the single legacy email line.
async function renderRowWithPreferences(
  gateway: FakeCommunicationsGateway,
  subject: Appointment = appointment,
) {
  const view = await render(
    <TestPersistenceProvider>
      <CommunicationsGatewayProvider gateway={gateway}>
        <CommunicationPreferencesProvider>
          <AppointmentReminderRow appointment={subject} />
        </CommunicationPreferencesProvider>
      </CommunicationsGatewayProvider>
    </TestPersistenceProvider>,
  );
  await act(async () => {});
  return view;
}

describe('per-channel rendering (Lot C1)', () => {
  it('SMS globally OFF keeps the exact single email line', async () => {
    const gateway = createFakeCommunicationsGateway();
    gateway.seedPreferences(testBusiness.id, {
      emailRemindersEnabled: true,
      replyToEmail: 'salon@example.test',
    });
    gateway.setReminderStatus('apt-1', { status: 'SENT', sentAt: new Date() });
    const view = await renderRowWithPreferences(gateway);
    expect(view.getByText('Rappel cliente · Envoyé')).toBeTruthy();
    expect(view.queryByText('Rappels cliente')).toBeNull();
    expect(view.queryByText(/E-mail ·|SMS ·/)).toBeNull();
  });

  it('SMS enabled lists one compact line per channel', async () => {
    const gateway = createFakeCommunicationsGateway();
    gateway.seedPreferences(testBusiness.id, {
      emailRemindersEnabled: true,
      smsRemindersEnabled: true,
      replyToEmail: 'salon@example.test',
    });
    gateway.setReminderChannelStatuses('apt-1', [
      { channel: 'EMAIL', status: 'SENT', sentAt: new Date() },
      { channel: 'SMS', status: 'SCHEDULED', scheduledFor: new Date(2026, 8, 26, 14, 30) },
    ]);
    const view = await renderRowWithPreferences(gateway);
    expect(view.getByText('Rappels cliente')).toBeTruthy();
    expect(view.getByText('E-mail · Envoyé')).toBeTruthy();
    expect(view.getByText('SMS · Programmé · 26 septembre à 14:30')).toBeTruthy();
  });

  it('renders the SMS recipient states without technical language', async () => {
    const gateway = createFakeCommunicationsGateway();
    gateway.seedPreferences(testBusiness.id, {
      emailRemindersEnabled: true,
      smsRemindersEnabled: true,
      replyToEmail: 'salon@example.test',
    });
    gateway.setReminderChannelStatuses('apt-1', [
      { channel: 'EMAIL', status: 'SCHEDULED', scheduledFor: new Date(2026, 8, 26, 14, 30) },
      { channel: 'SMS', status: 'MISSING_PHONE' },
    ]);
    const view = await renderRowWithPreferences(gateway);
    expect(view.getByText('SMS · Aucun numéro de téléphone')).toBeTruthy();
  });

  it('a channel with nothing to show (NONE) is simply absent', async () => {
    const gateway = createFakeCommunicationsGateway();
    gateway.seedPreferences(testBusiness.id, {
      emailRemindersEnabled: true,
      smsRemindersEnabled: true,
      replyToEmail: 'salon@example.test',
    });
    gateway.setReminderChannelStatuses('apt-1', [
      { channel: 'EMAIL', status: 'SENT', sentAt: new Date() },
      { channel: 'SMS', status: 'NONE' },
    ]);
    const view = await renderRowWithPreferences(gateway);
    expect(view.getByText('E-mail · Envoyé')).toBeTruthy();
    expect(view.queryByText(/^SMS ·/)).toBeNull();
  });
});
