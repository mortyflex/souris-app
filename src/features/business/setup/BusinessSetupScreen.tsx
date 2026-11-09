// BeautIzzy — Onboarding (first run after authentication, NEW businesses only)
//
// Five guided steps on ONE route, driven by the pure step machine of
// onboarding-steps.ts — entered right after authentication (Welcome belongs
// to the first-entry experience, features/auth, and is never repeated here):
//
//   1. activity    the ONE primary activity (required) — only an AVAILABLE
//                  profession may be chosen (src/domain/business/professions.ts)
//   2. details     prénom *, nom, nom de l'activité *, téléphone
//   3. reminders   the optional EMAIL reminder opt-in (recommended)
//   4. services    the starter prestations proposed for the activity
//   5. complete    « On prépare votre espace… » (a short visual interlude,
//                  skipped under Reduced Motion), then the personalised
//                  recap, with the optional client import card:
//                  « Importer ma clientèle » → the app, then the existing
//                  import flow; « Accéder à mon espace » → the app
//
// The Business is created and bound EXACTLY ONCE, at the reminders decision
// (step 3), with the session's deferred entry: it exists remotely and
// locally from then on, the starter prestations are written against its id,
// and the app is entered only from the last step. Nothing before the
// creation can be revisited once it happened (no back from step 4 on, and
// no back on step 3 after a failed activation): a retry reuses the created
// Business — and the gateway reuses an ALREADY_EXISTS one — so a Business is
// never duplicated. A creation failure keeps the whole draft, and the
// professional may go back and correct it.
//
// Reminders are EMAIL reminders (the only client reminder channel sent
// today); activation is never claimed before the server accepted it. A
// failed activation shows a calm notice and leaves two ways on: retry, or
// continue with reminders OFF (the server default — « plus tard » saves
// nothing). Starter prestations are written through the normal Service
// store, with fresh identities, once: only the kept ones, never for an
// existing Business (which never mounts this screen).
//
// Two layers, one file:
//
//   BusinessSetupScreen   the route's screen: wires the FOUR effects of the
//                         flow to the real session (`useBusinessSetupActions`:
//                         the Business session, the communications gateway,
//                         the Service store, the account email);
//   BusinessSetupFlow     the five steps themselves — every piece of
//                         presentation and step logic, with NO provider
//                         dependency. It is what the development Playground
//                         mounts with in-memory actions to preview the
//                         onboarding of every profession, so the preview IS
//                         the real onboarding and never a copy of it
//                         (`src/features/playground`).
//
// When this task's follow-up adds the subscription gate, it slots in at root
// routing after `enterCreatedBusiness`: nothing here anticipates it.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';

import type { BusinessActivityType, BusinessProfile, BusinessSetupInput } from '@/domain/business';
import { isUsableCommunicationEmail } from '@/domain/communications';
import { contactEmailOf, isApplePrivateRelayEmail } from '@/features/auth/account-email';
import type { SocialProvider } from '@/features/auth/gateway';
import { useAuth } from '@/features/auth/session/AuthProvider';
import type { UpdateCommunicationPreferencesResult } from '@/features/communications/gateway';
import { useCommunicationsGateway } from '@/features/communications/session/CommunicationsGatewayProvider';
import { requestFirstArrival } from '@/features/home/first-steps/arrival';
import { startFirstSteps } from '@/features/home/first-steps/first-steps-store';
import { createServiceId, createServicePhaseId } from '@/features/services/editor/runtime-ids';
import { runInTransaction } from '@/persistence/database';
import { insertService } from '@/persistence/stores/services';
import { usePersistence } from '@/providers/PersistenceProvider';
import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { OnboardingStepLayout } from '@/shared/ui/OnboardingStepLayout';
import { TextField } from '@/shared/ui/TextField';
import { radii, rose, semanticColors, spacing } from '@/shared/ui/theme';

import { formatBusinessSessionFailure } from '../messages';
import { formatBusinessActivityType } from '../presentation';
import { useBusinessSession, type CreateBusinessOutcome } from '../session/BusinessSessionProvider';
import { getActivityIcon } from './activity-options';
import {
  buildBusinessSetupInput,
  EMPTY_BUSINESS_FORM,
  isValidBusinessForm,
  validateBusinessForm,
  type ActivityAcceptance,
  type BusinessFormValues,
} from './business-form';
import { ActivityOptionList } from './components/ActivityOptionList';
import { ReminderOptionCard } from './components/ReminderOptionCard';
import { SetupPreparation } from './components/SetupPreparation';
import { SetupRecap } from './components/SetupRecap';
import { StarterServiceList } from './components/StarterServiceList';
import { onboardingIllustrations } from './onboarding-illustrations';
import {
  canGoBack,
  getOnboardingProgress,
  nextOnboardingStep,
  previousOnboardingStep,
  type OnboardingStep,
} from './onboarding-steps';
import { buildStarterCatalog, getStarterServices, type StarterService } from './starter-services';

