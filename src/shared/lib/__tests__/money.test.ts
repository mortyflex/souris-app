import {
  eurosToCents,
  formatCentsAsInput,
  formatEuroCents,
  formatEuros,
  formatSignedEuroCents,
  parseEuroInputToCents,
} from '../money';

/** fr-FR uses a narrow no-break space before € and a regular/no-break group separator. */
function plain(value: string): string {
  return value.replace(/[  ]/g, ' ');
}

describe('money helpers', () => {
  it('formats euro numbers and integer cents identically in French', () => {
    expect(plain(formatEuros(1240))).toBe('1 240,00 €');
    expect(plain(formatEuroCents(124000))).toBe('1 240,00 €');
    expect(plain(formatEuroCents(7550))).toBe('75,50 €');
    expect(plain(formatEuroCents(5))).toBe('0,05 €');
    expect(plain(formatEuroCents(0))).toBe('0,00 €');
    expect(plain(formatEuroCents(-500))).toBe('-5,00 €');
    expect(() => formatEuroCents(12.5)).toThrow(RangeError);
  });

  it('formats a signed difference without alarm', () => {
    expect(plain(formatSignedEuroCents(500))).toBe('+5,00 €');
    expect(plain(formatSignedEuroCents(-500))).toBe('-5,00 €');
    expect(plain(formatSignedEuroCents(0))).toBe('0,00 €');
  });

  it('converts snapshot euro numbers to exact cents', () => {
    expect(eurosToCents(95)).toBe(9500);
    expect(eurosToCents(42.5)).toBe(4250);
    expect(eurosToCents(0.29)).toBe(29);
    expect(eurosToCents(1.005)).toBe(101);
    expect(eurosToCents(0)).toBe(0);
    expect(() => eurosToCents(Number.NaN)).toThrow(RangeError);
  });

  it('parses French decimal entry into cents without floating point', () => {
    expect(parseEuroInputToCents('')).toBe(0);
    expect(parseEuroInputToCents('   ')).toBe(0);
    expect(parseEuroInputToCents('95')).toBe(9500);
    expect(parseEuroInputToCents('95,5')).toBe(9550);
    expect(parseEuroInputToCents('95,50')).toBe(9550);
    expect(parseEuroInputToCents('95.50')).toBe(9550);
    expect(parseEuroInputToCents('95,')).toBe(9500);
    expect(parseEuroInputToCents('0,07')).toBe(7);
    expect(parseEuroInputToCents('1 240,00')).toBe(124000);
  });

  it('rejects negative, textual, and over-precise entries', () => {
    expect(parseEuroInputToCents('-5')).toBeUndefined();
    expect(parseEuroInputToCents('abc')).toBeUndefined();
    expect(parseEuroInputToCents('95,505')).toBeUndefined();
    expect(parseEuroInputToCents('9,5,0')).toBeUndefined();
    expect(parseEuroInputToCents('€')).toBeUndefined();
  });

  it('renders stored cents back into an editable entry', () => {
    expect(formatCentsAsInput(7550)).toBe('75,50');
    expect(formatCentsAsInput(9500)).toBe('95,00');
    expect(formatCentsAsInput(0)).toBe('0,00');
    expect(formatCentsAsInput(5)).toBe('0,05');
    expect(() => formatCentsAsInput(-1)).toThrow(RangeError);
  });

  it('round-trips parsing and input formatting', () => {
    for (const cents of [0, 5, 99, 100, 7550, 124000]) {
      expect(parseEuroInputToCents(formatCentsAsInput(cents))).toBe(cents);
    }
  });
});
