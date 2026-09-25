import {
  createFakeTransportRegistry,
  FakeCommunicationTransport,
  FAKE_OUTCOME_PAYLOAD_KEY,
} from '../fake-transport';
import type { OutgoingCommunication } from '../transport';

function message(payload: Record<string, unknown>): OutgoingCommunication {
  return {
    id: 'communication-1',
    businessId: 'business-1',
    kind: 'APPOINTMENT_REMINDER',
    channel: 'EMAIL',
    recipient: 'client@example.test',
    payload,
  };
}

describe('fake communication transport', () => {
  it('succeeds deterministically with a stable fake provider message id', async () => {
    const transport = new FakeCommunicationTransport();
    const first = await transport.send(message({}));
    const second = await transport.send(message({}));
    expect(first).toEqual({ status: 'SENT', providerMessageId: 'fake:communication-1' });
    expect(second).toEqual(first);
    expect(transport.deliveries).toHaveLength(2);
  });

  it('fails retryably on the retryable directive, without recording a delivery', async () => {
    const transport = new FakeCommunicationTransport();
    const result = await transport.send(
      message({ [FAKE_OUTCOME_PAYLOAD_KEY]: 'RETRYABLE_FAILURE' }),
    );
    expect(result.status).toBe('RETRYABLE_FAILURE');
    expect(transport.deliveries).toHaveLength(0);
  });

  it('fails permanently on the permanent directive, without recording a delivery', async () => {
    const transport = new FakeCommunicationTransport();
    const result = await transport.send(
      message({ [FAKE_OUTCOME_PAYLOAD_KEY]: 'PERMANENT_FAILURE' }),
    );
    expect(result.status).toBe('PERMANENT_FAILURE');
    expect(transport.deliveries).toHaveLength(0);
  });

  it('registers the fake transport for both channels', () => {
    const { transport, registry } = createFakeTransportRegistry();
    expect(registry.EMAIL).toBe(transport);
    expect(registry.SMS).toBe(transport);
  });
});