const ACTIVATION_FAILURE_TITLE = 'Impossible d’activer les rappels pour le moment.';
const ACTIVATION_FAILURE_BODY =
  'Votre activité a bien été créée, mais les rappels restent désactivés.';
const STARTER_WRITE_FAILURE = 'Impossible d’enregistrer ces prestations pour le moment. Réessayez.';
const CLIENT_IMPORT_CARD_TITLE = 'Retrouvez vos clients en quelques secondes';
const CLIENT_IMPORT_CARD_BODY =
  'Importez votre carnet depuis un fichier CSV ou une liste copiée. C’est facultatif : vous pourrez aussi le faire plus tard depuis Clientèle.';

/**
 * The FOUR effects of the five steps — everything that leaves the screen.
 * The product binds them to the real session (`useBusinessSetupActions`);
 * the development Playground binds them to memory. The flow never knows
 * which: it calls them at the same moments, in the same order.
 */
export interface BusinessSetupActions {
  /**
   * The signed-in account's email: the prefilled, editable reminders Reply-To.
   * Never an Apple private relay address (it would not receive client replies).
   */
  readonly accountEmail?: string;
  /** The first name the identity provider gave (Google, Apple): an editable suggestion only. */
  readonly accountGivenName?: string;
  /**
   * Set only for an account just created through Google or Apple: step 1 names
   * it and offers to change accounts, so a professional who already has
   * BeautIzzy under another address never builds a second Business by mistake.
   */
  readonly newSocialAccount?: {
    readonly provider: SocialProvider;
    readonly email?: string;
    readonly switchAccount: () => void;
  };
  /** Step 3: creates the Business ONCE (deferred entry). The outcome is the session's. */
  readonly createBusiness: (input: BusinessSetupInput) => Promise<CreateBusinessOutcome>;
  /**
   * Step 3, opt-in selected: saves the EMAIL reminder preference. Absent when
   * no communications gateway exists (unconfigured Supabase): the step then
   * shows the calm activation notice.
   */
  readonly activateReminders?: (
    businessId: string,
    replyToEmail: string,
  ) => Promise<UpdateCommunicationPreferencesResult>;
  /** Step 4: writes the kept starters for the Business and returns their count. Throws when the write fails. */
  readonly writeStarterServices: (business: BusinessProfile, kept: readonly StarterService[]) => number;
  /** Step 5: enters the created Business (the product), or leaves the preview (the Playground). */
  readonly enterBusiness: (business: BusinessProfile) => void;
  /**
   * Step 5, optional: enters the created Business and opens the EXISTING
   * client import over Accueil. Absent in the Playground preview, which
   * creates nothing to import into: the card is then not offered.
   */
  readonly importClients?: (business: BusinessProfile) => void;
}

/** The real effects: the Business session, the communications gateway, the Service store, the account. */
function useBusinessSetupActions(): BusinessSetupActions {
  const { createBusiness, enterCreatedBusiness } = useBusinessSession();
  const { state: auth, signOut } = useAuth();
  const { database, reloadSnapshot } = usePersistence();
  const communications = useCommunicationsGateway();
  const user = auth.status === 'authenticated' ? auth.user : undefined;
  const accountEmail = contactEmailOf(user?.email);
  const accountGivenName = user?.givenName;
  const createdWith = user?.createdWith;
  const signInEmail = user?.email;

  return useMemo<BusinessSetupActions>(
    () => ({
      accountEmail,
      accountGivenName,
      newSocialAccount:
        createdWith !== undefined
          ? { provider: createdWith, email: signInEmail, switchAccount: () => void signOut() }
          : undefined,
      createBusiness: (input) => createBusiness(input, { deferEntry: true }),
      activateReminders: communications
        ? (businessId, replyToEmail) =>
            communications.updatePreferences(businessId, { emailRemindersEnabled: true, replyToEmail })
        : undefined,
      writeStarterServices: (business, kept) => {
        const catalog = buildStarterCatalog(business.id, kept, {
          createServiceId,
          createPhaseId: createServicePhaseId,
        });
        // One transaction: either every kept prestation exists, or none does.
        runInTransaction(database, () => {
          for (const service of catalog) insertService(database, service);
        });
        // The (app) providers hydrate from the snapshot: it must know the new rows.
        reloadSnapshot();
        return catalog.length;
      },
      // Either way out offers the « Premiers pas » guide to THIS new Business.
      enterBusiness: (business) => {
        startFirstSteps(database, business.id);
        enterCreatedBusiness(business);
      },
      importClients: (business) => {
        startFirstSteps(database, business.id);
        requestFirstArrival('client-import');
        enterCreatedBusiness(business);
      },
    }),
    [
      accountEmail,
      accountGivenName,
      createdWith,
      signInEmail,
      signOut,
      communications,
      createBusiness,
      database,
      enterCreatedBusiness,
      reloadSnapshot,
    ],
  );
}

