import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

import { colors, foregroundSoft } from '../ui/theme';
import { AppText, getAppTextStyle } from '../ui/AppText';

describe('getAppTextStyle', () => {
  it('maps body to Plus Jakarta Sans regular 16 with the approved line height', () => {
    expect(getAppTextStyle('body', 'ios')).toEqual({
      fontFamily: 'PlusJakartaSans_400Regular',
      fontSize: 16,
      lineHeight: 24,
      letterSpacing: 0,
      color: colors.foreground,
    });
  });

  it('resolves the screen title per platform', () => {
    expect(getAppTextStyle('screenTitle', 'ios')).toMatchObject({
      fontFamily: 'PlusJakartaSans_700Bold',
      fontSize: 30,
      lineHeight: 36,
      letterSpacing: -0.72,
    });
    expect(getAppTextStyle('screenTitle', 'android')).toMatchObject({
      fontFamily: 'PlusJakartaSans_700Bold',
      fontSize: 27,
      letterSpacing: -0.324,
    });
  });

  it('resolves the control weight per platform', () => {
    expect(getAppTextStyle('control', 'ios')).toMatchObject({
      fontFamily: 'PlusJakartaSans_600SemiBold',
      fontSize: 16,
    });
    expect(getAppTextStyle('control', 'android')).toMatchObject({
      fontFamily: 'PlusJakartaSans_500Medium',
      fontSize: 16,
    });
  });

  it('resolves the tab label per platform', () => {
    expect(getAppTextStyle('tab', 'ios')).toMatchObject({
      fontFamily: 'PlusJakartaSans_600SemiBold',
      fontSize: 11,
    });
    expect(getAppTextStyle('tab', 'android')).toMatchObject({
      fontFamily: 'PlusJakartaSans_500Medium',
      fontSize: 12,
    });
  });

  it('uppercases the eyebrow variant and uses the readable secondary foreground', () => {
    const style = getAppTextStyle('eyebrow', 'ios');

    expect(style.textTransform).toBe('uppercase');
    expect(style.fontFamily).toBe('PlusJakartaSans_600SemiBold');
    expect(style.fontSize).toBe(12);
    expect(style.letterSpacing).toBe(1.08);
    expect(style.color).toBe(foregroundSoft);
  });

  it('uses the readable secondary foreground for metadata, never for body', () => {
    expect(getAppTextStyle('metadata', 'ios').color).toBe(foregroundSoft);
    expect(getAppTextStyle('body', 'ios').color).toBe(colors.foreground);
  });

  it('gives section titles and sheet titles a stronger editorial hierarchy than body', () => {
    expect(getAppTextStyle('sectionTitle', 'ios')).toMatchObject({
      fontFamily: 'PlusJakartaSans_700Bold',
      fontSize: 18,
    });
    expect(getAppTextStyle('sheetTitle', 'ios')).toMatchObject({
      fontFamily: 'PlusJakartaSans_700Bold',
      fontSize: 21,
    });
    expect(getAppTextStyle('rowTitle', 'ios').fontSize).toBe(16.5);
    expect(getAppTextStyle('body', 'ios').fontSize).toBe(16);
  });
});

describe('AppText', () => {
  it('renders children with the resolved variant style', async () => {
    const { getByText } = await render(<AppText variant="screenTitle">Agenda</AppText>);

    const style = StyleSheet.flatten(getByText('Agenda').props.style);
    expect(style.fontFamily).toBe('PlusJakartaSans_700Bold');
    expect(style.fontSize).toBe(30);
  });

  it('lets a passed style extend layout presentation after the variant', async () => {
    const { getByText } = await render(
      <AppText variant="body" style={{ marginTop: 8 }}>
        Texte
      </AppText>,
    );

    const style = StyleSheet.flatten(getByText('Texte').props.style);
    expect(style.fontFamily).toBe('PlusJakartaSans_400Regular');
    expect(style.marginTop).toBe(8);
  });
});
