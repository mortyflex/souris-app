// BeautIzzy — Playground demo scenario: « Institut Beauté Démo » (development ONLY)
//
// A fictional beauty institute: botanical surnames, a « Démo » business. The
// catalogue is the ESTHETICS onboarding base, priced: the facial is the one
// TECHNIQUE (« Soin du visage avec masque »: 20 min cleansing and mask, 15 min
// Temps d’attente while the mask sets and the professional is free, 25 min
// removal and finishing — 1 h), waxing, body treatment and eye beauty are
// SERVICES. Today's planning books a brow wax DURING the facial's waiting time.
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
    facial:
      'Nettoyage, masque adapté à votre peau, puis retrait, massage et finition.\nPendant le temps d’attente du masque, la professionnelle peut s’occuper de quelqu’un d’autre.\nVenir sans maquillage si possible.',
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
    // The previous calendar month, anchored on fixed days: a BUSIER month than the
    // current one whatever the day the demo is opened, so the Caisse shows a FALL
    // (its elapsed span always collects more than this month to date — except on
    // the 1st before the 9:00 appointment below has its counterpart). Tops &
    // tendances also finds loyal clients here.
    { key: 'p1', client: 'jade', services: ['body-treatment'], monthsAgo: 1, dayOfMonth: 1, hour: 9, minute: 0, outcome: 'PAID' },
    { key: 'p2', client: 'maya', services: ['facial', 'eye-beauty'], monthsAgo: 1, dayOfMonth: 2, hour: 14, minute: 0, outcome: 'PAID' },
    { key: 'p3', client: 'alice', services: ['leg-wax', 'brow-wax'], monthsAgo: 1, dayOfMonth: 5, hour: 11, minute: 0, outcome: 'PAID', paidBy: 'CASH' },
    { key: 'p4', client: 'elena', services: ['facial'], monthsAgo: 1, dayOfMonth: 9, hour: 10, minute: 0, outcome: 'PAID' },
    { key: 'p5', client: 'nour', services: ['body-treatment', 'leg-wax'], monthsAgo: 1, dayOfMonth: 13, hour: 15, minute: 0, outcome: 'PAID' },
    { key: 'p6', client: 'jade', services: ['facial', 'brow-wax'], monthsAgo: 1, dayOfMonth: 18, hour: 14, minute: 0, outcome: 'PAID', paidBy: 'CASH' },
    { key: 'p7', client: 'louise', services: ['body-treatment'], monthsAgo: 1, dayOfMonth: 24, hour: 10, minute: 0, outcome: 'PAID' },
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
    // Today: a facial at 9:30 whose mask (9:50 → 10:05) frees the professional for a brow wax at 9:50.
    { key: 't1', client: 'maya', services: ['facial'], dayOffset: 0, hour: 9, minute: 30, outcome: 'CONFIRMED' },
    { key: 't2', client: 'nour', services: ['brow-wax'], dayOffset: 0, hour: 9, minute: 50, outcome: 'SCHEDULED' },
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
