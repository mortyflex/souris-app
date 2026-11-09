import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { AuthCallbackScreen } from '@/features/auth/AuthCallbackScreen';
import { readOAuthCallback, type OAuthCallbackParams } from '@/features/auth/oauth-callback';

// The landing of « Continuer avec Google » (sourisapp://auth-callback).
export default function AuthCallbackRoute() {
  const { code, error, error_code } = useLocalSearchParams<{ code?: string; error?: string; error_code?: string }>();
  const callback = useMemo(() => readOAuthCallback({ code, error, error_code } satisfies OAuthCallbackParams), [code, error, error_code]);
  return <AuthCallbackScreen callback={callback} />;
}
