// Souris — shared persistence test fixtures (never imported by app code)

import type { Appointment, Service } from '@/domain/appointments';
import type { Client } from '@/domain/clients';
import type { Product } from '@/domain/products';

import type { FirstRunSeed } from '../seed';

export const BUSINESS_ID = 'business-test';

export const clientLea: Client = {
  id: 'client-lea',
  firstName: 'Léa',
  lastName: 'Martin',
  phone: '06 12 34 56 78',
  birthday: { month: 2, day: 29 },
};

export const serviceColor: Service = {
  id: 'service-color',
  businessId: BUSINESS_ID,
  name: 'Coloration',
  type: 'TECHNIQUE',
  price: 95,
  active: true,
  phases: [
    { id: 'color-application', name: 'Application', durationMinutes: 15, requiresStaff: true },
    { id: 'color-processing', name: 'Temps de pose', durationMinutes: 35, requiresStaff: false },
    { id: 'color-rinse', name: 'Rinçage', durationMinutes: 25, requiresStaff: true },
  ],
};

export const serviceCut: Service = {
  id: 'service-cut',
  businessId: BUSINESS_ID,
  name: 'Coupe',
  type: 'SERVICE',
  price: 42,
  active: true,
  phases: [{ id: 'cut', name: 'Coupe', durationMinutes: 45, requiresStaff: true }],
};

export const appointmentLea: Appointment = {
  id: 'appointment-lea',
  businessId: BUSINESS_ID,
  clientId: clientLea.id,
  staffMemberId: 'staff-amelie',
  startAt: new Date(2026, 8, 11, 9, 30),
  status: 'SCHEDULED',
  notes: 'Racines uniquement',
  items: [
    {
      id: 'appointment-lea-item-0',
      serviceId: serviceColor.id,
      order: 0,
      serviceName: 'Coloration',
      serviceType: 'TECHNIQUE',
      price: 95,
      phases: serviceColor.phases.map((phase) => ({ ...phase })),
    },
    {
      id: 'appointment-lea-item-1',
      serviceId: serviceCut.id,
      serviceOptionId: 'option-long',
      order: 1,
      serviceName: 'Coupe',
      serviceType: 'SERVICE',
      price: 40,
      phases: [{ id: 'cut', name: 'Coupe', durationMinutes: 30, requiresStaff: true }],
    },
  ],
};

export const productMask: Product = {
  id: 'product-mask',
  businessId: BUSINESS_ID,
  name: 'Masque réparateur',
  brand: 'Redken',
  category: 'hair-care',
  barcode: '00884486453280',
  imageUri: 'file:///app/Documents/products/product-mask-1.jpg',
  price: 50,
  stockQuantity: 5,
  active: true,
};

export const productSerum: Product = {
  id: 'product-serum',
  businessId: BUSINESS_ID,
  name: 'Sérum',
  price: 32,
  stockQuantity: 1,
  active: true,
};

export function createTestSeed(overrides: Partial<FirstRunSeed> = {}): FirstRunSeed {
  return {
    clients: [clientLea],
    services: [serviceColor, serviceCut],
    products: [productMask, productSerum],
    appointments: [appointmentLea],
    sales: [],
    ...overrides,
  };
}
