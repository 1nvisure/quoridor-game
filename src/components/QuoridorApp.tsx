'use client';

import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import GameScreen from './GameScreen';
import Lobby from './Lobby';
import ReviewDashboard from './review/ReviewDashboard';
import { getBot, botMove, firstLegalMove, type BotId } from '@/lib/bots';
import {
  CHAT_PACKS,
  deriveChatEvent,
  pickChatLine,
  type ChatCategory,
  type ChatMessage,
} from '@/lib/chat';
import {
  applyMove,
  createInitialState,
  isMoveLegal,
  other,
  type GameState,
  type Move,
  type Player,
} from '@/lib/engine';
import { analyzeGameAsync, positionAdvantage, winProbability, type GameAnalysis } from '@/lib/review';
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

/** Rebuild a session from a truncated move list. */
function sessionFrom(initial: GameState, history: HistoryEntry[]): Session {
  const state = history.length > 0 ? history[history.length - 1].stateAfter : initial;
  return {
    state,
    history,
    moves: history.map((h) => h.move),
    initial,
    startedAt: Date.now(),
  };
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

/** Human's win probability in a position (cheap: two BFS runs). */
function humanWinProb(state: GameState, humanPlayer: Player): number {
  const p = winProbability(positionAdvantage(state));
  return humanPlayer === 0 ? p : 1 - p;
}

export default function QuoridorApp() {
  const [screen, setScreen] = useState<Screen>('lobby');
  const [botId, setBotId] = useState<BotId>('rookford');
  const [humanPlayer, setHumanPlayer] = useState<Player>(0);
  const [session, setSession] = useState<Session>(() => freshSession(0));
  const [thinking, setThinking] = useState(false);
  const [records, setRecords] = useState<Records>({});
  const [analysis, setAnalysis] = useState<GameAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);

  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatTyping, setChatTyping] = useState(false);
  const [bubble, setBubble] = useState<ChatMessage | null>(null);

  const recordSaved = useRef(false);
  const chatId = useRef(0);
  const spoken = useRef(new Set<string>());
  const lastLines = useRef<Partial<Record<ChatCategory, string>>>({});

  const bot = getBot(botId);
  const { state, history, moves } = session;

  useEffect(() => {
    setRecords(loadRecords());
  }, []);

  /* ------------------------------------------------------------------ */
  /* Bot chat                                                            */
  /* ------------------------------------------------------------------ */

  const say = useCallback(
    (category: ChatCategory, ply: number, delay = 420) => {
      const pack = CHAT_PACKS[bot.id];
      setChatTyping(true);
      const timer = window.setTimeout(() => {
        const text = pickChatLine(pack, category, Math.random, lastLines.current[category]);
        lastLines.current[category] = text;
        const message: ChatMessage = { id: ++chatId.current, from: 'bot', text, category, ply };
        setChatTyping(false);
        setChat((prev) => [...prev, message]);
        setBubble(message);
      }, delay);
      return () => window.clearTimeout(timer);
    },
    [bot.id],
  );

  const saySystem = useCallback((text: string, ply: number) => {
    setChat((prev) => [
      ...prev,
      { id: ++chatId.current, from: 'system', text, category: 'idle', ply },
    ]);
  }, []);

  /* Reset chat for a new game. */
  const resetChat = useCallback(() => {
    setChat([]);
    setBubble(null);
    setChatTyping(false);
    spoken.current.clear();
    lastLines.current = {};
    chatId.current = 0;
  }, []);

  /**
   * React to the position after every half-move. The bot only speaks when the
   * *context* changes (a blunder, a lead change…), never on a blind timer.
   */
  useEffect(() => {
    if (screen !== 'game' && screen !== 'review') return;

    const last = history[history.length - 1];
    if (!last) return;

    const before = humanWinProb(last.stateBefore, humanPlayer);
    const after = humanWinProb(last.stateAfter, humanPlayer);
    const wallsPlaced = history.filter((h) => h.move.type === 'wall' && h.player === humanPlayer).length;

    const event = deriveChatEvent({
      ply: history.length,
      humanPlayer,
      mover: last.player,
      winProbBefore: before,
      winProbAfter: after,
      humanWallsPlaced: wallsPlaced,
      winner: last.stateAfter.winner,
    });

    if (!event) return;
    if (spoken.current.has(event.key)) return;
    spoken.current.add(event.key);

    // End-of-game lines land after a beat so the result modal reads first.
    const delay = event.category === 'botWin' || event.category === 'botLoss' ? 900 : 420;
    return say(event.category, history.length, delay);
  }, [history, humanPlayer, screen, say]);

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
    resetChat();
    setScreen('game');
  }, [resetChat]);

  const rematch = useCallback(() => startGame(botId, humanPlayer), [botId, humanPlayer, startGame]);

  const leave = useCallback(() => {
    setScreen('lobby');
    setSession(freshSession(0));
    setAnalysis(null);
    setThinking(false);
    setProgress(0);
    resetChat();
  }, [resetChat]);

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

  /**
   * Undo: roll back to just before the human's last move, which discards the
   * human's move *and* the bot's reply. Because that leaves the human to move,
   * the bot effect below stays dormant and cannot instantly replay.
   */
  const undo = useCallback(() => {
    // Find the human's most recent half-move.
    let index = history.length - 1;
    while (index >= 0 && history[index].player !== humanPlayer) index--;
    if (index < 0) return;

    // Everything from that move onward is discarded — typically our move plus
    // the bot's reply. The restored turn is the human's, so the bot effect below
    // stays dormant and cannot instantly replay.
    const kept = history.slice(0, index);
    const restored = history[index].stateBefore;
    const removed = history.length - index;

    setThinking(false);
    setSession((prev) => ({
      ...prev,
      state: restored,
      history: kept,
      moves: kept.map((h) => h.move),
    }));
    saySystem(`You took back ${removed} move${removed === 1 ? '' : 's'}.`, kept.length);
  }, [history, humanPlayer, saySystem]);

  const resign = useCallback(() => {
    setSession((prev) =>
      prev.state.winner !== null ? prev : { ...prev, state: { ...prev.state, winner: other(humanPlayer) } },
    );
    setThinking(false);
    saySystem('You resigned.', history.length);
  }, [humanPlayer, history.length, saySystem]);

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

  const buildReview = useCallback(
    async (initial: GameState, line: Move[]) => {
      setAnalyzing(true);
      setProgress(0);
      setScreen('review');
      try {
        const result = await analyzeGameAsync(initial, line, {
          depth: 1,
          wallLimit: 16,
          names: ['You', bot.name],
          onProgress: (done, total) => setProgress(total ? done / total : 0),
        });
        setAnalysis(result);
        setProgress(1);
        return result;
      } finally {
        setAnalyzing(false);
      }
    },
    [bot.name],
  );

  const runReview = useCallback(async () => {
    if (analyzing || moves.length === 0) return;

    const shouldSave = !recordSaved.current;

    try {
      const result = await buildReview(session.initial, moves);

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
    }
  }, [analyzing, moves, session.initial, humanPlayer, botId, buildReview]);

  /**
   * "Play from here": replace half-move `plyIndex` with `move`, drop everything
   * after it, and hand control back to the live match — the bot effect answers
   * on its own turn.
   */
  const branchFromReview = useCallback(
    (plyIndex: number, move: Move) => {
      setSession((prev) => {
        const entry = prev.history[plyIndex];
        if (!entry) return prev;
        if (!isMoveLegal(entry.stateBefore, move)) return prev;

        const next = applyMove(entry.stateBefore, move);
        const replacement: HistoryEntry = {
          move,
          player: entry.stateBefore.turn,
          stateBefore: entry.stateBefore,
          stateAfter: next,
        };
        return sessionFrom(prev.initial, [...prev.history.slice(0, plyIndex), replacement]);
      });

      // The stored analysis describes the old line, so discard it.
      setAnalysis(null);
      setAnalyzing(false);
      setProgress(0);
      recordSaved.current = false;
      setThinking(true);
      setScreen('game');
      saySystem(`Branching from move ${Math.floor(plyIndex / 2) + 1} — new line.`, plyIndex);
    },
    [saySystem],
  );

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

  /** Undo is available whenever the human has a move on the board. */
  const canUndo = useMemo(() => {
    if (thinking || state.winner !== null) return false;
    return history.some((h) => h.player === humanPlayer);
  }, [history, humanPlayer, thinking, state.winner]);

  const totalGames = useMemo(
    () => Object.values(records).reduce((sum, r) => sum + (r?.wins ?? 0) + (r?.losses ?? 0), 0),
    [records],
  );

  return (
    <div className="min-h-dvh">
      {/* Screens swap immediately (no exit-gated AnimatePresence) so a throttled
          browser tab can never leave the user on a blank screen. */}
      {screen === 'lobby' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
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
            onUndo={undo}
            canUndo={canUndo}
            onLeave={leave}
            onReview={runReview}
            onRematch={rematch}
            reviewing={analyzing}
            lastMove={lastMove}
            chat={chat}
            chatTyping={chatTyping}
            bubble={bubble}
            onDismissBubble={() => setBubble(null)}
            onSendTaunt={(text) => {
              setChat((prev) => [
                ...prev,
                { id: ++chatId.current, from: 'system', text: `You: ${text}`, category: 'idle', ply: history.length },
              ]);
              // The bot always gets the last word.
              say('idle', history.length, 700);
            }}
          />
        </motion.div>
      )}

      {screen === 'review' && (
        <motion.div
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
              onBranch={branchFromReview}
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
