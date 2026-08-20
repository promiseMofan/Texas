const assert = require('assert');
const AI = require('../src/ai-engine');

function card(rank, suit) {
  return { rank, suit, id: suit + '-' + rank };
}

function hand(specification) {
  const suitNames = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
  const rankNames = { A: 14, K: 13, Q: 12, J: 11, T: 10 };
  return specification.split(' ').map((token) => {
    const rankText = token.slice(0, -1);
    return card(rankNames[rankText] || Number(rankText), suitNames[token.slice(-1)]);
  });
}

function seeded(seedValue) {
  let seed = seedValue >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const unbeatable = AI.calculateEquity({
  holeCards: hand('As Ks'),
  community: hand('Qs Js Ts 2d 3c'),
  opponents: 3,
  iterations: 80,
  random: seeded(7)
});
assert.strictEqual(unbeatable, 1, '独占皇家同花顺的胜率应为 100%');

const weakFacingHugeBet = AI.decisionDistribution({
  equity: 0.08,
  opponents: 2,
  callAmount: 700,
  pot: 300,
  canRaise: false,
  difficulty: 'hard',
  profile: { aggression: 0.6, looseness: 0.4, bluff: 0.08 }
});
assert(weakFacingHugeBet.fold > 0.9, '困难AI面对高压下注时应高频弃掉极弱牌');
assert(!('raise' in weakFacingHugeBet), '不能加注时策略中不应出现加注');

const strongFacingBet = AI.decisionDistribution({
  equity: 0.92,
  opponents: 1,
  callAmount: 100,
  pot: 500,
  canRaise: true,
  difficulty: 'hard',
  profile: { aggression: 0.7, looseness: 0.4, bluff: 0.08 }
});
assert((strongFacingBet.call || 0) + (strongFacingBet.raise || 0) > 0.98, '超强牌不应轻易弃牌');

const allInDecision = AI.decide({
  holeCards: hand('7c 2d'),
  community: hand('As Kh Qh'),
  opponents: 2,
  phase: 'flop',
  callAmount: 900,
  pot: 260,
  currentBet: 900,
  raiseMin: 900,
  raiseMax: 900,
  canRaise: false,
  difficulty: 'hard',
  equity: 0.04,
  random: () => 0.5,
  profile: { aggression: 0.6, looseness: 0.4, bluff: 0.08 }
});
assert.strictEqual(allInDecision.type, 'fold', '弱牌面对覆盖筹码的下注不应被强制跟注');

assert(AI.DIFFICULTIES.easy.simulations < AI.DIFFICULTIES.normal.simulations);
assert(AI.DIFFICULTIES.normal.simulations < AI.DIFFICULTIES.hard.simulations);
assert(AI.DIFFICULTIES.easy.mistakeRate > AI.DIFFICULTIES.hard.mistakeRate);

const drawDecision = AI.decide({
  holeCards: hand('9h 8h'),
  community: hand('7h 6h Kd'),
  opponents: 1,
  phase: 'flop',
  callAmount: 30,
  pot: 120,
  currentBet: 30,
  raiseMin: 60,
  raiseMax: 900,
  canRaise: true,
  difficulty: 'normal',
  equity: 0.5,
  random: () => 0.5,
  profile: { aggression: 0.6, looseness: 0.4, bluff: 0.08 }
});
assert.strictEqual(drawDecision.draws.comboDraw, true, 'AI应识别同花顺组合听牌');

const earlyPosition = AI.decisionDistribution({
  equity: 0.57, opponents: 2, callAmount: 0, pot: 100, canRaise: true,
  position: 0.05, spr: 10, previousRaises: 0, difficulty: 'normal',
  profile: { aggression: 0.55, looseness: 0.45, bluff: 0.08 }
});
const latePosition = AI.decisionDistribution({
  equity: 0.57, opponents: 2, callAmount: 0, pot: 100, canRaise: true,
  position: 0.95, spr: 10, previousRaises: 0, difficulty: 'normal',
  profile: { aggression: 0.55, looseness: 0.45, bluff: 0.08 }
});
assert(
  (latePosition.bet_small || 0) + (latePosition.bet_large || 0) >
  (earlyPosition.bet_small || 0) + (earlyPosition.bet_large || 0),
  '后位应比前位更愿意主动下注'
);

console.log('✓ 三档难度、蒙特卡洛胜率、策略约束和全下决策测试全部通过');
