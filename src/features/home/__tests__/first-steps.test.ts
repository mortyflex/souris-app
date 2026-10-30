// BeautIzzy — « Premiers pas »: derived step states (pure)

import { areFirstStepsComplete, formatFirstStepsProgress, getFirstSteps, type FirstStepsEvidence } from '../first-steps/first-steps';

const nothing: FirstStepsEvidence = { activeServices: [], clientCount: 0, appointmentCount: 0, productCount: 0 };
const done = (evidence: FirstStepsEvidence) =>
  Object.fromEntries(getFirstSteps(evidence).map((step) => [step.key, step.done]));

describe('getFirstSteps', () => {
  it('ticks nothing without evidence', () => {
    expect(done(nothing)).toEqual({ services: false, clients: false, appointment: false, products: false });
    expect(formatFirstStepsProgress(getFirstSteps(nothing))).toBe('0 sur 3');
  });

  it('services are done only when every active prestation has its price', () => {
    const steps = (prices: number[]) => getFirstSteps({ ...nothing, activeServices: prices.map((price) => ({ price })) });
    expect(steps([0, 0])[0]).toMatchObject({ done: false, description: '2 tarifs à renseigner' });
    expect(steps([3500, 0])[0]).toMatchObject({ done: false, description: '1 tarif à renseigner' });
    expect(steps([3500, 2000])[0]).toMatchObject({ done: true, description: 'Vos tarifs sont renseignés' });
    expect(steps([])[0]).toMatchObject({ done: false, description: 'Ajoutez vos prestations et leurs tarifs' });
  });

  it('products are optional: complete without any product, never counted in the progress', () => {
    const evidence = { activeServices: [{ price: 3500 }], clientCount: 1, appointmentCount: 1, productCount: 0 };
    const steps = getFirstSteps(evidence);
    expect(steps.find((step) => step.key === 'products')).toMatchObject({ optional: true, done: false });
    expect(areFirstStepsComplete(steps)).toBe(true);
    expect(formatFirstStepsProgress(steps)).toBe('3 sur 3');
  });

  it('is not complete while a required step is missing, whatever the products', () => {
    expect(areFirstStepsComplete(getFirstSteps({ ...nothing, clientCount: 4, productCount: 12 }))).toBe(false);
  });
});
