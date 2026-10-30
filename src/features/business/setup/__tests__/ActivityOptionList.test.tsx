// BeautIzzy — the profession cards: an announced profession is never a choice
//
// No profession is « Bientôt disponible » today; the state stays for the next
// ones, so its card behaviour is kept covered with an announced option.

import { act, fireEvent, render } from '@testing-library/react-native';

import { ACTIVITY_OPTIONS, COMING_SOON_LABEL, type ActivityOption } from '../activity-options';
import { ActivityOptionList } from '../components/ActivityOptionList';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const press = (element: unknown) =>
  act(async () => {
    fireEvent.press(element as Parameters<typeof fireEvent.press>[0]);
  });

const ANNOUNCED: ActivityOption = { ...ACTIVITY_OPTIONS[1]!, availability: 'COMING_SOON' };

describe('ActivityOptionList', () => {
  it('shows an announced profession with its badge, disabled, and never selects it', async () => {
    const onSelect = jest.fn();
    const view = await render(
      <ActivityOptionList onSelect={onSelect} options={[ACTIVITY_OPTIONS[0]!, ANNOUNCED]} value={null} />,
    );

    const card = view.getByTestId(`activity-${ANNOUNCED.type}`);
    expect(card.props.accessibilityState).toEqual({ selected: false, checked: false, disabled: true });
    expect(card.props.accessibilityLabel).toBe(`${ANNOUNCED.label}, bientôt disponible`);
    expect(view.getByTestId(`activity-${ANNOUNCED.type}-coming-soon`)).toBeTruthy();
    expect(view.getAllByText(COMING_SOON_LABEL)).toHaveLength(1);

    await press(card);
    expect(onSelect).not.toHaveBeenCalled();

    await press(view.getByTestId(`activity-${ACTIVITY_OPTIONS[0]!.type}`));
    expect(onSelect).toHaveBeenCalledWith('HAIRDRESSING');
  });

  it('draws every profession of the domain by default, none of them announced', async () => {
    const view = await render(<ActivityOptionList onSelect={jest.fn()} value="WELLNESS" />);
    expect(view.getAllByRole('radio')).toHaveLength(ACTIVITY_OPTIONS.length);
    expect(view.queryByText(COMING_SOON_LABEL)).toBeNull();
    expect(view.getByTestId('activity-WELLNESS').props.accessibilityState.selected).toBe(true);
  });
});
