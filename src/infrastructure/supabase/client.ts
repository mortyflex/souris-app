// Souris — the ONE Supabase client
//
// Application-root only: screens and providers never import this module;
// they talk to the AuthGateway / BusinessGateway boundaries, which the root
// layout wires to the adapters below. Tests never import it either.
//
// Session persistence uses the `localStorage` installed by expo-sqlite
// (`expo-sqlite/localStorage/install`, the current Expo/Supabase
// integration), so no extra storage dependency is needed. Tokens live only
// inside that Supabase-owned storage — never in Souris business tables.
//
// `AppState` drives token auto-refresh (start when active, stop otherwise);
// the listener is registered exactly once, with the client.

import 'expo-sqlite/localStorage/install';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { readSupabaseConfig } from './config';
import type { Database } from './database-types';

export type SourisSupabaseClient = SupabaseClient<Database>;

let client: SourisSupabaseClient | undefined;

/**
 * Creates the client on first use. Throws `SupabaseConfigurationError` when
 * the environment is incomplete; callers turn that into a controlled state.
 */
export function getSupabaseClient(): SourisSupabaseClient {
  if (client) return client;

  const config = readSupabaseConfig();
  const created = createClient<Database>(config.url, config.publishableKey, {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
      // Native app: there is no URL to detect a session in.
      detectSessionInUrl: false,
    },
  });

  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void created.auth.startAutoRefresh();
    } else {
      void created.auth.stopAutoRefresh();
    }
  });

  client = created;
  return created;
}
