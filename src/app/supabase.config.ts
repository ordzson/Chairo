import { DOCUMENT } from '@angular/common';
import { inject, InjectionToken, makeEnvironmentProviders, signal, type EnvironmentProviders } from '@angular/core';
import type { ResolveFn } from '@angular/router';

export interface SupabaseConfig {
  readonly url: string;
  readonly publishableKey: string;
}

/**
 * Configuración del backend, o `null` cuando no hay ninguno. Se lee en tiempo
 * de ejecución desde `supabase.json` en lugar de compilarse dentro del bundle:
 * el mismo despliegue estático puede cambiar de proyecto, o quedarse sin
 * backend y jugar solo en el dispositivo, sin volver a construir.
 *
 * La clave publicable viaja al navegador por definición; lo que protege los
 * datos son las políticas RLS de `supabase/schema.sql`.
 */
export const SUPABASE_CONFIG = new InjectionToken<SupabaseConfig | null>('SUPABASE_CONFIG');

const loaded = signal<SupabaseConfig | null>(null);
let pending: Promise<SupabaseConfig | null> | undefined;

export function provideSupabaseConfig(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: SUPABASE_CONFIG, useFactory: () => loaded() }
  ]);
}

/**
 * Resolver de las rutas que necesitan sala. El centro de juegos abre sin pagar
 * esta lectura, y arrancar la aplicación no espera a la red.
 */
export const supabaseBackendResolver: ResolveFn<SupabaseConfig | null> = () => {
  const document = inject(DOCUMENT);
  pending ??= loadSupabaseConfig(document).then(config => {
    loaded.set(config);
    return config;
  });
  return pending;
};

async function loadSupabaseConfig(document: Document): Promise<SupabaseConfig | null> {
  try {
    const response = await fetch(new URL('supabase.json', document.baseURI), { cache: 'no-cache' });
    if (!response.ok) return null;
    const parsed: unknown = await response.json();
    return isSupabaseConfig(parsed) ? parsed : null;
  } catch {
    // Sin configuración legible la aplicación sigue, con la sala en el aparato.
    return null;
  }
}

function isSupabaseConfig(value: unknown): value is SupabaseConfig {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SupabaseConfig>;
  return typeof candidate.url === 'string' && candidate.url.startsWith('https://') &&
    typeof candidate.publishableKey === 'string' && candidate.publishableKey.length > 0;
}
