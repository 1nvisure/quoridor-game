/**
 * Bot trash talk.
 *
 * Each opponent owns a phrase pack keyed by *context*. The engine decides which
 * context applies (a real blunder, the bot taking the lead, a resignation…), so
 * the banter reacts to what actually happened on the board instead of firing on
 * a blind timer.
 *
 * This module deliberately depends only on the engine's *types* — the caller
 * passes in win probabilities. That keeps `bots.ts → chat.ts` a one-way edge and
 * avoids a runtime import cycle with `review.ts`.
 */

import type { Player } from './engine';

export type ChatCategory =
  | 'greeting'
  | 'playerBlunder'
  | 'playerGoodMove'
  | 'botAdvantage'
  | 'botBehind'
  | 'wallSpam'
  | 'idle'
  | 'botWin'
  | 'botLoss'
  | 'resignation'
  | 'undo';

export type ChatPack = Record<ChatCategory, string[]>;

export interface ChatMessage {
  id: number;
  /** Who said it — `bot` for the opponent, `system` for neutral notices. */
  from: 'bot' | 'system';
  text: string;
  category: ChatCategory;
  /** Half-move the line belongs to (for de-duplication and replay). */
  ply: number;
}

/* ------------------------------------------------------------------ */
/* Phrase packs — one distinct voice per opponent                      */
/* ------------------------------------------------------------------ */

export const PIP_CHAT: ChatPack = {
  greeting: ['hi!! is this the winning side?', 'ok i read the rules. mostly.', 'hello! pls be gentle 🌱'],
  playerBlunder: ['ooh did you mean to do that?', 'wait. was that on purpose??', 'i think that helped me. thank you?'],
  playerGoodMove: ['oh no that was good', 'hey! no fair', 'ok ok that one was pretty'],
  botAdvantage: ['am i... winning??', 'i think im doing it!', 'wait im actually ahead?!'],
  botBehind: ['uh oh', 'this is fine. this is fine.', 'i dont know what im doing'],
  wallSpam: ['so many walls! are you building a house?', 'thats a lot of walls friend', 'i cant see the board anymore'],
  idle: ['i like this square', 'is it my turn? its my turn.', 'walls are just spicy fences'],
  botWin: ['I WON?? i won!!', 'gg! i think. did i win?', 'wow ok that was lucky'],
  botLoss: ['gg! you were too good', 'i knew it. good game!', 'can we play again? i promise to think'],
  resignation: ['you gave up?? but we were having fun!', 'oh! gg then', 'a win is a win i guess'],
  undo: ['hey! i liked that move', 'takebacks?? ok fine', 'rewinding time, bold strategy'],
};

export const NIBBLES_CHAT: ChatPack = {
  greeting: ['Nibbles here! got any acorns?', 'hi hi hi! let us go go go', 'ok quick game, my snack is getting cold'],
  playerBlunder: ['OOPS. was that a real move?', 'yikes! my turn now!', 'ooh free steps, thanks!'],
  playerGoodMove: ['hey! no! bad move for me!', 'ok that was slick', 'you are fast. i am faster.'],
  botAdvantage: ['racing ahead! 🐿️💨', 'i smell the finish line', 'catch me if you can!'],
  botBehind: ['no no no come back', 'this is NOT the shortcut', 'i zigged when i should have zagged'],
  wallSpam: ['walls walls walls! where am i supposed to run?!', 'you are blocking my whole vibe', 'rude! i have tiny legs'],
  idle: ['*chomps acorn*', 'i could do this all day', 'wheeeee'],
  botWin: ['ZOOM! victory lap! 🐿️', 'gg! i am the fastest squirrel', 'and that is how it is done!'],
  botLoss: ['aw beans.', 'gg! i want a rematch and a snack', 'you outran me. impressive.'],
  resignation: ['you quit? but we were running!', 'gg! snack break for me', 'i accept this victory politely'],
  undo: ['hey! i was winning that!!', 'no takebacks! ...ok fine', 'you moved it back! cheater! jk'],
};

export const WATCHER_CHAT: ChatPack = {
  greeting: ['I have watched a thousand boards. Yours is interesting.', 'Sit. Let us see what you know.', 'The shortest path is rarely the obvious one.'],
  playerBlunder: ['Your path grew by two. I noticed.', 'A wall you did not need. A step you did need.', 'That move was… instructional.'],
  playerGoodMove: ['Correct. You are paying attention.', 'Hm. You found the line I was hiding.', 'A tidy move. Noted.'],
  botAdvantage: ['Your route is longer than mine now.', 'The gap is measurable. I am ahead.', 'I have been here before. It ends well for me.'],
  botBehind: ['You are ahead. For now, that is data.', 'I am behind. I am also patient.', 'Interesting. The board turned.'],
  wallSpam: ['Walls are not answers. You know this.', 'You spend wood where thought would do.', 'Three walls already. Predictable.'],
  idle: ['I am still watching.', 'Patience is a move too.', 'The board tells me things.'],
  botWin: ['The board agreed with me.', 'Predictable, and yet satisfying.', 'Study this one. There is a lesson.'],
  botLoss: ['You saw further. That is rare.', 'A clean lesson. Thank you.', 'I will remember this pattern.'],
  resignation: ['You conceded before the lesson ended.', 'Resignation is also a decision.', 'I accept. Reflect on the path.'],
  undo: ['You rewind. The board does not mind.', 'A second chance. Use it well.', 'Time folds. I am still watching.'],
};

