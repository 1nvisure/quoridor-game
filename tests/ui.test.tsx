import './dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';

import QuoridorApp from '../src/components/QuoridorApp';

const settle = (ms = 800) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const legalCells = () => Array.from(document.querySelectorAll('rect.cursor-pointer'));
const gameOver = () => !!document.body.textContent?.match(/You won!|You lost|Game over/);

test('lobby → game → review: the whole loop works', async () => {
  render(<QuoridorApp />);

  const cards = await screen.findAllByRole('button', { name: /play/i });
  assert.equal(cards.length, 3, 'three bot cards in the lobby');

  fireEvent.click(cards[0]); // Pawnsy (beginner)
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
