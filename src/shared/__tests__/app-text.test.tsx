import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

import { colors, foregroundSoft } from '../ui/theme';
import { AppText, getAppTextStyle } from '../ui/AppText';

describe('getAppTextStyle', () => {
  it('maps body to Inter regular 16 with the approved line height', () => {
    expect(getAppTextStyle('body', 'ios')).toEqual({
      fontFamily: 'Inter_400Regular',
      fontSize: 16,
      lineHeight: 23.2,
      letterSpacing: 0,
      color: colors.foreground,
    });
  });

  it('resolves the screen title per platform', () => {
    expect(getAppTextStyle('screenTitle', 'ios')).toMatchObject({
      fontFamily: 'Inter_700Bold',
      fontSize: 27,
      lineHeight: 30.24,
      letterSpacing: -0.756,
    });
    expect(getAppTextStyle('screenTitle', 'android')).toMatchObject({
      fontFamily: 'Inter_600SemiBold',
      fontSize: 24,
      letterSpacing: -0.24,
    });
  });

  it('resolves the control weight per platform', () => {
    expect(getAppTextStyle('control', 'ios').fontFamily).toBe('Inter_600SemiBold');
    expect(getAppTextStyle('control', 'android').fontFamily).toBe('Inter_500Medium');
  });

  it('resolves the tab label per platform', () => {
    expect(getAppTextStyle('tab', 'ios')).toMatchObject({
      fontFamily: 'Inter_600SemiBold',
      fontSize: 10.5,
    });
    expect(getAppTextStyle('tab', 'android')).toMatchObject({
      fontFamily: 'Inter_500Medium',
      fontSize: 12,
    });
  });

  it('uppercases the eyebrow variant and uses the readable secondary foreground', () => {
    const style = getAppTextStyle('eyebrow', 'ios');

    expect(style.textTransform).toBe('uppercase');
    expect(style.fontFamily).toBe('Inter_600SemiBold');
    expect(style.fontSize).toBe(12);
    expect(style.letterSpacing).toBe(1.08);
    expect(style.color).toBe(foregroundSoft);
  });

  it('uses the readable secondary foreground for metadata, never for body', () => {
    expect(getAppTextStyle('metadata', 'ios').color).toBe(foregroundSoft);
    expect(getAppTextStyle('body', 'ios').color).toBe(colors.foreground);
  });
});

describe('AppText', () => {
  it('renders children with the resolved variant style', async () => {
    const { getByText } = await render(<AppText variant="screenTitle">Agenda</AppText>);

    const style = StyleSheet.flatten(getByText('Agenda').props.style);
    expect(style.fontFamily).toBe('Inter_700Bold');
    expect(style.fontSize).toBe(27);
  });

  it('lets a passed style extend layout presentation after the variant', async () => {
    const { getByText } = await render(
      <AppText variant="body" style={{ marginTop: 8 }}>
        Texte
      </AppText>,
    );

    const style = StyleSheet.flatten(getByText('Texte').props.style);
    expect(style.fontFamily).toBe('Inter_400Regular');
    expect(style.marginTop).toBe(8);
  });
});
