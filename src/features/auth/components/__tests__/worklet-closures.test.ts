// BeautIzzy — Welcome worklet boundary (static check of the REAL Babel output)
//
// What this is: the Welcome files are transpiled exactly as Metro does it
// (babel-preset-expo with the React Compiler on, then the worklets plugin) and
// every worklet's captured closure is inspected. A worklet must never capture
// a function the React Compiler hoisted out of it (`_temp`, `_temp2`, …): that
// function is not a worklet, so calling it on the UI runtime throws
// "[Worklets] Tried to synchronously call a Remote Function".
//
// What this is NOT: a test of the touch interaction. Jest has no UI runtime;
// the screen tests run under a Reanimated mock where every worklet is a plain
// JS function, so they cannot see this class of bug. The interaction itself
// must be validated by hand on a simulator or a device (finger down in the
// hero, drag, release).

interface BabelCore {
  transformFileSync(file: string, options: object): { code?: string | null } | null;
}

const babel = jest.requireActual<BabelCore>('@babel/core');

const metroLikeOptions = (filename: string) => ({
  babelrc: false,
  configFile: false,
  filename,
  presets: ['babel-preset-expo'],
  caller: {
    name: 'metro',
    bundler: 'metro',
    platform: 'ios',
    isDev: true,
    engine: 'hermes',
    supportsReactCompiler: true,
  },
});

/** Names captured by each worklet closure in a transpiled module. */
function workletCaptures(code: string): string[][] {
  return [...code.matchAll(/\.__closure=\{([^}]*)\}/g)].map((match) =>
    match[1]
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name.length > 0),
  );
}

const hoistedByReactCompiler = (name: string) => /^_temp\d*$/.test(name);

const welcomeFiles = [
  'src/features/auth/WelcomeScreen.tsx',
  'src/features/auth/components/WelcomeMotifs.tsx',
  'src/features/auth/components/welcome-force-field.ts',
  'src/features/auth/components/welcome-physics.ts',
];

describe('Welcome worklet closures', () => {
  it('detects the failure it guards against (a helper declared inside a worklet)', () => {
    const fixture = 'src/features/auth/testing/helper-inside-worklet.fixture.tsx';
    const code = babel.transformFileSync(fixture, metroLikeOptions(fixture))?.code ?? '';

    expect(workletCaptures(code).flat().some(hoistedByReactCompiler)).toBe(true);
  });

  it.each(welcomeFiles)('%s: no worklet captures a function hoisted out by the React Compiler', (file) => {
    const code = babel.transformFileSync(file, metroLikeOptions(file))?.code ?? '';
    const captures = workletCaptures(code);

    // Not vacuous: the worklets plugin really ran on this file.
    expect(captures.length).toBeGreaterThan(0);
    expect(captures.flat().filter(hoistedByReactCompiler)).toEqual([]);
  });
});
