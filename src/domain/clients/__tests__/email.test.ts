import { clientEmailComparisonKey, isValidClientEmail } from '../email';

describe('Client email rule', () => {
  it('accepts « something@something.something », trimmed', () => {
    expect(isValidClientEmail(' sophie@example.com ')).toBe(true);
    expect(isValidClientEmail('sophie@example')).toBe(false);
    expect(isValidClientEmail('sophie example.com')).toBe(false);
    expect(isValidClientEmail('')).toBe(false);
  });

  it('compares emails trimmed and lowercased', () => {
    expect(clientEmailComparisonKey(' Sophie@Example.COM ')).toBe('sophie@example.com');
    expect(clientEmailComparisonKey('  ')).toBeUndefined();
    expect(clientEmailComparisonKey(undefined)).toBeUndefined();
  });
});
