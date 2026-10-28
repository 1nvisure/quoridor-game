# Quoridor — Play Bots & Review Your Game

A complete Quoridor web app in the visual language of Chess.com's dark theme: three
bot opponents, BFS-validated wall placement, and a full post-game review engine with
accuracy scores, an evaluation graph, move classifications and key moments.

![stack](https://img.shields.io/badge/Next.js-15-black) ![stack](https://img.shields.io/badge/TypeScript-5-blue) ![stack](https://img.shields.io/badge/Tailwind-3-38bdf8)

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

```bash
npm run build && npm start   # production
npm test                     # engine / bot / review unit tests (26)
npm run test:ui              # jsdom UI tests: full game → review loop (2)
npm run typecheck            # tsc --noEmit
```

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
│   ├── bots.ts               # evaluation, alpha-beta search, three personalities
│   ├── review.ts             # win probability, classification, accuracy, key moments
│   ├── types.ts              # screen / history / record types
│   └── __tests__/            # engine, bots and review unit tests
├── components/
│   ├── QuoridorApp.tsx       # screen router + game session reducer
│   ├── Lobby.tsx             # "Play Bots" lobby: cards, Elo, banter, records
│   ├── GameScreen.tsx        # play surface, wall controls, game-over modal
│   ├── Board.tsx             # SVG board, walls, pawns, ghosts, path overlay
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

## Bots

| Bot | Elo | How it plays |
| --- | --- | --- |
| **Pawnsy** 🌱 | ~600 | Greedy BFS walker; random walls ~22% of turns; occasional sideways step |
| **Rookford** ♞ | ~1200 | Path-differential hunter: only spends a wall when it costs you ≥ 2 steps and costs itself ≤ 1 |
| **Grandmaster Vex** ♛ | ~1800 | Negamax + alpha-beta, iterative deepening to depth 2–3, wall-inventory and centrality terms |

Shared evaluation (always from the side-to-move, so negamax signs stay consistent):

```
score = (oppPathLength − myPathLength) · 100
      + (myWalls − oppWalls) · 6
      − centrality(myPawn) + centrality(oppPawn)
      + tempo
```

The search uses move ordering from a cheap cut-edge heuristic: candidate walls are
pre-scored by whether they cross a shortest-path edge, so the expensive BFS is only
spent on the promising handful. Measured head-to-head (colour-swapped, 20 games each):

```
advanced vs intermediate   18 – 2
advanced vs beginner       19 – 1
intermediate vs beginner   19 – 1
```

Typical think time is 30–300 ms, always bounded by a node budget and a wall-clock
deadline so the UI never hangs.

---

## Review engine

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
`←` / `→` / `Home` / `End` to step through a review.

---

## Tests

* **Engine (10)** — starting positions, jumps, diagonal jumps, overlap/crossing,
  anti-trap rejection, win detection, BFS detours.
* **Bots (8)** — every bot only plays legal, non-trapping moves across many random
  games; the search respects its time budget; evaluation is antisymmetric.
* **Review (8)** — sigmoid bounds, classification thresholds, accuracy monotonicity,
  ranked best moves, async/sync parity, a deliberate tempo waste being penalised.
* **UI (2)** — jsdom + Testing Library: lobby → play → game over → review → step →
  retry → back to lobby, plus the red-side/wall-placement flow.

```bash
npm test        # 26 unit tests
npm run test:ui # 2 end-to-end UI tests
```
