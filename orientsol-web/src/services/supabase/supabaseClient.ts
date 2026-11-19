import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { platformSecureStorage, platformSecureStorageAdapter } from '@/services/storage/platformSecureStorage';


const STORAGE_KEY_URL = 'orientsol_supabase_url';
const STORAGE_KEY_KEY = 'orientsol_supabase_anon_key';

// Sin claves ni credenciales hardcodeadas en el código fuente.
// Se obtienen exclusivamente de las variables de entorno inyectadas en tiempo de build
// mediante GitHub Secrets (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).
const DEFAULT_SUPABASE_URL = '';
const DEFAULT_SUPABASE_ANON_KEY = '';

let clientInstance: SupabaseClient | null = null;

/**
 * Returns the effective Supabase URL and Anon Key.
 * Prioritizes build-time environment variables (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).
 * Falls back to localStorage/secureStorage, and finally to default verified credentials.
 */
export function getEffectiveSupabaseConfig(): { url: string; key: string } {
  let envUrl = '';
  let envKey = '';

  try {
    if (typeof import.meta.env.VITE_SUPABASE_URL === 'string') {
      envUrl = import.meta.env.VITE_SUPABASE_URL.trim();
    }
  } catch {}

  try {
    if (typeof import.meta.env.VITE_SUPABASE_ANON_KEY === 'string') {
      envKey = import.meta.env.VITE_SUPABASE_ANON_KEY.trim();
    }
  } catch {}

  // If valid environment variables were injected at build time, ALWAYS use them!
  if (
    envUrl.length > 0 &&
    !envUrl.includes('tu-proyecto') &&
    !envUrl.includes('placeholder') &&
    envKey.length > 0 &&
    !envKey.includes('tu-anon-key') &&
    !envKey.includes('placeholder')
  ) {
    return { url: envUrl, key: envKey };
  }

  // Fallback to localStorage / platformSecureStorage if user saved custom credentials
  let storageUrl = '';
  let storageKey = '';
  try {
    if (typeof localStorage !== 'undefined') {
      storageUrl = (localStorage.getItem(STORAGE_KEY_URL) || '').trim();
      storageKey = (localStorage.getItem(STORAGE_KEY_KEY) || '').trim();

      // Check if keys were moved to obfuscated storage prefix
      if (!storageUrl) {
        const secUrl = localStorage.getItem(`orientsol_sec_${STORAGE_KEY_URL}`);
        if (secUrl) {
          try {
            storageUrl = decodeURIComponent(atob(secUrl)).trim();
          } catch {}
        }
      }
      if (!storageKey) {
        const secKey = localStorage.getItem(`orientsol_sec_${STORAGE_KEY_KEY}`);
        if (secKey) {
          try {
            storageKey = decodeURIComponent(atob(secKey)).trim();
          } catch {}
        }
      }
    }
  } catch {}

  const url = storageUrl || envUrl || DEFAULT_SUPABASE_URL;
  const key = storageKey || envKey || DEFAULT_SUPABASE_ANON_KEY;

  return { url, key };
}

/**
 * Checks whether Supabase URL and Anon Key are configured and valid.
 */
export function isSupabaseConfigured(): boolean {
  const { url, key } = getEffectiveSupabaseConfig();
  return (
    url.length > 0 &&
    !url.includes('tu-proyecto') &&
    !url.includes('placeholder') &&
    key.length > 0 &&
    !key.includes('tu-anon-key') &&
    !key.includes('placeholder')
  );
}

/**
 * Returns the Supabase client singleton, or null if unconfigured.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const { url, key } = getEffectiveSupabaseConfig();

  if (!clientInstance) {
    try {
      clientInstance = createClient(url, key, {
        auth: {
          storage: platformSecureStorageAdapter,
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
    } catch (err) {
      console.error('[Supabase Client] Error initializing client:', err);
      return null;
    }
  }

  return clientInstance;
}

/**
 * Tests the connection to the configured Supabase database.
 */
export async function testSupabaseConnection(): Promise<{ ok: boolean; message: string; count?: number }> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      message: 'Supabase no está configurado (falta URL o Clave Anon).',
    };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return {
      ok: false,
      message: 'No se pudo inicializar el cliente de Supabase.',
    };
  }

  try {
    const { count, error } = await supabase
      .from('datos_mensuales')
      .select('*', { count: 'exact', head: true });

    if (error) {
      return {
        ok: false,
        message: `Error al consultar la tabla datos_mensuales: ${error.message}`,
      };
    }

    return {
      ok: true,
      message: `Conexión exitosa con Supabase (${count ?? 0} emplazamientos registrados).`,
      count: count ?? 0,
    };
  } catch (err: any) {
    return {
      ok: false,
      message: `Fallo de red o conexión: ${err.message || String(err)}`,
    };
  }
}

const STORAGE_KEY_BACKEND_URL = 'orientsol_backend_api_url';

/**
 * Returns optional custom backend API proxy URL (e.g. https://api.orientsol.com)
 * When set, the mobile app calls this backend instead of holding database credentials directly.
 */
export function getBackendApiUrl(): string {
  let envBackend = '';
  try {
    if (typeof import.meta.env.VITE_BACKEND_API_URL === 'string') {
      envBackend = import.meta.env.VITE_BACKEND_API_URL.trim();
    }
  } catch {}

  let storageBackend = '';
  try {
    if (typeof localStorage !== 'undefined') {
      storageBackend = (localStorage.getItem(STORAGE_KEY_BACKEND_URL) || '').trim();
    }
  } catch {}

  return storageBackend || envBackend || '';
}

/**
 * Checks whether an external backend proxy server is configured.
 */
export function isBackendProxyConfigured(): boolean {
  const url = getBackendApiUrl();
  return url.length > 0 && (url.startsWith('https://') || url.startsWith('http://'));
}

/**
 * Sets or updates the custom backend API proxy URL in platform secure storage.
 */
export function setBackendApiUrl(url: string): void {
  try {
    if (url.trim()) {
      platformSecureStorage.setItem(STORAGE_KEY_BACKEND_URL, url.trim()).catch(() => {});
    } else {
      platformSecureStorage.removeItem(STORAGE_KEY_BACKEND_URL).catch(() => {});
    }
  } catch {}
}


