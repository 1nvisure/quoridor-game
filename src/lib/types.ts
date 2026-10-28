import type { GameState, Move, Player } from './engine';

export type Screen = 'lobby' | 'game' | 'review';

/** One half-move with the positions before and after it. */
export interface HistoryEntry {
  move: Move;
  player: Player;
  stateBefore: GameState;
  stateAfter: GameState;
}

export interface GameRecord {
  wins: number;
  losses: number;
  bestAccuracy: number;
}

export interface MatchResult {
  winner: Player | null;
  /** Set when the human resigned. */
  resigned?: boolean;
  moves: number;
  durationMs: number;
  botName: string;
}
