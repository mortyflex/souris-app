// BeautIzzy — Business-scoped reminder preference cache (Lots B/C1)
//
// Backward compatibility of the cached JSON: a cache written by a build
// that predates the SMS switch has no `smsRemindersEnabled` key and must
// read as FALSE (the fail-safe), never as an error and never as enabled.

import { writeMetadata } from '@/persistence/metadata';
import { migrateDatabase } from '@/persistence/migrations';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { testBusiness } from '@/providers/testing/TestPersistenceProvider';

import {
  readCachedCommunicationPreferences,
  writeCachedCommunicationPreferences,
} from '../preferences-cache';

describe('SMS switch compatibility (Lot C1)', () => {
  it('a pre-C1 cached record without the SMS key reads as false', () => {
    const database = openTestDatabase();
    migrateDatabase(database);
    writeMetadata(
      database,
      'communication_preferences_cache',
      JSON.stringify({
        businessId: testBusiness.id,
        emailRemindersEnabled: true,
        replyToEmail: 'salon@example.test',
        cachedAt: '2026-09-01T10:00:00.000Z',
      }),
    );

    expect(readCachedCommunicationPreferences(database, testBusiness.id)).toEqual({
      emailRemindersEnabled: true,
      smsRemindersEnabled: false,
      replyToEmail: 'salon@example.test',
    });
  });

  it('the SMS switch round-trips through the cache', () => {
    const database = openTestDatabase();
    migrateDatabase(database);
    writeCachedCommunicationPreferences(database, testBusiness.id, {
      emailRemindersEnabled: true,
      smsRemindersEnabled: true,
      replyToEmail: 'salon@example.test',
    });

    expect(readCachedCommunicationPreferences(database, testBusiness.id)).toEqual({
      emailRemindersEnabled: true,
      smsRemindersEnabled: true,
      replyToEmail: 'salon@example.test',
    });
  });
});
