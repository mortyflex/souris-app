// BeautIzzy — Playground demo scenario: « Institut Beauté Démo » (development ONLY)
//
// A fictional beauty institute: botanical surnames, a « Démo » business. The
// catalogue is the ESTHETICS onboarding base, priced: the facial is the one
// TECHNIQUE (Application → Temps de pose → Finition — the mask sets while the
// professional is free), waxing, body treatment and eye beauty are SERVICES.
// Today's planning books a brow wax DURING a facial's pose.
//
// Retail (Step B2): face and body care from a fictional « Marque Démo » — a
// cleanser, a moisturiser, a serum, body care; one product is inactive.

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
  // Step 3: categories, one of them still empty (the management screen shows it).
  categories: [
    { key: 'face', name: 'Soins du visage' },
    { key: 'wax', name: 'Épilations', description: 'Cire tiède ou cire froide selon la zone.' },
    { key: 'body', name: 'Soins du corps' },
    { key: 'eyes', name: 'Beauté du regard' },
    { key: 'hands-feet', name: 'Beauté des mains et des pieds' },
  ],
  serviceCategories: {
    facial: 'face',
    'brow-wax': 'wax',
    'leg-wax': 'wax',
    'body-treatment': 'body',
    'eye-beauty': 'eyes',
  },
  descriptions: {
    facial: 'Nettoyage, gommage, masque adapté à votre peau et massage.\nVenir sans maquillage si possible.',
    'leg-wax': 'Jambes complètes. Éviter le soleil et le gommage 24 h avant.',
    'eye-beauty': 'Teinture des cils et des sourcils, restructuration incluse.',
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
  products: [
    { key: 'cleanser', name: 'Gel nettoyant douceur', brand: 'Marque Démo', category: 'Visage', barcode: '2000000000031', price: 19, initialStock: 9 },
    { key: 'moisturizer', name: 'Crème hydratante', brand: 'Marque Démo', category: 'Visage', price: 32, initialStock: 7 },
    { key: 'serum', name: 'Sérum éclat', brand: 'Marque Démo', category: 'Visage', price: 39, initialStock: 4 },
    { key: 'body-oil', name: 'Huile sèche corps', brand: 'Marque Démo', category: 'Corps', price: 27, initialStock: 6 },
    { key: 'scrub', name: 'Gommage corps sucré', brand: 'Marque Démo', category: 'Corps', price: 22, initialStock: 3 },
    { key: 'gift-box', name: 'Coffret fêtes (édition passée)', brand: 'Marque Démo', category: 'Coffrets', price: 45, initialStock: 0, inactive: true },
  ],
  sales: [
    {
      key: 's1',
      client: 'jade',
      dayOffset: -13,
      hour: 16,
      minute: 0,
      lines: [
        { product: 'body-oil', quantity: 1 },
        { product: 'scrub', quantity: 1 },
      ],
    },
    { key: 's2', dayOffset: -8, hour: 12, minute: 30, lines: [{ product: 'cleanser', quantity: 1 }], paidBy: 'CASH' },
    { key: 's3', client: 'louise', dayOffset: -4, hour: 18, minute: 15, lines: [{ product: 'moisturizer', quantity: 1 }] },
    { key: 's4', minutesAgo: 55, lines: [{ product: 'cleanser', quantity: 1 }], paidBy: 'CASH' },
  ],
  appointments: [
    // Earlier history, so Tops & tendances has loyal clients to rank.
    { key: 'h0a', client: 'maya', services: ['facial'], dayOffset: -45, hour: 10, minute: 0, outcome: 'PAID' },
    { key: 'h0b', client: 'alice', services: ['leg-wax'], dayOffset: -38, hour: 14, minute: 0, outcome: 'PAID', paidBy: 'CASH' },
    { key: 'h0c', client: 'jade', services: ['eye-beauty'], dayOffset: -31, hour: 11, minute: 0, outcome: 'PAID' },
    // History.
    {
      key: 'h1',
      client: 'maya',
      services: ['facial'],
      dayOffset: -24,
      hour: 10,
      minute: 0,
      outcome: 'PAID',
      products: [
        { product: 'serum', quantity: 1 },
        { product: 'moisturizer', quantity: 1 },
      ],
    },
    { key: 'h2', client: 'alice', services: ['leg-wax', 'brow-wax'], dayOffset: -18, hour: 14, minute: 0, outcome: 'PAID' },
    {
      key: 'h3',
      client: 'jade',
      services: ['body-treatment'],
      dayOffset: -14,
      hour: 15,
      minute: 0,
      outcome: 'PAID',
      products: [{ product: 'body-oil', quantity: 1 }],
    },
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
      products: [{ product: 'cleanser', quantity: 1 }],
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
