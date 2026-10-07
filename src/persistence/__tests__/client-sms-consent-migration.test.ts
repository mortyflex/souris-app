// BeautIzzy — schema v16: Client promotional SMS consent (SMS pivot Phase 2)
//
// Three nullable columns travelling together on `clients`: the explicit
// consent (OPTED_IN / OPTED_OUT, NULL = UNKNOWN), the recording instant and
// the recording source. Every existing Client stays UNKNOWN — the migration
// never backfills a consent, marks nothing in the outbox and rewrites no
// row. The CLIENT sync payload always carries the triple (values or three
// nulls); a remote pulled through functions that predate the consent simply
// has no keys, which reads as UNKNOWN — never a failure.

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import { migrateDatabase, readSchemaVersion } from '../migrations';
import { CURRENT_SCHEMA_VERSION, migrations } from '../schema';
import { loadClients, updateClient } from '../stores/clients';
import { readAggregatePayload } from '../sync/aggregate-payload';
import { parseRemoteBusinessSnapshot } from '../sync/remote-snapshot';
import { createTestSeed } from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

const CONSENT_RECORD = {
  status: 'OPTED_IN',
  updatedAt: new Date('2026-09-27T10:00:00.000Z'),
  source: 'PROFESSIONAL',
} as const;

/** A database exactly as the previous build (schema v15) leaves it. */
function openSchemaV15Database() {
  const db = openTestDatabase();
  db.withTransactionSync(() => {
    for (const migration of migrations.filter((candidate) => candidate.version <= 15)) {
      migration.up(db);
    }
    db.execSync('PRAGMA user_version = 15');
  });
  const insert =
    'INSERT INTO clients (id, first_name, last_name, phone, email, birthday, notes, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
  db.runSync(insert, ['client-lea', 'Léa', 'Martin', '06 12 34 56 78', null, '02-29', null, null]);
  db.runSync(insert, ['client-felix', 'Félix', null, null, 'felix@example.com', null, 'Préfère le matin', null]);
  db.runSync(
    "INSERT INTO sync_outbox (business_id, aggregate_type, aggregate_id, operation, revision, created_at, updated_at) VALUES ('business-remote', 'CLIENT', 'client-lea', 'UPSERT', 2, '2026-09-19T08:00:00.000Z', '2026-09-19T09:00:00.000Z')",
  );
  db.runSync("INSERT INTO souris_metadata (key, value) VALUES ('seed_version', '1')");
  return db;
}

describe('schema v16 migration on an existing v15 database', () => {
  it('adds three NULL consent columns and leaves every Client and sync row untouched', () => {
    const db = openSchemaV15Database();
    const clientsBefore = db.getAllSync(
      'SELECT rowid, id, first_name, last_name, phone, email, birthday, notes, archived_at FROM clients ORDER BY rowid',
    );
    const outboxBefore = db.getAllSync('SELECT * FROM sync_outbox ORDER BY id');
    const createSeed = jest.fn(createTestSeed);

    const snapshot = bootstrapPersistence(db, createSeed);

    expect(readSchemaVersion(db)).toBe(16);
    expect(CURRENT_SCHEMA_VERSION).toBe(16);
    expect(createSeed).not.toHaveBeenCalled();
    expect(
      db.getAllSync(
        'SELECT rowid, id, first_name, last_name, phone, email, birthday, notes, archived_at FROM clients ORDER BY rowid',
      ),
    ).toEqual(clientsBefore);
    // No backfill, ever: every existing client stays UNKNOWN.
    expect(
      db.getFirstSync<{ count: number }>(
        'SELECT COUNT(*) AS count FROM clients WHERE sms_marketing_consent IS NOT NULL OR sms_marketing_consent_updated_at IS NOT NULL OR sms_marketing_consent_source IS NOT NULL',
      )?.count,
    ).toBe(0);
    // The migration changed nothing the remote should hear about.
    expect(db.getAllSync('SELECT * FROM sync_outbox ORDER BY id')).toEqual(outboxBefore);
    // UNKNOWN loads as an ABSENT domain value, never a null key.
    for (const client of snapshot.clients) {
      expect('smsMarketingConsent' in client).toBe(false);
    }
  });

  it('is idempotent and round-trips a recorded consent afterwards', () => {
    const db = openSchemaV15Database();
    bootstrapPersistence(db, createTestSeed);
    expect(migrateDatabase(db)).toBe(16);

    const lea = loadClients(db).find((client) => client.id === 'client-lea');
    updateClient(db, { ...lea!, smsMarketingConsent: CONSENT_RECORD });

    expect(loadSnapshot(db).clients.find((client) => client.id === 'client-lea')?.smsMarketingConsent).toEqual(
      CONSENT_RECORD,
    );

    // Clearing back to « Non renseigné » removes the whole triple.
    const optedIn = loadClients(db).find((client) => client.id === 'client-lea');
    const { smsMarketingConsent: _cleared, ...unknownAgain } = optedIn!;
    updateClient(db, unknownAgain);
    expect(
      db.getFirstSync<{ count: number }>(
        "SELECT COUNT(*) AS count FROM clients WHERE id = 'client-lea' AND sms_marketing_consent IS NULL AND sms_marketing_consent_updated_at IS NULL AND sms_marketing_consent_source IS NULL",
      )?.count,
    ).toBe(1);
  });

  it('an out-of-vocabulary stored value reads as UNKNOWN rather than crashing', () => {
    const db = openSchemaV15Database();
    bootstrapPersistence(db, createTestSeed);
    // Simulate hostile/foreign data around the CHECK (updated_at without a status).
    db.runSync(
      "UPDATE clients SET sms_marketing_consent_updated_at = '2026-01-01T00:00:00.000Z' WHERE id = 'client-felix'",
    );
    expect(loadClients(db).find((client) => client.id === 'client-felix')?.smsMarketingConsent).toBeUndefined();
  });
});

