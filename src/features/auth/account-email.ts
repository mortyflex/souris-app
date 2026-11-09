// BeautIzzy — what an account's email address can be used for (pure)
//
// « Masquer mon adresse e-mail » gives an Apple account a private relay
// address. It identifies the account, but Apple forwards to it only the
// mail of senders registered for this app: a client replying to a reminder
// would never reach the professional. It is never proposed as a contact
// address (the reminders Reply-To), and never compared with another account's
// address — accounts are told apart by their user id only.

const APPLE_PRIVATE_RELAY_DOMAIN = '@privaterelay.appleid.com';

export function isApplePrivateRelayEmail(email: string | undefined): boolean {
  return email !== undefined && email.trim().toLowerCase().endsWith(APPLE_PRIVATE_RELAY_DOMAIN);
}

/** The account email worth proposing as a contact address, if any. */
export function contactEmailOf(email: string | undefined): string | undefined {
  return email !== undefined && !isApplePrivateRelayEmail(email) ? email : undefined;
}
