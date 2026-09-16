import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';

import { GameError, GamePort } from '../domain/game.port';
import {
  questionDuration,
  scoreAnswer,
  type AnswerChoice,
  type GameQuestion,
  type MatchSnapshot,
  type PlayerStanding,
  type RoundResult
} from '../domain/match';
import { MultiplayerPort } from '../domain/multiplayer.port';
import type { Participant, Room, RoomCode } from '../domain/room';
import type { MatchSetup } from '../domain/setup-config';
import { MatchSnapshotStore, type StoredAnswer, type StoredMatch } from './match-snapshot.store';
import { RoomSnapshotStore } from './room-snapshot.store';

const COUNTDOWN_MS = 3_000;

/** Réplica local de las mismas fases que administra Supabase. */
@Injectable()
export class InMemoryGameAdapter implements GamePort {
  private readonly multiplayer = inject(MultiplayerPort);
  private readonly matches = inject(MatchSnapshotStore);
  private readonly rooms = inject(RoomSnapshotStore);
  private readonly state = signal<StoredMatch | null>(this.matches.read());

  readonly match = computed(() => {
    const stored = this.state();
    const room = this.multiplayer.room();
    const self = this.multiplayer.self();
    return stored && room && self ? toSnapshot(stored, room, self) : null;
  });

  constructor() {
    const unsubscribe = this.matches.onExternalChange(match => this.state.set(match));
    inject(DestroyRef).onDestroy(unsubscribe);
  }

  async startMatch(code: RoomCode, questions: readonly GameQuestion[]): Promise<MatchSnapshot> {
    const room = this.requireRoom(code);
    const self = this.multiplayer.self();
    if (self?.role !== 'host') throw new GameError('not-host', 'Solo el anfitrión puede comenzar.');
    if (questions.length !== room.setup.questionCount) {
      throw new GameError('question-bank-insufficient', 'No hay suficientes preguntas para esta partida.');
    }

    const now = Date.now();
    const match: StoredMatch = {
      code,
      questions,
      roundIndex: 0,
      phase: 'countdown',
      phaseStartedAt: now,
      phaseEndsAt: now + COUNTDOWN_MS,
      answers: []
    };
    // La partida se escribe antes que el estado de la sala: las demás pestañas
    // saltan a la partida al ver la sala en juego, y tienen que encontrarla.
    this.commit(match);
    this.rooms.write({ ...room, status: 'playing' });
    return toSnapshot(match, { ...room, status: 'playing' }, self);
  }

  async restoreMatch(code: RoomCode): Promise<MatchSnapshot> {
    const room = this.requireRoom(code);
    const self = this.multiplayer.self();
    if (!self) throw new GameError('match-not-found', 'Este dispositivo no ocupa un asiento en la partida.');
    const current = this.matches.read();
    if (!current || current.code !== code) {
      throw new GameError('match-not-found', 'La partida todavía no existe.');
    }
    const synced = syncPhase(current, room.setup);
    if (synced !== current) this.commit(synced);
    if (synced.phase === 'finished' && room.status !== 'finished') {
      this.rooms.write({ ...room, status: 'finished' });
    }
    return toSnapshot(synced, room, self);
  }

  async submitAnswer(code: RoomCode, choice: AnswerChoice): Promise<MatchSnapshot> {
    const room = this.requireRoom(code);
    const self = this.multiplayer.self();
    if (!self?.plays) throw new GameError('not-playing', 'Este dispositivo conduce la partida sin responder.');
    const current = this.matches.read();
    if (!current || current.code !== code) throw new GameError('match-not-found', 'La partida no existe.');

    const synced = syncPhase(current, room.setup);
    if (synced.phase !== 'question' || synced.phaseEndsAt === null) {
      throw new GameError(synced.phase === 'reveal' ? 'time-up' : 'not-playing', 'La respuesta ya no está disponible.');
    }
    if (synced.answers.some(answer => answer.roundIndex === synced.roundIndex && answer.participantId === self.id)) {
      throw new GameError('answer-locked', 'Tu respuesta ya quedó guardada.');
    }

    const now = Date.now();
    if (now > synced.phaseEndsAt) throw new GameError('time-up', 'Se terminó el tiempo.');
    const question = synced.questions[synced.roundIndex]!;
    const responseMs = Math.max(0, now - synced.phaseStartedAt);
    const correct = (choice === 'verse') === question.isVerse;
    const answer: StoredAnswer = {
      participantId: self.id,
      roundIndex: synced.roundIndex,
      choice,
      answeredAt: now,
      responseMs,
      correct,
      points: scoreAnswer(correct, responseMs, questionDuration(question.statement, room.setup.questionSeconds))
    };

    let next: StoredMatch = { ...synced, answers: [...synced.answers, answer] };
    if (answeredPlayers(next, room) >= playingParticipants(room).length) {
      next = { ...next, phase: 'reveal', phaseStartedAt: now, phaseEndsAt: now + room.setup.revealSeconds * 1000 };
    }
    this.commit(next);
    return toSnapshot(next, room, self);
  }

