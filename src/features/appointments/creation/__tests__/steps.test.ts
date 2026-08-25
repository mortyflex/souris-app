import { canNavigateTo, getStepProgressLabel, getStepState, stepLabels } from '../steps';

describe('getStepState', () => {
  it('marks earlier steps as completed, the active step as current, later steps as future', () => {
    expect(getStepState(0, 0)).toBe('current');
    expect(getStepState(0, 1)).toBe('future');
    expect(getStepState(0, 2)).toBe('future');

    expect(getStepState(1, 0)).toBe('completed');
    expect(getStepState(1, 1)).toBe('current');
    expect(getStepState(1, 2)).toBe('future');

    expect(getStepState(2, 0)).toBe('completed');
    expect(getStepState(2, 1)).toBe('completed');
    expect(getStepState(2, 2)).toBe('current');
  });
});

describe('canNavigateTo', () => {
  it('permits backward navigation to completed steps only', () => {
    expect(canNavigateTo(1, 0)).toBe(true);
    expect(canNavigateTo(2, 0)).toBe(true);
    expect(canNavigateTo(2, 1)).toBe(true);
  });

  it('forbids forward jumps and staying in place', () => {
    expect(canNavigateTo(0, 1)).toBe(false);
    expect(canNavigateTo(0, 2)).toBe(false);
    expect(canNavigateTo(1, 2)).toBe(false);
    expect(canNavigateTo(1, 1)).toBe(false);
  });

  it('forbids invalid targets', () => {
    expect(canNavigateTo(2, -1)).toBe(false);
    expect(canNavigateTo(2, 3)).toBe(false);
  });
});

describe('stepLabels', () => {
  it('keeps the three creation steps in order', () => {
    expect(stepLabels).toEqual(['Cliente', 'Prestations', 'Résumé']);
  });
});

describe('getStepProgressLabel', () => {
  it('announces the current position', () => {
    expect(getStepProgressLabel(0)).toBe('Étape 1 sur 3');
    expect(getStepProgressLabel(2)).toBe('Étape 3 sur 3');
  });
});
