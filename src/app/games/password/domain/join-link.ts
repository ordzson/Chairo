import type { RoomCode } from './room';

export const PASSWORD_JOIN_ROUTE = '#/juegos/revelaciones/unirse';

export function buildPasswordJoinUrl(href: string, code: RoomCode): string {
  const url = new URL(href);
  return `${url.origin}${url.pathname}${url.search}${PASSWORD_JOIN_ROUTE}/${code}`;
}

export function buildPasswordInvitation(joinUrl: string, code: RoomCode): string {
  return `Únete a Revelaciones en Chairo con el código ${code}: ${joinUrl}`;
}

