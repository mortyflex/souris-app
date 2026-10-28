// BeautIzzy — Playground demo scenario: « Atelier Ongles Démo » (development ONLY)
//
// A fictional nail studio: gemstone surnames, a « Démo » business. The
// catalogue is the NAILS onboarding base, priced — every prestation a SERVICE
// with one duration (a lamp cure lasts seconds; the technician stays). Long
// sets and infills shape the day; nail art and repairs are quick add-ons
// booked together with a set.

import type { DemoScenarioDefinition } from './scenario';

export const NAILS_DEMO: DemoScenarioDefinition = {
  activityType: 'NAILS',
  businessName: 'Atelier Ongles Démo',
  ownerFirstName: 'Zoé',
  ownerLastName: 'Démo',
  phone: '06 00 00 00 02',
  prices: {
    'gel-full-set': 55,
    'gel-infill': 42,
    'semi-permanent-hands': 35,
    'semi-permanent-feet': 38,
    removal: 15,
    'nail-art': 10,
    'nail-repair': 8,
  },
  // Step 3: the professional's own categories — « Réparation d’un ongle » stays « Sans catégorie ».
  categories: [
    { key: 'natural', name: 'Ongles naturels', description: 'Semi-permanent sur l’ongle naturel, sans rallongement.' },
    { key: 'gel', name: 'Extensions et poses en gel' },
    { key: 'infill', name: 'Remplissages', description: 'À prévoir toutes les 3 à 4 semaines.' },
    { key: 'feet', name: 'Beauté des pieds' },
    { key: 'removal', name: 'Déposes' },
    { key: 'art', name: 'Nail art et modèles' },
  ],
  serviceCategories: {
    'semi-permanent-hands': 'natural',
    'gel-full-set': 'gel',
    'gel-infill': 'infill',
    'semi-permanent-feet': 'feet',
    removal: 'removal',
    'nail-art': 'art',
  },
  descriptions: {
    'gel-full-set': 'Pose de capsules ou chablons, gel de construction et couleur.\nLimage et soin des cuticules inclus.',
    removal: 'Dépose d’un gel posé dans un autre salon : prévoir 15 minutes de plus.',
    'nail-art': 'Jusqu’à deux ongles décorés. Au-delà, sur devis.',
  },
  clients: [
    {
      key: 'lina',
      firstName: 'Lina',
      lastName: 'Saphir',
      phone: '06 00 00 00 21',
      email: 'lina.saphir@exemple.fr',
      birthday: 'today',
      notes: 'Profil fictif (démonstration). Remplissage toutes les 3 semaines.',
    },
    { key: 'zoe', firstName: 'Zoé', lastName: 'Opale', phone: '06 00 00 00 22' },
    {
      key: 'manon',
      firstName: 'Manon',
      lastName: 'Ambre',
      phone: '06 00 00 00 23',
      notes: 'Ongles fins : base renforçante systématique.',
      birthday: { month: 7, day: 21 },
    },
    { key: 'chloe', firstName: 'Chloé', lastName: 'Jade', email: 'chloe.jade@exemple.fr' },
    { key: 'emma', firstName: 'Emma', lastName: 'Corail', phone: '06 00 00 00 25' },
    { key: 'sarah', firstName: 'Sarah', lastName: 'Onyx', phone: '06 00 00 00 26', birthday: { month: 1, day: 9 } },
    { key: 'yasmine', firstName: 'Yasmine', lastName: 'Topaze', email: 'yasmine.topaze@exemple.fr' },
    { key: 'rosalie', firstName: 'Rosalie', lastName: 'Quartz', archived: true },
  ],
  appointments: [
    // History.
    { key: 'h1', client: 'lina', services: ['gel-full-set'], dayOffset: -28, hour: 10, minute: 0, outcome: 'PAID' },
    {
      key: 'h2',
      client: 'manon',
      services: ['semi-permanent-hands', 'nail-art'],
      dayOffset: -21,
      hour: 14,
      minute: 0,
      outcome: 'PAID',
      discount: { type: 'FIXED', amountCents: 500 },
    },
    { key: 'h3', client: 'lina', services: ['gel-infill'], dayOffset: -14, hour: 10, minute: 0, outcome: 'PAID', paidBy: 'CASH' },
    { key: 'h4', client: 'chloe', services: ['semi-permanent-feet'], dayOffset: -12, hour: 16, minute: 0, outcome: 'COMPLETED' },
    { key: 'h5', client: 'emma', services: ['gel-full-set'], dayOffset: -8, hour: 9, minute: 30, outcome: 'NO_SHOW' },
    { key: 'h6', client: 'sarah', services: ['removal', 'semi-permanent-hands'], dayOffset: -5, hour: 11, minute: 0, outcome: 'PAID' },
    {
      key: 'h7',
      client: 'zoe',
      services: ['semi-permanent-hands'],
      dayOffset: -4,
      hour: 15,
      minute: 30,
      outcome: 'CANCELLED_BY_CLIENT',
      reason: 'Malade',
    },
    { key: 'h8', client: 'chloe', services: ['nail-repair'], dayOffset: -1, hour: 12, minute: 30, outcome: 'PAID' },
    // Today.
    { key: 't1', client: 'lina', services: ['gel-infill', 'nail-art'], dayOffset: 0, hour: 9, minute: 0, outcome: 'CONFIRMED' },
    { key: 't2', client: 'manon', services: ['semi-permanent-hands'], dayOffset: 0, hour: 10, minute: 45, outcome: 'SCHEDULED' },
    {
      key: 't3',
      client: 'emma',
      services: ['gel-full-set'],
      dayOffset: 0,
      hour: 13,
      minute: 30,
      outcome: 'SCHEDULED',
      notes: 'Forme amande, longueur moyenne.',
    },
    { key: 't4', client: 'sarah', services: ['semi-permanent-feet'], dayOffset: 0, hour: 15, minute: 30, outcome: 'SCHEDULED' },
    { key: 't5', client: 'zoe', services: ['nail-repair'], dayOffset: 0, hour: 17, minute: 0, outcome: 'SCHEDULED' },
    // Ahead.
    { key: 'f1', client: 'chloe', services: ['removal', 'gel-full-set'], dayOffset: 1, hour: 10, minute: 0, outcome: 'SCHEDULED' },
    { key: 'f2', client: 'yasmine', services: ['semi-permanent-hands'], dayOffset: 2, hour: 14, minute: 0, outcome: 'CONFIRMED' },
    { key: 'f3', client: 'manon', services: ['gel-infill'], dayOffset: 3, hour: 9, minute: 30, outcome: 'SCHEDULED' },
    { key: 'f4', client: 'lina', services: ['semi-permanent-feet'], dayOffset: 6, hour: 16, minute: 0, outcome: 'SCHEDULED' },
    { key: 'f5', client: 'emma', services: ['gel-infill'], dayOffset: 8, hour: 11, minute: 0, outcome: 'SCHEDULED' },
    {
      key: 'f6',
      client: 'sarah',
      services: ['gel-full-set'],
      dayOffset: 13,
      hour: 14,
      minute: 0,
      outcome: 'SCHEDULED',
      discount: { type: 'PERCENT', percent: 10 },
    },
    {
      key: 'f7',
      client: 'yasmine',
      services: ['gel-infill'],
      dayOffset: 10,
      hour: 9,
      minute: 30,
      outcome: 'CANCELLED_BY_BUSINESS',
      reason: 'Journée de formation',
    },
  ],
};
