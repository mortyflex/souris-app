import { formatSelectedServiceNames, formatSelectionCountLabel } from '../presentation';

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
});
