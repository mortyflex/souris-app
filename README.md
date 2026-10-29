# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

1. Configure Supabase (account & Business identity only — see `docs/architecture/AUTH.md`)

   ```bash
   cp .env.example .env
   ```

   Fill `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the Supabase
   project Connect panel, and apply `supabase/migrations` as described in `supabase/README.md`.
   Never use the secret key or the database password in the app.

2. Start the app

   ```bash
   npm run dev
   ```

   This is the everyday development command (see [Development launcher](#development-launcher)).
   `npx expo start` still works for a bare Metro server.

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Development launcher

`npm run dev` (`scripts/dev.js`, plain Node, no dependency) starts ONE Metro server for every
device at once:

```bash
APP_VARIANT=development NODE_OPTIONS=--dns-result-order=ipv4first npx expo start --dev-client --lan
```

- `APP_VARIANT=development` evaluates `app.config.js` for BeautIzzy Dev, the
  `com.mortyflex.sourisapp.dev` build installed on the simulators and the iPhone.
- `--lan` advertises the Mac's Wi-Fi address, the only one a physical iPhone can reach.
- `--dns-result-order=ipv4first` keeps the loopback URLs IPv4: an IPv6 `ws://::1:8081` inspector
  URL crashes the iOS development client.
- `.env.development.local` and `.env` are loaded by Expo exactly as with `npx expo start`.

Once Metro answers on port 8081, the launcher opens BeautIzzy Dev with the Expo development-client
URL (`exp+souris-app://expo-development-client/?url=http://<lan-ip>:8081`):

- on every booted iOS Simulator where the `.dev` bundle identifier is installed, through
  `xcrun simctl openurl`;
- on every online Android emulator or device where the `.dev` package is installed, through adb
  (`adb` from the PATH, `ANDROID_HOME`, `ANDROID_SDK_ROOT` or `~/Library/Android/sdk`);
- the physical iPhone scans Metro's QR code over the same Wi-Fi.

Expo's own `i` / `a` shortcuts look for the bundle identifier of the native project generated under
`ios/` and `android/` (today the Apple Sandbox variant, `docs/architecture/ARCHITECTURE.md` §10) and
open the wrong application; the launcher addresses the `.dev` build by its identifier instead. The
LAN address is discovered at every start from the library Expo itself uses (`lan-network`) and
checked against Metro, so after a Wi-Fi change just restart `npm run dev`. The command never builds,
installs, uninstalls or resets anything: a missing development build is reported with the one-off
`APP_VARIANT=development npx expo run:ios` / `run:android` to run, a missing simulator or emulator is
reported and the other devices still start.

If a Metro server already listens on port 8081, no second one is started: a server of this project
started for the development variant is reused (the devices are opened against it, its QR code stays
in its own terminal), anything else is reported with the request to stop it first. Ctrl+C stops Metro
and the launcher together.

## Historical technical identifiers

The product was previously named Souris. The name is intentionally retained in technical
identifiers that real installs, data and infrastructure depend on, and must not be renamed:

- Expo slug `souris-app`, URL scheme `sourisapp`, bundle identifiers
  `com.mortyflex.sourisapp` and `com.mortyflex.sourisapp.dev`, the npm package name;
- the SQLite file `souris.db` and the `souris_metadata` table;
- the `SOURIS_EMAIL_LOGO_URL` secret and the `souris-communication-…` email idempotency key;
- applied migrations and internal `Souris*` TypeScript identifiers (for example `SourisDatabase`).

Everything a user, a client or an email recipient sees says BeautIzzy.
