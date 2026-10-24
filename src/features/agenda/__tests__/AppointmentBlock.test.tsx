import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import type { Appointment } from '@/domain/appointments';
import { fontFamilies, semanticColors } from '@/shared/ui/theme';

import { agendaAppointmentPalettes } from '../appointment-palette';
import { AppointmentBlock } from '../components/AppointmentBlock';
import type { AgendaStaffSegment } from '../layout/agenda-staff-segments';

jest.mock('expo-image', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return { Image: (props: object) => React.createElement(View, props) };
});

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

function cardStyle(view: Awaited<ReturnType<typeof renderBlock>>) {
  return StyleSheet.flatten(view.getByRole('button').props.style) as Record<string, unknown>;
}

function renderBlock(
  height: number,
  blockSegment: AgendaStaffSegment,
  options: {
    readonly width?: number;
    readonly clientInitials?: string;
    readonly clientPhotoUri?: string;
  } = { clientInitials: 'AX' },
) {
  return render(
    <AppointmentBlock
      clientInitials={options.clientInitials}
      clientPhotoUri={options.clientPhotoUri}
      clientName="Ahlem X"
      segment={blockSegment}
      height={height}
      width={options.width}
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

describe('AppointmentBlock hierarchy by height', () => {
  const multiService = (minutes: number): AgendaStaffSegment => ({
    ...segment(),
    serviceName: 'Couleur · Coupe',
    phaseNames: ['Application', 'Coupe'],
    endAt: new Date(2026, 7, 24, 9, minutes),
  });

  it('groups a tall card at its start line: initials, name, services, phases — no time, no duration', async () => {
    // 90 minutes on the 68 pt hour.
    const view = await renderBlock(102, multiService(90));

    expect(cardStyle(view)).toMatchObject({ justifyContent: 'flex-start', paddingTop: 4 });
    const avatar = view.getByTestId('appointment-block-avatar');
    expect(avatar).toHaveStyle({ height: 32, width: 32 });
    expect(avatar).toHaveTextContent('AX');
    expect(view.getByText('Ahlem X')).toHaveStyle({ lineHeight: 18 });
    // Several prestations stay ONE summary line.
    expect(view.getByText('Couleur · Coupe').props.numberOfLines).toBe(1);
    expect(view.getByTestId('appointment-block-phase')).toHaveTextContent('Application · Coupe');
    // Reading order: name, services, phases.
    const order = view
      .getAllByText(/^(Ahlem X|Couleur · Coupe|Application · Coupe)$/)
      .map((node) => node.props.children);
    expect(order[0]).toBe('Ahlem X');
    expect(order[order.length - 1]).toBe('Application · Coupe');
    // The grid places the card: its time is never written.
    expect(view.queryByText(/\d{2}:\d{2}/)).toBeNull();
    // The height of the card is the duration: it is never written.
    expect(view.queryByText(/\d+ (h|min)/)).toBeNull();
    // The status is carried by the colours: never written.
    expect(view.queryByText(/Terminé|Planifié|Confirmé/)).toBeNull();
  });

  it('fits name, services and the phases line in a one-hour card, without a time or a duration', async () => {
    const view = await renderBlock(68, multiService(60));

    expect(view.queryByText(/\d{2}:\d{2}/)).toBeNull();
    expect(view.getByTestId('appointment-block-phase')).toHaveTextContent('Application · Coupe');
    expect(view.queryByText(/\d+ (h|min)/)).toBeNull();
  });

  it('gives the phases their own line on the shortest tall card, now the time is gone', async () => {
    const view = await renderBlock(56, multiService(50));

    expect(view.queryByText(/\d{2}:\d{2}/)).toBeNull();
    expect(view.getByTestId('appointment-block-phase')).toHaveTextContent('Application · Coupe');
  });

  it('keeps a medium card to two tight centred lines beside a smaller initials disc', async () => {
    const view = await renderBlock(40, segment());

    expect(cardStyle(view)).toMatchObject({ justifyContent: 'center' });
    expect(cardStyle(view).paddingTop).toBeUndefined();
    expect(view.getByTestId('appointment-block-avatar')).toHaveStyle({ height: 24, width: 24 });
    expect(view.getByText('Ahlem X')).toHaveStyle({ lineHeight: 16 });
    expect(view.getByText('Balayage 3')).toBeTruthy();
    expect(view.queryByText(/\d{2}:\d{2}/)).toBeNull();
    expect(view.queryByTestId('appointment-block-phase')).toBeNull();
  });

  it('reduces a short card to one line: no initials, no time', async () => {
    const view = await renderBlock(20, segment());

    expect(view.getByText(/Ahlem/).props.numberOfLines).toBe(1);
    expect(view.queryByText('Ahlem X')).toBeNull();
    expect(view.queryByTestId('appointment-block-avatar')).toBeNull();
    expect(view.queryByText(/\d{2}:\d{2}/)).toBeNull();
  });

  it('reduces a quarter-hour sliver to its colour, still spoken in full', async () => {
    const view = await renderBlock(12, segment());

    expect(view.queryByText(/Ahlem/)).toBeNull();
    expect(view.queryByTestId('appointment-block-avatar')).toBeNull();
    expect(cardStyle(view).backgroundColor).toBe(palette.background);
    expect(view.getByRole('button').props.accessibilityLabel).toBe('Ahlem X, Balayage 3');
  });

  it('drops the initials in a narrow overlap column and keeps the text', async () => {
    const view = await renderBlock(102, segment(), { clientInitials: 'AX', width: 98 });

    expect(view.queryByTestId('appointment-block-avatar')).toBeNull();
    expect(view.getByText('Ahlem X').props.numberOfLines).toBe(1);
  });

  it('shows no disc when the caller has no initials', async () => {
    const view = await renderBlock(102, segment(), {});

    expect(view.queryByTestId('appointment-block-avatar')).toBeNull();
    expect(view.getByText('Ahlem X')).toBeTruthy();
  });

  it('fills the same disc with the client photo when one is available', async () => {
    const view = await renderBlock(102, segment(), {
      clientInitials: 'AX',
      clientPhotoUri: 'file:///portrait.jpg',
    });

    expect(view.getByTestId('appointment-block-avatar')).toHaveStyle({
      height: 32,
      overflow: 'hidden',
      width: 32,
    });
    const photo = view.getByTestId('appointment-block-photo');
    expect(photo.props.source).toEqual({ uri: 'file:///portrait.jpg' });
    expect(photo.props.contentFit).toBe('cover');
    // Decorative: the card already speaks the client's name.
    expect(photo.props.accessible).toBe(false);
    expect(view.queryByText('AX')).toBeNull();
  });

  it('keeps the medium disc size for a photo', async () => {
    const view = await renderBlock(40, segment(), {
      clientInitials: 'AX',
      clientPhotoUri: 'file:///portrait.jpg',
    });

    expect(view.getByTestId('appointment-block-avatar')).toHaveStyle({ height: 24, width: 24 });
    expect(view.getByTestId('appointment-block-photo')).toBeTruthy();
  });

  it('falls back to the initials when the photo cannot load', async () => {
    const view = await renderBlock(102, segment(), {
      clientInitials: 'AX',
      clientPhotoUri: 'file:///missing.jpg',
    });

    await act(async () => {
      fireEvent(view.getByTestId('appointment-block-photo'), 'error');
    });

    expect(view.queryByTestId('appointment-block-photo')).toBeNull();
    expect(view.getByTestId('appointment-block-avatar')).toHaveTextContent('AX');
  });

  it('draws the initials on a solid white disc in the family ink, over the untouched pastel fill', async () => {
    const view = await renderBlock(102, segment());

    expect(view.getByTestId('appointment-block-avatar')).toHaveStyle({
      backgroundColor: semanticColors.surfaceElevated,
    });
    expect(textStyle(view.getByText('AX')).color).toBe(palette.primaryText);
    expect(cardStyle(view)).toMatchObject({
      backgroundColor: palette.background,
      borderLeftColor: palette.accent,
      borderLeftWidth: 3,
    });
  });

  it.each([
    [12, 3],
    [20, 5],
    [32, 8],
    [96, 12],
  ])('softens the corner with the height: %i pt tall, radius %i', async (height, radius) => {
    const view = await renderBlock(height, segment());

    expect(cardStyle(view).borderRadius).toBe(radius);
  });

  it('drains an exceptional outcome of its colour and still speaks it', async () => {
    const view = await renderBlock(96, segment(false, 'NO_SHOW'));

    expect(cardStyle(view).backgroundColor).not.toBe(palette.background);
    expect(cardStyle(view).borderLeftColor).not.toBe(palette.accent);
    expect(view.getByRole('button').props.accessibilityLabel).toBe('Ahlem X, Balayage 3, Absence');
  });
});
