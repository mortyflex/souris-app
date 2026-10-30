# BeautIzzy — Account emails from beautizzy.fr (M2)

How the Supabase Auth emails (account confirmation, password recovery, email change) become French
BeautIzzy emails sent from `beautizzy.fr`. Part of milestone M2 (`docs/product/LAUNCH_ROADMAP.md`).

Nothing in this document is configured by the repository. Every step below is **manual**, done in
the order given, **Staging first, then Production**. Nothing here is assumed done: check each box
in the real dashboards.

---

## 1. Audit (30 October 2026, from the repository)

| Item | State in the repository | Consequence |
|---|---|---|
| Auth emails sent by | the Supabase built-in mailer (no SMTP configuration exists in the repo; `docs/release/TESTFLIGHT.md` §3) | default Supabase sender and English default templates, unless someone changed the Dashboard |
| Auth templates | none versioned before M2 → now `supabase/templates/auth/` | pasted by hand |
| Redirect URLs | `sourisapp://sign-in` documented; `sourisapp://reset-password` new in M2 | the recovery URL must be added (§5) |
| Client reminder emails | Resend, from the Edge Function secret `RESEND_FROM_EMAIL` (`supabase/README.md` › Resend secrets) | Resend is already the project's email provider; its sender domain is not recorded in the repo |
| Brand image for emails | `assets/brand/email/symbol-on-dark.png`, published through `SOURIS_EMAIL_LOGO_URL` (worker only) | the Auth templates use no image (§4) |
| `supabase/config.toml` | absent | the Dashboard is the only place Auth is configured |

The built-in mailer is for development: Supabase restricts it (low hourly rate limit, and recent
projects only deliver to the addresses of the organization's team members — check the notice in
Authentication › Emails). **A pilot's own address may therefore never receive a confirmation or a
recovery email until custom SMTP is configured.** This is the first external blocker of M2.

---

## 2. What the source code does (done) vs what stays manual

```text
Source code (implemented locally, M2)              Manual, outside the repository
──────────────────────────────────────────         ─────────────────────────────────────────────
« Mot de passe oublié ? » → recovery request       DNS records of beautizzy.fr (SPF, DKIM, DMARC)
PKCE client, sourisapp://reset-password landing    Domain verified in Resend
« Nouveau mot de passe » screen, link failures     Supabase custom SMTP (both projects)
French templates in supabase/templates/auth/       Templates + subjects pasted (both projects)
Template guard test (no raw token link)            Redirect URL allow-list (both projects)
Documentation (AUTH.md §4a, this file)             Auth email rate limit raised
                                                    RESEND_FROM_EMAIL moved to the domain
                                                    Real-device validation
```

No secret is in the repository and none is needed by the app: SMTP credentials live only in the
Supabase Dashboard; the Resend API key of the worker only in Edge Function secrets.

---

## 3. Sending domain: beautizzy.fr

Prerequisite: access to the DNS zone of `beautizzy.fr` (registrar or DNS host — not recorded in
the repo).

Recommended sender: `BeautIzzy <compte@beautizzy.fr>` for account emails. The client reminders
keep their own display name (« <business> via BeautIzzy ») and may use `rappels@beautizzy.fr`;
both can share the verified domain. A dedicated sending subdomain (e.g. `mail.beautizzy.fr`) is an
acceptable alternative if the root domain already sends other mail (a mailbox provider); decide
before step 1, because the DNS records depend on it.

Steps:

1. Resend › Domains › Add domain → `beautizzy.fr` (or the chosen subdomain), region EU.
2. Create at the DNS host **exactly** the records Resend displays — typically:
   - DKIM: a `TXT` record on `resend._domainkey`;
   - SPF / bounce: an `MX` and a `TXT` (`v=spf1 include:… ~all`) on the `send` subdomain Resend names.
   If the domain already has an SPF record on the same name, merge the `include:` into it: a name
   may hold only ONE SPF record.
3. Add DMARC (not created by Resend): `TXT` on `_dmarc.beautizzy.fr`, start in observation mode,
   e.g. `v=DMARC1; p=none; rua=mailto:<an address you read>`; move to `p=quarantine` once reports
   show only legitimate senders.
4. Wait until Resend shows the domain **Verified** (DNS propagation can take hours).
5. Send a test from Resend to a Gmail and an iCloud address; in « Afficher l’original », check
   `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`.

---

## 4. Templates (source of truth: `supabase/templates/auth/`)

