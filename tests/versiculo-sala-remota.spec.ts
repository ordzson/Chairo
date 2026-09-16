import { expect, test } from '@playwright/test';

import { withStubbedBackend, type StubbedBackend } from './offline';

/**
 * Los caminos de fallo del adaptador de Supabase. El adaptador en memoria no
 * puede fallar al salir de la sala —escribe en el propio navegador— así que la
 * única forma de cubrirlos sin red es contestar las peticiones desde
 * Playwright, como hace `withStubbedBackend`.
 */

const roomUrl = (code: string): string => `./#/juegos/versiculo-o-inventiculo/sala/${code}`;

const HOST_ID = '11111111-1111-4111-8111-111111111111';
const GUEST_ID = '22222222-2222-4222-8222-222222222222';

const hostSeat = {
  id: 'asiento-anfitrion',
  user_id: HOST_ID,
  name: 'Tú',
  color: 'yellow',
  role: 'host',
  status: 'ready',
  plays: true,
  joined_at: '2026-09-15T10:00:00Z'
};

const guestSeat = {
  id: 'asiento-invitado',
  user_id: GUEST_ID,
  name: 'Leo',
  color: 'turquoise',
  role: 'guest',
  status: 'ready',
  plays: true,
  joined_at: '2026-09-15T10:01:00Z'
};

/** Sala abierta con el anfitrión y un invitado dentro, y la salida rechazada. */
function deniedBackend(userId: string): StubbedBackend {
  return {
    userId,
    room: {
      id: '33333333-3333-4333-8333-333333333333',
      code: 'ABCD',
      difficulty: 'medium',
      question_count: 10,
      host_role: 'player',
      status: 'waiting',
      created_at: '2026-09-15T10:00:00Z'
    },
    participants: [{ ...hostSeat }, { ...guestSeat }],
    writeStatus: 403
  };
}

test('cerrar la sala avisa cuando la escritura falla y no abandona la sala', async ({ page }) => {
  const backend = deniedBackend(HOST_ID);
  await withStubbedBackend(page, backend);
  await page.goto(roomUrl('ABCD'));

  await expect(page.getByRole('heading', { name: 'Sala lista', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar sala' }).click();

  await expect(page.getByRole('alert')).toHaveText(
    'No pudimos cerrar la sala: sigue abierta y nadie ha salido. Revisa tu conexión y vuelve a tocar «Cerrar sala».'
  );
  await expect(page).toHaveURL(/sala\/ABCD$/);
  await expect(page.getByRole('listitem').filter({ hasText: 'Leo' })).toBeVisible();

  // El aviso dice qué hacer, así que volver a tocarlo tiene que funcionar.
  backend.writeStatus = 200;
  await page.getByRole('button', { name: 'Cerrar sala' }).click();
  await expect(page).toHaveURL(/#\/juegos\/versiculo-o-inventiculo$/);
});

test('salir de la sala avisa al invitado cuando la escritura falla', async ({ page }) => {
  const backend = deniedBackend(GUEST_ID);
  await withStubbedBackend(page, backend);
  await page.goto(roomUrl('ABCD'));

  await expect(page.getByRole('heading', { name: 'Ya estás dentro', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Salir de la sala', exact: true }).click();

  await expect(page.getByRole('alert')).toHaveText(
    'No pudimos retirar tu asiento: sigues dentro de la sala. Revisa tu conexión y vuelve a tocar «Salir de la sala».'
  );
  await expect(page).toHaveURL(/sala\/ABCD$/);
  await expect(page.getByText('Esperando a que el anfitrión comience', { exact: true })).toBeVisible();

  backend.writeStatus = 200;
  await page.getByRole('button', { name: 'Salir de la sala', exact: true }).click();
  await expect(page).toHaveURL(/#\/juegos\/versiculo-o-inventiculo\/unirse$/);
});
