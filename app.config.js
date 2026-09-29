const IS_DEV = process.env.APP_VARIANT === 'development';

export default ({ config }) => ({
  ...config,
  name: IS_DEV ? 'Souris Dev' : config.name,
  ios: {
    ...config.ios,
    bundleIdentifier: IS_DEV
      ? 'com.mortyflex.sourisapp.dev'
      : config.ios.bundleIdentifier,
  },
});
