// Souris — Development client seed
//
// The clients genuinely used by the current Agenda appointment fixtures.
// Their ids match the clientId values already referenced by those fixtures,
// so Appointment → Client resolution is coherent without renaming any
// validated fixture scenario.

import type { Client } from '@/domain/clients';

export const developmentClients: readonly Client[] = [
  { id: 'client-agenda-lea', firstName: 'Léa', lastName: 'Martin' },
  { id: 'client-agenda-camille', firstName: 'Camille', lastName: 'Durand' },
  { id: 'client-agenda-ines', firstName: 'Inès', lastName: 'Bernard' },
  { id: 'client-agenda-sofia', firstName: 'Sofia', lastName: 'Petit' },
  { id: 'client-agenda-nadia', firstName: 'Nadia', lastName: 'Roy' },
  { id: 'client-agenda-elodie', firstName: 'Élodie', lastName: 'Moreau' },
  { id: 'client-agenda-hugo', firstName: 'Hugo', lastName: 'Lefèvre' },
  { id: 'client-agenda-julie', firstName: 'Julie', lastName: 'Garcia' },
  { id: 'client-agenda-anais', firstName: 'Anaïs', lastName: 'Petit' },
];
