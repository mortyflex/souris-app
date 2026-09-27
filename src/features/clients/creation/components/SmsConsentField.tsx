// Souris — Promotional SMS consent field (SMS pivot Phase 2)
//
// One quiet optional form row: the professional records the client's
// EXPRESSED choice about promotional SMS (birthday and win-back offers) —
// « Non renseigné » (the default), « Autorisés » or « Refusés ». No legal
// jargon, no separate consent flow, and « Non renseigné » is never treated
// as consent. When the client accepts SMS but has no texting-capable
// number, a concise informational line appears — it never blocks the form.

import { StyleSheet, View } from 'react-native';

import { communicationSmsPhoneIssue } from '@/domain/communications';
import type { ClientSmsMarketingConsentStatus } from '@/domain/clients';
import {
  SMS_CONSENT_FIELD_LABEL,
  SMS_CONSENT_OPTED_IN_LABEL,
  SMS_CONSENT_OPTED_OUT_LABEL,
  SMS_CONSENT_PHONE_NOTICE,
  SMS_CONSENT_UNKNOWN_LABEL,
} from '@/features/clients/presentation';
import { AppText } from '@/shared/ui/AppText';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { semanticColors, spacing } from '@/shared/ui/theme';

type ConsentOption = 'UNKNOWN' | ClientSmsMarketingConsentStatus;

interface SmsConsentFieldProps {
  readonly value: ClientSmsMarketingConsentStatus | undefined;
  /** The phone as currently typed in the form — drives the informational note only. */
  readonly phone: string;
  readonly onChange: (value: ClientSmsMarketingConsentStatus | undefined) => void;
}

export function SmsConsentField({ value, phone, onChange }: SmsConsentFieldProps) {
  const phoneIssue = communicationSmsPhoneIssue(phone.trim() || undefined);
  return (
    <View style={styles.field}>
      <AppText variant="metadata" style={styles.label}>
        {SMS_CONSENT_FIELD_LABEL}
      </AppText>
      <SegmentedControl<ConsentOption>
        onChange={(option) => onChange(option === 'UNKNOWN' ? undefined : option)}
        options={[
          { value: 'UNKNOWN', label: SMS_CONSENT_UNKNOWN_LABEL, testID: 'sms-consent-unknown' },
          { value: 'OPTED_IN', label: SMS_CONSENT_OPTED_IN_LABEL, testID: 'sms-consent-opted-in' },
          { value: 'OPTED_OUT', label: SMS_CONSENT_OPTED_OUT_LABEL, testID: 'sms-consent-opted-out' },
        ]}
        stretch
        testID="sms-consent-field"
        value={value ?? 'UNKNOWN'}
      />
      {value === 'OPTED_IN' && phoneIssue !== undefined && (
        <AppText variant="metadata" style={styles.notice} testID="sms-consent-phone-notice">
          {SMS_CONSENT_PHONE_NOTICE}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  label: { color: semanticColors.foregroundSoft },
  notice: { color: semanticColors.foregroundSoft },
});