| Supabase template | File | Subject |
|---|---|---|
| Confirm signup | `confirm-signup.html` | `Confirmez votre adresse email` |
| Reset password | `reset-password.html` | `Choisissez un nouveau mot de passe BeautIzzy` |
| Change email address | `change-email.html` | `Confirmez votre nouvelle adresse email` |

Rules (guarded by `src/infrastructure/supabase/__tests__/auth-email-templates.test.ts`):

- French, the same identity as the reminder emails (warm surface, white card, deep lavender
  `#654199`), email-safe inline styles, no image, no script;
- the only action is `{{ .ConfirmationURL }}`: Supabase verifies the link, then returns to the app
  with a one-time code (PKCE). Never replace it by a link built from `{{ .Token }}` or
  `{{ .TokenHash }}` — that would bypass the verification and the PKCE protection;
- the recovery email says to open the link on the phone that asked (the PKCE verifier lives
  there);
- the email-change template names both addresses. The app has no « change my email » screen yet:
  Supabase sends this email only if an email change is requested (a future account screen, or
  support). With « Secure email change » enabled, both addresses must confirm.

Paste: Supabase › Authentication › Emails › each template → Subject + Message body (the whole HTML
file, comment included) → Save. Repeat for Staging and Production. Other templates (Magic link,
Invite user, Reauthentication) are not used by the app; leave them untouched.

---

## 5. Supabase Dashboard (both projects)

1. Authentication › URL Configuration
   - Site URL: `sourisapp://sign-in` (unchanged);
   - Redirect URLs: `sourisapp://sign-in` **and** `sourisapp://reset-password`. A redirect that is
     not allow-listed silently falls back to the Site URL: the recovery link would then open
     « Se connecter » with nothing to do.
2. Authentication › Emails › SMTP Settings → Enable custom SMTP:
   - Sender email: `compte@beautizzy.fr` (a verified domain address); Sender name: `BeautIzzy`;
   - Host `smtp.resend.com`, port `465` (or `587`), username `resend`, password: a Resend API key
     created for this purpose (« Sending access », restricted to the domain) — a different key
     from the worker's `RESEND_API_KEY`, so either can be rotated alone.
3. Authentication › Rate Limits: raise « Rate limit for sending emails » to a pilot-compatible
   value (custom SMTP is required to change it). Keep the per-address recovery throttling: the app
   reports `RATE_LIMITED` in French.
4. Authentication › Sign In / Providers › Email: « Confirm email » stays enabled; leave « Email OTP
   expiration » at its default unless decided otherwise (the email does not quote a duration).
5. Authentication › Emails: the three templates of §4.

---

## 6. Client reminder emails

They already go through Resend (`RESEND_FROM_EMAIL`). Once the domain is verified, set
`RESEND_FROM_EMAIL` to an address of it (e.g. `rappels@beautizzy.fr`) in the Edge Function secrets
of each project (`supabase/README.md` › Resend secrets), if it is not already one. No code change.

---

## 7. Validation (Staging first, then Production)

Never on the pilot hairdresser's account or phone.

- [ ] sign-up with a non-team address → the French confirmation email arrives from
      `BeautIzzy <compte@beautizzy.fr>`, not in spam; SPF / DKIM / DMARC pass;
- [ ] the confirmation link opens BeautIzzy on « Se connecter » (app running, and app killed);
- [ ] « Mot de passe oublié ? » → the French recovery email arrives;
- [ ] the link opened on the same iPhone opens « Nouveau mot de passe » (app running, and app
      killed); a new password is saved; the app opens on the account's Business with its data;
- [ ] the old password is refused, the new one works after a sign-out;
- [ ] the same link opened a second time → « Ce lien a expiré »;
- [ ] a link from an earlier request, after a newer request → « Ce lien a expiré » or « Lien
      inutilisable », then « Demander un nouveau lien » works;
- [ ] the link opened on another device (computer) → no session there; on the phone, the next
      request still works;
- [ ] « Annuler » on « Nouveau mot de passe » → « Se connecter », the old password still works;
- [ ] link opened → « Nouveau mot de passe » → kill the app → relaunch: « Bienvenue » / sign-in,
      never the app; the old password still works; a new link is needed to reset;
- [ ] the same, relaunched in airplane mode: still never the app;
- [ ] an unknown address → the same « Si un compte existe… » screen;
- [ ] a reminder email (Staging) arrives from the verified domain.
