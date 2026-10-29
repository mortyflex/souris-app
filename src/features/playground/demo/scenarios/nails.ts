// BeautIzzy — Playground demo scenario: « Atelier Ongles Démo » (development ONLY)
//
// A fictional nail studio: gemstone surnames, a « Démo » business. The
// catalogue is the NAILS onboarding base, priced — every prestation a SERVICE
// with one duration (a lamp cure lasts seconds; the technician stays), except
// « Dépose par dissolution »: 10 min of wraps, 10 min of waiting while they
// soak (the technician is free), 15 min of removal and finishing. Long sets
// and infills shape the day; nail art and repairs are quick add-ons booked
// together with a set.
//
// Retail (Step B2): nail and hand care from a fictional « Marque Démo » —
// cuticle oil and hand cream sell best; one product is nearly out of stock,
// a seasonal polish is inactive.

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
    'soak-off': 20,
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
    'soak-off': 'removal',
    'nail-art': 'art',
  },
  descriptions: {
    'gel-full-set': 'Pose de capsules ou chablons, gel de construction et couleur.\nLimage et soin des cuticules inclus.',
    removal: 'Dépose d’un gel posé dans un autre salon : prévoir 15 minutes de plus.',
    'soak-off':
      'Gel ou semi-permanent retiré au dissolvant, sans ponçage.\nPendant le temps d’attente, les papillotes agissent seules : la professionnelle peut s’occuper de quelqu’un d’autre.',
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
  products: [
    { key: 'cuticle-oil', name: 'Huile cuticules', brand: 'Marque Démo', category: 'Soins des ongles', barcode: '2000000000024', price: 12, initialStock: 15 },
    { key: 'base', name: 'Base fortifiante', brand: 'Marque Démo', category: 'Soins des ongles', price: 15, initialStock: 6 },
    { key: 'hand-cream', name: 'Crème mains karité', brand: 'Marque Démo', category: 'Mains et pieds', price: 14, initialStock: 10 },
    { key: 'foot-cream', name: 'Crème pieds réparatrice', brand: 'Marque Démo', category: 'Mains et pieds', price: 16, initialStock: 4 },
    { key: 'file', name: 'Lime en verre', brand: 'Marque Démo', category: 'Accessoires', price: 9, initialStock: 3 },
    { key: 'summer-polish', name: 'Vernis édition été', brand: 'Marque Démo', category: 'Vernis', price: 11, initialStock: 0, inactive: true },
  ],
  sales: [
    { key: 's1', client: 'zoe', dayOffset: -16, hour: 17, minute: 45, lines: [{ product: 'cuticle-oil', quantity: 1 }] },
    {
      key: 's2',
      dayOffset: -10,
      hour: 12,
      minute: 0,
      lines: [
        { product: 'hand-cream', quantity: 1 },
        { product: 'file', quantity: 1 },
      ],
      paidBy: 'CASH',
    },
    { key: 's3', client: 'yasmine', dayOffset: -6, hour: 15, minute: 20, lines: [{ product: 'hand-cream', quantity: 2 }] },
    { key: 's4', client: 'lina', dayOffset: -3, hour: 18, minute: 0, lines: [{ product: 'cuticle-oil', quantity: 1 }], paidBy: 'CASH' },
    { key: 's5', minutesAgo: 25, lines: [{ product: 'file', quantity: 1 }] },
  ],
  appointments: [
    // A studio that started recording four weeks ago: NOTHING older than 27 days,
    // so the history never reaches the 1st of the previous month and the Caisse
    // offers no month comparison — whatever the day the demo is opened. Still
    // enough earlier history for Tops & tendances to rank loyal clients.
    { key: 'h0a', client: 'lina', services: ['gel-infill'], dayOffset: -27, hour: 10, minute: 0, outcome: 'PAID' },
    { key: 'h0b', client: 'manon', services: ['semi-permanent-hands'], dayOffset: -25, hour: 14, minute: 0, outcome: 'PAID', paidBy: 'CASH' },
    { key: 'h0c', client: 'sarah', services: ['semi-permanent-feet'], dayOffset: -23, hour: 11, minute: 0, outcome: 'PAID' },
    // History.
    {
      key: 'h1',
      client: 'lina',
      services: ['gel-full-set'],
      dayOffset: -19,
      hour: 10,
      minute: 0,
      outcome: 'PAID',
      products: [{ product: 'cuticle-oil', quantity: 1 }],
    },
    {
      key: 'h2',
      client: 'manon',
      services: ['semi-permanent-hands', 'nail-art'],
      dayOffset: -21,
      hour: 14,
      minute: 0,
      outcome: 'PAID',
      discount: { type: 'FIXED', amountCents: 500 },
      products: [{ product: 'base', quantity: 1 }],
    },
    { key: 'h3', client: 'lina', services: ['gel-infill'], dayOffset: -14, hour: 10, minute: 0, outcome: 'PAID', paidBy: 'CASH' },
    { key: 'h4', client: 'chloe', services: ['semi-permanent-feet'], dayOffset: -12, hour: 16, minute: 0, outcome: 'COMPLETED' },
    { key: 'h5', client: 'emma', services: ['gel-full-set'], dayOffset: -8, hour: 9, minute: 30, outcome: 'NO_SHOW' },
    {
      key: 'h6',
      client: 'sarah',
      services: ['removal', 'semi-permanent-hands'],
      dayOffset: -5,
      hour: 11,
      minute: 0,
      outcome: 'PAID',
      products: [{ product: 'foot-cream', quantity: 1 }],
    },
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
    // A soak-off removal before a new semi-permanent: 12:00 → 13:20, waiting 12:10 → 12:20.
    {
      key: 't6',
      client: 'yasmine',
      services: ['soak-off', 'semi-permanent-hands'],
      dayOffset: 0,
      hour: 12,
      minute: 0,
      outcome: 'SCHEDULED',
    },
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
