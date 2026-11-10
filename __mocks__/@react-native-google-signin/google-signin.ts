// BeautIzzy — Jest manual mock of @react-native-google-signin/google-signin
//
// The package resolves its native TurboModule when imported, which Jest does
// not have. Jest picks up a root `__mocks__/<package>` automatically, so every
// test that imports the Supabase wiring gets this inert stand-in; tests of the
// device adapter drive these functions directly. Application code never
// imports this file.

type NativeError = Error & { code: string };

export const statusCodes = Object.freeze({
  SIGN_IN_CANCELLED: '12501',
  IN_PROGRESS: 'ASYNC_OP_IN_PROGRESS',
  PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  SIGN_IN_REQUIRED: '4',
  NULL_PRESENTER: 'NULL_PRESENTER',
});

export const GoogleSignin = {
  configure: jest.fn(),
  hasPlayServices: jest.fn(async () => true),
  signIn: jest.fn(async () => ({ type: 'cancelled', data: null })),
  signOut: jest.fn(async () => null),
};

export function isErrorWithCode(error: unknown): error is NativeError {
  return typeof error === 'object' && error !== null && 'code' in error;
}

export function isCancelledResponse(response: { readonly type: string }): boolean {
  return response.type === 'cancelled';
}

export function isSuccessResponse(response: { readonly type: string }): boolean {
  return response.type === 'success';
}
