// BeautIzzy — Communication Core (Lot B): the explicit refusal of a channel
// that has NO production transport.
//
// SMS is Lot C. A queue record that somehow carries channel SMS must not be
// silently "sent" by a fake transport in production, and must not retry
// forever: it fails permanently, with an explicit reason, and the record
// stays inspectable. Tests keep using the deterministic fake transport.

import type {
  CommunicationChannel,
  CommunicationTransport,
  OutgoingCommunication,
  TransportResult,
} from './transport.ts';

export class UnsupportedChannelTransport implements CommunicationTransport {
  constructor(private readonly channel: CommunicationChannel) {}

  send(message: OutgoingCommunication): Promise<TransportResult> {
    return Promise.resolve({
      status: 'PERMANENT_FAILURE',
      error: `channel ${message.channel ?? this.channel} has no production transport`,
    });
  }
}
