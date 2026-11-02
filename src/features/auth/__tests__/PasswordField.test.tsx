// BeautIzzy — the password field's visibility control on iOS and Android (behavioral)

import { act, fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';
import { Platform, StyleSheet } from 'react-native';

import { PasswordField } from '../components/PasswordField';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

let current = '';

function Harness({ intent = 'current' }: { readonly intent?: 'new' | 'current' }) {
  const [value, setValue] = useState('');
  return (
    <PasswordField
      intent={intent}
      onChangeText={(text) => {
        current = text;
        setValue(text);
      }}
      value={value}
    />
  );
}

const run = (callback: () => void) =>
  act(async () => {
    callback();
  });

async function renderField(intent?: 'new' | 'current') {
  current = '';
  const view = await render(<Harness intent={intent} />);
  const input = () => view.getByTestId('password-input');
  const toggle = () => view.getByTestId('password-input-visibility');
  return { view, input, toggle };
}

describe.each(['ios', 'android'] as const)('PasswordField on %s', (os) => {
  let platform: jest.ReplaceProperty<typeof Platform.OS>;
  beforeEach(() => {
    platform = jest.replaceProperty(Platform, 'OS', os);
  });
  afterEach(() => platform.restore());

  it('is hidden by default and shows / hides on tap, with French accessible labels', async () => {
    const { view, input, toggle } = await renderField();

    expect(input().props.secureTextEntry).toBe(true);
    expect(toggle().props.accessibilityRole).toBe('button');
    expect(view.getByLabelText('Afficher le mot de passe')).toBeTruthy();

    await run(() => fireEvent.press(toggle()));
    expect(input().props.secureTextEntry).toBe(false);
    expect(view.getByLabelText('Masquer le mot de passe')).toBeTruthy();

    await run(() => fireEvent.press(toggle()));
    expect(input().props.secureTextEntry).toBe(true);
    expect(view.getByLabelText('Afficher le mot de passe')).toBeTruthy();
  });

  it('offers a comfortable touch target (44 pt or more, hit slop included)', async () => {
    const { toggle } = await renderField();
    const style = StyleSheet.flatten(toggle().props.style) as { width: number; height: number };
    const slop = toggle().props.hitSlop as number;
    expect(style.width + 2 * slop).toBeGreaterThanOrEqual(44);
    expect(style.height + 2 * slop).toBeGreaterThanOrEqual(44);
  });

  it('keeps the value and the autofill hints whatever the visibility', async () => {
    const { input, toggle } = await renderField('new');
    await run(() => fireEvent.changeText(input(), 'Secret-42'));

    await run(() => fireEvent.press(toggle()));
    expect(input().props.value).toBe('Secret-42');
    expect(input().props.textContentType).toBe('newPassword');
    expect(input().props.autoComplete).toBe('new-password');

    await run(() => fireEvent.press(toggle()));
    expect(input().props.value).toBe('Secret-42');
    expect(input().props.textContentType).toBe('newPassword');
    expect(input().props.autoComplete).toBe('new-password');
  });

  it('takes a password manager fill as it arrives, even right after hiding', async () => {
    const { input, toggle } = await renderField();
    await run(() => fireEvent.changeText(input(), 'ancien'));
    await run(() => fireEvent.press(toggle()));
    await run(() => fireEvent.press(toggle()));
    await run(() => fireEvent.changeText(input(), 'Nouveau-Secret-42'));
    expect(current).toBe('Nouveau-Secret-42');
  });
});

describe('PasswordField — iOS emptying a hidden field', () => {
  let platform: jest.ReplaceProperty<typeof Platform.OS>;
  beforeEach(() => {
    platform = jest.replaceProperty(Platform, 'OS', 'ios');
  });
  afterEach(() => platform.restore());

  it('typing after hiding again continues the password instead of replacing it', async () => {
    const { input, toggle } = await renderField();
    await run(() => fireEvent.changeText(input(), 'abcd1234'));
    await run(() => fireEvent.press(toggle()));
    await run(() => fireEvent.changeText(input(), 'abcd1234XY'));
    await run(() => fireEvent.press(toggle()));

    // UIKit reports the emptying, then the keystroke, back to back.
    await run(() => {
      fireEvent.changeText(input(), '');
      fireEvent.changeText(input(), 'z');
    });
    expect(current).toBe('abcd1234XYz');
    expect(input().props.value).toBe('abcd1234XYz');
  });

  it('Delete after hiding removes one character, not the whole password', async () => {
    const { input, toggle } = await renderField();
    await run(() => fireEvent.changeText(input(), 'abcd1234'));
    await run(() => fireEvent.press(toggle()));
    await run(() => fireEvent.press(toggle()));
    await run(() => fireEvent.changeText(input(), ''));
    expect(current).toBe('abcd123');
  });

  it('typing after coming back to the hidden field keeps what was typed before', async () => {
    const { input } = await renderField();
    await run(() => fireEvent.changeText(input(), 'abcd1234'));
    await run(() => fireEvent(input(), 'focus'));
    await run(() => {
      fireEvent.changeText(input(), '');
      fireEvent.changeText(input(), 'q');
    });
    expect(current).toBe('abcd1234q');

    // Afterwards typing is ordinary again: a single deletion stays a deletion.
    await run(() => fireEvent.changeText(input(), 'abcd1234'));
    expect(current).toBe('abcd1234');
  });

  it('never alters what is typed while the password is visible', async () => {
    const { input, toggle } = await renderField();
    await run(() => fireEvent.changeText(input(), 'abcd1234'));
    await run(() => fireEvent.press(toggle()));
    await run(() => fireEvent.changeText(input(), ''));
    expect(current).toBe('');
  });
});

describe('PasswordField — Android never empties the field', () => {
  let platform: jest.ReplaceProperty<typeof Platform.OS>;
  beforeEach(() => {
    platform = jest.replaceProperty(Platform, 'OS', 'android');
  });
  afterEach(() => platform.restore());

  it('takes every change as it arrives, even right after hiding or refocusing', async () => {
    const { input, toggle } = await renderField();
    await run(() => fireEvent.changeText(input(), 'abcd1234'));
    await run(() => fireEvent.press(toggle()));
    await run(() => fireEvent.press(toggle()));
    await run(() => fireEvent.changeText(input(), 'z'));
    expect(current).toBe('z');

    await run(() => fireEvent(input(), 'focus'));
    await run(() => fireEvent.changeText(input(), ''));
    expect(current).toBe('');
  });
});
