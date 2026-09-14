(function attachSessionStore(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.HoldemSession = api;
})(typeof window !== 'undefined' ? window : globalThis, function createSessionStore() {
  'use strict';

  const KEY = 'holdem-session-v1';
  const STATE_FIELDS = [
    'deck', 'community', 'dealer', 'smallBlindIndex', 'bigBlindIndex', 'smallBlind', 'bigBlind',
    'phase', 'currentBet', 'minRaise', 'streetRaises', 'currentPlayer', 'handNumber',
    'handComplete', 'resultReady', 'revealCards', 'winnerIds', 'awards', 'lastPot',
    'raiseTarget', 'sessionStart', 'sessionOver'
  ];
  const PLAYER_FIELDS = [
    'chips', 'hand', 'inHand', 'folded', 'allIn', 'totalBet', 'roundBet', 'acted',
    'lastAction', 'visibleCardCount'
  ];
  const STAT_FIELDS = ['hands', 'wins', 'maxPot', 'actions', 'folds', 'raises'];
  const integer = (value) => Number.isSafeInteger(value) && value >= 0;
  const seat = (value) => Number.isInteger(value) && value >= 0 && value < 4;
  const pick = (source, fields) => fields.reduce((result, key) => {
    result[key] = source[key];
    return result;
  }, {});

  function serialize(state, resume, history) {
    return JSON.stringify({
      version: 1,
      savedAt: Date.now(),
      resume,
      state: Object.assign(pick(state, STATE_FIELDS), {
        players: state.players.map((player) => pick(player, PLAYER_FIELDS))
      }),
      stats: pick(state.stats, STAT_FIELDS),
      history: (history || []).slice(0, 80)
    });
  }

  // Save only at resumable boundaries. Animation frames are never a save point:
  // a reload replays the pending deal/transition from the same deck, exactly once.
  function parse(raw) {
    try {
      const snapshot = JSON.parse(raw);
      if (!snapshot || snapshot.version !== 1) return null;
      const { state, resume, stats, history } = snapshot;
      if (!state || !resume || !['deal', 'turn', 'after-action', 'result'].includes(resume.type)) return null;
      if (!Array.isArray(state.players) || state.players.length !== 4) return null;
      if (!Array.isArray(state.deck) || !Array.isArray(state.community)) return null;
      if (!['dealing', 'preflop', 'flop', 'turn', 'river', 'showdown'].includes(state.phase)) return null;
      if (!['dealer', 'smallBlindIndex', 'bigBlindIndex'].every((key) => seat(state[key]))) return null;
      if (!['smallBlind', 'bigBlind', 'currentBet', 'minRaise', 'streetRaises', 'handNumber', 'lastPot', 'sessionStart']
        .every((key) => integer(state[key]))) return null;
      if (state.handNumber < 1 || state.bigBlind < 1 || state.sessionStart !== 2000) return null;
      if (!['handComplete', 'resultReady', 'revealCards', 'sessionOver'].every((key) => typeof state[key] === 'boolean')) return null;
      if (state.raiseTarget !== null && !integer(state.raiseTarget)) return null;
      if (!stats || !STAT_FIELDS.every((key) => integer(stats[key]))) return null;
      if (stats.wins > stats.hands || stats.raises + stats.folds > stats.actions) return null;

      for (const player of state.players) {
        if (!player || !['chips', 'roundBet', 'totalBet', 'visibleCardCount'].every((key) => integer(player[key]))) return null;
        if (player.roundBet > player.totalBet || player.visibleCardCount > 2) return null;
        if (!['inHand', 'folded', 'allIn', 'acted'].every((key) => typeof player[key] === 'boolean')) return null;
        if (typeof player.lastAction !== 'string' || player.lastAction.length > 80) return null;
        const expectedCards = state.phase === 'dealing' || !player.inHand ? 0 : 2;
        if (!Array.isArray(player.hand) || player.hand.length !== expectedCards) return null;
      }

      const communityCounts = { dealing: 0, preflop: 0, flop: 3, turn: 4, river: 5, showdown: 5 };
      if (state.community.length !== communityCounts[state.phase]) return null;
      const cards = state.deck.concat(state.community, ...state.players.map((player) => player.hand));
      const validCards = cards.every((card) => card &&
        ['spades', 'hearts', 'diamonds', 'clubs'].includes(card.suit) &&
        Number.isInteger(card.rank) && card.rank >= 2 && card.rank <= 14 &&
        card.id === card.suit + '-' + card.rank);
      const burnedCards = { dealing: 0, preflop: 0, flop: 1, turn: 2, river: 3, showdown: 3 }[state.phase];
      if (!validCards || cards.length !== 52 - burnedCards || new Set(cards.map((card) => card.id)).size !== cards.length) return null;

      const totalChips = state.players.reduce((sum, player) => sum + player.chips + (state.handComplete ? 0 : player.totalBet), 0);
      if (totalChips !== 8000) return null;
      if (!Array.isArray(state.winnerIds) || !state.winnerIds.every(seat) || !state.awards || typeof state.awards !== 'object') return null;
      if (resume.type === 'result') {
        if (!state.handComplete || !state.resultReady || state.currentPlayer !== null || state.winnerIds.length < 1) return null;
        if (new Set(state.winnerIds).size !== state.winnerIds.length) return null;
        if (Object.keys(state.awards).length !== state.winnerIds.length) return null;
        if (!state.winnerIds.every((id) => integer(state.awards[id]) && state.awards[id] > 0)) return null;
        if (Object.values(state.awards).reduce((sum, value) => sum + value, 0) !== state.lastPot) return null;
      } else {
        if (state.handComplete || state.resultReady || state.winnerIds.length || Object.keys(state.awards).length) return null;
        if (resume.type === 'deal' && (state.phase !== 'dealing' || state.currentPlayer !== null)) return null;
        if (resume.type === 'after-action' && (!seat(resume.player) || state.currentPlayer !== null || state.phase === 'dealing')) return null;
        if (resume.type === 'turn') {
          if (!seat(state.currentPlayer) || state.phase === 'dealing') return null;
          const current = state.players[state.currentPlayer];
          if (!current.inHand || current.folded || current.allIn) return null;
        }
      }
      if (!Array.isArray(history) || history.length > 80 || !history.every((entry) => entry &&
        typeof entry.message === 'string' && entry.message.length < 500 &&
        ['phase', 'action', 'fold', 'win', ''].includes(entry.type) &&
        typeof entry.time === 'string' && entry.time.length < 40)) return null;
      return {
        version: 1, savedAt: snapshot.savedAt, resume: { type: resume.type, player: resume.player },
        state: Object.assign(pick(state, STATE_FIELDS), { players: state.players.map((player) => pick(player, PLAYER_FIELDS)) }),
        stats: pick(stats, STAT_FIELDS), history
      };
    } catch (error) {
      return null;
    }
  }

  return { KEY, serialize, parse };
});
