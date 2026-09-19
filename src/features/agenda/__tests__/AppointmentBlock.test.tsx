import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import type { Appointment } from '@/domain/appointments';
import { fontFamilies } from '@/shared/ui/theme';

import { agendaAppointmentPalettes } from '../appointment-palette';
import { AppointmentBlock } from '../components/AppointmentBlock';
import type { AgendaStaffSegment } from '../layout/agenda-staff-segments';

const palette = agendaAppointmentPalettes[0];

function segment(
  isResume = false,
  status: Appointment['status'] = 'SCHEDULED',
): AgendaStaffSegment {
  return {
    id: 'segment-a',
    appointmentId: 'appointment-a',
    clientId: 'client-a',
    status,
    serviceName: 'Balayage 3',
    phaseNames: [],
    startAt: new Date(2026, 7, 24, 9, 0),
    endAt: new Date(2026, 7, 24, 10, 0),
    isResume,
    phases: [],
  };
}

function renderBlock(height: number, blockSegment: AgendaStaffSegment) {
  return render(
    <AppointmentBlock
      clientName="Ahlem X"
      segment={blockSegment}
      height={height}
      palette={palette}
      onPress={() => undefined}
    />,
  );
}

function textStyle(node: { props: { style?: unknown } }) {
  return StyleSheet.flatten(node.props.style as never) as {
    color?: string;
    fontFamily?: string;
  };
}

describe('AppointmentBlock family typography', () => {
  it('writes the client name in the family ink and the service in its softer tone', async () => {
    const view = await renderBlock(96, segment());

    const client = textStyle(view.getByText('Ahlem X'));
    const service = textStyle(view.getByText('Balayage 3'));

    expect(client.color).toBe(palette.primaryText);
    expect(service.color).toBe(palette.secondaryText);
    expect(client.fontFamily).toBe(fontFamilies['600']);
    expect(service.fontFamily).toBe(fontFamilies['400']);
  });

  it('keeps a compact single-line card in the same family', async () => {
    const view = await renderBlock(20, segment(true));

    const client = textStyle(view.getByText(/Ahlem/));
    const reprise = textStyle(view.getByText(/Reprise/));

    expect(client.color).toBe(palette.primaryText);
    expect(reprise.color).toBe(palette.secondaryText);
    expect(client.fontFamily).toBe(fontFamilies['600']);
    expect(reprise.fontFamily).toBe(fontFamilies['400']);
  });

  it('paints a flat solid fill with a solid accent and no overlay layer', async () => {
    const view = await renderBlock(96, segment());
    const card = view.getByRole('button');
    const style = StyleSheet.flatten(card.props.style) as Record<string, unknown>;

    expect(style.backgroundColor).toBe(palette.background);
    expect(style.borderLeftColor).toBe(palette.accent);
    expect(style.experimental_backgroundImage).toBeUndefined();
    expect(style.opacity).toBeUndefined();
    expect(view.queryByTestId('appointment-block-gloss')).toBeNull();
    // Only text lives inside the card: nothing is drawn over the fill.
    expect(JSON.stringify(view.toJSON())).not.toContain('gradient');
  });

  it('keeps the soft status text of a completed card', async () => {
    const view = await renderBlock(96, segment(false, 'COMPLETED'));

    expect(textStyle(view.getByText('Ahlem X')).color).not.toBe(palette.primaryText);
  });
});
