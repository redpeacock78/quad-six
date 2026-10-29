/** Multi-game match: keeps the 56-tile game rules unchanged. */
import { newGame, totalScore } from './engine.js';

export const MATCH_FORMATS = Object.freeze({
  single: { label: '一局戦', games: 1 },
  tonpu: { label: '東風戦', games: 4 },
  hanchan: { label: '半荘戦', games: 8 }
});
export const STARTING_POINTS = 250;

export function createMatch({ format = 'single', mode = 'cpu', seed = Date.now(), initialHand = 9, startingPlayer = null } = {}) {
  if (!MATCH_FORMATS[format]) throw new Error('未対応の対局形式です');
  if (!['cpu', 'local'].includes(mode)) throw new Error('未対応の対戦モードです');
  // Only the first game draws the parent at random. Later games alternate.
  if (startingPlayer === null) startingPlayer = Math.floor(Math.random() * 2);
  if (startingPlayer !== 0 && startingPlayer !== 1) throw new Error('最初の親は0か1で指定してください');
  return {
    format, mode, initialHand, totalGames: MATCH_FORMATS[format].games,
    gameNumber: 1, initialStarter: startingPlayer, points: [STARTING_POINTS, STARTING_POINTS],
    history: [], settled: false, complete: false,
    game: newGame({ mode, seed, initialHand, startingPlayer })
  };
}

/** Each game's *difference* is transferred; the total point pool stays at 500. */
export function settleMatchGame(match) {
  if (match.game.phase !== 'finished') throw new Error('ゲームがまだ終了していません');
  if (match.settled) return match.history.at(-1);
  const scores = [totalScore(match.game, 0), totalScore(match.game, 1)];
  const delta = scores[0] - scores[1];
  match.points[0] += delta;
  match.points[1] -= delta;
  const record = {
    game: match.gameNumber, scores, delta,
    points: [...match.points],
    winner: delta === 0 ? null : delta > 0 ? 0 : 1,
    reason: match.game.endReason
  };
  match.history.push(record);
  match.settled = true;
  match.complete = match.gameNumber === match.totalGames;
  return record;
}

export function nextMatchGame(match, seed = Date.now()) {
  if (!match.settled) throw new Error('現在のゲームが終了していません');
  if (match.complete) throw new Error('対局はすでに終了しています');
  match.gameNumber++;
  match.game = newGame({ mode: match.mode, initialHand: match.initialHand, seed,
    startingPlayer: (match.initialStarter + match.gameNumber - 1) % 2 });
  match.settled = false;
  return match.game;
}

export function matchWinner(match) {
  if (!match.complete) return null;
  return match.points[0] === match.points[1] ? null : match.points[0] > match.points[1] ? 0 : 1;
}
