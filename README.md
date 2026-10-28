# Quoridor — Play Bots & Review Your Game

A complete Quoridor web app in the visual language of Chess.com's dark theme: seven
bot opponents with their own trash talk, BFS-validated wall placement, an undo button,
and a full post-game review engine with accuracy scores, an evaluation graph, move
classifications, key moments — and the ability to branch the game and keep playing
from any position.

![stack](https://img.shields.io/badge/Next.js-15-black) ![stack](https://img.shields.io/badge/TypeScript-5-blue) ![stack](https://img.shields.io/badge/Tailwind-3-38bdf8)

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

```bash
npm run build && npm start   # production
npm test                     # engine / roster / review unit tests (40)
npm run test:ui              # jsdom UI tests: play, undo, chat, review, branch (7)
npm run typecheck            # tsc --noEmit
```

## What's in the box

| Feature | Where |
| --- | --- |
| Seven-tier bot ladder, 400 → 2200 Elo | `src/lib/bots.ts`, `src/components/Lobby.tsx` |
| Contextual bot trash talk | `src/lib/chat.ts`, `src/components/BotChat.tsx` |
| Undo (takes back your move *and* the reply) | `src/components/QuoridorApp.tsx` |
| "Play from here" — branch a finished game | `src/components/review/ReviewDashboard.tsx` |
| BFS anti-trap wall validation | `src/lib/engine.ts` |
| Accuracy, eval graph, key moments, retry | `src/lib/review.ts` |

---

## The game

9×9 board, two pawns, ten walls each.

* **Green (player 0)** starts bottom-centre `e1` and races to `e9`.
* **Red (player 1)** starts top-centre `e9` and races to `e1`.
* A move is either a one-square orthogonal step, or a wall placement.
* You may **jump over** an adjacent opponent. If the square directly behind them is
  off-board or walled, you may instead land **diagonally** beside them.

### Wall placement rules

A wall spans exactly two cell edges and lives on the 8×8 lattice of gaps between
squares. The engine rejects a wall when it:

1. overlaps a wall of the same orientation,
2. crosses a wall of the opposite orientation,
3. exceeds the player's wall inventory, or
4. **would leave either player with no path to their goal row** — the anti-trap rule.

Rule 4 is what makes Quoridor hard to implement correctly. Every candidate wall is
tentatively placed, both pawns are re-searched with BFS, and the wall is rolled back if
either search fails to reach the target baseline:

```ts
// src/lib/engine.ts
export function isWallLegal(s, wall, player = s.turn) {
  if (!isWallStructurallyLegal(s, wall, player)) return false;

  const grid = wall.o === 'h' ? s.h : s.v;
  grid[idx(wall.r, wall.c)] = true;
  const ok = pathLength(s, 0) !== Infinity && pathLength(s, 1) !== Infinity;  // BFS
  grid[idx(wall.r, wall.c)] = false;

  return ok;
}
```

Bots call the same function, so a bot can never trap itself or you.

---

## Source map

```
src/
├── app/
│   ├── layout.tsx            # metadata, fonts, viewport
│   ├── globals.css           # Tailwind layers + Chess.com-style primitives
│   └── page.tsx              # mounts <QuoridorApp />
├── lib/
│   ├── engine.ts             # rules, BFS pathfinding, wall validation, notation
│   ├── bots.ts               # evaluation, alpha-beta search, seven personalities
│   ├── chat.ts               # contextual trash-talk packs + event triggers
│   ├── review.ts             # win probability, classification, accuracy, key moments
│   ├── types.ts              # screen / history / record types
│   └── __tests__/            # engine, bots and review unit tests
├── components/
│   ├── QuoridorApp.tsx       # screen router + game session reducer
│   ├── Lobby.tsx             # "Play Bots" lobby: cards, Elo, banter, records
│   ├── GameScreen.tsx        # play surface, wall controls, game-over modal
│   ├── Board.tsx             # SVG board, walls, pawns, ghosts, path overlay
│   ├── BotChat.tsx           # chat panel, speech bubbles, typing indicator
│   ├── PlayerCard.tsx        # avatar, wall pips, thinking indicator
│   ├── MoveList.tsx          # two-column move table
│   ├── review/
│   │   ├── ReviewDashboard.tsx
│   │   ├── EvalGraph.tsx
│   │   └── ClassificationBadge.tsx
│   └── ui/                   # Avatar, Ring, AccuracyBar
└── tests/                    # jsdom + Testing Library end-to-end UI tests
```

---

## Engine

`src/lib/engine.ts` is a pure, immutable module — every action returns a new
`GameState`, which makes the review engine trivially able to replay a game.

| Concern | Implementation |
| --- | --- |
| Board state | `pawns[2]`, `h[81]`, `v[81]` bit-grids for wall slots, `left[2]`, `turn`, `ply`, `winner` |
| Movement | `legalPawnMoves()` — steps, straight jumps, diagonal jumps |
| Pathfinding | `bfs(state, start, goalRow)` → `{ dist, path }`, edge-blocked aware, `Int16Array` queues |
| Wall legality | `isWallStructurallyLegal()` + `isWallLegal()` (anti-trap BFS) |
| Notation | `cellName()` → `e4`, `wallName()` → `e5h` / `e5v` |

BFS returns the full route, not just a distance, so the UI can draw the live shortest
path for both players and the review can reason about cut edges.

---

## Bots — seven tiers

| Tier | Bot | Elo | Strategy | Personality |
| --- | --- | --- | --- | --- |
| 1 | 🌱 **Pip** | 400 | random legal moves | eager, apologetic, no plan |
| 2 | 🐿️ **Nibbles** | 700 | greedy BFS + random walls | hyperactive, snack-driven |
| 3 | 🦉 **The Watcher** | 1000 | path differential, min gain 1 | calm, cryptic, patient |
| 4 | ♞ **Rookford** | 1300 | path differential, min gain 2 | precise, arithmetic-obsessed |
| 5 | 🐺 **Sable** | 1600 | negamax + αβ, **depth 2** | predatory, laconic |
| 6 | ♛ **Grandmaster Vex** | 1900 | negamax + αβ, **depth 3** | theatrical, condescending |
| 7 | 🔮 **The Oracle** | 2200 | negamax + αβ, **depth 4** | omniscient, fatalistic |

Shared evaluation (always from the side-to-move, so negamax signs stay consistent):

```
score = (oppPathLength − myPathLength) · 100
      + (myWalls − oppWalls) · 6
      − centrality(myPawn) + centrality(oppPawn)
      + tempo
```

### Making depth actually pay

The interesting engineering problem was that **depth alone did not create strength**.
The first naive ladder produced a depth-3 bot that *lost* to depth-2 (0–12), for two
independent reasons:

1. **Odd/even parity.** A leaf evaluated right after our own move assumes the opponent
   passes, so odd depths were systematically optimistic. Fixed with a one-reply
   *quiescence* step at every leaf: the side to move always gets its answer scored.
2. **A saturating evaluation.** Beyond two plies the path-difference heuristic stops
   adding information, so extra search just found moves that gamed the eval.

The fix was to make the deeper tiers verify *more*: a wider root and a wider leaf
quiescence (4 → 8 → 12 candidates), plus a `searchNoise` term that models a weaker
player's imprecision. Colour-swapped head-to-head, 10 games per adjacent pair:

```
pip      vs nibbles    0 – 10
nibbles  vs watcher    3 – 7
watcher  vs rookford   1 – 9
rookford vs sable      2 – 8
sable    vs vex        3 – 7
vex      vs oracle     0 – 10
```

Monotonic the whole way up. Think time stays inside the clock: tier 5 ~20 ms, tier 6
~200 ms, tier 7 ~500 ms typical (1.7 s budget cap).

Two performance fixes keep depth 4 affordable (3.8 s → 0.79 s on a mid-game check):

* **Zobrist transposition table** per search — unrelated wall placements transpose
  constantly, so memoising positions prunes most of the re-search.
* **Deferred anti-trap BFS.** `generateCandidates` used to run two full BFS passes for
  all 128 wall slots at every node. It now does the cheap structural check for every
  slot and the expensive anti-trap validation only for the walls it actually returns.

---

## Bot trash talk

`src/lib/chat.ts` gives every opponent a `ChatPack` keyed by context:
`greeting`, `playerBlunder`, `playerGoodMove`, `botAdvantage`, `botBehind`,
`wallSpam`, `idle`, `botWin`, `botLoss`, `resignation`, `undo`.

The trigger is **the position, not a timer**: after each half-move the app compares the
human's win probability before and after (cheap two-BFS evaluation) and asks
`deriveChatEvent` what to say. A 11-point drop is a blunder, a bot move that takes the
bot above 64% win probability is `botAdvantage`, and so on. Every event carries a stable
de-duplication key so React effect re-runs never repeat a line.

Lines appear as speech bubbles in the sidebar chat (with a typing indicator), the newest
one also floats over the board for a few seconds, and the player can type back — the bot
always gets the last word.

---

## Undo

The Undo button (or `U`) rewinds to just before the human's last move, discarding that
move **and** the bot's reply, and restoring pawns, wall inventories and board state
exactly. Because the restored turn belongs to the human, the bot effect stays dormant —
the engine cannot instantly replay the move you just took back. It is disabled while the
bot is thinking, when the game is over, and when there is nothing of yours to take back.

---

## Play from here

Step back to any position in the review and the board becomes live again — highlighted
squares are real moves. Playing one replaces that half-move, truncates everything after
it, drops the stale analysis, and hands control back to **Active Match**, where the bot
answers immediately. The result is a new line that can itself be reviewed.

---

## Review engine## Review engine

After a game ends, "Game Review" analyses **every half-move**:

1. **Advantage** — shortest-path difference for both players, tempo-normalised and with
   a small wall-inventory term. Positive favours green.
2. **Win probability** — `σ(k · advantage)` with `k = 0.55`:

   ```ts
   export function winProbability(advantage: number, steepness = 0.55) {
     const x = advantage * steepness;
     if (x > 30) return 1;
     if (x < -30) return 0;
     return 1 / (1 + Math.exp(-x));
   }
   ```

3. **Best move** — every candidate move is scored with a 1-ply alpha-beta search; the
   top-scoring move is the engine's choice.
4. **Classification** — the drop in win probability between the move played and the
   best move:

   | Badge | Rule |
   | --- | --- |
   | ⭐ Best | the engine's top move |
   | 🟢 Excellent | < 2 pp lost |
   | 🟢 Good | < 6 pp |
   | 🟡 Inaccuracy | < 12 pp |
   | 🟠 Mistake | < 22 pp |
   | 🔴 Blunder | ≥ 22 pp |

5. **Accuracy** — `100 · e^(−loss / 24)` per move, averaged per player.
6. **Key moments** — the biggest blunders/mistakes, with the engine's recommendation.
7. **Dashboard** — accuracy rings, per-classification counts, an interactive
   win-probability graph, step-through board, **Retry** (replay the position and get
   your attempt scored) and **Show best move**.

Analysis runs incrementally (`analyzeGameAsync` yields between half-moves) so the
"Analysing your game" screen animates instead of freezing the tab.

---

## Design system

Strict Chess.com dark palette, wired into `tailwind.config.ts`:

| Token | Hex | Use |
| --- | --- | --- |
| `app-900` | `#121212` | page background |
| `app-750` | `#262522` | panels and cards |
| `brand` | `#81b64c` | primary actions, optimal moves, your pawn |
| `danger` | `#fa412d` | blunders, opponent pawn |
| `warn` | `#f7c631` | inaccuracies |

Motion: Framer Motion springs for pawn travel and wall snaps, layout animations for the
active-player bar, and a pulsing ring on the side to move. Screens swap instantly (no
exit-gated transitions) so a throttled background tab can't strand the user.

Keyboard: `W` wall mode, `H` / `V` orientation, `Esc` cancel, `P` shortest paths,
`U` undo, `←` / `→` / `Home` / `End` to step through a review.

---

## Tests

* **Engine (10)** — starting positions, jumps, diagonal jumps, overlap/crossing,
  anti-trap rejection, win detection, BFS detours.
* **Bots (8)** — every bot only plays legal, non-trapping moves across many random
  games; the search respects its time budget; evaluation is antisymmetric.
* **Roster (14)** — seven unique tiers with an ascending Elo curve, strategy/depth
  scaling, a complete chat pack per bot, depth-completion and time budgets, a
  transposition-table determinism check, and Rookford's "gain ≥ 2, cost ≤ 1" wall
  contract verified on every wall it places.
* **Review (8)** — sigmoid bounds, classification thresholds, accuracy monotonicity,
  ranked best moves, async/sync parity, a deliberate tempo waste being penalised.
* **UI (7)** — jsdom + Testing Library: lobby → play → game over → review → step →
  retry → back to lobby; the red-side/wall-placement flow; resign-with-no-moves
  disabling the review; **undo** removing both half-moves and leaving the bot dormant;
  the bot **chatting** during a live game; **"play from here"** branching a finished
  game back into a live match; and branching with a **wall** rather than a pawn step.

```bash
npm test        # 40 unit tests
npm run test:ui # 7 end-to-end UI tests
```
