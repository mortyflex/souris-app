// Souris — client import copy
//
// Every visible string of the import review lives here: counts, issue and
// duplicate explanations, the import button, result messages. Neutral
// « client » wording (DESIGN_OVERRIDES.md §38). Details quote the pasted text
// back to the professional on screen only — never logged, never stored.

import { formatClientBirthday, getClientDisplayName, type Client } from '@/domain/clients';
import type {
  ClassifiedClientImportCandidate,
  ClientImportCandidate,
  ClientImportCsvFailure,
  ClientImportIssue,
} from '@/domain/clients/import';

import type { ClientImportFailureCode } from './run-client-import';

export function pluralClients(count: number): string {
  return count === 1 ? '1 client' : `${count} clients`;
}

export function detectedTitle(count: number): string {
  if (count === 0) return 'Aucun client détecté';
  return count === 1 ? '1 client détecté' : `${count} clients détectés`;
}

export function importButtonTitle(count: number): string {
  return count === 0 ? 'Aucun client sélectionné' : `Importer ${pluralClients(count)}`;
}

/**
 * The folded exact duplicates. Neutral on purpose: a duplicate may match an
 * earlier line of the same list, not only a saved Client — the expanded
 * cards say which.
 */
export function exactDuplicatesSummary(count: number): string {
  return count === 1 ? '1 doublon détecté — ignoré' : `${count} doublons détectés — ignorés`;
}

export function importedClientsTitle(count: number): string {
  return count === 1 ? '1 client importé' : `${count} clients importés`;
}

/**
 * The one short line under an imported client in the result summary: what
 * the Client was created with — phone · email, else the birthday — or
 * undefined when it holds nothing but a name (no placeholder).
 */
export function importedClientDetail(client: Client): string | undefined {
  const contact = [client.phone, client.email].filter(Boolean).join(' · ');
  if (contact) return contact;
  return client.birthday ? `Anniversaire : ${formatClientBirthday(client.birthday)}` : undefined;
}

/** Why a picked file gave nothing to review — always a way forward, never a technical error. */
export type ClientImportCsvProblem = ClientImportCsvFailure | 'UNREADABLE' | 'TOO_LARGE' | 'NO_CLIENT';

export function csvProblemMessage(problem: ClientImportCsvProblem): string {
  switch (problem) {
    case 'UNREADABLE':
      return 'Impossible de lire ce fichier. Réessayez ou choisissez-en un autre.';
    case 'TOO_LARGE':
      return 'Ce fichier est trop volumineux. Choisissez un fichier CSV plus léger.';
    case 'NOT_TEXT':
      return 'Ce fichier n’est pas un fichier CSV. Depuis Excel, Numbers ou Google Sheets, exportez votre liste au format CSV.';
    case 'EMPTY':
      return 'Ce fichier est vide. Choisissez-en un autre.';
    case 'NO_CLIENT':
      return 'Aucun client détecté dans ce fichier. Choisissez-en un autre.';
  }
}

export function unreadLinesLabel(lines: readonly string[]): string {
  return lines.length === 1
    ? `Ligne ignorée (rien à importer) : ${lines[0]}`
    : `Lignes ignorées (rien à importer) : ${lines.join(', ')}`;
}

export function candidateDisplayName(candidate: ClientImportCandidate): string {
  const name = `${candidate.firstName ?? ''} ${candidate.lastName ?? ''}`.trim();
  return name.length > 0 ? name : 'Prénom manquant';
}

export function issueLabel(issue: ClientImportIssue): string {
  const detail = issue.detail ? ` : ${issue.detail}` : '';
  switch (issue.code) {
    case 'MISSING_FIRST_NAME':
      return 'Prénom manquant';
    case 'INVALID_EMAIL':
      return 'Email invalide';
    case 'UNRECOGNIZED_PHONE':
      return 'Numéro à vérifier';
    case 'AMBIGUOUS_NAME_SPLIT':
      return 'Nom à vérifier';
    case 'AMBIGUOUS_BIRTHDAY':
      return `Anniversaire à vérifier${detail}`;
    case 'BIRTHDAY_DROPPED':
      return `Date ignorée${detail}`;
    case 'EXTRA_PHONES':
      return `Autres numéros ignorés${detail}`;
    case 'EXTRA_EMAILS':
      return `Autres emails ignorés${detail}`;
    case 'IGNORED_TEXT':
      return `Texte ignoré${detail}`;
  }
}

/** Why a duplicate is one, naming the existing client or the earlier row. */
export function matchLabel(
  entry: ClassifiedClientImportCandidate,
  clientsById: ReadonlyMap<string, Client>,
  candidatesByKey: ReadonlyMap<string, ClientImportCandidate>,
): string | undefined {
  const match = entry.match;
  if (!match) return undefined;
  const target = match.target;
  let name: string;
  if (target.kind === 'CLIENT') {
    const client = clientsById.get(target.clientId);
    name = client ? getClientDisplayName(client) : 'un client existant';
    if (target.archived) name = `${name} (archivé)`;
  } else {
    const earlier = candidatesByKey.get(target.candidateKey);
    name = earlier ? `${candidateDisplayName(earlier)}, plus haut dans la liste` : 'plus haut dans la liste';
  }
  switch (match.reason) {
    case 'PHONE':
      return `Même numéro que ${name}`;
    case 'EMAIL':
      return `Même email que ${name}`;
    case 'NAME':
      return `Même nom que ${name}`;
    case 'PHONE_LAST_DIGITS':
      return `Numéro proche de ${name}`;
    case 'PHONE_EMAIL_CONFLICT':
      return `Numéro de ${name}, email d’un autre client`;
  }
}

export function failureMessage(failure: ClientImportFailureCode): string {
  switch (failure) {
    case 'NOT_BOUND':
      return 'Votre compte n’est pas encore prêt. Réessayez dans un instant.';
    case 'WRITE_FAILED':
      return 'L’enregistrement a échoué. Vos clients déjà importés sont conservés.';
  }
}
