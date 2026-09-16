import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';

import type { GameColor } from '../../../game';
import { SUPABASE_CONFIG } from '../../../supabase.config';
import {
  MultiplayerError,
  MultiplayerPort,
  type ParticipantDraft
} from '../domain/multiplayer.port';
import {
  createRoomCode,
  hostParticipant,
  type Participant,
  type Room,
  type RoomCode
} from '../domain/room';
import type { Difficulty, HostRole, MatchSetup } from '../domain/setup-config';

interface RoomRow {
  readonly id: string;
  readonly code: string;
  readonly difficulty: Difficulty;
  readonly question_count: number;
  readonly host_role: HostRole;
  readonly status: 'waiting' | 'playing' | 'finished';
  readonly created_at: string;
}

interface ParticipantRow {
  readonly id: string;
  readonly user_id: string;
  readonly name: string;
  readonly color: GameColor;
  readonly role: 'host' | 'guest';
  readonly status: 'joining' | 'ready';
  readonly plays: boolean;
  readonly joined_at: string;
}

const ROOM_COLUMNS = 'id, code, difficulty, question_count, host_role, status, created_at';
const PARTICIPANT_COLUMNS = 'id, user_id, name, color, role, status, plays, joined_at';
const CODE_ATTEMPTS = 12;
const UNIQUE_VIOLATION = '23505';

/**
 * Adaptador de sala sobre Supabase. Cada dispositivo entra con una sesión
 * anónima, así que `auth.uid()` identifica el asiento sin pedir cuenta, y las
 * reglas duras —sala llena, partida empezada, nombre o color repetidos— las
 * decide la base de datos; aquí solo se traducen a errores del dominio.
 *
 * Las condiciones de carrera reales viven en el servidor: dos personas pueden
 * pedir el mismo nombre o el último asiento en el mismo instante, y el cliente
 * nunca puede saberlo por adelantado.
 */
@Injectable()
export class SupabaseMultiplayerAdapter implements MultiplayerPort {
  private readonly config = inject(SUPABASE_CONFIG);
  private readonly state = signal<Room | null>(null);
  private readonly seatId = signal<string | null>(null);
  private client?: SupabaseClient;
  private channel?: RealtimeChannel;
  private roomId?: string;
  private userId?: string;

  readonly room = this.state.asReadonly();

  /** El asiento cuyo `user_id` es el de esta sesión anónima, si lo hay. */
  readonly self = computed<Participant | null>(() => {
    const room = this.state();
    const id = this.seatId();
    if (!room || !id) return null;
    return room.participants.find(participant => participant.id === id) ?? null;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => void this.unwatch());
  }

  async createRoom(setup: MatchSetup): Promise<Room> {
    const client = await this.connect();
    const host = hostParticipant(setup.hostRole);

    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
      const { data, error } = await client
        .from('rooms')
        .insert({
          code: createRoomCode(Math.random),
          difficulty: setup.difficulty,
          question_count: setup.questionCount,
          host_role: setup.hostRole
        })
        .select(ROOM_COLUMNS)
        .single<RoomRow>();

      if (error) {
        // El código ya estaba tomado por otra sala abierta: prueba con otro.
        if (error.code === UNIQUE_VIOLATION) continue;
        throw new MultiplayerError('unavailable', 'No pudimos abrir la sala.');
      }

      const seat = await client
        .from('participants')
        .insert({
          room_id: data.id,
          name: host.name,
          color: host.color,
          role: 'host',
          status: 'ready',
          plays: host.plays
        })
        .select(PARTICIPANT_COLUMNS)
        .single<ParticipantRow>();

      if (seat.error) {
        await client.from('rooms').update({ closed_at: new Date().toISOString() }).eq('id', data.id);
        throw new MultiplayerError('unavailable', 'No pudimos abrir la sala.');
      }

      this.seatId.set(seat.data.id);
      return this.watch(data, [seat.data]);
    }

