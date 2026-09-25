// Souris — Communication Core: the Lot A transport — fake, deterministic, offline
//
// The ONLY transport that exists in Lot A. It never touches the network and
// can therefore never email or SMS anyone. Tests (and a deployed Lot A
// worker, should a record ever become due) get deterministic behavior from a
// payload directive — never from randomness:
//
//   payload.fakeOutcome = 'RETRYABLE_FAILURE'  → retryable failure
//   payload.fakeOutcome = 'PERMANENT_FAILURE'  → permanent failure
//   anything else                              → success, providerMessageId fake:<id>

import type {
  CommunicationTransport,
  OutgoingCommunication,
  TransportRegistry,
  TransportResult,
} from './transport.ts';

export const FAKE_OUTCOME_PAYLOAD_KEY = 'fakeOutcome';

export class FakeCommunicationTransport implements CommunicationTransport {
  readonly deliveries: OutgoingCommunication[] = [];

  async send(message: OutgoingCommunication): Promise<TransportResult> {
    const directive = message.payload[FAKE_OUTCOME_PAYLOAD_KEY];
    if (directive === 'RETRYABLE_FAILURE') {
      return { status: 'RETRYABLE_FAILURE', error: 'fake transport: retryable failure' };
    }
    if (directive === 'PERMANENT_FAILURE') {
      return { status: 'PERMANENT_FAILURE', error: 'fake transport: permanent failure' };
    }
    this.deliveries.push(message);
    return { status: 'SENT', providerMessageId: `fake:${message.id}` };
  }
}

export function createFakeTransportRegistry(): {
  readonly transport: FakeCommunicationTransport;
  readonly registry: TransportRegistry;
} {
  const transport = new FakeCommunicationTransport();
  return { transport, registry: { EMAIL: transport, SMS: transport } };
}
