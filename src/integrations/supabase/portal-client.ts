// Cliente Supabase EXCLUSIVO del Portal de Cliente.
// Igual que client.ts pero con la sesión en sessionStorage (se borra al
// cerrar la pestaña/navegador) y una storageKey distinta para no pisar
// la sesión persistente del panel interno (staff).
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_');
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (isNewSupabaseApiKey(supabaseKey) && headers.get('Authorization') === `Bearer ${supabaseKey}`) {
      headers.delete('Authorization');
    }

    headers.set('apikey', supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function createPortalClient() {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('Missing Supabase environment variables for portal client.');
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: {
      fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
    },
    auth: {
      persistSession: true,
      storage: window.sessionStorage,
      storageKey: 'adecomex-portal-auth',
      autoRefreshToken: true,
    },
  });
}

let _portal: ReturnType<typeof createPortalClient> | undefined;

// Uso: import { supabasePortal } from "@/integrations/supabase/portal-client";
export const supabasePortal = new Proxy({} as ReturnType<typeof createPortalClient>, {
  get(_, prop, receiver) {
    if (!_portal) _portal = createPortalClient();
    return Reflect.get(_portal, prop, receiver);
  },
});
