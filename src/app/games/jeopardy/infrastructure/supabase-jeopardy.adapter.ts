import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';

import type { GameColor } from '../../../game';
import { SUPABASE_CONFIG } from '../../../supabase.config';
import type { JeopardyCell, JeopardyClue, JeopardyPlayer, JeopardyRoom, JeopardySetup, JeopardyTile } from '../domain/jeopardy';
import { JeopardyError, JeopardyPort, jeopardyErrorFrom, type JeopardySeatDraft } from '../domain/jeopardy.port';

/** Respaldo del aviso en tiempo real: si el websocket se cae, la sala sigue al día. */
const POLL_MS = 2000;

interface Snapshot {
  readonly roomId: string;
  readonly room: JeopardyRoom;
}

/**
 * Jeopardy sobre Supabase. Cada teléfono entra con una sesión anónima y todas
 * las jugadas son funciones de `supabase/schema.sql`, que comprueban turno,
 * fase y asiento con la sala bloqueada y devuelven la sala vista desde quien
 * llama. Aquí no se decide ninguna regla: solo se traducen los errores.
 *
 * Realtime avisa de cualquier cambio en la sala o en sus jugadores y entonces
 * se vuelve a pedir la sala entera; un sondeo cubre al teléfono que pierde el
 * websocket.
 */
@Injectable()
export class SupabaseJeopardyAdapter implements JeopardyPort {
  private readonly config = inject(SUPABASE_CONFIG);
  private readonly document = inject(DOCUMENT);
  private readonly state = signal<JeopardyRoom | null>(null);
  private client?: SupabaseClient;
  private channel?: RealtimeChannel;
  private poll?: number;
  private watchedRoomId?: string;
  private watchedCode?: string;
  private refreshing = false;
  private refreshQueued = false;
  /** Cuenta las jugadas enviadas: una lectura que empezó antes llega vieja. */
  private writes = 0;

