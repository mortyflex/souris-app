import { act, fireEvent, render } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { caution, semanticColors, spacing, typography } from '@/shared/ui/theme';

import {
  ProfileStatCard,
  estimateProfileStatValueWidth,
  getProfileStatValueFontSize,
  profileStatValueMaxFontScale,
  profileStatValueMinimumScale,
} from '../ProfileStatCard';

const icon = { ios: 'person.fill.xmark', android: 'person_off' } as const;
const roleSize = typography.daySummaryValue.fontSize;
const roleLineHeight = typography.daySummaryValue.lineHeight;

/** The copy column of a half-width card on a 375 pt iPhone (gutter 20, padding 12, 32 pt glyph, 8 pt gap). */
const NARROW_PHONE_COPY_WIDTH = 99.5;
/** The same column on a 393 pt iPhone. */
const REGULAR_PHONE_COPY_WIDTH = 108.5;

async function layoutCopy(view: Awaited<ReturnType<typeof render>>, testID: string, width: number) {
  const copy = view.getByTestId(testID).parent!;
  await act(async () => {
    fireEvent(copy, 'layout', { nativeEvent: { layout: { width, height: 44, x: 0, y: 0 } } });
  });
}

function valueStyle(view: Awaited<ReturnType<typeof render>>, testID: string) {
  return StyleSheet.flatten(view.getByTestId(testID).props.style);
}

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

  describe('figure typography', () => {
    const setFontScale = async (fontScale: number) => {
      await act(async () => {
        Dimensions.set({ window: { ...Dimensions.get('window'), fontScale } });
      });
    };

    beforeEach(async () => {
      // Jest's default device reports a doubled text scale; these cards sit on a standard one.
      await setFontScale(1);
    });

    afterEach(async () => {
      await setFontScale(2);
    });

    it('renders every figure at the fixed summaryValue size — never auto-shrunk', async () => {
      const view = await render(
        <>
          <ProfileStatCard icon={icon} label="Réalisés" testID="metric-completed" value="0" />
          <ProfileStatCard icon={icon} label="Total dépensé" testID="metric-spent" value="0,00 €" />
          <ProfileStatCard icon={icon} label="Absences" testID="metric-noshow" value="1" />
          <ProfileStatCard icon={icon} label="Total dépensé" testID="metric-large" value="163,00 €" />
        </>,
      );

      for (const testID of ['metric-completed', 'metric-spent', 'metric-noshow', 'metric-large']) {
        const figure = view.getByTestId(testID);
        expect(figure.props.adjustsFontSizeToFit).toBeUndefined();
        expect(figure.props.minimumFontScale).toBeUndefined();
        expect(figure.props.numberOfLines).toBe(1);
        expect(figure.props.maxFontSizeMultiplier).toBe(profileStatValueMaxFontScale);
        expect(valueStyle(view, testID)).toMatchObject({ fontSize: roleSize, lineHeight: roleLineHeight });
      }
    });

    it('keeps zero, a normal and a large amount at one size once the card is laid out on a regular phone', async () => {
      const view = await render(
        <>
          <ProfileStatCard icon={icon} label="Réalisés" testID="metric-completed" value="0" />
          <ProfileStatCard icon={icon} label="Total dépensé" testID="metric-spent" value="0,00 €" />
          <ProfileStatCard icon={icon} label="Total dépensé" testID="metric-normal" value="163,00 €" />
          <ProfileStatCard icon={icon} label="Total dépensé" testID="metric-large" value="1 234,56 €" />
        </>,
      );
      for (const testID of ['metric-completed', 'metric-spent', 'metric-normal', 'metric-large']) {
        await layoutCopy(view, testID, REGULAR_PHONE_COPY_WIDTH);
      }

      expect(valueStyle(view, 'metric-completed').fontSize).toBe(roleSize);
      expect(valueStyle(view, 'metric-spent').fontSize).toBe(roleSize);
      expect(valueStyle(view, 'metric-normal').fontSize).toBe(roleSize);
      // Only a figure that genuinely does not fit steps down, and stays readable.
      const large = valueStyle(view, 'metric-large');
      expect(large.fontSize).toBeLessThan(roleSize);
      expect(large.fontSize).toBeGreaterThanOrEqual(roleSize * profileStatValueMinimumScale);
      expect(large.lineHeight).toBeCloseTo((roleLineHeight * large.fontSize!) / roleSize);
    });

    it('recomputes from every layout, so a transient narrow measure never sticks', async () => {
      const view = await render(
        <ProfileStatCard icon={icon} label="Total dépensé" testID="metric-spent" value="0,00 €" />,
      );

      await layoutCopy(view, 'metric-spent', 20);
      expect(valueStyle(view, 'metric-spent').fontSize).toBe(roleSize * profileStatValueMinimumScale);

      await layoutCopy(view, 'metric-spent', REGULAR_PHONE_COPY_WIDTH);
      expect(valueStyle(view, 'metric-spent').fontSize).toBe(roleSize);
    });

    it('steps a figure down for the reader’s text size, capped, and never below the floor', async () => {
      await setFontScale(3);
      const view = await render(
        <>
          <ProfileStatCard icon={icon} label="Réalisés" testID="metric-completed" value="0" />
          <ProfileStatCard icon={icon} label="Total dépensé" testID="metric-huge" value="12 345 678,90 €" />
        </>,
      );
      await layoutCopy(view, 'metric-completed', NARROW_PHONE_COPY_WIDTH);
      await layoutCopy(view, 'metric-huge', NARROW_PHONE_COPY_WIDTH);

      // « 0 » at the capped multiplier still fits: full role size.
      expect(valueStyle(view, 'metric-completed').fontSize).toBe(roleSize);
      // An absurdly long figure stops at the floor and truncates on its one line.
      expect(valueStyle(view, 'metric-huge').fontSize).toBe(roleSize * profileStatValueMinimumScale);
      expect(view.getByTestId('metric-huge').props.numberOfLines).toBe(1);
    });
  });

  describe('deterministic fit', () => {
    it('estimates widths from the bold tabular figure role, spaces over-estimated', () => {
      expect(estimateProfileStatValueWidth('0', roleSize)).toBeCloseTo(0.6 * roleSize);
      // « 163,00 € »: five tabular digits, a comma, a no-break space, the euro sign.
      expect(estimateProfileStatValueWidth('163,00 €', roleSize)).toBeCloseTo((5 * 0.6 + 0.36 + 0.25 + 0.77) * roleSize);
      // A thousands separator (narrow no-break space) counts as a space.
      expect(estimateProfileStatValueWidth('1 234,56 €', roleSize)).toBeCloseTo((6 * 0.6 + 0.36 + 2 * 0.25 + 0.77) * roleSize);
    });

    it('returns the role size whenever the figure fits, at any text scale up to the cap', () => {
      expect(getProfileStatValueFontSize('0', NARROW_PHONE_COPY_WIDTH, 1)).toBe(roleSize);
      expect(getProfileStatValueFontSize('0,00 €', NARROW_PHONE_COPY_WIDTH, 1)).toBe(roleSize);
      expect(getProfileStatValueFontSize('163,00 €', REGULAR_PHONE_COPY_WIDTH, 1)).toBe(roleSize);
      // On the narrowest phone a six-figure amount sits at the limit: the
      // over-estimated space steps it down by a hair, never visibly.
      expect(getProfileStatValueFontSize('163,00 €', NARROW_PHONE_COPY_WIDTH, 1)).toBeGreaterThanOrEqual(
        roleSize * 0.98,
      );
      // Growth is capped, so a larger setting asks for no more width.
      expect(getProfileStatValueFontSize('99', NARROW_PHONE_COPY_WIDTH, 3)).toBe(
        getProfileStatValueFontSize('99', NARROW_PHONE_COPY_WIDTH, profileStatValueMaxFontScale),
      );
    });

    it('steps down exactly as much as needed, floored, same input same output', () => {
      const large = '1 234,56 €';
      const fitted = getProfileStatValueFontSize(large, NARROW_PHONE_COPY_WIDTH, 1);
      expect(fitted).toBeLessThan(roleSize);
      expect(fitted).toBeGreaterThan(roleSize * profileStatValueMinimumScale);
      expect(estimateProfileStatValueWidth(large, fitted)).toBeCloseTo(NARROW_PHONE_COPY_WIDTH);
      expect(getProfileStatValueFontSize(large, NARROW_PHONE_COPY_WIDTH, 1)).toBe(fitted);
      // A wider card asks for less of a step; a larger text scale for more.
      expect(getProfileStatValueFontSize(large, REGULAR_PHONE_COPY_WIDTH, 1)).toBeGreaterThan(fitted);
      expect(getProfileStatValueFontSize(large, NARROW_PHONE_COPY_WIDTH, 1.2)).toBeLessThan(fitted);
      // Never below the floor.
      expect(getProfileStatValueFontSize('12 345 678,90 €', 20, 1)).toBe(roleSize * profileStatValueMinimumScale);
    });
  });
});
