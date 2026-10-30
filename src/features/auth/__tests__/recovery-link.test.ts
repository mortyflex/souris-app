import { readRecoveryLink } from '../recovery-link';

const CODE = '0b5c1f3e-8f7a-4d2b-9c61-2e4a7d9b1f20';

describe('readRecoveryLink', () => {
  it('reads the one-time code Supabase returns with a valid link', () => {
    expect(readRecoveryLink({ code: CODE })).toEqual({ kind: 'code', code: CODE });
    expect(readRecoveryLink({ code: [CODE, 'other'] })).toEqual({ kind: 'code', code: CODE });
  });

  it('reports an expired or already used link as expired', () => {
    for (const errorCode of ['otp_expired', 'flow_state_expired']) {
      expect(readRecoveryLink({ error: 'access_denied', error_code: errorCode })).toEqual({
        kind: 'failed',
        failure: { code: 'RECOVERY_LINK_EXPIRED' },
      });
    }
  });

  it('never exchanges a link that carries an error, even with a code', () => {
    expect(readRecoveryLink({ code: CODE, error: 'server_error' })).toEqual({
      kind: 'failed',
      failure: { code: 'RECOVERY_LINK_INVALID' },
    });
  });

  it('treats a missing or malformed code as an invalid link', () => {
    const invalid = { kind: 'failed', failure: { code: 'RECOVERY_LINK_INVALID' } };
    expect(readRecoveryLink({})).toEqual(invalid);
    expect(readRecoveryLink({ code: '' })).toEqual(invalid);
    expect(readRecoveryLink({ code: 'short' })).toEqual(invalid);
    expect(readRecoveryLink({ code: `${CODE}&next=evil` })).toEqual(invalid);
    expect(readRecoveryLink({ code: 'x'.repeat(200) })).toEqual(invalid);
  });
});
