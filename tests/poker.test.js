const assert = require('assert');
const Poker = require('../src/poker-engine');

function card(rank, suit) {
  return { rank, suit, id: suit + '-' + rank };
}

function hand(specification) {
  const suitNames = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
  const rankNames = { A: 14, K: 13, Q: 12, J: 11, T: 10 };
  return specification.split(' ').map((token) => {
    const rankText = token.slice(0, -1);
    const suitText = token.slice(-1);
    return card(rankNames[rankText] || Number(rankText), suitNames[suitText]);
  });
}

const deck = Poker.createDeck();
assert.strictEqual(deck.length, 52, '牌组应包含 52 张牌');
assert.strictEqual(new Set(deck.map((item) => item.id)).size, 52, '每张牌应唯一');

const royal = Poker.evaluateHand(hand('As Ks Qs Js Ts 2d 3c'));
assert.strictEqual(royal.category, 8);
assert.strictEqual(royal.name, '皇家同花顺');

const wheel = Poker.evaluateHand(hand('As 2d 3c 4h 5s Kd Qc'));
assert.strictEqual(wheel.category, 4);
assert.strictEqual(wheel.kickers[0], 5, 'A2345 应识别为 5 高顺子');

const fullHouse = Poker.evaluateHand(hand('Ah Ad Ac Ks Kd 2c 3s'));
const flush = Poker.evaluateHand(hand('Ah Jh 9h 6h 2h Kd Qc'));
assert(fullHouse.value > flush.value, '葫芦应大于同花');

const twoPairAceKicker = Poker.evaluateHand(hand('Ah Ad Ks Kc Qh 2d 3s'));
const twoPairJackKicker = Poker.evaluateHand(hand('As Ac Kh Kd Jh 9d 8s'));
assert(twoPairAceKicker.value > twoPairJackKicker.value, '两对相同时应比较踢脚');

const sidePots = Poker.buildSidePots([
  { id: 0, totalBet: 100, folded: false },
  { id: 1, totalBet: 300, folded: false },
  { id: 2, totalBet: 300, folded: false },
  { id: 3, totalBet: 500, folded: true }
]);
assert.deepStrictEqual(sidePots.map((pot) => pot.amount), [400, 600, 200]);
assert.deepStrictEqual(sidePots.map((pot) => pot.eligible.length), [3, 2, 1]);

assert(Poker.preflopStrength(hand('As Ah')) > Poker.preflopStrength(hand('7c 2d')));

const comboDraw = Poker.detectDraws(hand('9h 8h 7h 6h Kd'));
assert.strictEqual(comboDraw.flushDraw, true);
assert.strictEqual(comboDraw.openEndedStraightDraw, true);
assert.strictEqual(comboDraw.comboDraw, true);

console.log('✓ 牌组、牌型比较、A2345 顺子、踢脚和边池测试全部通过');
