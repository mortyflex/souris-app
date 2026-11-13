module.exports = {
  preset: 'jest-expo',
  setupFiles: ['react-native-gesture-handler/jestSetup'],
  // web/ is the standalone Next.js application: its own dependencies, its own
  // checks. The mobile test run never crawls it.
  modulePathIgnorePatterns: ['<rootDir>/web/'],
};
