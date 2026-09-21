import {
  formatBirthdayMessage,
  formatOfFirstName,
  formatProfileBirthdayAccessibilityLabel,
} from '../presentation';

describe('birthday copy', () => {
  it('elides « de » before a vowel sound, accents included', () => {
    expect(formatOfFirstName('Amel')).toBe("d'Amel");
    expect(formatOfFirstName('Élodie')).toBe("d'Élodie");
    expect(formatOfFirstName('Inès')).toBe("d'Inès");
    expect(formatOfFirstName('Hélène')).toBe("d'Hélène");
    expect(formatOfFirstName('Léa')).toBe('de Léa');
    expect(formatOfFirstName(' Sofia ')).toBe('de Sofia');
  });

  it('adapts the profile sentences to the first name', () => {
    expect(formatBirthdayMessage({ firstName: 'Amel' }, 'TODAY')).toBe(
      "C'est l'anniversaire d'Amel aujourd'hui.",
    );
    expect(formatProfileBirthdayAccessibilityLabel({ firstName: 'Amel' })).toBe(
      "Anniversaire aujourd'hui. Vous pouvez proposer une réduction à Amel.",
    );
  });

  it('never says « aujourd\'hui » for a birthday on another day, elision kept', () => {
    expect(formatBirthdayMessage({ firstName: 'Amel' }, 'THAT_DAY')).toBe(
      "C'est l'anniversaire d'Amel ce jour-là.",
    );
    expect(formatBirthdayMessage({ firstName: 'Léa' }, 'THAT_DAY')).toBe(
      "C'est l'anniversaire de Léa ce jour-là.",
    );
  });
});
