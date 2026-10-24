import { render, within } from '@testing-library/react-native';

import { caution, cautionTint, semanticColors } from '@/shared/ui/theme';

import { NoShowWarningNotice } from '../NoShowWarningNotice';
import { getClientNoShowWarning, type ClientNoShowWarning } from '../presentation';

function warningFor(noShowCount: number, latestOutcome: 'NO_SHOW' | 'ATTENDED' | undefined) {
  return getClientNoShowWarning({ noShowCount, latestOutcome }) as ClientNoShowWarning;
}

describe('NoShowWarningNotice', () => {
  it('writes the title and the one supporting line, spoken as one element', async () => {
    const warning = warningFor(1, 'NO_SHOW');
    const view = await render(<NoShowWarningNotice testID="warning" warning={warning} />);

    const notice = view.getByTestId('warning');
    expect(within(notice).getByText('Dernier rendez-vous non honoré')).toBeTruthy();
    expect(
      within(notice).getByText('1 absence enregistrée. Pensez à demander un acompte.'),
    ).toBeTruthy();
    // Two text lines only: the card stays compact in a footer.
    expect(within(notice).getAllByText(/./)).toHaveLength(2);
    expect(notice.props.accessibilityLabel).toBe(warning.accessibilityLabel);
    expect(notice.props.accessibilityLiveRegion).toBe('polite');
    expect(notice.props.accessible).toBe(true);
  });

  it.each([
    ['amber', warningFor(2, 'NO_SHOW'), caution.amber600, cautionTint.amber],
    ['orange', warningFor(4, 'ATTENDED'), caution.orange600, cautionTint.orange],
    ['red', warningFor(6, undefined), caution.red600, cautionTint.red],
  ])('outlines a white card in %s by severity', async (_tone, warning, accent, badge) => {
    const view = await render(<NoShowWarningNotice testID="warning" warning={warning} />);

    const notice = view.getByTestId('warning');
    expect(notice).toHaveStyle({
      borderColor: accent,
      borderWidth: 1.5,
      backgroundColor: semanticColors.surfaceElevated,
    });
    // The badge disc is the only tinted fill; the copy stays navy / soft navy.
    expect(notice.children[0]).toHaveStyle({ backgroundColor: badge });
    expect(view.getByText(warning.title)).toHaveStyle({ color: semanticColors.foreground });
  });

  it('offers no action: the deposit suggestion is a sentence, never a button', async () => {
    const view = await render(
      <NoShowWarningNotice testID="warning" warning={warningFor(3, 'NO_SHOW')} />,
    );

    expect(view.queryByRole('button')).toBeNull();
    expect(view.queryByText(/Ajouter un acompte|Prendre un acompte/)).toBeNull();
    // The supporting line wraps freely: nothing clamps it for large text sizes.
    expect(view.getByText(/absences enregistrées/).props.numberOfLines).toBeUndefined();
  });
});
