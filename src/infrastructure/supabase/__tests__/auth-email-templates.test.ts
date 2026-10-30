// BeautIzzy — the Supabase Auth email templates stay pasteable and safe (source-level guard)
//
// They live in supabase/templates/auth and are pasted BY HAND into the
// Dashboard (docs/release/AUTH_EMAILS.md). Every link goes through
// {{ .ConfirmationURL }}: Supabase verifies the link first, then returns to the
// app with a one-time code (PKCE). A link built from {{ .TokenHash }} or
// {{ .Token }} would bypass that, so none may appear.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const TEMPLATES_DIR = join(__dirname, '..', '..', '..', '..', 'supabase', 'templates', 'auth');
const read = (name: string) => readFileSync(join(TEMPLATES_DIR, name), 'utf8');

const TEMPLATES = [
  { file: 'confirm-signup.html', button: 'Confirmer mon adresse' },
  { file: 'reset-password.html', button: 'Choisir un nouveau mot de passe' },
  { file: 'change-email.html', button: 'Confirmer la nouvelle adresse' },
] as const;

describe('Supabase Auth email templates', () => {
  it.each(TEMPLATES)('$file is a French BeautIzzy email whose only action is the verified link', ({ file, button }) => {
    const html = read(file);
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain('BeautIzzy');
    expect(html).toContain(`<a href="{{ .ConfirmationURL }}"`);
    expect(html).toContain(button);
    // Only Supabase's verified link: no raw token, no other destination.
    expect(html).not.toMatch(/\{\{\s*\.(TokenHash|Token|RedirectTo)\s*\}\}/);
    expect(html.match(/href="([^"]*)"/g)).toEqual(['href="{{ .ConfirmationURL }}"']);
    // Email-safe: no script, no external stylesheet, no remote image to break.
    expect(html).not.toMatch(/<script|<link |<img /i);
  });

  it('tells the professional to open the recovery link on the phone that asked (PKCE)', () => {
    expect(read('reset-password.html')).toContain('sur le téléphone depuis lequel vous avez fait la demande');
  });

  it('names both addresses on an email change', () => {
    const html = read('change-email.html');
    expect(html).toContain('{{ .NewEmail }}');
    expect(html).toContain('{{ .Email }}');
  });
});
