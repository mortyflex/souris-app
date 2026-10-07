// BeautIzzy — Communication Core: the transport boundary
//
// The worker depends on this interface, never on a provider SDK. A transport
// reports success or one of two failure classes — retryable (a temporary
// provider problem: retry later under the central policy) or permanent (this
// message can never be delivered: fail now). Provider-specific detail (HTTP
// statuses, SDK errors) must be translated INTO these classes by the
// transport; it never leaks into the worker or the database lifecycle.
//
// Lot A ships no real transport: the only implementation is the fake one
// (fake-transport.ts). Lot B binds EMAIL to a real provider, Lot C binds SMS;
// their credentials will live in server environment secrets only.

export type CommunicationChannel = 'EMAIL' | 'SMS';

export interface OutgoingCommunication {
  readonly id: string;
  readonly businessId: string;
  readonly kind: string;
  readonly channel: CommunicationChannel;
  readonly recipient: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export type TransportResult =
  | { readonly status: 'SENT'; readonly providerMessageId?: string }
  | { readonly status: 'RETRYABLE_FAILURE'; readonly error: string }
  | { readonly status: 'PERMANENT_FAILURE'; readonly error: string };

export interface CommunicationTransport {
  send(message: OutgoingCommunication): Promise<TransportResult>;
}

/** One transport per channel. The worker refuses a channel it has no transport for. */
export type TransportRegistry = Readonly<
  Record<CommunicationChannel, CommunicationTransport>
>;
