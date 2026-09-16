import { inject, Injectable, signal } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { GameColor } from '../../../game';
import { SUPABASE_CONFIG } from '../../../supabase.config';
import { GameError, GamePort, type GameErrorReason } from '../domain/game.port';
import type {
  AnswerChoice,
  GameQuestion,
  MatchPhase,
  MatchSnapshot,
  PlayerStanding,
  RoundResult
} from '../domain/match';
import type { Participant, RoomCode } from '../domain/room';

interface RpcSnapshot {
  readonly code: string;
  readonly phase: MatchPhase;
  readonly phaseEndsAt: string | null;
  readonly serverNow: string;
  readonly roundNumber: number;
  readonly totalRounds: number;
  readonly question: { readonly id: string; readonly statement: string; readonly totalSeconds: number } | null;
  readonly solution: { readonly isVerse: boolean; readonly reference: string | null; readonly explanation: string } | null;
  readonly revealSeconds: number;
  readonly self: Participant;
  readonly selfChoice: AnswerChoice | null;
  readonly answeredCount: number;
  readonly expectedAnswers: number;
  readonly roundResults: readonly RoundResult[];
  readonly standings: readonly PlayerStanding[];
}

@Injectable()
export class SupabaseGameAdapter implements GamePort {
  private readonly config = inject(SUPABASE_CONFIG);
  private readonly state = signal<MatchSnapshot | null>(null);
  private client?: SupabaseClient;

  readonly match = this.state.asReadonly();

  async startMatch(code: RoomCode, questions: readonly GameQuestion[]): Promise<MatchSnapshot> {
    return this.call('start_versiculo_match', { p_code: code, p_questions: questions });
  }

  async restoreMatch(code: RoomCode): Promise<MatchSnapshot> {
    return this.call('get_versiculo_match', { p_code: code });
  }

  async submitAnswer(code: RoomCode, choice: AnswerChoice): Promise<MatchSnapshot> {
    return this.call('submit_versiculo_answer', { p_code: code, p_choice: choice });
  }

  private async call(name: string, parameters: Record<string, unknown>): Promise<MatchSnapshot> {
    const client = await this.connect();
    const { data, error } = await client.rpc(name, parameters);
    if (error) throw gameError(error.message);
    const snapshot = parseSnapshot(data);
    this.state.set(snapshot);
    return snapshot;
  }

  private async connect(): Promise<SupabaseClient> {
    if (!this.config) throw new GameError('unavailable', 'Esta copia no tiene partida remota configurada.');
    this.client ??= createClient(this.config.url, this.config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'chairo:sesion' }
    });
    const { data } = await this.client.auth.getSession();
    if (!data.session) {
      const signed = await this.client.auth.signInAnonymously();
      if (signed.error) throw new GameError('unavailable', 'No pudimos identificar este dispositivo.');
    }
    return this.client;
  }
}

function parseSnapshot(value: unknown): MatchSnapshot {
  if (!value || typeof value !== 'object') throw new GameError('unavailable', 'La partida devolvió un estado inválido.');
  const raw = value as RpcSnapshot;
  const phaseEndsAt = raw.phaseEndsAt ? Date.parse(raw.phaseEndsAt) : null;
  const serverNow = Date.parse(raw.serverNow);
  if (!raw.code || !Number.isFinite(serverNow) || (phaseEndsAt !== null && !Number.isFinite(phaseEndsAt))) {
    throw new GameError('unavailable', 'La partida devolvió un reloj inválido.');
  }
  return {
    ...raw,
    code: raw.code,
    phaseEndsAt,
    serverNow,
    self: normalizeParticipant(raw.self),
    roundResults: (raw.roundResults ?? []).map(result => ({ ...result })),
    standings: (raw.standings ?? []).map(standing => ({ ...standing }))
  };
}

function normalizeParticipant(value: Participant): Participant {
  return {
    id: String(value.id),
    name: String(value.name),
    role: value.role,
    status: value.status,
    color: value.color as GameColor,
    plays: Boolean(value.plays)
  };
}

function gameError(message: string): GameError {
  const reasons: readonly GameErrorReason[] = [
    'match-not-found',
    'not-host',
    'not-playing',
    'answer-locked',
    'time-up',
    'question-bank-insufficient'
  ];
  const reason = reasons.find(candidate => message.includes(candidate)) ?? 'unavailable';
  return new GameError(reason, message);
}
