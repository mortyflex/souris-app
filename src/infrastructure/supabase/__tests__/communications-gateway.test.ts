// Souris — CommunicationsGateway bound to the Lot B owner RPCs

import { CommunicationsGatewayError } from '@/features/communications/gateway';

import {
  createSupabaseCommunicationsGateway,
  mapCommunicationsPostgrestError,
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

describe('dormant SMS preference field (retired appointment-SMS switch)', () => {
  it('a server answer carrying the deprecated field parses tolerantly', async () => {
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

describe('lifecycle SMS preferences (SMS pivot Phase 2)', () => {
  const SERVER_DEFAULTS = {
    birthday_sms_enabled: false,
    birthday_discount_percent: 15,
    birthday_validity_days: 7,
    winback_sms_enabled: false,
    winback_after_days: 60,
    winback_discount_percent: 10,
    winback_validity_days: 7,
    updated_at: null,
  };

  it('reads the V1 defaults, both automations OFF', async () => {
    const { client, calls } = createRpcMock({
      communications_read_lifecycle_sms_preferences: { data: SERVER_DEFAULTS },
    });

    const preferences = await createSupabaseCommunicationsGateway(client).readLifecycleSmsPreferences('biz-1');

    expect(calls[0]).toEqual({
      fn: 'communications_read_lifecycle_sms_preferences',
      args: { p_business_id: 'biz-1' },
    });
    expect(preferences).toEqual({
      birthdaySmsEnabled: false,
      birthdayDiscountPercent: 15,
      birthdayValidityDays: 7,
      winbackSmsEnabled: false,
      winbackAfterDays: 60,
      winbackDiscountPercent: 10,
      winbackValidityDays: 7,
    });
  });

  it('refuses a malformed lifecycle answer', async () => {
    const { client } = createRpcMock({
      communications_read_lifecycle_sms_preferences: { data: { birthday_sms_enabled: 'yes' } },
    });
    await expect(
      createSupabaseCommunicationsGateway(client).readLifecycleSmsPreferences('biz-1'),
    ).rejects.toThrow(CommunicationsGatewayError);
  });

  it('sends the two switches alone when no knob is supplied', async () => {
    const { client, calls } = createRpcMock({
      communications_update_lifecycle_sms_preferences: {
        data: { status: 'UPDATED', ...SERVER_DEFAULTS, birthday_sms_enabled: true },
      },
    });

    const result = await createSupabaseCommunicationsGateway(client).updateLifecycleSmsPreferences('biz-1', {
      birthdaySmsEnabled: true,
      winbackSmsEnabled: false,
    });

    // An omitted knob is not sent: the server keeps its stored value.
    expect(calls[0]).toEqual({
      fn: 'communications_update_lifecycle_sms_preferences',
      args: { p_business_id: 'biz-1', p_birthday_sms_enabled: true, p_winback_sms_enabled: false },
    });
    expect(result.status).toBe('UPDATED');
    if (result.status === 'UPDATED') {
      expect(result.preferences.birthdaySmsEnabled).toBe(true);
      expect(result.preferences.winbackSmsEnabled).toBe(false);
    }
  });

  it.each([
    ['birthdayDiscountPercent', 20, 'p_birthday_discount_percent'],
    ['birthdayValidityDays', 10, 'p_birthday_validity_days'],
    ['winbackAfterDays', 90, 'p_winback_after_days'],
    ['winbackDiscountPercent', 25, 'p_winback_discount_percent'],
    ['winbackValidityDays', 14, 'p_winback_validity_days'],
  ] as const)('maps %s alone to %s', async (knob, value, parameter) => {
    const { client, calls } = createRpcMock({
      communications_update_lifecycle_sms_preferences: {
        data: { status: 'UPDATED', ...SERVER_DEFAULTS },
      },
    });

    await createSupabaseCommunicationsGateway(client).updateLifecycleSmsPreferences('biz-1', {
      birthdaySmsEnabled: false,
      winbackSmsEnabled: true,
      [knob]: value,
    });

    expect(calls[0]?.args).toEqual({
      p_business_id: 'biz-1',
      p_birthday_sms_enabled: false,
      p_winback_sms_enabled: true,
      [parameter]: value,
    });
  });

  it('maps every supplied knob and returns the stored values', async () => {
    const { client, calls } = createRpcMock({
      communications_update_lifecycle_sms_preferences: {
        data: {
          status: 'UPDATED',
          ...SERVER_DEFAULTS,
          birthday_discount_percent: 20,
          birthday_validity_days: 10,
          winback_after_days: 90,
          winback_discount_percent: 25,
          winback_validity_days: 14,
        },
      },
    });

    const result = await createSupabaseCommunicationsGateway(client).updateLifecycleSmsPreferences('biz-1', {
      birthdaySmsEnabled: false,
      winbackSmsEnabled: false,
      birthdayDiscountPercent: 20,
      birthdayValidityDays: 10,
      winbackAfterDays: 90,
      winbackDiscountPercent: 25,
      winbackValidityDays: 14,
    });

    expect(calls[0]?.args).toEqual({
      p_business_id: 'biz-1',
      p_birthday_sms_enabled: false,
      p_winback_sms_enabled: false,
      p_birthday_discount_percent: 20,
      p_birthday_validity_days: 10,
      p_winback_after_days: 90,
      p_winback_discount_percent: 25,
      p_winback_validity_days: 14,
    });
    expect(result).toEqual({
      status: 'UPDATED',
      preferences: {
        birthdaySmsEnabled: false,
        birthdayDiscountPercent: 20,
        birthdayValidityDays: 10,
        winbackSmsEnabled: false,
        winbackAfterDays: 90,
        winbackDiscountPercent: 25,
        winbackValidityDays: 14,
      },
    });
  });

  it('maps the INVALID_VALUE refusal', async () => {
    const { client } = createRpcMock({
      communications_update_lifecycle_sms_preferences: { data: { status: 'INVALID_VALUE' } },
    });
    const result = await createSupabaseCommunicationsGateway(client).updateLifecycleSmsPreferences('biz-1', {
      birthdaySmsEnabled: true,
      winbackSmsEnabled: true,
      birthdayDiscountPercent: 101,
    });
    expect(result).toEqual({ status: 'INVALID_VALUE' });
  });
});