  private requireRoom(code: RoomCode): Room {
    const room = this.multiplayer.room() ?? this.rooms.read();
    if (!room || room.code !== code) throw new GameError('match-not-found', 'La sala ya no está abierta.');
    return room;
  }

  private commit(match: StoredMatch): void {
    this.state.set(match);
    this.matches.write(match);
  }
}

function syncPhase(match: StoredMatch, setup: MatchSetup, now = Date.now()): StoredMatch {
  if (match.phaseEndsAt === null || now < match.phaseEndsAt) return match;
  if (match.phase === 'countdown') {
    const seconds = questionDuration(match.questions[match.roundIndex]!.statement, setup.questionSeconds);
    return { ...match, phase: 'question', phaseStartedAt: now, phaseEndsAt: now + seconds * 1000 };
  }
  if (match.phase === 'question') {
    return { ...match, phase: 'reveal', phaseStartedAt: now, phaseEndsAt: now + setup.revealSeconds * 1000 };
  }
  if (match.phase === 'reveal') {
    if (match.roundIndex + 1 >= match.questions.length) {
      return { ...match, phase: 'finished', phaseStartedAt: now, phaseEndsAt: null };
    }
    return {
      ...match,
      roundIndex: match.roundIndex + 1,
      phase: 'countdown',
      phaseStartedAt: now,
      phaseEndsAt: now + COUNTDOWN_MS
    };
  }
  return match;
}

function toSnapshot(match: StoredMatch, room: Room, self: Participant): MatchSnapshot {
  const now = Date.now();
  const question = match.questions[match.roundIndex] ?? null;
  const currentAnswers = match.answers.filter(answer => answer.roundIndex === match.roundIndex);
  const players = playingParticipants(room);
  const reveal = match.phase === 'reveal';
  const visible = question && (match.phase === 'question' || reveal)
    ? { id: question.id, statement: question.statement, totalSeconds: questionDuration(question.statement, room.setup.questionSeconds) }
    : null;
  const results: RoundResult[] = reveal ? players.map(participant => {
    const answer = currentAnswers.find(item => item.participantId === participant.id);
    return {
      participantId: participant.id,
      name: participant.name,
      color: participant.color,
      choice: answer?.choice ?? null,
      correct: answer?.correct ?? false,
      points: answer?.points ?? 0,
      responseMs: answer?.responseMs ?? null
    };
  }) : [];

  return {
    code: match.code,
    phase: match.phase,
    phaseEndsAt: match.phaseEndsAt,
    serverNow: now,
    roundNumber: Math.min(match.roundIndex + 1, match.questions.length),
    totalRounds: match.questions.length,
    question: visible,
    solution: reveal && question ? {
      isVerse: question.isVerse,
      reference: question.reference,
      explanation: question.explanation
    } : null,
    revealSeconds: room.setup.revealSeconds,
    self,
    selfChoice: currentAnswers.find(answer => answer.participantId === self.id)?.choice ?? null,
    answeredCount: currentAnswers.length,
    expectedAnswers: players.length,
    roundResults: results,
    standings: buildStandings(players, match.answers)
  };
}

function playingParticipants(room: Room): readonly Participant[] {
  return room.participants.filter(participant => participant.plays);
}

function answeredPlayers(match: StoredMatch, room: Room): number {
  const playerIds = new Set(playingParticipants(room).map(participant => participant.id));
  return match.answers.filter(answer => answer.roundIndex === match.roundIndex && playerIds.has(answer.participantId)).length;
}

function buildStandings(participants: readonly Participant[], answers: readonly StoredAnswer[]): PlayerStanding[] {
  return participants.map(participant => {
    const mine = answers.filter(answer => answer.participantId === participant.id);
    const answered = mine.length;
    return {
      participantId: participant.id,
      name: participant.name,
      color: participant.color,
      score: mine.reduce((sum, answer) => sum + answer.points, 0),
      correctCount: mine.filter(answer => answer.correct).length,
      averageResponseMs: answered ? Math.round(mine.reduce((sum, answer) => sum + answer.responseMs, 0) / answered) : null
    };
  }).sort((left, right) => right.score - left.score);
}
