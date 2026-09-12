import { useLocalSearchParams } from 'expo-router';

import { VerifyEmailScreen } from '@/features/auth/VerifyEmailScreen';

export default function VerifyEmailRoute() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  return <VerifyEmailScreen email={email ?? ''} />;
}