describe('CLIENT sync payload with the consent triple', () => {
  it('always serializes the three keys — values, or three nulls for UNKNOWN', () => {
    const db = openSchemaV15Database();
    bootstrapPersistence(db, createTestSeed);
    const ref = { aggregateType: 'CLIENT', aggregateId: 'client-lea' } as const;

    const unknown = readAggregatePayload(db, 'business-remote', ref) as unknown as Record<string, unknown>;
    expect(unknown.sms_marketing_consent).toBeNull();
    expect(unknown.sms_marketing_consent_updated_at).toBeNull();
    expect(unknown.sms_marketing_consent_source).toBeNull();

    const lea = loadClients(db).find((client) => client.id === 'client-lea');
    updateClient(db, { ...lea!, smsMarketingConsent: CONSENT_RECORD });
    const optedIn = readAggregatePayload(db, 'business-remote', ref) as unknown as Record<string, unknown>;
    expect(optedIn.sms_marketing_consent).toBe('OPTED_IN');
    expect(optedIn.sms_marketing_consent_updated_at).toBe('2026-09-27T10:00:00.000Z');
    expect(optedIn.sms_marketing_consent_source).toBe('PROFESSIONAL');
  });

  it('a pulled Client without the consent keys (older remote) reads as UNKNOWN, never a failure', () => {
    const snapshot = parseRemoteBusinessSnapshot({
      pulled_at: '2026-09-27T10:00:00.000Z',
      clients: [
        {
          id: 'client-old',
          sync_version: 1,
          deleted_at: null,
          first_name: 'Léa',
          last_name: null,
          phone: null,
          email: null,
          birthday: null,
          notes: null,
          photo_path: null,
          archived_at: null,
        },
      ],
      services: [],
      products: [],
      appointments: [],
      sales: [],
    });
    expect(snapshot.clients[0]?.payload?.sms_marketing_consent).toBeNull();
    expect(snapshot.clients[0]?.payload?.sms_marketing_consent_updated_at).toBeNull();
    expect(snapshot.clients[0]?.payload?.sms_marketing_consent_source).toBeNull();
  });

  it('a pulled out-of-vocabulary consent is refused', () => {
    expect(() =>
      parseRemoteBusinessSnapshot({
        pulled_at: '2026-09-27T10:00:00.000Z',
        clients: [
          {
            id: 'client-bad',
            sync_version: 1,
            deleted_at: null,
            first_name: 'Léa',
            last_name: null,
            phone: null,
            email: null,
            birthday: null,
            notes: null,
            photo_path: null,
            sms_marketing_consent: 'MAYBE',
            sms_marketing_consent_updated_at: null,
            sms_marketing_consent_source: null,
            archived_at: null,
          },
        ],
        services: [],
        products: [],
        appointments: [],
        sales: [],
      }),
    ).toThrow();
  });
});
