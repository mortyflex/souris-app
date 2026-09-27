// Souris — Communication Core (SMS pivot Phase 2): lifecycle SMS content
//
// Locks the V1 French copy of the two client lifecycle SMS, the fallback
// without a usable first name, the civil valid_until formatting, the
// deterministic length ceiling (presentation text compacted before the
// discount/date are ever at risk), and the refusals: appointment SMS kinds,
// non-SMS channels and malformed snapshots render NOTHING.

import {
  formatLifecycleSmsDate,
  LIFECYCLE_SMS_HARD_LIMIT,
  parseClientLifecycleSmsPayload,
  renderSmsContent,
} from '../sms-content';
import type { OutgoingCommunication } from '../transport';

const BASE_PAYLOAD = {
  business_name: 'Salon Amélie',
  client_first_name: 'Léa',
  discount_percent: 15,
  valid_until: '2026-10-04',
};

function communication(
  overrides: Partial<OutgoingCommunication> = {},
): OutgoingCommunication {
  return {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    businessId: 'biz-1',
    kind: 'CLIENT_BIRTHDAY_OFFER',
    channel: 'SMS',
    recipient: '+33612345678',
    payload: BASE_PAYLOAD,
    ...overrides,
  };
}

describe('the V1 lifecycle copy', () => {
  it('locks the birthday offer', () => {
    expect(renderSmsContent(communication())).toBe(
      "Joyeux anniversaire Léa ! Salon Amélie vous offre -15% sur votre prochaine prestation, valable jusqu'au 04/10/2026.",
    );
  });

  it('locks the win-back offer', () => {
    expect(
      renderSmsContent(
        communication({
          kind: 'INACTIVE_CLIENT_FOLLOWUP',
          payload: { ...BASE_PAYLOAD, discount_percent: 10 },
        }),
      ),
    ).toBe(
      "Bonjour Léa, ça fait un moment ! Salon Amélie vous offre -10% sur votre prochaine prestation, valable jusqu'au 04/10/2026.",
    );
  });

  it('falls back without a usable first name — birthday', () => {
    expect(
      renderSmsContent(
        communication({ payload: { ...BASE_PAYLOAD, client_first_name: '   ' } }),
      ),
    ).toBe(
      "Joyeux anniversaire ! Salon Amélie vous offre -15% sur votre prochaine prestation, valable jusqu'au 04/10/2026.",
    );
  });

  it('falls back without a usable first name — win-back', () => {
    expect(
      renderSmsContent(
        communication({
          kind: 'INACTIVE_CLIENT_FOLLOWUP',
          payload: { ...BASE_PAYLOAD, client_first_name: null as unknown as string },
        }),
      ),
    ).toBe(
      "Bonjour, ça fait un moment ! Salon Amélie vous offre -15% sur votre prochaine prestation, valable jusqu'au 04/10/2026.",
    );
  });

  it('keeps accented names exactly — no transliteration to force GSM-7', () => {
    const body = renderSmsContent(
      communication({
        payload: { ...BASE_PAYLOAD, client_first_name: 'Zoé-Aïcha', business_name: 'Ébène & Sœurs' },
      }),
    );
    expect(body).toContain('Zoé-Aïcha');
    expect(body).toContain('Ébène & Sœurs');
  });

  it('the nominal copy stays within one SMS segment', () => {
    expect(renderSmsContent(communication())!.length).toBeLessThanOrEqual(160);
  });

  it('contains no HTML, no emoji, no link and no STOP text', () => {
    for (const kind of ['CLIENT_BIRTHDAY_OFFER', 'INACTIVE_CLIENT_FOLLOWUP'] as const) {
      const body = renderSmsContent(communication({ kind }))!;
      expect(body).not.toMatch(/[<>]/);
      expect(body).not.toMatch(/https?:/i);
      expect(body).not.toMatch(/stop/i);
      expect(body).not.toMatch(/[\u{1F300}-\u{1FAFF}☀-➿]/u);
    }
  });

  it('never surfaces appointment data, prices, deposits or payments', () => {
    // The payload is the minimal offer snapshot; even a hostile snapshot
    // carrying extra keys must not leak them into the body.
    const body = renderSmsContent(
      communication({
        payload: {
          ...BASE_PAYLOAD,
          services: ['Coloration'],
          appointment_id: 'apt-99',
          deposit_cents: 4500,
          phone: '+33612345678',
        },
      }),
    )!;
    expect(body).not.toContain('Coloration');
    expect(body).not.toContain('apt-99');
    expect(body).not.toContain('4500');
    expect(body).not.toContain('+33612345678');
  });
});

