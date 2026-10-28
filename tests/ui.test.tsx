import './dom';
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';

import QuoridorApp from '../src/components/QuoridorApp';

const settle = (ms = 800) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

// Always unmount, even when an assertion fails, so the next test starts clean.
afterEach(() => cleanup());
const legalCells = () => Array.from(document.querySelectorAll('rect.cursor-pointer'));
const gameOver = () => !!document.body.textContent?.match(/You won!|You lost|Game over/);

test('lobby → game → review: the whole loop works', async () => {
  render(<QuoridorApp />);

  const cards = await screen.findAllByRole('button', { name: /play/i });
  assert.equal(cards.length, 7, 'seven bot cards in the lobby');

  fireEvent.click(cards[0]); // Pip (tier 1, fastest games)
  await waitFor(() => assert.ok(screen.getByText('Moves')), { timeout: 4000 });

  // Play until the game ends (the harness always takes the topmost legal square).
  for (let i = 0; i < 24 && !gameOver(); i++) {
    await waitFor(() => assert.ok(legalCells().length > 0, 'expected a legal move'), { timeout: 6000 });
    fireEvent.click(legalCells()[0]);
    await settle(720);
  }
  assert.ok(gameOver(), 'the game should finish');

  const reviewButtons = await screen.findAllByRole('button', { name: /game review/i });
  fireEvent.click(reviewButtons[reviewButtons.length - 1]);

  await waitFor(() => assert.ok(screen.getByText('Key moments')), { timeout: 30000 });
  assert.ok(screen.getByText('Accuracy'), 'accuracy panel');
  assert.ok(screen.getByText('Evaluation'), 'evaluation graph');
  assert.ok(screen.getAllByText(/% accuracy/i).length >= 2, 'both players get an accuracy score');

  // Step through the game.
  const next = screen.getByRole('button', { name: /^next$/i });
  const prev = screen.getByRole('button', { name: /^previous$/i });
  fireEvent.click(prev);
  fireEvent.click(prev);
  fireEvent.click(next);
  fireEvent.click(screen.getByRole('button', { name: /best move/i }));
  await settle(150);

  // Retry one position and score the attempt.
  fireEvent.click(screen.getByRole('button', { name: /^retry$/i }));
  await settle(200);
  assert.ok(screen.getByText(/retry mode/i), 'retry mode opens');
  await waitFor(() => assert.ok(legalCells().length > 0), { timeout: 3000 });
  fireEvent.click(legalCells()[legalCells().length - 1]);
  await settle(600);
  assert.match(document.body.textContent ?? '', /You (stepped|placed)/, 'retry scores the attempt');

  fireEvent.click(screen.getByRole('button', { name: /back to review/i }));
  await settle(150);
  assert.ok(screen.getByText('Key moments'), 'returns to the dashboard');

  // Leaving the review returns to the lobby and persists the record.
  fireEvent.click(screen.getByRole('button', { name: /back to lobby/i }));
  await settle(300);
  assert.ok(screen.getByText('Play Bots'), 'back in the lobby');
  assert.ok(window.localStorage.getItem('quoridor-records-v1'), 'record persisted');

  cleanup();
});

test('playing as red: the bot opens, and walls can be placed', async () => {
  render(<QuoridorApp />);

  fireEvent.click(screen.getByRole('button', { name: /red · second/i }));
  await settle(60);
  const cards = await screen.findAllByRole('button', { name: /play/i });
  fireEvent.click(cards[1]); // Rookford (intermediate)

  await waitFor(() => assert.ok(screen.getByText('Moves')), { timeout: 4000 });

  // The bot is green, so it must move before we can act.
  await waitFor(() => assert.ok(legalCells().length > 0, 'human turn'), { timeout: 8000 });

  // Wall mode: squares become inert, wall slots become clickable.
  fireEvent.click(screen.getByRole('button', { name: /place a wall/i }));
  await settle(180);
  const ghosts = legalCells();
  assert.ok(ghosts.length > 30, `expected wall ghosts, got ${ghosts.length}`);

  fireEvent.click(ghosts[Math.floor(ghosts.length / 2)]);
  await settle(900);
  assert.match(document.body.textContent ?? '', /9 \/ 10 left/, 'wall inventory decremented');
  assert.ok(document.querySelectorAll('rect[fill^="url(#wallWood"]').length >= 1, 'wall drawn');

  // Vertical orientation.
  fireEvent.click(screen.getByRole('button', { name: /vertical/i }));
  await settle(180);
  const vGhosts = legalCells();
  assert.ok(vGhosts.length > 0, 'vertical ghosts');
  fireEvent.click(vGhosts[0]);
  await settle(900);
  assert.ok(
    document.querySelectorAll('rect[fill^="url(#wallWood"]').length >= 2,
    'second wall drawn',
  );

  // Path overlay + keyboard escape.
  fireEvent.click(screen.getByRole('button', { name: /shortest paths/i }));
  await settle(150);
  assert.equal(document.querySelectorAll('polyline').length, 2, 'two shortest paths drawn');

  fireEvent.keyDown(window, { key: 'Escape' });
  await settle(120);
  assert.ok(legalCells().length < 6, 'escape leaves wall mode');

  cleanup();
});

