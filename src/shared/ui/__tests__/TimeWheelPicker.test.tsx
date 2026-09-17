import { act, fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';

import { haptics } from '@/shared/lib/haptics';

import { settleWheelOn, wheelRowKeys, wheelValue } from '../testing/wheels';
import { TimeWheelPicker, type TimeOfDay } from '../TimeWheelPicker';
import { WHEEL_ROW_HEIGHT } from '../WheelColumn';

const selectionHaptic = jest.spyOn(haptics, 'selection').mockImplementation();

function Harness({ initial, onChange }: { readonly initial: TimeOfDay; readonly onChange?: (value: TimeOfDay) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <TimeWheelPicker
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      value={value}
    />
  );
}

describe('TimeWheelPicker', () => {
  beforeEach(() => selectionHaptic.mockClear());

  it('offers a 24-hour wheel and a 5-minute wheel, opened on the value', async () => {
    const view = await render(<Harness initial={{ hour: 19, minute: 0 }} />);

    expect(wheelRowKeys(view, 'time-wheel-hour')).toEqual(Array.from({ length: 24 }, (_, hour) => String(hour)));
    expect(wheelRowKeys(view, 'time-wheel-minute')).toEqual(
      Array.from({ length: 12 }, (_, index) => String(index * 5)),
    );
    expect(wheelValue(view, 'time-wheel-hour')).toBe('19 heures');
    expect(wheelValue(view, 'time-wheel-minute')).toBe('0 minutes');
    // Two-digit, 24-hour labels; both wheels start centered on their value.
    expect(view.getByText('19', { includeHiddenElements: true })).toBeTruthy();
    // « 00 » is both midnight on the hours wheel and the full hour on the minutes wheel.
    expect(view.getAllByText('00', { includeHiddenElements: true })).toHaveLength(2);
    expect(view.getByTestId('time-wheel-hour').props.contentOffset).toEqual({ x: 0, y: 19 * WHEEL_ROW_HEIGHT });
    expect(view.getByTestId('time-wheel-minute').props.contentOffset).toEqual({ x: 0, y: 0 });
  });

  it('snaps each wheel to a row and changes only its own part of the time', async () => {
    const onChange = jest.fn();
    const view = await render(<Harness initial={{ hour: 10, minute: 15 }} onChange={onChange} />);

    for (const wheel of ['time-wheel-hour', 'time-wheel-minute']) {
      expect(view.getByTestId(wheel).props.snapToInterval).toBe(WHEEL_ROW_HEIGHT);
    }

    await settleWheelOn(view, 'time-wheel-hour', '0');
    expect(onChange).toHaveBeenLastCalledWith({ hour: 0, minute: 15 });
    await settleWheelOn(view, 'time-wheel-minute', '55');
    expect(onChange).toHaveBeenLastCalledWith({ hour: 0, minute: 55 });
    await settleWheelOn(view, 'time-wheel-hour', '23');
    expect(onChange).toHaveBeenLastCalledWith({ hour: 23, minute: 55 });
    expect(selectionHaptic).toHaveBeenCalledTimes(3);
  });

  it('settles a wheel released between two rows on the nearest one', async () => {
    const onChange = jest.fn();
    const view = await render(<Harness initial={{ hour: 10, minute: 0 }} onChange={onChange} />);

    await act(async () => {
      fireEvent(view.getByTestId('time-wheel-minute'), 'momentumScrollEnd', {
        nativeEvent: { contentOffset: { y: 3 * WHEEL_ROW_HEIGHT + 14 } },
      });
    });
    expect(onChange).toHaveBeenLastCalledWith({ hour: 10, minute: 15 });
  });

  it('never rounds an off-grid minute silently: it stays on the wheel until another one is chosen', async () => {
    const onChange = jest.fn();
    const view = await render(<Harness initial={{ hour: 9, minute: 36 }} onChange={onChange} />);

    expect(wheelValue(view, 'time-wheel-minute')).toBe('36 minutes');
    expect(wheelRowKeys(view, 'time-wheel-minute')).toContain('36');
    // Changing the hour keeps the exact minute.
    await settleWheelOn(view, 'time-wheel-hour', '14');
    expect(onChange).toHaveBeenLastCalledWith({ hour: 14, minute: 36 });
    // Picking a grid minute leaves the original one available for the way back.
    await settleWheelOn(view, 'time-wheel-minute', '40');
    expect(onChange).toHaveBeenLastCalledWith({ hour: 14, minute: 40 });
    expect(wheelRowKeys(view, 'time-wheel-minute')).toContain('36');
  });

  it('restricts the hours to the offered range', async () => {
    const view = await render(
      <TimeWheelPicker maxHour={23} minHour={8} onChange={jest.fn()} value={{ hour: 8, minute: 0 }} />,
    );

    expect(wheelRowKeys(view, 'time-wheel-hour')).toEqual(Array.from({ length: 16 }, (_, index) => String(8 + index)));
  });

  it('lets assistive tech adjust each wheel one row at a time', async () => {
    const onChange = jest.fn();
    const view = await render(<Harness initial={{ hour: 23, minute: 55 }} onChange={onChange} />);
    const hours = view.getByTestId('time-wheel-hour');

    expect(hours.props.accessibilityRole).toBe('adjustable');
    await act(async () => {
      fireEvent(hours, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    });
    expect(onChange).toHaveBeenLastCalledWith({ hour: 22, minute: 55 });
    // The last row has no next one.
    onChange.mockClear();
    await act(async () => {
      fireEvent(view.getByTestId('time-wheel-minute'), 'accessibilityAction', {
        nativeEvent: { actionName: 'increment' },
      });
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});
