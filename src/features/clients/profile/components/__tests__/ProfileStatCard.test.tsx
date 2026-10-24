import { render } from '@testing-library/react-native';

import { caution, semanticColors, spacing } from '@/shared/ui/theme';

import { ProfileStatCard } from '../ProfileStatCard';

const icon = { ios: 'person.fill.xmark', android: 'person_off' } as const;

describe('ProfileStatCard', () => {
  it('renders a plain borderless card spoken as « label, value »', async () => {
    const view = await render(
      <ProfileStatCard icon={icon} label="Absences" testID="metric-noshow" value="0" />,
    );

    const card = view.getByLabelText('Absences, 0');
    expect(card).toHaveStyle({ padding: spacing.md });
    expect(card).not.toHaveStyle({ borderWidth: 1.5 });
    expect(view.getByTestId('metric-noshow').props.children).toBe('0');
    expect(view.getByText('Absences')).toBeTruthy();
  });

  it('draws the accent as a thin outline carved out of the padding — same footprint', async () => {
    const view = await render(
      <ProfileStatCard
        accent={{ color: caution.orange600 }}
        accessibilityDescription="absences répétées"
        icon={icon}
        label="Absences"
        testID="metric-noshow"
        value="4"
      />,
    );

    const card = view.getByLabelText('Absences, 4, absences répétées');
    expect(card).toHaveStyle({
      borderColor: caution.orange600,
      borderWidth: 1.5,
      padding: spacing.md - 1.5,
      backgroundColor: semanticColors.surfaceElevated,
    });
    // The figure stays navy and fully readable: only the outline and glyph carry the colour.
    expect(view.getByTestId('metric-noshow')).toHaveStyle({ color: semanticColors.foreground });
    expect(view.getByTestId('metric-noshow').props.children).toBe('4');
  });

  it('keeps the shortened label spoken in full, then the value, then the severity', async () => {
    const view = await render(
      <ProfileStatCard
        accessibilityLabel="Rendez-vous réalisés"
        icon={icon}
        label="Réalisés"
        testID="metric-completed"
        value="12"
      />,
    );

    expect(view.getByLabelText('Rendez-vous réalisés, 12')).toBeTruthy();
  });

  it('never speaks a description without an accent', async () => {
    const view = await render(
      <ProfileStatCard
        accessibilityDescription="à surveiller"
        icon={icon}
        label="Absences"
        testID="metric-noshow"
        value="0"
      />,
    );

    expect(view.getByLabelText('Absences, 0')).toBeTruthy();
  });
});
