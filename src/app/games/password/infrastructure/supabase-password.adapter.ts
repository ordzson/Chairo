import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';

import type { GameColor } from '../../../game';
import { SUPABASE_CONFIG } from '../../../supabase.config';
import {
  PasswordError,
  passwordErrorFrom,
  type PasswordPhase,
  type PasswordPlayer,
  type PasswordSnapshot,
  type RoundEntry
} from '../domain/match';
import { PasswordPort, type PasswordConnection, type PasswordSeatDraft } from '../domain/password.port';
import type { RoomCode } from '../domain/room';
import type { PasswordSetup, RoundSeconds } from '../domain/setup-config';

const POLL_MS = 1_500;

interface ParsedSnapshot {
  readonly roomId: string;
  readonly snapshot: PasswordSnapshot;
}

/**
 * Password remoto: todas las mutaciones pasan por RPC transaccionales. Realtime
 * solo despierta al cliente; cada aviso vuelve a pedir una instantánea
 * personalizada, por lo que la palabra del otro teléfono nunca viaja en el
 * canal. El sondeo sostiene la partida si el websocket se interrumpe.
 */
@Injectable()
export class SupabasePasswordAdapter implements PasswordPort {
  private readonly config = inject(SUPABASE_CONFIG);
  private readonly document = inject(DOCUMENT);
  private readonly state = signal<PasswordSnapshot | null>(null);
  private readonly connectionState = signal<PasswordConnection>('online');
  private client?: SupabaseClient;
  private channel?: RealtimeChannel;
  private poll?: number;
  private roomId?: string;
  private code?: RoomCode;
  private refreshing = false;
  private queued = false;
  private writes = 0;

  readonly snapshot = this.state.asReadonly();
  readonly connection = this.connectionState.asReadonly();

  constructor() {
    const view = this.document.defaultView;
    const onOnline = (): void => { this.connectionState.set('reconnecting'); void this.refresh(); };
    const onOffline = (): void => this.connectionState.set('offline');
    const onVisibility = (): void => {
      if (this.document.visibilityState === 'visible') {
        this.connectionState.set('reconnecting');
        void this.refresh();
      }
    };
    view?.addEventListener('online', onOnline);
    view?.addEventListener('offline', onOffline);
    this.document.addEventListener('visibilitychange', onVisibility);
    inject(DestroyRef).onDestroy(() => {
      view?.removeEventListener('online', onOnline);
      view?.removeEventListener('offline', onOffline);
      this.document.removeEventListener('visibilitychange', onVisibility);
      this.unwatch();
    });
  }

  createRoom(setup: PasswordSetup, hostName: string): Promise<PasswordSnapshot> {
    return this.call('create_password_room', { p_host_name: hostName, p_round_seconds: setup.roundSeconds });
  }

  restoreRoom(code: RoomCode): Promise<PasswordSnapshot> {
    return this.call('get_password_snapshot', { p_code: code }, false);
  }

  joinRoom(code: RoomCode, draft: PasswordSeatDraft): Promise<PasswordSnapshot> {
    return this.call('join_password_room', { p_code: code, p_name: draft.name, p_color: draft.color });
  }

  startMatch(code: RoomCode): Promise<PasswordSnapshot> {
    return this.call('start_password_match', { p_code: code });
  }

  setReady(code: RoomCode, ready: boolean, words: readonly string[]): Promise<PasswordSnapshot> {
    return this.call('set_password_ready', { p_code: code, p_ready: ready, p_words: words });
  }

  endRound(code: RoomCode): Promise<PasswordSnapshot> {
    return this.call('end_password_round', { p_code: code });
  }

  scoreRound(code: RoomCode, results: Readonly<Record<string, boolean>>): Promise<PasswordSnapshot> {
    return this.call('score_password_round', {
      p_code: code,
      p_results: Object.entries(results).map(([participantId, guessed]) => ({ participantId, guessed }))
    });
  }

  prepareRound(code: RoomCode): Promise<PasswordSnapshot> {
    return this.call('prepare_password_round', { p_code: code });
  }

  finishMatch(code: RoomCode): Promise<PasswordSnapshot> {
    return this.call('finish_password_match', { p_code: code });
  }

  reopenRoom(code: RoomCode, setup: PasswordSetup): Promise<PasswordSnapshot> {
    return this.call('reopen_password_room', { p_code: code, p_round_seconds: setup.roundSeconds });
  }

  async leaveRoom(code: RoomCode): Promise<void> {
    await this.run('leave_password_room', { p_code: code });
    this.forget();
  }

  async closeRoom(code: RoomCode): Promise<void> {
    await this.run('close_password_room', { p_code: code });
    this.forget();
  }

  private async call(
    name: string,
    parameters: Record<string, unknown>,
    mutation = true
  ): Promise<PasswordSnapshot> {
    if (mutation) this.writes += 1;
    const parsed = parseSnapshot(await this.rpc(name, parameters));
    this.state.set(parsed.snapshot);
    this.connectionState.set('online');
    this.watch(parsed);
    return parsed.snapshot;
  }

  private async run(name: string, parameters: Record<string, unknown>): Promise<unknown> {
    this.writes += 1;
    return this.rpc(name, parameters);
  }

