import {
  hasCredentialErrors,
  hasNewPasswordErrors,
  normalizeEmail,
  validateCredentials,
  validateNewPassword,
} from '../form';

describe('credential form', () => {
  it('normalizes the email', () => {
    expect(normalizeEmail('  Lea@Example.COM ')).toBe('lea@example.com');
  });

  it('validates sign-up with the minimum password length', () => {
    expect(validateCredentials({ email: '', password: '' }, 'sign-up')).toEqual({
      email: 'L’email est requis.',
      password: 'Le mot de passe est requis.',
    });
    expect(validateCredentials({ email: 'not-an-email', password: 'short' }, 'sign-up')).toEqual({
      email: 'Adresse email invalide.',
      password: '8 caractères minimum.',
    });
    expect(validateCredentials({ email: 'lea@example.com', password: 'password123' }, 'sign-up')).toEqual({});
  });

  it('only requires a password value on sign-in', () => {
    expect(validateCredentials({ email: 'lea@example.com', password: 'short' }, 'sign-in')).toEqual({});
    expect(hasCredentialErrors(validateCredentials({ email: 'lea@example.com', password: '' }, 'sign-in'))).toBe(true);
    expect(hasCredentialErrors({})).toBe(false);
  });

  it('asks for a new password of the sign-up length, typed twice identically', () => {
    expect(validateNewPassword({ password: '', confirmation: '' })).toEqual({
      password: 'Le mot de passe est requis.',
      confirmation: 'Confirmez le mot de passe.',
    });
    expect(validateNewPassword({ password: 'short', confirmation: 'short' })).toEqual({ password: '8 caractères minimum.' });
    expect(validateNewPassword({ password: 'password123', confirmation: 'password124' })).toEqual({
      confirmation: 'Les deux mots de passe ne correspondent pas.',
    });
    expect(validateNewPassword({ password: 'password123', confirmation: 'password123' })).toEqual({});
    expect(hasNewPasswordErrors({ confirmation: 'x' })).toBe(true);
    expect(hasNewPasswordErrors({})).toBe(false);
  });
});