    throw new MultiplayerError('code-unavailable', 'No pudimos reservar un código de sala libre.');
  }

  async restoreRoom(code: RoomCode): Promise<Room> {
    const client = await this.connect();
    const { data, error } = await client
      .from('rooms')
      .select(ROOM_COLUMNS)
      .eq('code', code)
      .is('closed_at', null)
      .maybeSingle<RoomRow>();

    if (error) throw new MultiplayerError('unavailable', 'No pudimos contactar con la sala.');
    if (!data) throw new MultiplayerError('room-not-found', `La sala ${code} ya no está abierta.`);

    return this.watch(data, await this.readParticipants(client, data.id));
  }

  async joinRoom(code: RoomCode, draft: ParticipantDraft): Promise<Participant> {
    const room = await this.restoreRoom(code);
    const client = await this.connect();

    const { data, error } = await client
      .from('participants')
      .insert({
        room_id: this.roomId,
        name: draft.name.trim(),
        color: draft.color,
        role: 'guest',
        status: 'ready',
        plays: true
      })
      .select(PARTICIPANT_COLUMNS)
      .single<ParticipantRow>();

    if (error) throw joinError(error, room.code);

    this.seatId.set(data.id);
    await this.refresh();
    return toParticipant(data);
  }

  /**
   * Cierre de la sala por el anfitrión. Un fallo aquí no puede pasar en
   * silencio: la sala seguiría abierta reteniendo su código y la pantalla
   * habría vuelto a la configuración como si todo hubiera ido bien.
   *
   * No se cuentan las filas devueltas porque no distinguen nada: la sala
   * recién cerrada deja de verse por `rooms_select_open`, así que un cierre
   * correcto devuelve la misma lista vacía que una sala que ya no estaba.
   * Ambos casos dejan la sala cerrada, que es lo que se pedía.
   */
  async closeRoom(code: RoomCode): Promise<void> {
    const client = await this.connect();
    const { error } = await client
      .from('rooms')
      .update({ closed_at: new Date().toISOString() })
      .eq('code', code)
      .is('closed_at', null);

    if (error) throw new MultiplayerError('unavailable', 'No pudimos cerrar la sala.');
    await this.forget();
  }

  /**
   * Salida del invitado: borra su propia fila y deja la sala abierta. La
   * política `participants_delete_self_or_host` ya limita el borrado al asiento
   * de `auth.uid()`, así que nadie puede retirar a otro con esta llamada.
   */
  async leaveRoom(code: RoomCode): Promise<void> {
    const client = await this.connect();
    if (!this.roomId) await this.restoreRoom(code);
    const roomId = this.roomId;
    if (roomId && this.userId) {
      const { error } = await client
        .from('participants')
        .delete()
        .eq('room_id', roomId)
        .eq('user_id', this.userId);

      if (error) throw new MultiplayerError('unavailable', 'No pudimos retirar tu asiento.');
    }
    await this.forget();
  }

  /** Abre la sesión anónima una sola vez y la reutiliza entre recargas. */
  private async connect(): Promise<SupabaseClient> {
    if (!this.config) throw new MultiplayerError('unavailable', 'Esta copia no tiene sala remota configurada.');
    this.client ??= createClient(this.config.url, this.config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'chairo:sesion' }
    });

    const { data } = await this.client.auth.getSession();
    let session = data.session;
    if (!session) {
      const signed = await this.client.auth.signInAnonymously();
      if (signed.error) throw new MultiplayerError('unavailable', 'No pudimos identificar este dispositivo.');
      session = signed.data.session;
    }
    this.userId = session?.user.id;
    return this.client;
  }

  private async readParticipants(client: SupabaseClient, roomId: string): Promise<ParticipantRow[]> {
    const { data, error } = await client
      .from('participants')
      .select(PARTICIPANT_COLUMNS)
      .eq('room_id', roomId)
      .order('joined_at', { ascending: true });

    if (error) throw new MultiplayerError('unavailable', 'No pudimos leer los participantes.');
    return (data ?? []) as ParticipantRow[];
  }

  private async watch(row: RoomRow, participants: ParticipantRow[]): Promise<Room> {
    const room = toRoom(row, participants);
    this.state.set(room);
    this.markSeat(participants);

    if (this.roomId !== row.id) {
      await this.unwatch();
      this.roomId = row.id;
      this.channel = this.client!
        .channel(`sala:${row.id}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'participants', filter: `room_id=eq.${row.id}` },
          () => void this.refresh())
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${row.id}` },
          () => void this.refresh());
      await this.channel.subscribe();
    }

    return room;
  }

  /** Una sola lectura tras cualquier cambio: la sala es pequeña y siempre cabe. */
  private async refresh(): Promise<void> {
    const client = this.client;
    const roomId = this.roomId;
    if (!client || !roomId) return;

    // El filtro de `closed_at` es lo que hace desaparecer una sala cerrada:
    // `rooms_select_open` deja al anfitrión ver las suyas aunque estén
    // cerradas, porque sin eso no podría cerrarlas.
    const { data } = await client
      .from('rooms')
      .select(ROOM_COLUMNS)
      .eq('id', roomId)
      .is('closed_at', null)
      .maybeSingle<RoomRow>();
    if (!data) {
      await this.forget();
      return;
    }
    const participants = await this.readParticipants(client, roomId);
    this.state.set(toRoom(data, participants));
    this.markSeat(participants);
  }

  /** Reconoce el asiento propio en cada lectura: `auth.uid()` es el criterio. */
  private markSeat(participants: ParticipantRow[]): void {
    const mine = participants.find(row => row.user_id === this.userId);
    this.seatId.set(mine?.id ?? null);
  }

  private async forget(): Promise<void> {
    await this.unwatch();
    this.seatId.set(null);
    this.state.set(null);
  }

  private async unwatch(): Promise<void> {
    const channel = this.channel;
    this.channel = undefined;
    this.roomId = undefined;
    if (channel) await this.client?.removeChannel(channel);
  }
}

function toRoom(row: RoomRow, participants: ParticipantRow[]): Room {
  return {
    code: row.code,
    setup: {
      difficulty: row.difficulty,
      questionCount: row.question_count,
      hostRole: row.host_role
    },
    participants: participants.map(toParticipant),
    createdAt: Date.parse(row.created_at),
    status: row.status
  };
}

function toParticipant(row: ParticipantRow): Participant {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    status: row.status,
    color: row.color,
    plays: row.plays
  };
}

function joinError(error: { code?: string; message: string }, code: RoomCode): MultiplayerError {
  if (error.code === UNIQUE_VIOLATION) {
    if (error.message.includes('participants_room_name_key')) {
      return new MultiplayerError('name-taken', 'Ese nombre ya está en la sala.');
    }
    if (error.message.includes('participants_room_color_key')) {
      return new MultiplayerError('color-taken', 'Ese color ya está tomado.');
    }
    return new MultiplayerError('unavailable', 'Ya estás dentro de esta sala desde este dispositivo.');
  }
  if (error.message.includes('room-full')) return new MultiplayerError('room-full', 'La sala ya está completa.');
  if (error.message.includes('room-started')) return new MultiplayerError('room-started', 'La partida ya empezó.');
  if (error.message.includes('room-not-found')) {
    return new MultiplayerError('room-not-found', `La sala ${code} ya no está abierta.`);
  }
  return new MultiplayerError('unavailable', 'No pudimos entrar a la sala.');
}