export const ROOKFORD_CHAT: ChatPack = {
  greeting: ['Shortest path wins. Shall we measure?', 'I count every step. Begin.', 'Good luck. You will need a shorter route.'],
  playerBlunder: ['+2 to your path. Thank you.', 'That cost you 0.12 of the position.', 'Arithmetic is unforgiving. So am I.'],
  playerGoodMove: ['Optimal. Annoying.', 'You matched the engine. Once.', 'Correct by a single step. Well played.'],
  botAdvantage: ['I am two steps clear. That is enough.', 'The differential is mine.', 'Measured, and I am ahead.'],
  botBehind: ['The numbers turned. I will adjust.', 'You are ahead. I miscalculated.', 'I concede the tempo. Not the game.'],
  wallSpam: ['That wall costs 1 and gains 0. Poor value.', 'Spending walls without purpose.', 'Your inventory is not infinite. Mine either.'],
  idle: ['Calculating. Always calculating.', 'Eleven steps remain for me. Eight for you.', 'Paths, not pictures.'],
  botWin: ['The differential held.', 'Two steps. Exactly two.', 'Calculated, executed, done.'],
  botLoss: ['Your path was shorter. Mathematically.', 'A precise game. Well earned.', 'I will re-run that line.'],
  resignation: ['The arithmetic was already settled.', 'Concession noted. Efficient.', 'A correct calculation on your part.'],
  undo: ['Undoing does not change the maths.', 'Recalculate. Now I expect more.', 'You may rewrite the line. The answer is still mine.'],
};

export const SABLE_CHAT: ChatPack = {
  greeting: ['Run if you like.', 'I will see your walls before you place them.', 'Let us not pretend this is close.'],
  playerBlunder: ['There. That was the opening.', 'You flinched.', 'Slow. Predictable. Costly.'],
  playerGoodMove: ['Hm. Better than expected.', 'You can play. Noted.', 'That will cost me a step.'],
  botAdvantage: ['I have your path now.', 'The hunt is going well.', 'You are three steps behind. I can hear it.'],
  botBehind: ['You are quicker than I assumed.', 'I have ground to make up. I will.', 'Finally. A chase worth having.'],
  wallSpam: ['Walls you cannot defend.', 'Every wall you place, you will miss later.', 'You build a cage. Do not be inside it.'],
  idle: ['I am patient.', 'Come closer.', 'The board is small when I am hunting.'],
  botWin: ['As it should be.', 'The chase ends here.', 'You lasted longer than most.'],
  botLoss: ['You got past me. Once.', 'Prey that bites. Interesting.', 'I will find you again.'],
  resignation: ['You smelled the ending.', 'Wise. It was over.', 'A clean kill is a courtesy.'],
  undo: ['You flinch twice.', 'Take it back. It changes nothing.', 'Rewriting history is how prey thinks.'],
};

export const VEX_CHAT: ChatPack = {
  greeting: ['Ah, a challenger. Delightful.', 'Do try to last past move twenty.', 'I have forgotten more openings than you will ever learn.'],
  playerBlunder: ['Oh, *dear*.', 'That is a move one apologises for. Rewind it. You cannot.', 'My calculator did not need three plies for that.'],
  playerGoodMove: ['Hmph. Competent.', 'You have a coach, clearly.', 'That was nearly worthy of the board.'],
  botAdvantage: ['The position sings for me now.', 'Advantage, as forecast.', 'You are losing, and you know it.'],
  botBehind: ['A temporary narrative arc.', 'You are ahead. Enjoy this page of the story.', 'Do not celebrate. It is unbecoming.'],
  wallSpam: ['Walls are a currency, not confetti.', 'You place them like punctuation.', 'Every wall you spend, I shall spend better.'],
  idle: ['I am considering three replies. You would see one.', 'Tempo, my friend. Tempo.', 'The centre is mine. It always is.'],
  botWin: ['Curtain.', 'A masterclass in patience.', 'Concede with dignity. That is all you have left.'],
  botLoss: ['…Well. That was rude.', 'You have beaten me. Tell no one.', 'A fluke. Rematch. Do not speak of it.'],
  resignation: ['Ah. The white flag. Classic.', 'Sensible. Expensive, but sensible.', 'I accept your surrender. Reluctantly.'],
  undo: ['You are allowed exactly one of those.', 'Takebacks? In MY arena?', 'Very well. I shall pretend I did not see it.'],
};

