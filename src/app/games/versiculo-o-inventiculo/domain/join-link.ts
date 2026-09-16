import type { RoomCode } from './room';

/**
 * Ruta definitiva de unión. La pantalla del invitado llega en una etapa
 * posterior, pero el QR ya debe llevar impresa la dirección final: un código
 * impreso o compartido hoy tiene que seguir siendo válido entonces.
 */
export const JOIN_ROUTE = '#/juegos/versiculo-o-inventiculo/unirse';

/** Conserva la base del despliegue (subcarpeta de GitHub Pages incluida). */
export function buildJoinUrl(href: string, code: RoomCode): string {
  const url = new URL(href);
  return `${url.origin}${url.pathname}${url.search}${JOIN_ROUTE}/${code}`;
}

export function buildInvitationMessage(joinUrl: string, code: RoomCode): string {
  return `Entra a ¿Versículo o inventículo? con el código ${code}: ${joinUrl}`;
}
