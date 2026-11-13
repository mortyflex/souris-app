import "server-only";

/**
 * Server-only environment contract.
 *
 * `server-only` makes the build fail if a Client Component ever imports this
 * module, so a secret can never reach the browser bundle. Secrets are read
 * lazily, at the moment a server module needs one, never at import time.
 *
 * Nothing calls this yet: no privileged database operation exists in this
 * sprint. Future server modules (booking reads and writes) import from here.
 */

export class MissingServerEnvError extends Error {
  constructor(name: string) {
    // The variable NAME only: a value must never appear in a message or a log.
    super(`Missing server environment variable: ${name}`);
    this.name = "MissingServerEnvError";
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new MissingServerEnvError(name);
  return value;
}

export const serverEnv = {
  /** Supabase SECRET key for the booking server modules. Never prefixed NEXT_PUBLIC_. */
  supabaseSecretKey: () => required("SUPABASE_SECRET_KEY"),
} as const;
