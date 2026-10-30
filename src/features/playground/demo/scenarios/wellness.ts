// BeautIzzy — Playground demo scenario: « Espace Bien-être Démo » (development ONLY)
//
// A fictional wellness practice: mineral surnames, a « Démo » business. The
// catalogue is the WELLNESS onboarding base, priced: every prestation is a
// SERVICE with one duration — the practitioner stays with the client from
// start to finish, so no appointment of the day overlaps another. The menu is
// priced by length (30 min, 1 h, 1 h 30), grouped in the professional's own
// categories.
//
// Retail: massage and relaxation products from a fictional « Marque Démo » —
// oils, a balm, candles; one product is inactive.

import type { DemoScenarioDefinition } from './scenario';

export const WELLNESS_DEMO: DemoScenarioDefinition = {
  activityType: 'WELLNESS',
  businessName: 'Espace Bien-être Démo',
  ownerFirstName: 'Inès',
  ownerLastName: 'Démo',
  phone: '06 00 00 00 04',
  prices: {
    'relaxing-30': 40,
    'relaxing-60': 70,
    'relaxing-90': 100,
    back: 40,
    feet: 35,
    'hot-stones': 90,
    'body-scrub': 45,
  },
  categories: [
    { key: 'relaxing', name: 'Massages relaxants', description: 'Huiles neutres ou parfumées, au choix.' },
    { key: 'targeted', name: 'Massages ciblés' },
    { key: 'signature', name: 'Soins signature' },
    { key: 'gift', name: 'Bons cadeaux' },
  ],
  serviceCategories: {
    'relaxing-30': 'relaxing',
    'relaxing-60': 'relaxing',
    'relaxing-90': 'relaxing',
    back: 'targeted',
    feet: 'targeted',
    'hot-stones': 'signature',
    'body-scrub': 'signature',
  },
  descriptions: {
    'relaxing-60': 'Massage du corps entier aux huiles. Prévoir une tenue confortable.',
    'hot-stones': 'Pierres de basalte chauffées, posées puis utilisées pendant le massage.',
    'body-scrub': 'Gommage au sucre, puis application d’une huile nourrissante.',
  },
  clients: [
    {
      key: 'chloe',
      firstName: 'Chloé',
      lastName: 'Quartz',
      phone: '06 00 00 00 41',
      email: 'chloe.quartz@exemple.fr',
      birthday: 'today',
      notes: 'Profil fictif (démonstration). Préfère une pression légère.',
    },
    { key: 'sarah', firstName: 'Sarah', lastName: 'Ambre', phone: '06 00 00 00 42', birthday: { month: 4, day: 12 } },
    { key: 'paul', firstName: 'Paul', lastName: 'Jade', email: 'paul.jade@exemple.fr' },
    { key: 'lina', firstName: 'Lina', lastName: 'Opale', phone: '06 00 00 00 44' },
    {
      key: 'marc',
      firstName: 'Marc',
      lastName: 'Silex',
      phone: '06 00 00 00 45',
      notes: 'Tensions au niveau des épaules.',
    },
    { key: 'emma', firstName: 'Emma', lastName: 'Agate', email: 'emma.agate@exemple.fr', birthday: { month: 11, day: 21 } },
    { key: 'rose', firstName: 'Rose', lastName: 'Perle', archived: true },
  ],
  products: [
    { key: 'oil', name: 'Huile de massage neutre', brand: 'Marque Démo', category: 'Huiles', barcode: '2000000000041', price: 18, initialStock: 10 },
    { key: 'scented-oil', name: 'Huile relaxante lavande', brand: 'Marque Démo', category: 'Huiles', price: 24, initialStock: 6 },
    { key: 'balm', name: 'Baume chauffant', brand: 'Marque Démo', category: 'Soins', price: 21, initialStock: 4 },
    { key: 'candle', name: 'Bougie de massage', brand: 'Marque Démo', category: 'Ambiance', price: 26, initialStock: 5 },
    { key: 'gift-box', name: 'Coffret détente (édition passée)', brand: 'Marque Démo', category: 'Coffrets', price: 49, initialStock: 0, inactive: true },
  ],
  sales: [
    { key: 's1', client: 'paul', dayOffset: -12, hour: 17, minute: 0, lines: [{ product: 'balm', quantity: 1 }] },
    {
      key: 's2',
      dayOffset: -7,
      hour: 12,
      minute: 15,
      lines: [
        { product: 'candle', quantity: 1 },
        { product: 'oil', quantity: 1 },
      ],
      paidBy: 'CASH',
    },
    { key: 's3', client: 'emma', dayOffset: -3, hour: 18, minute: 30, lines: [{ product: 'scented-oil', quantity: 1 }] },
    { key: 's4', minutesAgo: 40, lines: [{ product: 'oil', quantity: 1 }], paidBy: 'CASH' },
  ],
  appointments: [
    // The previous calendar month, anchored on fixed days (stable Caisse comparisons).
    { key: 'p1', client: 'sarah', services: ['relaxing-60'], monthsAgo: 1, dayOfMonth: 3, hour: 10, minute: 0, outcome: 'PAID' },
    { key: 'p2', client: 'marc', services: ['back'], monthsAgo: 1, dayOfMonth: 7, hour: 18, minute: 0, outcome: 'PAID', paidBy: 'CASH' },
    { key: 'p3', client: 'chloe', services: ['hot-stones'], monthsAgo: 1, dayOfMonth: 12, hour: 14, minute: 0, outcome: 'PAID' },
    { key: 'p4', client: 'lina', services: ['relaxing-90'], monthsAgo: 1, dayOfMonth: 19, hour: 11, minute: 0, outcome: 'PAID' },
    { key: 'p5', client: 'paul', services: ['feet', 'back'], monthsAgo: 1, dayOfMonth: 25, hour: 17, minute: 0, outcome: 'PAID' },
    // History.
    {
      key: 'h1',
      client: 'chloe',
      services: ['relaxing-60'],
      dayOffset: -20,
      hour: 10,
      minute: 0,
      outcome: 'PAID',
      products: [{ product: 'scented-oil', quantity: 1 }],
    },
    { key: 'h2', client: 'marc', services: ['back'], dayOffset: -15, hour: 18, minute: 0, outcome: 'PAID', paidBy: 'CASH' },
    { key: 'h3', client: 'sarah', services: ['body-scrub', 'relaxing-30'], dayOffset: -11, hour: 14, minute: 0, outcome: 'PAID' },
    { key: 'h4', client: 'lina', services: ['feet'], dayOffset: -9, hour: 12, minute: 0, outcome: 'COMPLETED' },
    {
      key: 'h5',
      client: 'emma',
      services: ['relaxing-90'],
      dayOffset: -6,
      hour: 15,
      minute: 0,
      outcome: 'CANCELLED_BY_CLIENT',
      reason: 'Enfant malade',
    },
    { key: 'h6', client: 'paul', services: ['back'], dayOffset: -4, hour: 19, minute: 0, outcome: 'NO_SHOW' },
    {
      key: 'h7',
      client: 'sarah',
      services: ['hot-stones'],
      dayOffset: -2,
      hour: 11,
      minute: 0,
      outcome: 'PAID',
      discount: { type: 'PERCENT', percent: 10 },
      products: [{ product: 'candle', quantity: 1 }],
    },
    { key: 'h8', client: 'chloe', services: ['feet'], dayOffset: -1, hour: 17, minute: 30, outcome: 'PAID', paidBy: 'CASH' },
    // Today: one client at a time, with a short break between two massages.
    { key: 't1', client: 'chloe', services: ['relaxing-60'], dayOffset: 0, hour: 9, minute: 30, outcome: 'CONFIRMED' },
    { key: 't2', client: 'marc', services: ['back'], dayOffset: 0, hour: 11, minute: 0, outcome: 'SCHEDULED' },
    { key: 't3', client: 'lina', services: ['hot-stones'], dayOffset: 0, hour: 14, minute: 0, outcome: 'SCHEDULED' },
    {
      key: 't4',
      client: 'emma',
      services: ['body-scrub', 'relaxing-30'],
      dayOffset: 0,
      hour: 16,
      minute: 0,
      outcome: 'SCHEDULED',
      notes: 'Première visite.',
    },
    // Ahead.
    { key: 'f1', client: 'sarah', services: ['relaxing-90'], dayOffset: 1, hour: 10, minute: 0, outcome: 'SCHEDULED' },
    { key: 'f2', client: 'paul', services: ['feet'], dayOffset: 2, hour: 18, minute: 0, outcome: 'CONFIRMED' },
    { key: 'f3', client: 'marc', services: ['back'], dayOffset: 5, hour: 18, minute: 30, outcome: 'SCHEDULED' },
    { key: 'f4', client: 'chloe', services: ['hot-stones'], dayOffset: 7, hour: 14, minute: 0, outcome: 'SCHEDULED' },
    { key: 'f5', client: 'lina', services: ['relaxing-60'], dayOffset: 9, hour: 11, minute: 0, outcome: 'SCHEDULED' },
    {
      key: 'f6',
      client: 'emma',
      services: ['relaxing-60'],
      dayOffset: 12,
      hour: 15,
      minute: 0,
      outcome: 'CANCELLED_BY_BUSINESS',
      reason: 'Formation de la praticienne',
    },
  ],
};