  private async rpc(name: string, parameters: Record<string, unknown>): Promise<unknown> {
    const client = await this.connect();
    const { data, error } = await client.rpc(name, parameters);
    if (error) {
      const failure = passwordErrorFrom(error.message);
      if (failure.reason === 'room-not-found') this.forget();
      throw failure;
    }
    return data;
  }

  private async connect(): Promise<SupabaseClient> {
    if (!this.config) throw new PasswordError('unavailable', 'Esta copia no tiene sala remota configurada.');
    this.client ??= createClient(this.config.url, this.config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'chairo:sesion' }
    });
    const { data } = await this.client.auth.getSession();
    if (!data.session) {
      const signed = await this.client.auth.signInAnonymously();
      if (signed.error) throw new PasswordError('unavailable', 'No pudimos identificar este dispositivo.');
    }
    return this.client;
  }

  private watch(parsed: ParsedSnapshot): void {
    this.code = parsed.snapshot.code;
    if (this.roomId === parsed.roomId || !this.client) return;
    this.unwatch();
    this.roomId = parsed.roomId;
    this.code = parsed.snapshot.code;
    this.channel = this.client
      .channel(`password:${parsed.roomId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'password_rooms', filter: `id=eq.${parsed.roomId}` },
        () => void this.refresh())
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'password_players', filter: `room_id=eq.${parsed.roomId}` },
        () => void this.refresh())
      .subscribe(status => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') this.connectionState.set('reconnecting');
      });
    this.poll = this.document.defaultView?.setInterval(() => void this.refresh(), POLL_MS);
  }

  private async refresh(): Promise<void> {
    const code = this.code;
    if (!code) return;
    if (this.refreshing) {
      this.queued = true;
      return;
    }
    this.refreshing = true;
    this.connectionState.set('reconnecting');
    const writes = this.writes;
    try {
      const client = await this.connect();
      const { data, error } = await client.rpc('get_password_snapshot', { p_code: code });
      if (code !== this.code || writes !== this.writes) return;
      if (error) {
        if (passwordErrorFrom(error.message).reason === 'room-not-found') this.forget();
        return;
      }
      const parsed = parseSnapshot(data);
      this.state.set(parsed.snapshot);
      this.connectionState.set('online');
    } catch {
      this.connectionState.set(this.document.defaultView?.navigator.onLine === false ? 'offline' : 'reconnecting');
    } finally {
      this.refreshing = false;
      if (this.queued) {
        this.queued = false;
        void this.refresh();
      }
    }
  }

  private forget(): void {
    this.unwatch();
    this.state.set(null);
    this.connectionState.set('online');
  }

  private unwatch(): void {
    const channel = this.channel;
    if (this.poll !== undefined) this.document.defaultView?.clearInterval(this.poll);
    this.channel = undefined;
    this.poll = undefined;
    this.roomId = undefined;
    this.code = undefined;
    if (channel) void this.client?.removeChannel(channel);
  }
}

function parseSnapshot(value: unknown): ParsedSnapshot {
  const raw = (value ?? {}) as Record<string, unknown>;
  const selfRaw = raw['self'] as Record<string, unknown> | undefined;
  if (typeof raw['roomId'] !== 'string' || typeof raw['code'] !== 'string' || !selfRaw || !Array.isArray(raw['players'])) {
    throw new PasswordError('unavailable', 'La sala devolvió un estado inválido.');
  }
  const players = (raw['players'] as Record<string, unknown>[]).map(parsePlayer);
  const entries = Array.isArray(raw['revealedEntries'])
    ? (raw['revealedEntries'] as Record<string, unknown>[]).map(parseEntry)
    : [];
  const deltasRaw = raw['roundDeltas'];
  const deltas: Record<string, 0 | 1> = {};
  if (deltasRaw && typeof deltasRaw === 'object') {
    for (const [id, result] of Object.entries(deltasRaw as Record<string, unknown>)) deltas[id] = Number(result) === 1 ? 1 : 0;
  }
  return {
    roomId: raw['roomId'],
    snapshot: {
      code: raw['code'],
      phase: raw['phase'] as PasswordPhase,
      roundNumber: Number(raw['roundNumber']),
      roundSeconds: Number(raw['roundSeconds']) as RoundSeconds,
      wordVisibleAt: parseTime(raw['wordVisibleAt']),
      deadlineAt: parseTime(raw['deadlineAt']),
      serverNow: parseTime(raw['serverNow']) ?? Date.now(),
      self: parsePlayer(selfRaw),
      players,
      selfWord: typeof raw['selfWord'] === 'string' ? raw['selfWord'] : null,
      revealedEntries: entries,
      roundDeltas: deltas
    }
  };
}

function parsePlayer(raw: Record<string, unknown>): PasswordPlayer {
  return {
    id: String(raw['id']),
    name: String(raw['name']),
    color: raw['color'] as GameColor,
    role: raw['role'] as PasswordPlayer['role'],
    score: Number(raw['score']),
    ready: Boolean(raw['ready'])
  };
}

function parseEntry(raw: Record<string, unknown>): RoundEntry {
  return {
    participantId: String(raw['participantId']),
    word: String(raw['word']),
    guessed: typeof raw['guessed'] === 'boolean' ? raw['guessed'] : null
  };
}

function parseTime(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

