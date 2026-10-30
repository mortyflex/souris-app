import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { readRecoveryLink, type RecoveryLinkParams } from '@/features/auth/recovery-link';
import { ResetPasswordScreen } from '@/features/auth/ResetPasswordScreen';

// The landing of the password recovery email (sourisapp://reset-password).
export default function ResetPasswordRoute() {
  const { code, error, error_code } = useLocalSearchParams<{ code?: string; error?: string; error_code?: string }>();
  const link = useMemo(() => readRecoveryLink({ code, error, error_code } satisfies RecoveryLinkParams), [code, error, error_code]);
  return <ResetPasswordScreen link={link} />;
}
