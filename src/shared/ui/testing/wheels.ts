// BeautIzzy — test helpers for the shared wheels (never imported by app code)
//
// Under Jest there is no native scrolling: a test settles a wheel column the
// way the platform reports it, with the momentum-end event of the snapped row.

import { act, fireEvent, type render } from '@testing-library/react-native';

import { WHEEL_ROW_HEIGHT } from '../WheelColumn';

type Rendered = Awaited<ReturnType<typeof render>>;

/** Scrolls a wheel column so that the row at `index` settles in the center. */
export async function settleWheel(view: Rendered, testID: string, index: number): Promise<void> {
  await act(async () => {
    fireEvent(view.getByTestId(testID), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { y: index * WHEEL_ROW_HEIGHT } },
    });
  });
}

/** Settles the row whose label is `label` (e.g. '19', '05'). */
export async function settleWheelOn(view: Rendered, testID: string, label: string): Promise<void> {
  const rows = view.getAllByTestId(new RegExp(`^${testID}-row-\\d+$`), { includeHiddenElements: true });
  const index = rows.findIndex((row) => row.props.testID === `${testID}-row-${Number(label)}`);
  if (index < 0) throw new Error(`No row ${label} on wheel ${testID}`);
  await settleWheel(view, testID, index);
}

/** The value a wheel column announces. */
export function wheelValue(view: Rendered, testID: string): string {
  return view.getByTestId(testID).props.accessibilityValue.text as string;
}

/** Labels of the rows a wheel column offers, in order. */
export function wheelRowKeys(view: Rendered, testID: string): string[] {
  return view
    .getAllByTestId(new RegExp(`^${testID}-row-\\d+$`), { includeHiddenElements: true })
    .map((row) => (row.props.testID as string).slice(`${testID}-row-`.length));
}
