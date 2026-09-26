// Souris — CommunicationsGateway bound to the Lot B owner RPCs

import { CommunicationsGatewayError } from '@/features/communications/gateway';

import {
  createSupabaseCommunicationsGateway,
  mapCommunicationsPostgrestError,
  toAppointmentChannelReminderStatuses,
  toAppointmentReminderStatus,
  type SupabaseCommunicationsApi,
} from '../communications-gateway';

function createRpcMock(results: Record<string, { data?: unknown; error?: unknown }>) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: (fn: string, args: unknown) => {
      calls.push({ fn, args });
      const result = results[fn] ?? {};
      return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
    },
  } as unknown as SupabaseCommunicationsApi;
  return { client, calls };
}

describe('readPreferences', () => {
  it('maps the jsonb answer to the domain shape', async () => {
    const { client, calls } = createRpcMock({
      communications_read_preferences: {
        data: { email_reminders_enabled: true, reply_to_email: 'a@b.test', updated_at: null },
      },
    });
    const gateway = createSupabaseCommunicationsGateway(client);

    const preferences = await gateway.readPreferences('biz-1');

    expect(calls[0]).toEqual({ fn: 'communications_read_preferences', args: { p_business_id: 'biz-1' } });
    expect(preferences).toEqual({
      emailRemindersEnabled: true,
      smsRemindersEnabled: false,
      replyToEmail: 'a@b.test',
    });
  });

  it('a null Reply-To hydrates as an absent property', async () => {
    const { client } = createRpcMock({
      communications_read_preferences: {
        data: { email_reminders_enabled: false, reply_to_email: null, updated_at: null },
      },
    });
    const preferences = await createSupabaseCommunicationsGateway(client).readPreferences('biz-1');
    expect(preferences).toEqual({ emailRemindersEnabled: false, smsRemindersEnabled: false });
    expect('replyToEmail' in preferences).toBe(false);
  });

  it('refuses a malformed answer', async () => {
    const { client } = createRpcMock({ communications_read_preferences: { data: { nope: 1 } } });
    await expect(createSupabaseCommunicationsGateway(client).readPreferences('biz-1')).rejects.toThrow(
      CommunicationsGatewayError,
    );
  });
});

describe('updatePreferences', () => {
  it('sends the preference and returns the accepted state', async () => {
    const { client, calls } = createRpcMock({
      communications_update_preferences: {
        data: { status: 'UPDATED', email_reminders_enabled: true, reply_to_email: 'a@b.test' },
      },
    });
    const result = await createSupabaseCommunicationsGateway(client).updatePreferences('biz-1', {
      emailRemindersEnabled: true,
      replyToEmail: 'a@b.test',
    });
    expect(calls[0]).toEqual({
      fn: 'communications_update_preferences',
      args: { p_business_id: 'biz-1', p_email_reminders_enabled: true, p_reply_to_email: 'a@b.test' },
    });
    expect(result).toEqual({
      status: 'UPDATED',
      preferences: {
        emailRemindersEnabled: true,
        smsRemindersEnabled: false,
        replyToEmail: 'a@b.test',
      },
    });
  });

  it('surfaces the server refusal as INVALID_REPLY_TO', async () => {
    const { client } = createRpcMock({
      communications_update_preferences: { data: { status: 'INVALID_REPLY_TO' } },
    });
    const result = await createSupabaseCommunicationsGateway(client).updatePreferences('biz-1', {
      emailRemindersEnabled: true,
      replyToEmail: 'nope',
    });
    expect(result).toEqual({ status: 'INVALID_REPLY_TO' });
  });
});

describe('readAppointmentReminderStatus', () => {
  it('maps every projection field', async () => {
    const { client, calls } = createRpcMock({
      communications_appointment_reminder_status: {
        data: { status: 'SCHEDULED', scheduled_for: '2027-03-25T13:30:00.000Z' },
      },
    });
    const status = await createSupabaseCommunicationsGateway(client).readAppointmentReminderStatus(
      'biz-1',
      'apt-1',
    );
    expect(calls[0]).toEqual({
      fn: 'communications_appointment_reminder_status',
      args: { p_business_id: 'biz-1', p_appointment_id: 'apt-1' },
    });
    expect(status.status).toBe('SCHEDULED');
    expect(status.scheduledFor?.toISOString()).toBe('2027-03-25T13:30:00.000Z');
  });

  it('validates the vocabulary', () => {
    expect(toAppointmentReminderStatus({ status: 'SENT', sent_at: '2026-09-25T10:00:00.000Z' }).sentAt).toBeDefined();
    expect(() => toAppointmentReminderStatus({ status: 'WHATEVER' })).toThrow(CommunicationsGatewayError);
    expect(() => toAppointmentReminderStatus('SENT')).toThrow(CommunicationsGatewayError);
  });
});

