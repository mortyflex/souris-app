// BeautIzzy — Playground demo scenario: « Institut Beauté Démo » (development ONLY)
//
// A fictional beauty institute: botanical surnames, a « Démo » business. The
// catalogue is the ESTHETICS onboarding base, priced: the facial is the one
// TECHNIQUE (Application → Temps de pose → Finition — the mask sets while the
// professional is free), waxing, body treatment and eye beauty are SERVICES.
// Today's planning books a brow wax DURING a facial's pose.

import type { DemoScenarioDefinition } from './scenario';

export const ESTHETICS_DEMO: DemoScenarioDefinition = {
  activityType: 'ESTHETICS',
  businessName: 'Institut Beauté Démo',
  ownerFirstName: 'Clara',
  ownerLastName: 'Démo',
  phone: '06 00 00 00 03',
  prices: {
    facial: 65,
    'brow-wax': 12,
    'leg-wax': 32,
    'body-treatment': 75,
    'eye-beauty': 30,
  },
  clients: [
    {
      key: 'maya',
      firstName: 'Maya',
      lastName: 'Lotus',
      phone: '06 00 00 00 31',
      email: 'maya.lotus@exemple.fr',
      birthday: 'today',
      notes: 'Profil fictif (démonstration). Peau réactive : soin apaisant uniquement.',
    },
    { key: 'alice', firstName: 'Alice', lastName: 'Vanille', phone: '06 00 00 00 32', birthday: { month: 5, day: 27 } },
    { key: 'jade', firstName: 'Jade', lastName: 'Amande', email: 'jade.amande@exemple.fr' },
    { key: 'nour', firstName: 'Nour', lastName: 'Jasmin', phone: '06 00 00 00 34' },
    {
      key: 'elena',
      firstName: 'Elena',
      lastName: 'Sauge',
      phone: '06 00 00 00 35',
      notes: 'Épilation : cire tiède uniquement.',
    },
    { key: 'louise', firstName: 'Louise', lastName: 'Figue', email: 'louise.figue@exemple.fr', birthday: { month: 9, day: 3 } },
    { key: 'lucie', firstName: 'Lucie', lastName: 'Verveine', archived: true },
  ],
  appointments: [
    // History.
    { key: 'h1', client: 'maya', services: ['facial'], dayOffset: -24, hour: 10, minute: 0, outcome: 'PAID' },
    { key: 'h2', client: 'alice', services: ['leg-wax', 'brow-wax'], dayOffset: -18, hour: 14, minute: 0, outcome: 'PAID' },
    { key: 'h3', client: 'jade', services: ['body-treatment'], dayOffset: -14, hour: 15, minute: 0, outcome: 'PAID' },
    { key: 'h4', client: 'nour', services: ['eye-beauty'], dayOffset: -11, hour: 11, minute: 30, outcome: 'COMPLETED' },
    {
      key: 'h5',
      client: 'elena',
      services: ['facial'],
      dayOffset: -9,
      hour: 9,
      minute: 30,
      outcome: 'CANCELLED_BY_CLIENT',
      reason: 'Déplacement professionnel',
    },
    { key: 'h6', client: 'louise', services: ['brow-wax'], dayOffset: -6, hour: 17, minute: 0, outcome: 'NO_SHOW' },
    {
      key: 'h7',
      client: 'alice',
      services: ['facial'],
      dayOffset: -2,
      hour: 10,
      minute: 0,
      outcome: 'PAID',
      discount: { type: 'PERCENT', percent: 10 },
    },
    { key: 'h8', client: 'maya', services: ['brow-wax'], dayOffset: -1, hour: 16, minute: 30, outcome: 'PAID', paidBy: 'CASH' },
    // Today: a facial at 9:30 whose mask pose frees the professional for a brow wax at 10:15.
    { key: 't1', client: 'maya', services: ['facial'], dayOffset: 0, hour: 9, minute: 30, outcome: 'CONFIRMED' },
    { key: 't2', client: 'nour', services: ['brow-wax'], dayOffset: 0, hour: 10, minute: 15, outcome: 'SCHEDULED' },
    { key: 't3', client: 'jade', services: ['leg-wax'], dayOffset: 0, hour: 11, minute: 30, outcome: 'SCHEDULED' },
    {
      key: 't4',
      client: 'elena',
      services: ['body-treatment'],
      dayOffset: 0,
      hour: 14,
      minute: 0,
      outcome: 'SCHEDULED',
      notes: 'Gommage doux avant le soin.',
    },
    { key: 't5', client: 'louise', services: ['eye-beauty'], dayOffset: 0, hour: 16, minute: 30, outcome: 'SCHEDULED' },
    // Ahead.
    { key: 'f1', client: 'alice', services: ['brow-wax', 'eye-beauty'], dayOffset: 1, hour: 10, minute: 0, outcome: 'SCHEDULED' },
    { key: 'f2', client: 'nour', services: ['facial'], dayOffset: 2, hour: 14, minute: 0, outcome: 'CONFIRMED' },
    { key: 'f3', client: 'jade', services: ['body-treatment'], dayOffset: 4, hour: 15, minute: 0, outcome: 'SCHEDULED' },
    { key: 'f4', client: 'maya', services: ['leg-wax'], dayOffset: 5, hour: 11, minute: 0, outcome: 'SCHEDULED' },
    { key: 'f5', client: 'elena', services: ['facial'], dayOffset: 8, hour: 9, minute: 30, outcome: 'SCHEDULED' },
    {
      key: 'f6',
      client: 'louise',
      services: ['facial', 'brow-wax'],
      dayOffset: 11,
      hour: 10,
      minute: 0,
      outcome: 'CANCELLED_BY_BUSINESS',
      reason: 'Fermeture exceptionnelle de l’institut',
    },
  ],
};
