import type { Page } from '@playwright/test';

/**
 * Las pruebas corren sin backend: se sirve una configuración vacía, así que la
 * aplicación elige el adaptador en memoria. La ruta del adaptador de Supabase
 * se verifica contra el proyecto real, no aquí.
 */
export async function withoutBackend(page: Page): Promise<void> {
  await page.route('**/supabase.json', route => route.fulfill({ json: {} }));
}

/**
 * Backend de Supabase simulado dentro del navegador. Las tres pantallas eligen
 * el adaptador remoto en cuanto `supabase.json` trae configuración, así que
 * esto es lo único que permite ejercitar sus caminos de fallo —RLS, red, sala
 * ya cerrada— sin salir a la red: cada petición la contesta Playwright.
 *
 * Los campos son mutables a propósito: una prueba puede rechazar la primera
 * escritura y aceptar la siguiente, que es como se comprueba que el aviso de
 * error no deja a nadie encerrado.
 */
export interface StubbedBackend {
  /** El `auth.uid()` de esta sesión; decide qué asiento reconoce como propio. */
  userId: string;
  room: Record<string, unknown>;
  participants: Record<string, unknown>[];
  /** Estado de la escritura de salida. 403 imita el rechazo de una política. */
  writeStatus: number;
}

/** Mismo puerto que el servidor estático, para que ni el websocket salga de la máquina. */
const BACKEND_ORIGIN = 'https://127.0.0.1:4173';

const RLS_DENIED = {
  code: '42501',
  details: null,
  hint: null,
  message: 'new row violates row-level security policy for table "rooms"'
};

export async function withStubbedBackend(page: Page, backend: StubbedBackend): Promise<void> {
  await page.route('**/supabase.json', route => route.fulfill({
    json: { url: BACKEND_ORIGIN, publishableKey: 'sb_publishable_de_pruebas' }
  }));

  await page.route(`${BACKEND_ORIGIN}/**`, route => {
    const method = route.request().method();
    const { pathname } = new URL(route.request().url());

    if (pathname === '/auth/v1/signup') {
      return route.fulfill({ json: anonymousSession(backend.userId) });
    }
    if (method === 'GET' && pathname === '/rest/v1/rooms') {
      return route.fulfill({ json: [backend.room] });
    }
    if (method === 'GET' && pathname === '/rest/v1/participants') {
      return route.fulfill({ json: backend.participants });
    }
    if (method === 'PATCH' || method === 'DELETE') {
      // Una escritura aceptada no devuelve filas: la sala recién cerrada deja
      // de verse, y el asiento borrado ya no está.
      return backend.writeStatus === 200
        ? route.fulfill({ status: 200, json: [] })
        : route.fulfill({ status: backend.writeStatus, json: RLS_DENIED });
    }
    return route.fulfill({ status: 404, json: [] });
  });
}

function anonymousSession(userId: string): Record<string, unknown> {
  return {
    access_token: 'sesion-de-pruebas',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'refresco-de-pruebas',
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      is_anonymous: true,
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-09-15T10:00:00Z'
    }
  };
}