describe('readAppointmentReminderStatuses (Lot C1)', () => {
  it('maps the per-channel projection', async () => {
    const { client, calls } = createRpcMock({
      communications_appointment_reminder_statuses: {
        data: [
          { channel: 'EMAIL', status: 'SENT', sent_at: '2026-09-25T10:00:00.000Z' },
          { channel: 'SMS', status: 'SCHEDULED', scheduled_for: '2027-03-25T13:30:00.000Z' },
        ],
      },
    });
    const statuses = await createSupabaseCommunicationsGateway(
      client,
    ).readAppointmentReminderStatuses('biz-1', 'apt-1');
    expect(calls[0]).toEqual({
      fn: 'communications_appointment_reminder_statuses',
      args: { p_business_id: 'biz-1', p_appointment_id: 'apt-1' },
    });
    expect(statuses).toHaveLength(2);
    expect(statuses[0]).toMatchObject({ channel: 'EMAIL', status: 'SENT' });
    expect(statuses[1]?.channel).toBe('SMS');
    expect(statuses[1]?.scheduledFor?.toISOString()).toBe('2027-03-25T13:30:00.000Z');
  });

  it('accepts the SMS recipient states and refuses anything malformed', () => {
    expect(
      toAppointmentChannelReminderStatuses([
        { channel: 'SMS', status: 'MISSING_PHONE' },
        { channel: 'SMS', status: 'INVALID_PHONE' },
      ]),
    ).toEqual([
      { channel: 'SMS', status: 'MISSING_PHONE' },
      { channel: 'SMS', status: 'INVALID_PHONE' },
    ]);
    expect(() => toAppointmentChannelReminderStatuses({ status: 'SENT' })).toThrow(
      CommunicationsGatewayError,
    );
    expect(() =>
      toAppointmentChannelReminderStatuses([{ channel: 'FAX', status: 'SENT' }]),
    ).toThrow(CommunicationsGatewayError);
    expect(() =>
      toAppointmentChannelReminderStatuses([{ channel: 'EMAIL', status: 'WHATEVER' }]),
    ).toThrow(CommunicationsGatewayError);
  });
});

describe('SMS preference parsing (Lot C1)', () => {
  it('a server answer with the SMS switch on hydrates it', async () => {
    const { client } = createRpcMock({
      communications_read_preferences: {
        data: {
          email_reminders_enabled: true,
          sms_reminders_enabled: true,
          reply_to_email: 'a@b.test',
          updated_at: null,
        },
      },
    });
    const preferences = await createSupabaseCommunicationsGateway(client).readPreferences('biz-1');
    expect(preferences.smsRemindersEnabled).toBe(true);
  });
});

describe('error mapping', () => {
  it('reduces PostgREST errors to the stable codes', () => {
    expect(mapCommunicationsPostgrestError({ code: '', message: '' }).code).toBe('NETWORK');
    expect(mapCommunicationsPostgrestError({ code: '', message: 'fetch failed' }).code).toBe('NETWORK');
    expect(mapCommunicationsPostgrestError({ code: '42501', message: '' }).code).toBe('FORBIDDEN');
    expect(mapCommunicationsPostgrestError({ code: 'PGRST301', message: '' }).code).toBe('FORBIDDEN');
    expect(mapCommunicationsPostgrestError({ code: 'XX000', message: '' }).code).toBe('UNKNOWN');
  });

  it('rpc errors reach the caller as gateway errors', async () => {
    const { client } = createRpcMock({
      communications_read_preferences: { error: { code: '42501', message: 'denied' } },
    });
    await expect(createSupabaseCommunicationsGateway(client).readPreferences('biz-1')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