  readonly room = this.state.asReadonly();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.unwatch());
  }

  createRoom(setup: JeopardySetup, hostName: string): Promise<JeopardyRoom> {
    return this.call('create_jeopardy_room', {
      p_rows: setup.rows,
      p_columns: setup.columns,
      p_double_count: setup.doubleCount,
      p_host_name: hostName
    });
  }

  restoreRoom(code: string): Promise<JeopardyRoom> {
    return this.call('get_jeopardy_room', { p_code: code });
  }

  joinRoom(code: string, draft: JeopardySeatDraft): Promise<JeopardyRoom> {
    return this.call('join_jeopardy_room', { p_code: code, p_name: draft.name, p_color: draft.color });
  }

  startGame(code: string, cells: readonly JeopardyCell[]): Promise<JeopardyRoom> {
    return this.call('start_jeopardy_game', {
      p_code: code,
      p_cells: cells.map(cell => ({
        column: cell.column,
        row: cell.row,
        category: cell.category,
        questionCategory: cell.question.category,
        prompt: cell.question.prompt,
        answer: cell.question.answer,
        reference: cell.question.reference,
        special: cell.special,
        double: cell.double
      }))
    });
  }

  selectCell(code: string, cellId: string): Promise<JeopardyRoom> {
    return this.call('select_jeopardy_cell', { p_code: code, p_cell_id: cellId });
  }

  setWager(code: string, wager: number): Promise<JeopardyRoom> {
    return this.call('set_jeopardy_wager', { p_code: code, p_wager: Math.round(wager) });
  }

  markAnswered(code: string): Promise<JeopardyRoom> {
    return this.call('mark_jeopardy_answered', { p_code: code });
  }

  judge(code: string, correct: boolean): Promise<JeopardyRoom> {
    return this.call('judge_jeopardy_answer', { p_code: code, p_correct: correct });
  }

  acceptSteal(code: string): Promise<JeopardyRoom> {
    return this.call('accept_jeopardy_steal', { p_code: code });
  }

  passSteal(code: string): Promise<JeopardyRoom> {
    return this.call('pass_jeopardy_steal', { p_code: code });
  }

  reopenRoom(code: string, setup: JeopardySetup): Promise<JeopardyRoom> {
    return this.call('reopen_jeopardy_room', {
      p_code: code,
      p_rows: setup.rows,
      p_columns: setup.columns,
      p_double_count: setup.doubleCount
    });
  }

  async closeRoom(code: string): Promise<void> {
    await this.run('close_jeopardy_room', { p_code: code });
    this.forget();
  }

  async leaveRoom(code: string): Promise<void> {
    await this.run('leave_jeopardy_room', { p_code: code });
    this.forget();
  }

  private async call(name: string, parameters: Record<string, unknown>): Promise<JeopardyRoom> {
    const snapshot = parseSnapshot(await this.run(name, parameters));
    this.state.set(snapshot.room);
    this.watch(snapshot);
    return snapshot.room;
  }

  private async run(name: string, parameters: Record<string, unknown>): Promise<unknown> {
    const client = await this.connect();
    this.writes += 1;
    const { data, error } = await client.rpc(name, parameters);
    if (error) {
      const failure = jeopardyErrorFrom(error.message);
      if (failure.reason === 'room-not-found') this.forget();
      throw failure;
    }
    return data;
  }

  /** Abre la sesión anónima una sola vez; es la misma que usa ¿Versículo o inventículo?. */
  private async connect(): Promise<SupabaseClient> {
    if (!this.config) throw new JeopardyError('unavailable', 'Esta copia no tiene sala remota configurada.');
    this.client ??= createClient(this.config.url, this.config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'chairo:sesion' }
    });
    const { data } = await this.client.auth.getSession();
    if (!data.session) {
      const signed = await this.client.auth.signInAnonymously();
      if (signed.error) throw new JeopardyError('unavailable', 'No pudimos identificar este dispositivo.');
    }
    return this.client;
  }

  private watch(snapshot: Snapshot): void {
    this.watchedCode = snapshot.room.code;
    if (this.watchedRoomId === snapshot.roomId || !this.client) return;
    this.unwatch();
    this.watchedRoomId = snapshot.roomId;
    this.watchedCode = snapshot.room.code;
    this.channel = this.client
      .channel(`jeopardy:${snapshot.roomId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'jeopardy_rooms', filter: `id=eq.${snapshot.roomId}` },
        () => void this.refresh())
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'jeopardy_players', filter: `room_id=eq.${snapshot.roomId}` },
        () => void this.refresh())
      .subscribe();
    this.poll = this.document.defaultView?.setInterval(() => void this.refresh(), POLL_MS);
  }

  private async refresh(): Promise<void> {
    const code = this.watchedCode;
    if (!code) return;
    if (this.refreshing) {
      this.refreshQueued = true;
      return;
    }
    this.refreshing = true;
    const writes = this.writes;
    try {
      const client = await this.connect();
      const { data, error } = await client.rpc('get_jeopardy_room', { p_code: code });
      if (code !== this.watchedCode || writes !== this.writes) return;
      if (error) {
        if (jeopardyErrorFrom(error.message).reason === 'room-not-found') this.forget();
        return;
      }
      this.state.set(parseSnapshot(data).room);
    } catch {
      // Sin red la sala se queda como estaba; el siguiente sondeo lo reintenta.
    } finally {
      this.refreshing = false;
      if (this.refreshQueued) {
        this.refreshQueued = false;
        void this.refresh();
      }
    }
  }

  private forget(): void {
    this.unwatch();
    this.state.set(null);
  }

  private unwatch(): void {
    const channel = this.channel;
    if (this.poll !== undefined) this.document.defaultView?.clearInterval(this.poll);
    this.channel = undefined;
    this.poll = undefined;
    this.watchedRoomId = undefined;
    this.watchedCode = undefined;
    if (channel) void this.client?.removeChannel(channel);
  }
}

function parseSnapshot(value: unknown): Snapshot {
  const raw = (value ?? {}) as Record<string, unknown>;
  const setup = raw['setup'] as Record<string, unknown> | undefined;
  if (typeof raw['roomId'] !== 'string' || typeof raw['code'] !== 'string' || !setup ||
    !Array.isArray(raw['players']) || !Array.isArray(raw['board'])) {
    throw new JeopardyError('unavailable', 'La sala devolvió un estado inválido.');
  }
  const clue = raw['clue'] as Record<string, unknown> | null;
  return {
    roomId: raw['roomId'],
    room: {
      code: raw['code'],
      status: raw['status'] as JeopardyRoom['status'],
      phase: raw['phase'] as JeopardyRoom['phase'],
      setup: {
        rows: Number(setup['rows']),
        columns: Number(setup['columns']),
        doubleCount: Number(setup['doubleCount'])
      },
      players: (raw['players'] as Record<string, unknown>[]).map((player): JeopardyPlayer => ({
        id: String(player['id']),
        name: String(player['name']),
        color: (player['color'] ?? null) as GameColor | null,
        isHost: Boolean(player['isHost']),
        plays: Boolean(player['plays']),
        score: Number(player['score'])
      })),
      selfId: optionalString(raw['selfId']),
      turnPlayerId: optionalString(raw['turnPlayerId']),
      attemptPlayerId: optionalString(raw['attemptPlayerId']),
      stealQueue: Array.isArray(raw['stealQueue']) ? raw['stealQueue'].map(String) : [],
      wager: raw['wager'] === null || raw['wager'] === undefined ? null : Number(raw['wager']),
      message: String(raw['message'] ?? ''),
      board: (raw['board'] as Record<string, unknown>[]).map((tile): JeopardyTile => ({
        id: String(tile['id']),
        column: Number(tile['column']),
        row: Number(tile['row']),
        category: String(tile['category']),
        value: Number(tile['value']),
        used: Boolean(tile['used'])
      })),
      clue: clue ? {
        id: String(clue['id']),
        category: String(clue['category']),
        value: Number(clue['value']),
        points: clue['points'] === null || clue['points'] === undefined ? null : Number(clue['points']),
        special: Boolean(clue['special']),
        double: Boolean(clue['double']),
        prompt: optionalString(clue['prompt']),
        answer: optionalString(clue['answer']),
        reference: optionalString(clue['reference'])
      } satisfies JeopardyClue : null
    }
  };
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