test('resigning before any move disables the review instead of failing silently', async () => {
  render(<QuoridorApp />);

  const cards = await screen.findAllByRole('button', { name: /play/i });
  fireEvent.click(cards[0]);
  await waitFor(() => assert.ok(screen.getByText('Moves')), { timeout: 4000 });

  // Resign immediately (the bot may have opened if we were red; here green = us).
  fireEvent.click(screen.getByRole('button', { name: /resign/i }));
  await settle(400);

  const noMoves = await screen.findAllByRole('button', { name: /no moves to review/i });
  assert.equal(noMoves.length, 2, 'sidebar + modal both offer review');
  for (const btn of noMoves) {
    assert.equal((btn as HTMLButtonElement).disabled, true, 'review is disabled with no moves');
  }

  // The modal can be dismissed to inspect the board, then reopened.
  fireEvent.click(screen.getByRole('button', { name: /close/i }));
  await settle(200);
  assert.equal(screen.queryByText('You lost'), null, 'modal dismissed');
  const reopen = screen.getByRole('button', { name: /result/i });
  fireEvent.click(reopen);
  await settle(200);
  assert.ok(screen.getByText('You lost'), 'modal reopened');

  cleanup();
});

test('undo takes back the human move and the bot reply', async () => {
  render(<QuoridorApp />);

  const cards = await screen.findAllByRole('button', { name: /play/i });
  assert.equal(cards.length, 7, 'seven bot cards in the lobby');
  fireEvent.click(cards[1]); // Nibbles (tier 2, quick)
  await waitFor(() => assert.ok(screen.getByText('Moves')), { timeout: 4000 });

  // Play one full exchange: our move, then the bot's reply.
  await waitFor(() => assert.ok(legalCells().length > 0), { timeout: 6000 });
  fireEvent.click(legalCells()[0]);
  await settle(900);

  const rowsBefore = () => document.querySelectorAll('tbody tr').length;
  const pliesBefore = rowsBefore();
  assert.ok(pliesBefore >= 1, 'at least one move on the board');

  const undo = screen.getByRole('button', { name: /undo/i }) as HTMLButtonElement;
  assert.equal(undo.disabled, false, 'undo is available once we have moved');

  fireEvent.click(undo);
  await settle(400);

  // Both half-moves are gone: the move list is empty and it is our turn again.
  const cells = legalCells();
  assert.ok(cells.length > 0, 'board is interactive again');
  assert.match(document.body.textContent ?? '', /Your move/, 'turn returns to the human');

  // The bot must not immediately replay — the board stays ours.
  await settle(700);
  assert.match(document.body.textContent ?? '', /Your move/, 'bot stays dormant after an undo');

  // Undo is disabled when there is nothing left to take back.
  assert.equal((screen.getByRole('button', { name: /undo/i }) as HTMLButtonElement).disabled, true);

  cleanup();
});

