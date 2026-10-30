/** Multi-game match: 1/4/8 scheduled dealer hands, with dealer continuations. */
import { newGame, totalScore } from './engine.js?v=port-feedback-20261030f';

export const MATCH_FORMATS = Object.freeze({
  single: { label: '一局戦', games: 1 },
  tonpu: { label: '東風戦', games: 4 },
  hanchan: { label: '半荘戦', games: 8 }
});
export const STARTING_POINTS = 250;
export const TABLE_HONBA_UNIT = 5;

/**
 * Mahjong-style designation for a scheduled hand.
 * Tonpu: 東1局..東4局; hanchan: 東1局..東4局, 南1局..南4局.
 * Dealer continuations retain the same designation and increment honba.
 */
export function matchRoundName(format, handNumber, honba = 0) {
  if (!MATCH_FORMATS[format]) throw new Error('未対応の対局形式です');
  if (format === 'single') return '一局戦';
  if (!Number.isInteger(handNumber) || handNumber < 1 || handNumber > MATCH_FORMATS[format].games) {
    throw new Error('親番の番号が範囲外です');
  }
  if (!Number.isInteger(honba) || honba < 0) throw new Error('本場数が不正です');
  const wind = handNumber <= 4 ? '東' : '南';
  const number = ((handNumber - 1) % 4) + 1;
  return `${wind}${number}局 ${honba}本場`;
}

/** The first dealer is random; each subsequent scheduled hand changes dealer. */
export function createMatch({ format = 'single', mode = 'cpu', seed = Date.now(), initialHand = 9, startingPlayer = null } = {}) {
  if (!MATCH_FORMATS[format]) throw new Error('未対応の対局形式です');
  if (!['cpu', 'local'].includes(mode)) throw new Error('未対応の対戦モードです');
  if (startingPlayer === null) startingPlayer = Math.floor(Math.random() * 2);
  if (startingPlayer !== 0 && startingPlayer !== 1) throw new Error('最初の親は0か1で指定してください');
  return {
    format, mode, initialHand,
    // totalGames is the number of scheduled dealer hands, NOT the maximum
    // number of games: dealer wins may extend the match.
    totalGames: MATCH_FORMATS[format].games,
    gameNumber: 1, handNumber: 1, dealer: startingPlayer,
    honba: 0, initialStarter: startingPlayer,
    points: [STARTING_POINTS, STARTING_POINTS],
    history: [], settled: false, complete: false,
    game: newGame({ mode, seed, initialHand, startingPlayer })
  };
}

/**
 * Settle one complete game.
 * A dealer's early win repeats the current scheduled hand and adds 1 honba.
 * A child's early win or exhaustion advances the parent and resets honba.
 * 5 × current honba is added to whoever goes out, in addition to +15 early.
 * Single-game matches always end after one game, without table-honba scoring.
 */
export function settleMatchGame(match) {
  if (match.game.phase !== 'finished') throw new Error('ゲームがまだ終了していません');
  if (match.settled) return match.history.at(-1);
  const early = match.game.endReason === 'early';
  const winner = early ? match.game.endWinner : null;
  if (early && winner !== 0 && winner !== 1) throw new Error('早アガリした人を判定できません');
  const bonus = match.format !== 'single' && early ? match.honba * TABLE_HONBA_UNIT : 0;
  if (bonus) match.game.scores[winner].tableHonba += bonus;

  const scores = [totalScore(match.game, 0), totalScore(match.game, 1)];
  const delta = scores[0] - scores[1];
  match.points[0] += delta;
  match.points[1] -= delta;

  const repeat = match.format !== 'single' && early && winner === match.dealer;
  const record = {
    game: match.gameNumber, hand: match.handNumber,
    honba: match.honba, dealer: match.dealer,
    earlyWinner: winner, honbaPoints: bonus, renchan: repeat,
    scores, delta, points: [...match.points],
    winner: delta === 0 ? null : delta > 0 ? 0 : 1,
    reason: match.game.endReason
  };
  match.history.push(record);
  match.settled = true;

  if (repeat) {
    match.honba++;
  } else {
    match.honba = 0;
    match.handNumber++;
    match.dealer = 1 - match.dealer;
  }
  match.complete = match.format === 'single' || (!repeat && record.hand === match.totalGames);
  return record;
}

export function nextMatchGame(match, seed = Date.now()) {
  if (!match.settled) throw new Error('現在のゲームが終了していません');
  if (match.complete) throw new Error('対局はすでに終了しています');
  match.gameNumber++;
  match.game = newGame({
    mode: match.mode, initialHand: match.initialHand, seed,
    startingPlayer: match.dealer
  });
  match.settled = false;
  return match.game;
}

export function matchWinner(match) {
  if (!match.complete) return null;
  return match.points[0] === match.points[1] ? null : match.points[0] > match.points[1] ? 0 : 1;
}
