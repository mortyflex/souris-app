// The read row never breaks a label mid-word: its 112 pt column is a minimum, a longer
// label takes its natural width, and the value wraps UNDER the label when both no longer
// fit on one line (compact iPhone, larger text) — no screen width is assumed.

import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import {
  GROUPED_READ_ROW_LABEL_MIN_WIDTH,
  GROUPED_READ_ROW_VALUE_MIN_WIDTH,
  GroupedReadRow,
} from '../GroupedReadRow';

describe('GroupedReadRow', () => {
  it('keeps « Remboursement » whole: no fixed label width, a wrapping row, a value that yields its line', async () => {
    const view = await render(<GroupedReadRow label="Remboursement" testID="row" value="12,00 € · carte 12,00 € · mode confirmé" />);
    const row = view.getByTestId('row');
    expect(StyleSheet.flatten(row.props.style)).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap' });
    const label = StyleSheet.flatten(view.getByText('Remboursement').props.style);
    expect(label.width).toBeUndefined();
    expect(label).toMatchObject({ minWidth: GROUPED_READ_ROW_LABEL_MIN_WIDTH, maxWidth: '100%' });
    // The label is never truncated or limited in lines.
    expect(view.getByText('Remboursement').props.numberOfLines).toBeUndefined();
    const value = StyleSheet.flatten(view.getByText('12,00 € · carte 12,00 € · mode confirmé').props.style);
    expect(value).toMatchObject({ flexBasis: GROUPED_READ_ROW_VALUE_MIN_WIDTH, minWidth: GROUPED_READ_ROW_VALUE_MIN_WIDTH, flexGrow: 1, flexShrink: 1 });
    expect(value.flex).toBeUndefined();
  });
});