export const ORACLE_CHAT: ChatPack = {
  greeting: ['I knew you would arrive.', 'The board has already told me how this ends.', 'Sit. The walls know you.'],
  playerBlunder: ['I saw that move three turns ago.', 'The shape you needed was elsewhere.', 'Your path just ended. You simply have not reached the end of it.'],
  playerGoodMove: ['Hm. You have surprised the pattern.', 'There it is. The line I foresaw.', 'You grow. Even the board noticed.'],
  botAdvantage: ['The end is written. You are on the wrong path.', 'I am ahead. This is not the surprising part.', 'You will need more than walls.'],
  botBehind: ['You have overtaken me. For now.', 'Ah. A branch I did not favour.', 'You are ahead. The board trembles, politely.'],
  wallSpam: ['You build a maze. I have already solved it.', 'Every wall casts a shadow ahead of you.', 'Walls are the noise before the answer.'],
  idle: ['I am not thinking. I am remembering.', 'Do you hear the paths?', 'The board is patient. So am I.'],
  botWin: ['As foreseen.', 'You walked exactly where I needed you to.', 'The end was decided earlier. You simply arrived.'],
  botLoss: ['You wrote a different ending.', 'I foresaw this too. I hoped otherwise.', 'The pattern favoured you. It happens.'],
  resignation: ['You saw the ending early. Wisdom.', 'The board accepts your concession.', 'A foreseen ending is still an ending.'],
  undo: ['Time is a wall too. You found a way through it.', 'You bend the path. Bold.', 'I have seen this branch before.'],
};

export const CHAT_PACKS = {
  pip: PIP_CHAT,
  nibbles: NIBBLES_CHAT,
  watcher: WATCHER_CHAT,
  rookford: ROOKFORD_CHAT,
  sable: SABLE_CHAT,
  vex: VEX_CHAT,
  oracle: ORACLE_CHAT,
} as const;

export type ChatPackId = keyof typeof CHAT_PACKS;

/* ------------------------------------------------------------------ */
/* Choosing a line                                                    */
/* ------------------------------------------------------------------ */

/** Pick a line, avoiding the one we said last for this category. */
export function pickChatLine(
  pack: ChatPack,
  category: ChatCategory,
  random: () => number = Math.random,
  avoid?: string,
): string {
  const lines = pack[category]?.length ? pack[category] : pack.idle;
  if (lines.length === 0) return '';
  if (lines.length === 1) return lines[0];

  const pool = avoid ? lines.filter((l) => l !== avoid) : lines;
  const usable = pool.length > 0 ? pool : lines;
  return usable[Math.floor(random() * usable.length) % usable.length];
}

/* ------------------------------------------------------------------ */
/* Context evaluation                                                 */
/* ------------------------------------------------------------------ */

export interface ChatContext {
  /** Half-moves played so far. */
  ply: number;
  humanPlayer: Player;
  /** Who made the move that just happened. */
  mover: Player;
  /** Human's win probability (0-1) before and after that move. */
  winProbBefore: number;
  winProbAfter: number;
  /** Walls the human has spent this game. */
  humanWallsPlaced: number;
  winner: Player | null;
  resigned?: boolean;
  undone?: boolean;
}

/** A blunder in chat terms: losing this much win probability in one move. */
export const CHAT_BLUNDER_DROP = 0.11;
/** A "good move" keeps a real advantage and gives nothing away. */
const GOOD_MOVE_DROP_MAX = 0.015;

/**
 * Decide what (if anything) the bot should say about the latest event.
 * Returns a stable `key` so callers can de-duplicate React effect runs.
 */
export function deriveChatEvent(ctx: ChatContext): { category: ChatCategory; key: string } | null {
  const { ply, humanPlayer, mover, winProbBefore, winProbAfter, winner } = ctx;

  if (ctx.resigned) return { category: 'resignation', key: `resign-${ply}` };

  if (winner !== null) {
    return winner === humanPlayer
      ? { category: 'botLoss', key: `over-${ply}` }
      : { category: 'botWin', key: `over-${ply}` };
  }

  if (ply === 1) return { category: 'greeting', key: 'greeting' };

  const drop = winProbBefore - winProbAfter;

  if (mover === humanPlayer) {
    if (drop >= CHAT_BLUNDER_DROP) return { category: 'playerBlunder', key: `blunder-${ply}` };
    if (drop <= GOOD_MOVE_DROP_MAX && winProbAfter >= 0.52) {
      return { category: 'playerGoodMove', key: `good-${ply}` };
    }
  } else {
    // The bot just moved: trash talk about the resulting position.
    if (winProbAfter <= 0.36) return { category: 'botAdvantage', key: `adv-${ply}` };
    if (winProbAfter >= 0.64) return { category: 'botBehind', key: `behind-${ply}` };
    if (ctx.humanWallsPlaced >= 3 && ply % 4 === 0) {
      return { category: 'wallSpam', key: `walls-${ply}` };
    }
  }

  // Ambient filler, sparingly.
  if (ply > 6 && ply % 6 === 0) return { category: 'idle', key: `idle-${ply}` };

  return null;
}
