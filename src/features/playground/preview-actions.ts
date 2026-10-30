// BeautIzzy — the in-memory effects of the onboarding preview (development ONLY) — pure
//
// The Playground mounts the REAL five-step flow (`BusinessSetupFlow`) and
// binds its four effects here instead of to the session: a « Business » that
// lives in this object only, a reminder activation that accepts at once, a
// starter write that counts and stores nothing, and two finishes — the
// product's « Accéder à mon espace » and « Importer ma clientèle » — that hand
// control back to the Playground with what the preview chose (it then opens
// the first-use demo, in memory too). Nothing is persisted, synced, scheduled,
// purchased or requested: no gateway, no database, no provider is involved,
// and the object is discarded with the preview.
//
// Every call is counted so the tests can prove what the preview did — and,
// above all, what it never did.

import type { BusinessProfile, BusinessSetupInput } from '@/domain/business';
import type { BusinessSetupActions } from '@/features/business/setup/BusinessSetupScreen';

/** The in-memory identifiers of a preview: obviously not a record of anything. */
export const PREVIEW_BUSINESS_ID = 'playground-preview-business';
export const PREVIEW_OWNER_USER_ID = 'playground-preview-owner';
/** The Reply-To the preview prefills where the product shows the account email. */
export const PREVIEW_ACCOUNT_EMAIL = 'demo@exemple.fr';

export interface PreviewSetupCalls {
  readonly createBusiness: readonly BusinessSetupInput[];
  readonly activateReminders: readonly { readonly businessId: string; readonly replyToEmail: string }[];
  readonly writeStarterServices: readonly { readonly businessId: string; readonly keptKeys: readonly string[] }[];
  readonly enterBusiness: readonly BusinessProfile[];
  readonly importClients: readonly BusinessProfile[];
}

/** How the preview ended, for the Playground to continue in a first-use demo. */
export interface PreviewFinish {
  readonly business: BusinessProfile;
  /** The starters kept at step 4: empty when none were added. */
  readonly keptStarterKeys: readonly string[];
  /** « Importer ma clientèle » rather than « Accéder à mon espace ». */
  readonly importClients: boolean;
}

export interface PreviewSetupActions extends BusinessSetupActions {
  /** What the flow asked for, in order — memory only. */
  readonly calls: PreviewSetupCalls;
}

export interface PreviewSetupOptions {
  /** Called by either last action: the Playground takes over (nothing is entered). */
  readonly onFinish: (finish: PreviewFinish) => void;
  readonly now?: () => Date;
}

export function createPreviewSetupActions({ onFinish, now = () => new Date() }: PreviewSetupOptions): PreviewSetupActions {
  const calls = {
    createBusiness: [] as BusinessSetupInput[],
    activateReminders: [] as { businessId: string; replyToEmail: string }[],
    writeStarterServices: [] as { businessId: string; keptKeys: string[] }[],
    enterBusiness: [] as BusinessProfile[],
    importClients: [] as BusinessProfile[],
  };
  const keptStarterKeys = () => calls.writeStarterServices.at(-1)?.keptKeys ?? [];

  return {
    calls,
    accountEmail: PREVIEW_ACCOUNT_EMAIL,
    createBusiness: async (input) => {
      calls.createBusiness.push(input);
      const at = now();
      return {
        kind: 'created',
        business: {
          id: PREVIEW_BUSINESS_ID,
          ownerUserId: PREVIEW_OWNER_USER_ID,
          ownerFirstName: input.ownerFirstName,
          ...(input.ownerLastName !== undefined && { ownerLastName: input.ownerLastName }),
          name: input.name,
          activityType: input.activityType,
          ...(input.phone !== undefined && { phone: input.phone }),
          createdAt: at,
          updatedAt: at,
        },
      };
    },
    activateReminders: async (businessId, replyToEmail) => {
      calls.activateReminders.push({ businessId, replyToEmail });
      return { status: 'UPDATED', preferences: { emailRemindersEnabled: true, replyToEmail } };
    },
    writeStarterServices: (business, kept) => {
      calls.writeStarterServices.push({ businessId: business.id, keptKeys: kept.map((starter) => starter.key) });
      return kept.length;
    },
    enterBusiness: (business) => {
      calls.enterBusiness.push(business);
      onFinish({ business, keptStarterKeys: keptStarterKeys(), importClients: false });
    },
    importClients: (business) => {
      calls.importClients.push(business);
      onFinish({ business, keptStarterKeys: keptStarterKeys(), importClients: true });
    },
  };
}