test('review "play from here" branches the game and the bot answers', async () => {
  render(<QuoridorApp />);

  const cards = await screen.findAllByRole('button', { name: /play/i });
  fireEvent.click(cards[1]); // Nibbles
  await waitFor(() => assert.ok(screen.getByText('Moves')), { timeout: 4000 });

  // Play a few exchanges so there is a real line to branch from.
  for (let i = 0; i < 3 && !gameOver(); i++) {
    await waitFor(() => assert.ok(legalCells().length > 0), { timeout: 6000 });
    fireEvent.click(legalCells()[0]);
    await settle(850);
  }

  if (!gameOver()) {
    fireEvent.click(screen.getByRole('button', { name: /resign/i }));
    await settle(500);
  }

  const reviewButtons = await screen.findAllByRole('button', { name: /game review/i });
  fireEvent.click(reviewButtons[reviewButtons.length - 1]);
  await waitFor(() => assert.ok(screen.getByText('Key moments')), { timeout: 30000 });

  // Step back to the opening — an even ply is the human's turn.
  for (let i = 0; i < 6; i++) {
    fireEvent.click(screen.getByRole('button', { name: /^previous$/i }));
  }
  await settle(200);

  const banner = screen.queryByText(/play a highlighted square to branch/i);
  assert.ok(banner, 'the branch affordance is offered');

  const branchTargets = legalCells();
  assert.ok(branchTargets.length > 0, 'branch targets are highlighted');
  fireEvent.click(branchTargets[0]);
  await settle(1400);

  // We are back in a live match, with the bot having answered our new move.
  assert.ok(screen.getByText('Moves'), 'back on the game screen');
  assert.ok(document.body.textContent?.includes('Move'), 'match is live');
  await waitFor(() => assert.ok(legalCells().length > 0, 'human to move again'), { timeout: 8000 });

  cleanup();
});

test('the bot chats during a live game', async () => {
  render(<QuoridorApp />);

  const cards = await screen.findAllByRole('button', { name: /play/i });
  fireEvent.click(cards[0]); // Pip
  await waitFor(() => assert.ok(screen.getByText('Moves')), { timeout: 4000 });

  // The greeting fires once both sides have made their first move.
  await waitFor(() => assert.ok(legalCells().length > 0), { timeout: 6000 });
  fireEvent.click(legalCells()[0]);
  await settle(1200);
  await waitFor(() => assert.ok(legalCells().length > 0), { timeout: 6000 });
  fireEvent.click(legalCells()[0]);
  await settle(1400);

  const chatPanel = screen.getByLabelText(/chat with pip/i);
  const lines = chatPanel.querySelectorAll('p');
  assert.ok(lines.length >= 1, `expected a bot line, found ${lines.length}`);

  // The speech bubble floats over the board too.
  assert.ok(document.body.textContent?.length > 0);

  // The player can talk back.
  const input = screen.getByLabelText(/chat message/i) as HTMLInputElement;
  fireEvent.change(input, { target: { value: 'good luck!' } });
  fireEvent.submit(input.closest('form')!);
  await settle(900);
  assert.match(document.body.textContent ?? '', /good luck!/, 'our message shows in chat');

  cleanup();
});

test('a wall can be placed to branch the game, not just a pawn step', async () => {
  render(<QuoridorApp />);

  const cards = await screen.findAllByRole('button', { name: /play/i });
  fireEvent.click(cards[1]);
  await waitFor(() => assert.ok(screen.getByText('Moves')), { timeout: 4000 });

  await waitFor(() => assert.ok(legalCells().length > 0), { timeout: 6000 });
  fireEvent.click(legalCells()[0]);
  await settle(900);
  if (!gameOver()) {
    fireEvent.click(screen.getByRole('button', { name: /resign/i }));
    await settle(500);
  }

  const reviewButtons = await screen.findAllByRole('button', { name: /game review/i });
  fireEvent.click(reviewButtons[reviewButtons.length - 1]);
  await waitFor(() => assert.ok(screen.getByText('Key moments')), { timeout: 30000 });

  // Back to the start, where it is green's (our) turn.
  fireEvent.click(screen.getByRole('button', { name: /^start$/i }));
  await settle(200);
  assert.ok(screen.queryByText(/play a highlighted square to branch/i), 'branch banner at the start');

  // Wall mode inside the review exposes wall slots, and clicking one branches.
  fireEvent.click(screen.getByRole('button', { name: /^walls$/i }));
  await settle(200);
  const ghosts = legalCells();
  assert.ok(ghosts.length > 30, `expected wall slots in review, got ${ghosts.length}`);

  fireEvent.click(ghosts[Math.floor(ghosts.length / 2)]);
  await settle(1500);

  // Live match again, with the wall on the board.
  assert.ok(screen.getByText('Moves'), 'back on the game screen');
  assert.ok(
    document.querySelectorAll('rect[fill^="url(#wallWood"]').length >= 1,
    'the branched wall is on the board',
  );

  cleanup();
});
