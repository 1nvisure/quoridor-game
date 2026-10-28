'use client';

import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import GameScreen from './GameScreen';
import Lobby from './Lobby';
import ReviewDashboard from './review/ReviewDashboard';
import { getBot, botMove, firstLegalMove, type BotId } from '@/lib/bots';
import {
  applyMove,
  createInitialState,
  isMoveLegal,
  other,
  type GameState,
  type Move,
  type Player,
} from '@/lib/engine';
import { analyzeGameAsync, type GameAnalysis } from '@/lib/review';
import type { GameRecord, HistoryEntry, Screen } from '@/lib/types';

const STORAGE_KEY = 'quoridor-records-v1';

type Records = Record<string, GameRecord>;

interface Session {
  state: GameState;
  history: HistoryEntry[];
  moves: Move[];
  /** The position the game started from (used by the review engine). */
  initial: GameState;
  startedAt: number;
}

function freshSession(firstTurn: Player): Session {
  const initial = createInitialState(firstTurn);
  return { state: initial, history: [], moves: [], initial, startedAt: Date.now() };
}

function loadRecords(): Records {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Records;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function saveRecords(records: Records) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    /* storage disabled — records are a nicety, never fatal */
  }
}

export default function QuoridorApp() {
  const [screen, setScreen] = useState<Screen>('lobby');
  const [botId, setBotId] = useState<BotId>('intermediate');
  const [humanPlayer, setHumanPlayer] = useState<Player>(0);
  const [session, setSession] = useState<Session>(() => freshSession(0));
  const [thinking, setThinking] = useState(false);
  const [records, setRecords] = useState<Records>({});
  const [analysis, setAnalysis] = useState<GameAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);

  const recordSaved = useRef(false);
  const bot = getBot(botId);
  const { state, history, moves } = session;

  useEffect(() => {
    setRecords(loadRecords());
  }, []);

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  const startGame = useCallback((id: BotId, side: Player) => {
    setBotId(id);
    setHumanPlayer(side);
    setSession(freshSession(0)); // green (player 0) always moves first
    setAnalysis(null);
    setAnalyzing(false);
    setProgress(0);
    setThinking(side !== 0);
    recordSaved.current = false;
    setScreen('game');
  }, []);

  const rematch = useCallback(() => startGame(botId, humanPlayer), [botId, humanPlayer, startGame]);

  const leave = useCallback(() => {
    setScreen('lobby');
    setSession(freshSession(0));
    setAnalysis(null);
    setThinking(false);
    setProgress(0);
  }, []);

  /* ------------------------------------------------------------------ */
  /* Moves                                                               */
  /* ------------------------------------------------------------------ */

  const applyPlayerMove = useCallback((move: Move) => {
    setSession((prev) => {
      if (prev.state.winner !== null) return prev;
      const next = applyMove(prev.state, move);
      const entry: HistoryEntry = {
        move,
        player: prev.state.turn,
        stateBefore: prev.state,
        stateAfter: next,
      };
      return {
        ...prev,
        state: next,
        history: [...prev.history, entry],
        moves: [...prev.moves, move],
      };
    });
  }, []);

  const handleHumanMove = useCallback(
    (move: Move) => {
      if (state.winner !== null || state.turn !== humanPlayer || thinking) return;
      applyPlayerMove(move);
    },
    [state.winner, state.turn, humanPlayer, thinking, applyPlayerMove],
  );

  const resign = useCallback(() => {
    setSession((prev) =>
      prev.state.winner !== null ? prev : { ...prev, state: { ...prev.state, winner: other(humanPlayer) } },
    );
    setThinking(false);
  }, [humanPlayer]);

  /* Bot turn */
  useEffect(() => {
    if (screen !== 'game' || state.winner !== null) return;
    if (state.turn === humanPlayer) {
      setThinking(false);
      return;
    }

    setThinking(true);
    const timer = window.setTimeout(
      () => {
        let move: Move | null = botMove(state, botId).move;
        // Defensive: a bot must never be able to wedge the game with an illegal move.
        if (!move || !isMoveLegal(state, move)) move = firstLegalMove(state);
        setThinking(false);
        if (move) applyPlayerMove(move);
      },
      280 + Math.random() * 320,
    );

    return () => window.clearTimeout(timer);
  }, [state, humanPlayer, botId, screen, applyPlayerMove]);

  /* ------------------------------------------------------------------ */
  /* Review                                                              */
  /* ------------------------------------------------------------------ */

  const runReview = useCallback(async () => {
    if (analyzing || moves.length === 0) return;
    setAnalyzing(true);
    setProgress(0);
    setScreen('review');

    const shouldSave = !recordSaved.current;

    try {
      const result = await analyzeGameAsync(session.initial, moves, {
        depth: 1,
        wallLimit: 16,
        names: ['You', bot.name],
        onProgress: (done, total) => setProgress(total ? done / total : 0),
      });
      setAnalysis(result);
      setProgress(1);

      if (shouldSave) {
        recordSaved.current = true;
        const win = result.winner === humanPlayer;
        const acc = result.accuracy[humanPlayer];
        setRecords((prev) => {
          const current = prev[botId] ?? { wins: 0, losses: 0, bestAccuracy: 0 };
          const updated: Records = {
            ...prev,
            [botId]: {
              wins: current.wins + (win ? 1 : 0),
              losses: current.losses + (win ? 0 : 1),
              bestAccuracy: Math.max(current.bestAccuracy ?? 0, Math.round(acc)),
            },
          };
          saveRecords(updated);
          return updated;
        });
      }
    } catch (err) {
      console.error('review failed', err);
      setScreen('game');
    } finally {
      setAnalyzing(false);
    }
  }, [analyzing, moves, session.initial, humanPlayer, botId, bot.name]);

  /* ------------------------------------------------------------------ */
  /* Derived                                                             */
  /* ------------------------------------------------------------------ */

  const lastMove = useMemo(() => {
    const last = history[history.length - 1];
    if (!last) return null;
    if (last.move.type === 'pawn') {
      return { from: last.stateBefore.pawns[last.player], to: last.move.to, wall: null };
    }
    return { from: null, to: null, wall: last.move.wall };
  }, [history]);

  const totalGames = useMemo(
    () => Object.values(records).reduce((sum, r) => sum + (r?.wins ?? 0) + (r?.losses ?? 0), 0),
    [records],
  );

  return (
    <div className="min-h-dvh">
      {/* Screens swap immediately (no exit-gated AnimatePresence) so a throttled
          browser tab can never leave the user on a blank screen. */}
      {screen === 'lobby' && (
          <motion.div
            key="lobby"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.18 }}
          >
            <Lobby
              onStart={startGame}
              records={records}
              humanPlayer={humanPlayer}
              onSelectSide={setHumanPlayer}
              totalGames={totalGames}
            />
          </motion.div>
        )}

        {screen === 'game' && (
          <motion.div
            key="game"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <GameScreen
              state={state}
              humanPlayer={humanPlayer}
              bot={bot}
              history={history}
              thinking={thinking}
              onMove={handleHumanMove}
              onResign={resign}
              onLeave={leave}
              onReview={runReview}
              onRematch={rematch}
              reviewing={analyzing}
              lastMove={lastMove}
            />
          </motion.div>
        )}

        {screen === 'review' && (
          <motion.div
            key="review"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {analysis ? (
              <ReviewDashboard
                analysis={analysis}
                initial={session.initial}
                humanPlayer={humanPlayer}
                bot={bot}
                onLeave={leave}
                onRematch={rematch}
              />
            ) : (
              <AnalysingScreen progress={progress} botName={bot.name} onCancel={leave} />
            )}
          </motion.div>
        )}
    </div>
  );
}

function AnalysingScreen({
  progress,
  botName,
  onCancel,
}: {
  progress: number;
  botName: string;
  onCancel: () => void;
}) {
  const pct = Math.round(progress * 100);

  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm text-center"
      >
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-brand/15">
          <motion.span
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            className="block h-9 w-9 rounded-full border-[3px] border-brand/25 border-t-brand"
          />
        </div>
        <h2 className="text-lg font-extrabold text-white">Analysing your game</h2>
        <p className="mt-1 text-[12.5px] text-[#a8a49b]">
          Scoring every half-move against the engine, the way Chess.com reviews a game
          against {botName}.
        </p>

        <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/[0.07]">
          <motion.div
            className="h-full rounded-full bg-brand"
            animate={{ width: `${Math.max(4, pct)}%` }}
            transition={{ duration: 0.25 }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] font-bold tabular-nums text-[#6f6b64]">
          <span>Shortest-path evaluation</span>
          <span>{pct}%</span>
        </div>

        <button onClick={onCancel} className="btn-ghost mt-6 text-[12px]">
          Cancel
        </button>
      </motion.div>
    </div>
  );
}