/** The onboarding route: the five steps bound to the real session. */
export function BusinessSetupScreen() {
  const actions = useBusinessSetupActions();
  return <BusinessSetupFlow actions={actions} />;
}

export interface BusinessSetupFlowProps {
  readonly actions: BusinessSetupActions;
  /**
   * Which activities may be chosen and completed with: the available
   * professions (the product, the default) — or every profession, for the
   * development Playground preview, whose actions never create a Business.
   */
  readonly activityAcceptance?: ActivityAcceptance;
  /** A preselected activity (the Playground preview); the product starts with none. */
  readonly initialActivityType?: BusinessActivityType;
  /** An uppercase eyebrow above every step title (the Playground: « Mode démonstration »). */
  readonly eyebrow?: string;
  /** A compact action at the end of every top bar (the Playground: « Quitter »). */
  readonly topBarEnd?: ReactNode;
  /** The title of the last step's way into the app; the product reads « Accéder à mon espace ». */
  readonly finishTitle?: string;
}

export function BusinessSetupFlow({
  actions,
  activityAcceptance = 'available-professions',
  initialActivityType,
  eyebrow,
  topBarEnd,
  finishTitle = 'Accéder à mon espace',
}: BusinessSetupFlowProps) {
  const previewing = activityAcceptance === 'every-profession';

  const [step, setStep] = useState<OnboardingStep>('activity');
  const [draft, setDraft] = useState<BusinessFormValues>(() => ({
    ...EMPTY_BUSINESS_FORM,
    activityType: initialActivityType ?? null,
  }));
  // A required field shows its error only once the professional typed in it.
  const [edited, setEdited] = useState<{ readonly ownerFirstName: boolean; readonly name: boolean }>({
    ownerFirstName: false,
    name: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // Reminders (step 3): the recommended opt-in is preselected; the Reply-To
  // is prefilled from the signed-in account and editable before activation.
  const [remindersSelected, setRemindersSelected] = useState(true);
  const [replyToDraft, setReplyToDraft] = useState<string>();
  const [replyToError, setReplyToError] = useState<string | null>(null);
  const [activationFailed, setActivationFailed] = useState(false);
  const [remindersEnabled, setRemindersEnabled] = useState(false);

  // Set once the Business exists remotely and locally; entry is deferred
  // until the last step. Never recreated on retry.
  const [createdBusiness, setCreatedBusiness] = useState<BusinessProfile>();

  // Starter prestations (step 4): the kept keys, and the count once written.
  const [selectedStarterKeys, setSelectedStarterKeys] = useState<ReadonlySet<string>>(new Set());
  const [starterServiceCount, setStarterServiceCount] = useState(0);
  // Written exactly once: a second press, however it arrives, writes nothing.
  const startersWritten = useRef(false);
  // The app is entered once: a second press of either last action does nothing.
  const entered = useRef(false);

  // The first name Google / Apple gave is a suggestion until the professional
  // types in the field (even to clear it). Derived, not copied: Apple's name
  // may reach the session just after this screen appeared.
  const values: BusinessFormValues =
    edited.ownerFirstName || actions.accountGivenName === undefined
      ? draft
      : { ...draft, ownerFirstName: actions.accountGivenName };
  const replyToValue = replyToDraft ?? actions.accountEmail ?? '';
  const errors = validateBusinessForm(values, activityAcceptance);
  const progress = getOnboardingProgress(step);
  const starters = useMemo(
    () => (createdBusiness ? getStarterServices(createdBusiness.activityType) : []),
    [createdBusiness],
  );
  const updateField = <Key extends keyof BusinessFormValues>(key: Key, value: BusinessFormValues[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    if (key === 'ownerFirstName' || key === 'name') setEdited((current) => ({ ...current, [key]: true }));
  };

  const goBack = () => {
    const previous = previousOnboardingStep(step);
    if (previous === undefined || !canGoBack(step, { businessCreated: createdBusiness !== undefined, submitting })) return;
    setFailure(null);
    setStep(previous);
  };
  const onBack = canGoBack(step, { businessCreated: createdBusiness !== undefined, submitting }) ? goBack : undefined;

  const advance = () => {
    haptics.action();
    setFailure(null);
    setStep(nextOnboardingStep(step));
  };

  /**
   * Creates and binds the Business ONCE, without entering the app yet.
   * A retry after a failure reuses the already-created Business (and the
   * gateway reuses an ALREADY_EXISTS one): never a duplicate.
   */
  const ensureBusinessCreated = async (): Promise<BusinessProfile | undefined> => {
    if (createdBusiness) return createdBusiness;
    const outcome = await actions.createBusiness(buildBusinessSetupInput(values, activityAcceptance));
    if (outcome.kind === 'created') {
      setCreatedBusiness(outcome.business);
      setSelectedStarterKeys(new Set(getStarterServices(outcome.business.activityType).map((starter) => starter.key)));
      return outcome.business;
    }
    haptics.warning();
    setFailure(formatBusinessSessionFailure(outcome.failure.code));
    return undefined;
  };

  /** « Plus tard » in every form: the Business is created, the server OFF default stands. */
  const continueWithoutReminders = async () => {
    if (submitting) return;
    haptics.action();
    setFailure(null);
    setSubmitting(true);
    const business = await ensureBusinessCreated();
    setSubmitting(false);
    if (!business) return;
    setRemindersEnabled(false);
    setStep('services');
  };

  /**
   * « Continuer » with the opt-in selected: the next step is reached ONLY
   * once the server accepted the preference. A failed save shows the calm
   * notice — the Business is kept (reminders simply stay OFF) and the
   * professional retries, or continues without reminders.
   */
  const activateReminders = async () => {
    if (submitting) return;
    const replyTo = replyToValue.trim();
    if (!isUsableCommunicationEmail(replyTo)) {
      setReplyToError('Adresse e-mail invalide.');
      haptics.warning();
      return;
    }
    haptics.action();
    setReplyToError(null);
    setFailure(null);
    setSubmitting(true);
    const business = await ensureBusinessCreated();
    if (!business) {
      setSubmitting(false);
      return;
    }
    try {
      const result = actions.activateReminders ? await actions.activateReminders(business.id, replyTo) : undefined;
      setSubmitting(false);
      if (result?.status === 'UPDATED') {
        setActivationFailed(false);
        setRemindersEnabled(true);
        setStep('services');
        return;
      }
      if (result?.status === 'INVALID_REPLY_TO') {
        setReplyToError('Adresse e-mail invalide.');
        haptics.warning();
        return;
      }
      // No gateway (unconfigured Supabase): same calm notice as a failure.
      setActivationFailed(true);
      haptics.warning();
    } catch {
      setSubmitting(false);
      setActivationFailed(true);
      haptics.warning();
    }
  };

  const continueFromReminders = () =>
    remindersSelected ? void activateReminders() : void continueWithoutReminders();

  const toggleStarter = (key: string) => {
    haptics.selection();
    setSelectedStarterKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /** Writes the kept starters once, through the normal Service store, then reaches the recap. */
  const addStarterServices = () => {
    if (submitting || !createdBusiness || startersWritten.current) return;
    const kept = starters.filter((starter) => selectedStarterKeys.has(starter.key));
    if (kept.length === 0) {
      continueWithoutStarters();
      return;
    }
    haptics.action();
    setFailure(null);
    setSubmitting(true);
    try {
      const count = actions.writeStarterServices(createdBusiness, kept);
      startersWritten.current = true;
      setStarterServiceCount(count);
      setSubmitting(false);
      setStep('complete');
    } catch {
      setSubmitting(false);
      setFailure(STARTER_WRITE_FAILURE);
      haptics.warning();
    }
  };

  const continueWithoutStarters = () => {
    if (submitting) return;
    haptics.action();
    setFailure(null);
    setStarterServiceCount(0);
    setStep('complete');
  };

  const enterApp = () => {
    if (!createdBusiness || entered.current) return;
    entered.current = true;
    haptics.action();
    actions.enterBusiness(createdBusiness);
  };

  const { importClients } = actions;
  const enterAndImportClients = importClients
    ? () => {
        if (!createdBusiness || entered.current) return;
        entered.current = true;
        haptics.action();
        importClients(createdBusiness);
      }
    : undefined;

  switch (step) {
    case 'activity':
      return (
        <OnboardingStepLayout
          footer={
            <AppButton
              disabled={values.activityType === null}
              onPress={advance}
              testID="continue-activity"
              title="Continuer"
            />
          }
          eyebrow={eyebrow}
          illustration={onboardingIllustrations.activity}
          onBack={onBack}
          progress={progress}
          subtitle="Choisissez celle qui correspond le mieux à votre quotidien."
          testID="onboarding-activity"
          title="Quelle est votre activité principale ?"
          topBarEnd={topBarEnd}
        >
          <ActivityOptionList
            comingSoonSelectable={previewing}
            onSelect={(activityType) => {
              haptics.selection();
              updateField('activityType', activityType);
            }}
            value={values.activityType}
          />
          {actions.newSocialAccount && <NewSocialAccountNotice account={actions.newSocialAccount} />}
        </OnboardingStepLayout>
      );

    case 'details':
      return (
        <DetailsStep
          edited={edited}
          errors={errors}
          eyebrow={eyebrow}
          onBack={onBack}
          onContinue={advance}
          onChange={updateField}
          progress={progress}
          topBarEnd={topBarEnd}
          valid={isValidBusinessForm(values, activityAcceptance)}
          values={values}
        />
      );

    case 'reminders':
      return (
        <OnboardingStepLayout
          footer={
            activationFailed ? (
              <>
                <AppButton
                  disabled={submitting}
                  onPress={() => void activateReminders()}
                  testID="retry-activate-reminders"
                  title={submitting ? 'Un instant…' : 'Réessayer'}
                />
                <AppButton
                  disabled={submitting}
                  onPress={() => void continueWithoutReminders()}
                  testID="continue-without-reminders"
                  title="Continuer sans les rappels"
                  variant="tertiary"
                />
              </>
            ) : (
              <>
                <AppButton
                  disabled={submitting}
                  onPress={continueFromReminders}
                  testID="continue-reminders"
                  title={submitting ? 'Un instant…' : 'Continuer'}
                />
                <AppButton
                  disabled={submitting}
                  onPress={() => void continueWithoutReminders()}
                  testID="skip-reminders"
                  title="Je préfère configurer ça plus tard"
                  variant="tertiary"
                />
              </>
            )
          }
          eyebrow={eyebrow}
          illustration={onboardingIllustrations.reminders}
          onBack={onBack}
          progress={progress}
          subtitle="BeautIzzy peut rappeler automatiquement vos rendez-vous à vos clients pour vous éviter d’y penser."
          testID="onboarding-reminders"
          title="Moins d’oublis, plus de tranquillité"
          topBarEnd={topBarEnd}
        >
          <ReminderOptionCard
            disabled={submitting || activationFailed}
            onToggle={() => {
              haptics.selection();
              setRemindersSelected((current) => !current);
              setReplyToError(null);
            }}
            selected={remindersSelected}
          />
          {remindersSelected && (
            <View style={styles.replyTo}>
              <TextField
                accessibilityLabel="Adresse de réponse"
                autoCapitalize="none"
                autoComplete="email"
                editable={!submitting}
                error={replyToError ?? undefined}
                keyboardType="email-address"
                label="Adresse de réponse"
                onChangeText={(text) => {
                  setReplyToDraft(text);
                  setReplyToError(null);
                }}
                placeholder="vous@exemple.fr"
                placement="page"
                testID="reminder-reply-to-input"
                textContentType="emailAddress"
                value={replyToValue}
              />
              <AppText style={styles.hint} variant="metadata">
                Les clients qui répondent à un rappel écrivent à cette adresse. Modifiable à tout moment
                dans les réglages.
              </AppText>
            </View>
          )}
          {activationFailed && (
            <View
              accessible
              accessibilityLabel={`${ACTIVATION_FAILURE_TITLE} ${ACTIVATION_FAILURE_BODY}`}
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
              style={styles.notice}
              testID="reminder-activation-failure"
            >
              <AppText style={styles.noticeTitle} variant="control">
                {ACTIVATION_FAILURE_TITLE}
              </AppText>
              <AppText style={styles.noticeBody} variant="metadata">
                {ACTIVATION_FAILURE_BODY}
              </AppText>
            </View>
          )}
          {failure && (
            <AppText accessibilityLiveRegion="polite" style={styles.failure} variant="metadata">
              {failure}
            </AppText>
          )}
        </OnboardingStepLayout>
      );

    case 'services': {
      const keptCount = starters.filter((starter) => selectedStarterKeys.has(starter.key)).length;
      return (
        <OnboardingStepLayout
          footer={
            <>
              {keptCount > 0 ? (
                <AppButton
                  disabled={submitting}
                  onPress={addStarterServices}
                  testID="add-starter-services"
                  title={submitting ? 'Un instant…' : 'Ajouter ces prestations'}
                />
              ) : (
                <AppButton
                  disabled={submitting}
                  onPress={continueWithoutStarters}
                  testID="continue-without-services"
                  title="Continuer sans prestations"
                />
              )}
              {starters.length > 0 && (
                <AppButton
                  disabled={submitting}
                  onPress={continueWithoutStarters}
                  testID="skip-starter-services"
                  title={'Je préfère ajouter mes prestations moi-\u2060même'}
                  variant="tertiary"
                />
              )}
            </>
          }
          eyebrow={eyebrow}
          illustration={onboardingIllustrations.services}
          progress={progress}
          subtitle="Nous vous proposons une base adaptée à votre activité. Vous pourrez tout modifier ensuite."
          testID="onboarding-services"
          title="Préparons vos premières prestations"
          topBarEnd={topBarEnd}
        >
          {starters.length > 0 ? (
            <>
              <StarterServiceList
                disabled={submitting}
                onToggle={toggleStarter}
                selectedKeys={selectedStarterKeys}
                starters={starters}
              />
              <AppText style={styles.hint} variant="metadata">
                Vous pourrez modifier, désactiver ou supprimer ces prestations à tout moment. Les tarifs
                sont à renseigner ensuite dans Prestations & tarifs.
              </AppText>
            </>
          ) : (
            <View style={styles.notice} testID="starter-services-none">
              <AppText style={styles.noticeTitle} variant="control">
                Aucune base proposée pour votre activité.
              </AppText>
              <AppText style={styles.noticeBody} variant="metadata">
                Vous ajouterez vos propres prestations dans Prestations & tarifs, quand vous le souhaitez.
              </AppText>
            </View>
          )}
          {failure && (
            <AppText accessibilityLiveRegion="polite" style={styles.failure} variant="metadata">
              {failure}
            </AppText>
          )}
        </OnboardingStepLayout>
      );
    }

    case 'complete':
      return (
        <CompleteStep
          activityType={createdBusiness?.activityType ?? values.activityType ?? 'OTHER'}
          eyebrow={eyebrow}
          finishTitle={finishTitle}
          onContinue={enterApp}
          onImportClients={enterAndImportClients}
          progress={progress}
          remindersEnabled={remindersEnabled}
          starterServiceCount={starterServiceCount}
          topBarEnd={topBarEnd}
        />
      );
  }
}

interface DetailsStepProps {
  readonly values: BusinessFormValues;
  readonly edited: { readonly ownerFirstName: boolean; readonly name: boolean };
  readonly errors: ReturnType<typeof validateBusinessForm>;
  readonly valid: boolean;
  readonly progress: ReturnType<typeof getOnboardingProgress>;
  readonly eyebrow?: string;
  readonly topBarEnd?: ReactNode;
  readonly onBack?: () => void;
  readonly onChange: <Key extends keyof BusinessFormValues>(key: Key, value: BusinessFormValues[Key]) => void;
  readonly onContinue: () => void;
}

/** Step 2: the business details, with the chosen activity recalled as a read-only chip. */
function DetailsStep({
  values,
  edited,
  errors,
  valid,
  progress,
  eyebrow,
  topBarEnd,
  onBack,
  onChange,
  onContinue,
}: DetailsStepProps) {
  const lastNameRef = useRef<TextInput>(null);
  const nameRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const activityType = values.activityType;

  return (
    <OnboardingStepLayout
      eyebrow={eyebrow}
      footer={<AppButton disabled={!valid} onPress={onContinue} testID="continue-details" title="Continuer" />}
      illustration={onboardingIllustrations.details}
      onBack={onBack}
      progress={progress}
      subtitle="Ces informations nous aideront à personnaliser votre espace BeautIzzy."
      testID="onboarding-details"
      title="Parlez-nous un peu de vous"
      topBarEnd={topBarEnd}
    >
      {activityType !== null && (
        <View
          accessible
          accessibilityLabel={`Activité principale : ${formatBusinessActivityType(activityType)}`}
          style={styles.activityChip}
          testID="selected-activity-chip"
        >
          <SymbolView name={getActivityIcon(activityType)} size={14} tintColor={semanticColors.accent} />
          <AppText style={styles.activityChipText} variant="chip">
            {formatBusinessActivityType(activityType)}
          </AppText>
        </View>
      )}
      <TextField
        accessibilityLabel="Prénom"
        autoCapitalize="words"
        autoComplete="given-name"
        error={edited.ownerFirstName ? errors.ownerFirstName : undefined}
        label="Prénom"
        onChangeText={(text) => onChange('ownerFirstName', text)}
        onSubmitEditing={() => lastNameRef.current?.focus()}
        placeholder="Ex. Sarah"
        placement="page"
        returnKeyType="next"
        submitBehavior="submit"
        testID="owner-first-name-input"
        textContentType="givenName"
        value={values.ownerFirstName}
      />
      <TextField
        accessibilityLabel="Nom, facultatif"
        autoCapitalize="words"
        autoComplete="family-name"
        inputRef={lastNameRef}
        label="Nom · facultatif"
        onChangeText={(text) => onChange('ownerLastName', text)}
        onSubmitEditing={() => nameRef.current?.focus()}
        placeholder="Ex. Martin"
        placement="page"
        returnKeyType="next"
        submitBehavior="submit"
        testID="owner-last-name-input"
        textContentType="familyName"
        value={values.ownerLastName}
      />
      <TextField
        accessibilityLabel="Nom de votre activité"
        autoCapitalize="words"
        autoComplete="organization"
        error={edited.name ? errors.name : undefined}
        inputRef={nameRef}
        label="Nom de votre activité"
        onChangeText={(text) => onChange('name', text)}
        onSubmitEditing={() => phoneRef.current?.focus()}
        placeholder="Ex. Studio Sarah"
        placement="page"
        returnKeyType="next"
        submitBehavior="submit"
        testID="business-name-input"
        textContentType="organizationName"
        value={values.name}
      />
      <TextField
        accessibilityLabel="Téléphone professionnel, facultatif"
        autoComplete="tel"
        inputRef={phoneRef}
        keyboardType="phone-pad"
        label="Téléphone professionnel · facultatif"
        onChangeText={(text) => onChange('phone', text)}
        placeholder="Ex. 06 12 34 56 78"
        placement="page"
        testID="business-phone-input"
        textContentType="telephoneNumber"
        value={values.phone}
      />
    </OnboardingStepLayout>
  );
}

interface CompleteStepProps {
  readonly activityType: BusinessProfile['activityType'];
  readonly remindersEnabled: boolean;
  readonly starterServiceCount: number;
  readonly progress: ReturnType<typeof getOnboardingProgress>;
  readonly eyebrow?: string;
  readonly topBarEnd?: ReactNode;
  readonly finishTitle: string;
  readonly onContinue: () => void;
  /** Absent: no client import card (the Playground preview). */
  readonly onImportClients?: () => void;
}

/**
 * Step 5: the « On prépare votre espace… » interlude, then the recap. The
 * interlude is purely visual — the Business, the reminders and the starters
 * are all settled before this step is reached — and it is never shown again:
 * nothing leaves this step but entering the app. Reduced Motion goes straight
 * to the recap.
 */
function CompleteStep(props: CompleteStepProps) {
  const reducedMotion = useReducedMotion();
  const [revealed, setRevealed] = useState(reducedMotion);
  if (!revealed) return <SetupPreparation onFinished={() => setRevealed(true)} />;
  return <SetupReady {...props} />;
}

/** The recap. ONE success haptic on its first appearance, never on a re-render. */
function SetupReady({
  activityType,
  remindersEnabled,
  starterServiceCount,
  progress,
  eyebrow,
  topBarEnd,
  finishTitle,
  onContinue,
  onImportClients,
}: CompleteStepProps) {
  const celebrated = useRef(false);
  useEffect(() => {
    if (celebrated.current) return;
    celebrated.current = true;
    haptics.success();
  }, []);

  return (
    <OnboardingStepLayout
      align="center"
      eyebrow={eyebrow}
      footer={
        onImportClients ? (
          <>
            <AppButton onPress={onImportClients} testID="import-clients" title="Importer ma clientèle" />
            <AppButton onPress={onContinue} testID="enter-app" title={finishTitle} variant="tertiary" />
          </>
        ) : (
          <AppButton onPress={onContinue} testID="enter-app" title={finishTitle} />
        )
      }
      illustration={onboardingIllustrations.complete}
      progress={progress}
      subtitle="Tout est en place pour vous aider à gérer votre activité plus simplement."
      testID="onboarding-complete"
      title="Votre espace BeautIzzy est prêt ✨"
      topBarEnd={topBarEnd}
    >
      <SetupRecap
        activityType={activityType}
        remindersEnabled={remindersEnabled}
        starterServiceCount={starterServiceCount}
      />
      {onImportClients && (
        <View
          accessible
          accessibilityLabel={`${CLIENT_IMPORT_CARD_TITLE}. ${CLIENT_IMPORT_CARD_BODY}`}
          style={styles.importCard}
          testID="client-import-card"
        >
          <View style={styles.importGlyph}>
            <SymbolView
              name={{ ios: 'person.2', android: 'group' }}
              size={18}
              tintColor={semanticColors.accent}
            />
          </View>
          <View style={styles.importCopy}>
            <AppText style={styles.importTitle} variant="control">
              {CLIENT_IMPORT_CARD_TITLE}
            </AppText>
            <AppText style={styles.noticeBody} variant="metadata">
              {CLIENT_IMPORT_CARD_BODY}
            </AppText>
          </View>
        </View>
      )}
    </OnboardingStepLayout>
  );
}

const styles = StyleSheet.create({
  activityChip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.xs + 2,
    minHeight: 28,
    paddingHorizontal: spacing.md,
  },
  activityChipText: { color: semanticColors.accent },
  replyTo: { gap: spacing.xs },
  hint: { color: semanticColors.foregroundSoft },
  // A calm informative notice — never red: the Business was created and
  // nothing was lost; only the optional activation is pending.
  notice: {
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    gap: spacing.xs,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  noticeTitle: { color: semanticColors.accent },
  // The optional client import offer of the recap: a quiet lavender card.
  importCard: {
    alignItems: 'flex-start',
    backgroundColor: semanticColors.surfaceLavender,
    borderColor: semanticColors.borderLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  importGlyph: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceElevated,
    borderRadius: radii.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  importCopy: { flex: 1, gap: 2, minWidth: 0 },
  importTitle: { color: semanticColors.foreground },
  noticeBody: { color: semanticColors.foregroundSoft },
  // Text on the app background: rose600 falls to ~4.3:1 there.
  failure: { color: rose.rose700 },
});

const SOCIAL_PROVIDER_NAMES: Record<SocialProvider, string> = { google: 'Google', apple: 'Apple' };

/**
 * Step 1 of an account just created with Google or Apple: which account is
 * signed in, and the way out BEFORE any Business exists. An Apple private
 * relay address is not named (it means nothing to the professional).
 */
function NewSocialAccountNotice({ account }: { readonly account: NonNullable<BusinessSetupActions['newSocialAccount']> }) {
  const provider = SOCIAL_PROVIDER_NAMES[account.provider];
  const shownEmail = account.email !== undefined && !isApplePrivateRelayEmail(account.email) ? account.email : undefined;
  return (
    <View style={noticeStyles.card} testID="onboarding-new-social-account">
      <AppText variant="metadata" style={noticeStyles.text}>
        {shownEmail
          ? `Nouveau compte créé avec ${provider} (${shownEmail}).`
          : `Nouveau compte créé avec ${provider}.`}{' '}
        Vous utilisez déjà BeautIzzy avec une autre adresse ? Changez de compte pour retrouver votre activité.
      </AppText>
      <AppButton
        onPress={account.switchAccount}
        style={noticeStyles.action}
        testID="onboarding-switch-account"
        title="Changer de compte"
        variant="tertiary"
      />
    </View>
  );
}

const noticeStyles = StyleSheet.create({
  card: {
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    gap: spacing.xs,
    marginTop: spacing.base,
    padding: spacing.base,
  },
  text: { color: semanticColors.foregroundSoft },
  action: { alignSelf: 'flex-start', marginHorizontal: -spacing.base, minHeight: 36 },
});
