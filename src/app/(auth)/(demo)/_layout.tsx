// BeautIzzy — Playground demo group (development ONLY)
//
// The SAME operational routes as `(app)` — tabs, appointment and client
// screens, the catalogue and its editor — mounted inside the Playground demo
// runtime instead of the account's providers: the real screens, on the
// in-memory data of the chosen profession. Being a group of `(auth)`, it
// exists only while signed out, and its paths (`/agenda`, `/clients/…`,
// `/services/…`) resolve here from inside the demo because Expo Router
// prefers the current group: every push of the real screens stays in the
// demo.
//
// The runtime module is required inside a `__DEV__` branch — never imported
// statically — so release bundles drop it with the fixtures. The route
// enforces THE availability rule on top of the (auth) layout's guard, and
// the runtime redirects to the landing when no demo was chosen (a direct
// navigation, a deep link): nothing here renders without a scenario.

import { Redirect, Stack } from 'expo-router';

import { isPlaygroundAvailable } from '@/features/playground/availability';
import { openInMemorySourisDatabase } from '@/persistence/expo-database';
import { contentSheet, editorSheet, workflowSheet } from '@/providers/sheet-route-options';
import { semanticColors } from '@/shared/ui/theme';

const PlaygroundDemoRuntime = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('@/features/playground/demo/PlaygroundDemoRuntime') as typeof import('@/features/playground/demo/PlaygroundDemoRuntime'))
      .PlaygroundDemoRuntime
  : undefined;

const pushedScreen = {
  headerShown: false,
  contentStyle: { backgroundColor: semanticColors.screen },
};

export default function PlaygroundDemoLayout() {
  if (PlaygroundDemoRuntime === undefined || !isPlaygroundAvailable()) return <Redirect href="/" />;

  return (
    <PlaygroundDemoRuntime openDatabase={openInMemorySourisDatabase}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: semanticColors.screen },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="appointments/[appointmentId]" options={contentSheet} />
        <Stack.Screen name="appointments/new" options={workflowSheet} />
        <Stack.Screen name="appointments/edit/[appointmentId]" options={workflowSheet} />
        <Stack.Screen name="estimations/new" options={workflowSheet} />
        <Stack.Screen name="calendar-blocks/[calendarBlockId]" options={contentSheet} />
        <Stack.Screen name="clients/[clientId]" options={pushedScreen} />
        <Stack.Screen name="clients/import" options={pushedScreen} />
        <Stack.Screen name="clients/appointments/[clientId]" options={pushedScreen} />
        <Stack.Screen name="clients/purchases/[clientId]" options={pushedScreen} />
        <Stack.Screen name="services/index" options={pushedScreen} />
        <Stack.Screen name="services/new" options={editorSheet} />
        <Stack.Screen name="services/[serviceId]" options={editorSheet} />
        {/* Step B2: the demo answers « Non disponible » where the product would sell. */}
        <Stack.Screen name="sales/new" options={pushedScreen} />
      </Stack>
    </PlaygroundDemoRuntime>
  );
}
