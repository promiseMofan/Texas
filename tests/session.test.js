'use strict';
const assert = require('assert');
const Poker = require('../src/poker-engine');
const Session = require('../src/session-store');

function fixture() {
  const deck = Poker.createDeck();
  const players = Array.from({ length: 4 }, (_, index) => ({
    chips: 2000, hand: [deck.pop(), deck.pop()], inHand: true,
    folded: false, allIn: false, totalBet: 0, roundBet: 0,
    acted: false, lastAction: '', visibleCardCount: 2,
    name: 'Player ' + index
  }));
  players[1].chips -= 10; players[1].roundBet = players[1].totalBet = 10;
  players[2].chips -= 20; players[2].roundBet = players[2].totalBet = 20;
  return {
    deck, players, community: [], dealer: 0, smallBlindIndex: 1, bigBlindIndex: 2,
    smallBlind: 10, bigBlind: 20, phase: 'preflop', currentBet: 20, minRaise: 20,
    streetRaises: 0, currentPlayer: 0, handNumber: 1, handComplete: false,
    resultReady: false, revealCards: false, winnerIds: [], awards: {}, lastPot: 0,
    raiseTarget: 40, sessionStart: 2000, sessionOver: false,
    stats: { hands: 0, wins: 0, maxPot: 0, actions: 0, folds: 0, raises: 0 }
  };
}

const turn = fixture();
const restored = Session.parse(Session.serialize(turn, { type: 'turn' }, []));
assert(restored, 'A live betting turn must be resumable');
assert.deepStrictEqual(restored.state.deck, turn.deck);
assert.deepStrictEqual(restored.state.players[0].hand, turn.players[0].hand);
assert.strictEqual(restored.state.players[0].name, undefined, 'Restore game data without replacing player identities');

const dealing = fixture();
dealing.deck = Poker.createDeck();
dealing.players.forEach((player) => { player.hand = []; player.visibleCardCount = 0; });
dealing.phase = 'dealing'; dealing.currentPlayer = null;
assert(Session.parse(Session.serialize(dealing, { type: 'deal' }, [])), 'An interrupted deal keeps its pre-deal deck and paid blinds');

const action = fixture();
action.players[0].chips -= 20;
action.players[0].roundBet = action.players[0].totalBet = 20;
action.players[0].acted = true;
action.currentPlayer = null;
action.stats.actions = 1;
assert(Session.parse(Session.serialize(action, { type: 'after-action', player: 0 }, [])), 'A paid action resumes from the next decision');

const result = fixture();
result.players[0].chips += 30;
result.players.slice(1).forEach((player) => { player.folded = true; });
Object.assign(result, { handComplete: true, resultReady: true, currentPlayer: null, winnerIds: [0], awards: { 0: 30 }, lastPot: 30 });
result.stats.hands = result.stats.wins = 1;
assert(Session.parse(Session.serialize(result, { type: 'result' }, [])), 'A settled result preserves awarded chips');

for (const corrupt of [
  (state) => { state.players[0].chips += 1; },
  (state) => { state.deck[0] = state.deck[1]; },
  (state) => { state.players[0].hand.pop(); },
  (state) => { state.currentPlayer = 8; },
  (state) => { state.community = [state.deck.pop()]; },
  (state) => { state.players[0].allIn = true; }
]) {
  const invalid = fixture(); corrupt(invalid);
  assert.strictEqual(Session.parse(Session.serialize(invalid, { type: 'turn' }, [])), null);
}
assert.strictEqual(Session.parse('{bad json'), null);
assert.strictEqual(Session.parse('null'), null);
assert.strictEqual(Session.parse(JSON.stringify({ version: 99 })), null);
console.log('✓ 续局存档、发牌中恢复、行动与结算保存、筹码守恒及损坏存档校验通过');
