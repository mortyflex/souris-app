import {
  formatSelectedServiceNames,
  formatSelectionCountLabel,
  formatServiceQuantity,
} from '../presentation';

describe('selection footer wording', () => {
  it('pluralizes the count', () => {
    expect(formatSelectionCountLabel(0)).toBe('0 prestation sélectionnée');
    expect(formatSelectionCountLabel(1)).toBe('1 prestation sélectionnée');
    expect(formatSelectionCountLabel(3)).toBe('3 prestations sélectionnées');
  });

  it('lists the selected names in selection order, and nothing else', () => {
    expect(formatSelectedServiceNames([])).toBe('');
    expect(formatSelectedServiceNames([{ serviceName: 'Balayage 3' }])).toBe('Balayage 3');
    expect(
      formatSelectedServiceNames([
        { serviceName: 'Balayage 3' },
        { serviceName: 'Coupe brushing' },
        { serviceName: 'Reprise' },
      ]),
    ).toBe('Balayage 3 · Coupe brushing · Reprise');
  });

  it('names a repeated Service once, at its first position, with its quantity', () => {
    expect(
      formatSelectedServiceNames([
        { serviceId: 'cut', serviceName: 'Coupe femme' },
        { serviceId: 'blow', serviceName: 'Brushing' },
        { serviceId: 'cut', serviceName: 'Coupe femme' },
      ]),
    ).toBe('Coupe femme ×2 · Brushing');
  });

  it('accepts another separator for assistive technologies', () => {
    expect(
      formatSelectedServiceNames(
        [
          { serviceId: 'cut', serviceName: 'Coupe femme' },
          { serviceId: 'blow', serviceName: 'Brushing' },
        ],
        ', ',
      ),
    ).toBe('Coupe femme, Brushing');
  });

  it('formats a quantity', () => {
    expect(formatServiceQuantity(1)).toBe('×1');
    expect(formatServiceQuantity(12)).toBe('×12');
  });
});