describe('valid_until formatting', () => {
  it('formats the civil date as DD/MM/YYYY without any timezone conversion', () => {
    expect(formatLifecycleSmsDate('2026-10-04')).toBe('04/10/2026');
    expect(formatLifecycleSmsDate('2027-01-01')).toBe('01/01/2027');
  });
});

describe('the deterministic length ceiling', () => {
  it('compacts a long business name first, keeping name, discount and date intact', () => {
    const body = renderSmsContent(
      communication({
        payload: { ...BASE_PAYLOAD, business_name: 'B'.repeat(150) },
      }),
    )!;
    expect(body.length).toBeLessThanOrEqual(LIFECYCLE_SMS_HARD_LIMIT);
    expect(body).toContain('Léa');
    expect(body).toContain('-15%');
    expect(body).toContain('04/10/2026');
    expect(body).toContain('...');
  });

  it('compacts a long first name after the business name, never the offer', () => {
    const body = renderSmsContent(
      communication({
        payload: {
          ...BASE_PAYLOAD,
          business_name: 'B'.repeat(80),
          client_first_name: 'P'.repeat(120),
        },
      }),
    )!;
    expect(body.length).toBeLessThanOrEqual(LIFECYCLE_SMS_HARD_LIMIT);
    expect(body).toContain('-15%');
    expect(body).toContain('04/10/2026');
  });

  it('holds the 200-character hard ceiling under absurd inputs', () => {
    for (const kind of ['CLIENT_BIRTHDAY_OFFER', 'INACTIVE_CLIENT_FOLLOWUP'] as const) {
      const body = renderSmsContent(
        communication({
          kind,
          payload: {
            business_name: 'B'.repeat(500),
            client_first_name: 'P'.repeat(500),
            discount_percent: 100,
            valid_until: '2026-12-31',
          },
        }),
      )!;
      expect(body.length).toBeLessThanOrEqual(LIFECYCLE_SMS_HARD_LIMIT);
      expect(body).toContain('-100%');
      expect(body).toContain('31/12/2026');
    }
  });
});

describe('refusals — no content, no send', () => {
  it.each([
    ['APPOINTMENT_REMINDER'],
    ['APPOINTMENT_RESCHEDULED'],
    ['APPOINTMENT_CANCELLED'],
    ['SOMETHING_ELSE'],
  ])('an appointment or unknown kind renders nothing: %s', (kind) => {
    expect(renderSmsContent(communication({ kind }))).toBeUndefined();
  });

  it('a non-SMS channel renders nothing', () => {
    expect(renderSmsContent(communication({ channel: 'EMAIL' }))).toBeUndefined();
  });

  it.each([
    ['missing business name', { ...BASE_PAYLOAD, business_name: '  ' }],
    ['missing discount', { ...BASE_PAYLOAD, discount_percent: undefined }],
    ['zero discount', { ...BASE_PAYLOAD, discount_percent: 0 }],
    ['discount above 100', { ...BASE_PAYLOAD, discount_percent: 101 }],
    ['fractional discount', { ...BASE_PAYLOAD, discount_percent: 12.5 }],
    ['missing valid_until', { ...BASE_PAYLOAD, valid_until: undefined }],
    ['malformed valid_until', { ...BASE_PAYLOAD, valid_until: '04/10/2026' }],
    ['impossible valid_until', { ...BASE_PAYLOAD, valid_until: '2026-13-40' }],
  ])('a malformed snapshot renders nothing: %s', (_label, payload) => {
    expect(
      renderSmsContent(communication({ payload: payload as Record<string, unknown> })),
    ).toBeUndefined();
  });

  it('parseClientLifecycleSmsPayload accepts the canonical snapshot only', () => {
    expect(parseClientLifecycleSmsPayload(BASE_PAYLOAD)).toEqual({
      businessName: 'Salon Amélie',
      clientFirstName: 'Léa',
      discountPercent: 15,
      validUntil: '2026-10-04',
    });
    expect(parseClientLifecycleSmsPayload({})).toBeUndefined();
  });
});
