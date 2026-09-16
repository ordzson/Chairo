import { DOCUMENT } from '@angular/common';
import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';

import {
  MultiplayerError,
  MultiplayerPort,
  type ParticipantDraft
} from '../domain/multiplayer.port';
import {
  createRoomCode,
  hostParticipant,
  isRoomFull,
  type Participant,
  type Room,
  type RoomCode
} from '../domain/room';
import type { MatchSetup } from '../domain/setup-config';
import { RoomSnapshotStore } from './room-snapshot.store';
import { SeatStore } from './seat.store';

const CODE_ATTEMPTS = 12;

/**
 * Adaptador en memoria del puerto multijugador. Sostiene una sala por sesión,
 * la respalda en `RoomSnapshotStore` y acepta invitados a través de `joinRoom`,
 * que es la vía de la pantalla de unión. Impone las mismas reglas que la base
 * de datos del adaptador remoto, para que las pruebas cubran el mismo
 * comportamiento sin red.
 */
@Injectable()
export class InMemoryMultiplayerAdapter implements MultiplayerPort {
  private readonly document = inject(DOCUMENT);
  private readonly snapshots = inject(RoomSnapshotStore);
  private readonly seats = inject(SeatStore);
  private readonly state = signal<Room | null>(this.snapshots.read());
  private readonly seat = signal(this.seats.read());
  private readonly usedCodes = new Set<RoomCode>();

  readonly room = this.state.asReadonly();

  /**
   * Sin asiento anotado el dispositivo es el anfitrión: la sala en memoria vive
   * en este navegador, así que solo puede haberla creado él. El invitado
   * siempre deja su asiento anotado al unirse, y ahí manda la anotación.
   */
  readonly self = computed<Participant | null>(() => {
    const room = this.state();
    if (!room) return null;
    const seat = this.seat();
    if (seat && seat.code === room.code) {
      return room.participants.find(participant => participant.id === seat.participantId) ?? null;
    }
    return room.participants.find(participant => participant.role === 'host') ?? null;
  });

  constructor() {
    const unsubscribe = this.snapshots.onExternalChange(room => {
      const current = this.state();
      if (room && current && room.code !== current.code) return;
      this.state.set(room);
    });
    inject(DestroyRef).onDestroy(unsubscribe);
  }

  async createRoom(setup: MatchSetup): Promise<Room> {
    const host = hostParticipant(setup.hostRole);
    const room: Room = {
      code: this.nextCode(),
      setup,
      participants: [host],
      createdAt: Date.now()
    };
    this.takeSeat(room.code, host.id);
    this.commit(room);
    return room;
  }

  async restoreRoom(code: RoomCode): Promise<Room> {
    const current = this.state() ?? this.snapshots.read();
    if (!current || current.code !== code) {
      throw new MultiplayerError('room-not-found', `La sala ${code} ya no está abierta.`);
    }
    this.usedCodes.add(current.code);
    this.state.set(current);
    return current;
  }

  async joinRoom(code: RoomCode, draft: ParticipantDraft): Promise<Participant> {
    const room = await this.restoreRoom(code);
    if (isRoomFull(room)) throw new MultiplayerError('room-full', 'La sala ya está completa.');

    // Las mismas reglas que impone la base de datos en el adaptador remoto.
    const name = draft.name.trim();
    const taken = (value: string): string => value.trim().toLocaleLowerCase('es');
    if (room.participants.some(seat => taken(seat.name) === taken(name))) {
      throw new MultiplayerError('name-taken', 'Ese nombre ya está en la sala.');
    }
    if (room.participants.some(seat => seat.color === draft.color)) {
      throw new MultiplayerError('color-taken', 'Ese color ya está tomado.');
    }

    const participant: Participant = {
      id: `guest-${room.participants.length}-${Date.now()}`,
      name,
      role: 'guest',
      status: 'ready',
      color: draft.color,
      plays: true
    };
    this.takeSeat(room.code, participant.id);
    this.commit({ ...room, participants: [...room.participants, participant] });
    return participant;
  }

  async closeRoom(code: RoomCode): Promise<void> {
    this.takeSeat(null);
    if (this.state()?.code !== code) return;
    this.state.set(null);
    this.snapshots.write(null);
  }

  async leaveRoom(code: RoomCode): Promise<void> {
    const room = this.state() ?? this.snapshots.read();
    const seat = this.seat();
    this.takeSeat(null);
    if (!room || room.code !== code || !seat || seat.code !== code) return;

    const remaining = room.participants.filter(participant => participant.id !== seat.participantId);
    // Quien deja la sala vacía la cierra; nadie queda para volver a abrirla.
    if (remaining.length === 0) {
      this.state.set(null);
      this.snapshots.write(null);
      return;
    }
    this.commit({ ...room, participants: remaining });
  }

  private takeSeat(code: RoomCode | null, participantId?: string): void {
    const seat = code && participantId ? { code, participantId } : null;
    this.seats.write(seat);
    this.seat.set(seat);
  }

  private commit(room: Room): void {
    this.usedCodes.add(room.code);
    this.state.set(room);
    this.snapshots.write(room);
  }

  private nextCode(): RoomCode {
    const random = this.randomSource();
    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
      const code = createRoomCode(random);
      if (!this.usedCodes.has(code)) return code;
    }
    throw new MultiplayerError('code-unavailable', 'No pudimos reservar un código de sala libre.');
  }

  private randomSource(): () => number {
    const crypto = this.document.defaultView?.crypto;
    if (!crypto?.getRandomValues) return Math.random;
    return () => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;
  }
}
