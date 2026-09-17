import { createUuidV4, isUuidV4, UUID_V4_PATTERN } from '../uuid';

describe('createUuidV4', () => {
  it('returns a canonical lowercase UUID v4', () => {
    const id = createUuidV4();

    expect(id).toMatch(UUID_V4_PATTERN);
    expect(id).toHaveLength(36);
    expect(id.charAt(14)).toBe('4');
    expect(['8', '9', 'a', 'b']).toContain(id.charAt(19));
  });

  it('never repeats across rapid generation', () => {
    const ids = new Set<string>();
    for (let index = 0; index < 10_000; index += 1) ids.add(createUuidV4());

    expect(ids.size).toBe(10_000);
  });

  it('does not depend on the clock or on module state: a restart in the same millisecond stays unique', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-14T10:00:00.000Z'));
    try {
      const firstLaunch = new Set<string>();
      const secondLaunch = new Set<string>();
      jest.isolateModules(() => {
        const { createUuidV4: create } = jest.requireActual<typeof import('../uuid')>('../uuid');
        for (let index = 0; index < 50; index += 1) firstLaunch.add(create());
      });
      jest.isolateModules(() => {
        const { createUuidV4: create } = jest.requireActual<typeof import('../uuid')>('../uuid');
        for (let index = 0; index < 50; index += 1) secondLaunch.add(create());
      });

      expect(firstLaunch.size).toBe(50);
      expect(secondLaunch.size).toBe(50);
      for (const id of secondLaunch) expect(firstLaunch.has(id)).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('refuses to hand out a non-UUID when the platform generator is unavailable', () => {
    jest.isolateModules(() => {
      jest.doMock('expo-crypto', () => ({ randomUUID: () => undefined }));
      const { createUuidV4: create } = jest.requireActual<typeof import('../uuid')>('../uuid');

      expect(() => create()).toThrow('createUuidV4: the platform did not return a UUID v4');
    });
    jest.dontMock('expo-crypto');
  });
});

describe('isUuidV4', () => {
  it.each([
    ['8f5c2a1e-3b7d-4c9a-9e2f-1a2b3c4d5e6f', true],
    ['client-1757840400000-1', false],
    ['8F5C2A1E-3B7D-4C9A-9E2F-1A2B3C4D5E6F', false],
    ['8f5c2a1e-3b7d-1c9a-9e2f-1a2b3c4d5e6f', false],
    ['8f5c2a1e-3b7d-4c9a-7e2f-1a2b3c4d5e6f', false],
    ['', false],
  ])('%s → %s', (value, expected) => {
    expect(isUuidV4(value)).toBe(expected);
  });
});
