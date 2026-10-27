// BeautIzzy — Playground demo scenario: « Studio Coiffure Démo » (development ONLY)
//
// A fictional single-professional hair studio. Every client carries a plant
// surname and the business a « Démo » name, so nothing can be mistaken for a
// real record. The catalogue is the HAIRDRESSING onboarding base, priced:
// cuts and blow-dries (SERVICE), colouring, balayage, gloss and care
// (TECHNIQUE: Application → Temps de pose → Finition, the professional free
// during the pose). Today's planning deliberately books a cut DURING a
// colour's processing time, the way a real studio works.

import type { DemoScenarioDefinition } from './scenario';

export const HAIRDRESSING_DEMO: DemoScenarioDefinition = {
  activityType: 'HAIRDRESSING',
  businessName: 'Studio Coiffure Démo',
  ownerFirstName: 'Camille',
  ownerLastName: 'Démo',
  phone: '06 00 00 00 01',
  prices: {
    'cut-women': 45,
    'blow-dry': 28,
    'cut-blow-dry': 62,
    color: 68,
    balayage: 120,
    gloss: 35,
    'cut-men': 26,
    care: 22,
  },
  clients: [
    {
      key: 'lea',
      firstName: 'Léa',
      lastName: 'Lavande',
      phone: '06 00 00 00 11',
      email: 'lea.lavande@exemple.fr',
      birthday: 'today',
      notes: 'Profil fictif (démonstration). Préfère les rendez-vous du matin.',
    },
    { key: 'ines', firstName: 'Inès', lastName: 'Pivoine', phone: '06 00 00 00 12', birthday: { month: 3, day: 14 } },
    { key: 'sofia', firstName: 'Sofia', lastName: 'Jasmin', email: 'sofia.jasmin@exemple.fr' },
    {
      key: 'nadia',
      firstName: 'Nadia',
      lastName: 'Orchidée',
      phone: '06 00 00 00 14',
      notes: 'Cuir chevelu sensible : test de la couleur 48 h avant.',
    },
    { key: 'camille', firstName: 'Camille', lastName: 'Bleuet', phone: '06 00 00 00 15' },
    { key: 'hugo', firstName: 'Hugo', lastName: 'Romarin', phone: '06 00 00 00 16', birthday: { month: 11, day: 2 } },
    { key: 'julie', firstName: 'Julie', lastName: 'Mimosa', email: 'julie.mimosa@exemple.fr' },
    { key: 'amelie', firstName: 'Amélie', lastName: 'Tulipe', archived: true },
  ],
  appointments: [
    // History: three weeks of activity, every outcome represented.
    { key: 'h1', client: 'lea', services: ['color', 'cut-women'], dayOffset: -21, hour: 9, minute: 0, outcome: 'PAID' },
    { key: 'h2', client: 'sofia', services: ['balayage'], dayOffset: -14, hour: 10, minute: 0, outcome: 'PAID' },
    { key: 'h3', client: 'hugo', services: ['cut-men'], dayOffset: -14, hour: 14, minute: 30, outcome: 'PAID', paidBy: 'CASH' },
    { key: 'h4', client: 'ines', services: ['cut-blow-dry'], dayOffset: -10, hour: 11, minute: 0, outcome: 'COMPLETED' },
    { key: 'h5', client: 'nadia', services: ['color'], dayOffset: -7, hour: 9, minute: 30, outcome: 'NO_SHOW' },
    {
      key: 'h6',
      client: 'camille',
      services: ['blow-dry'],
      dayOffset: -6,
      hour: 17,
      minute: 0,
      outcome: 'CANCELLED_BY_CLIENT',
      reason: 'Empêchement de dernière minute',
    },
    {
      key: 'h7',
      client: 'julie',
      services: ['cut-women', 'care'],
      dayOffset: -3,
      hour: 15,
      minute: 0,
      outcome: 'PAID',
      discount: { type: 'PERCENT', percent: 10 },
    },
    { key: 'h8', client: 'lea', services: ['blow-dry'], dayOffset: -1, hour: 12, minute: 0, outcome: 'PAID' },
    // Today: a colour at 9:00 whose pose frees the professional for a men's cut at 9:30.
    { key: 't1', client: 'ines', services: ['color'], dayOffset: 0, hour: 9, minute: 0, outcome: 'SCHEDULED' },
    { key: 't2', client: 'hugo', services: ['cut-men'], dayOffset: 0, hour: 9, minute: 30, outcome: 'CONFIRMED' },
    { key: 't3', client: 'sofia', services: ['cut-blow-dry'], dayOffset: 0, hour: 11, minute: 0, outcome: 'SCHEDULED' },
    {
      key: 't4',
      client: 'nadia',
      services: ['balayage', 'gloss'],
      dayOffset: 0,
      hour: 14,
      minute: 30,
      outcome: 'SCHEDULED',
      notes: 'Patine froide, comme la dernière fois.',
    },
    { key: 't5', client: 'camille', services: ['blow-dry'], dayOffset: 0, hour: 17, minute: 30, outcome: 'SCHEDULED' },
    // Ahead: the next two weeks.
    { key: 'f1', client: 'julie', services: ['care', 'blow-dry'], dayOffset: 1, hour: 10, minute: 0, outcome: 'SCHEDULED' },
    { key: 'f2', client: 'lea', services: ['cut-women'], dayOffset: 1, hour: 15, minute: 0, outcome: 'CONFIRMED' },
    { key: 'f3', client: 'sofia', services: ['gloss'], dayOffset: 2, hour: 11, minute: 0, outcome: 'SCHEDULED' },
    { key: 'f4', client: 'hugo', services: ['cut-men'], dayOffset: 4, hour: 18, minute: 0, outcome: 'SCHEDULED' },
    {
      key: 'f5',
      client: 'nadia',
      services: ['color'],
      dayOffset: 4,
      hour: 9,
      minute: 0,
      outcome: 'SCHEDULED',
      discount: { type: 'FIXED', amountCents: 500 },
    },
    { key: 'f6', client: 'ines', services: ['balayage'], dayOffset: 7, hour: 14, minute: 0, outcome: 'SCHEDULED' },
    {
      key: 'f7',
      client: 'camille',
      services: ['cut-blow-dry'],
      dayOffset: 9,
      hour: 10,
      minute: 30,
      outcome: 'CANCELLED_BY_BUSINESS',
      reason: 'Fermeture exceptionnelle du studio',
    },
    { key: 'f8', client: 'julie', services: ['cut-women'], dayOffset: 12, hour: 16, minute: 0, outcome: 'SCHEDULED' },
  ],
};
