(function attachPokerEngine(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PokerEngine = api;
})(typeof window !== 'undefined' ? window : globalThis, function createPokerEngine() {
  const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
  const SUIT_SYMBOLS = {
    spades: '♠',
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣'
  };
  const RANK_LABELS = {
    14: 'A',
    13: 'K',
    12: 'Q',
    11: 'J',
    10: '10',
    9: '9',
    8: '8',
    7: '7',
    6: '6',
    5: '5',
    4: '4',
    3: '3',
    2: '2'
  };

  function createDeck() {
    const deck = [];
    SUITS.forEach((suit) => {
      for (let rank = 2; rank <= 14; rank += 1) {
        deck.push({ rank, suit, id: suit + '-' + rank });
      }
    });
    return deck;
  }

  function shuffle(deck, random) {
    const rng = random || Math.random;
    const copy = deck.slice();
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const target = Math.floor(rng() * (index + 1));
      const value = copy[index];
      copy[index] = copy[target];
      copy[target] = value;
    }
    return copy;
  }

  function combinations(items, size) {
    const result = [];
    const selected = [];

    function visit(start) {
      if (selected.length === size) {
        result.push(selected.slice());
        return;
      }
      for (let index = start; index <= items.length - (size - selected.length); index += 1) {
        selected.push(items[index]);
        visit(index + 1);
        selected.pop();
      }
    }

    visit(0);
    return result;
  }

  function scoreValue(category, kickers) {
    const padded = kickers.slice(0, 5);
    while (padded.length < 5) padded.push(0);
    let value = category * Math.pow(15, 5);
    padded.forEach((rank, index) => {
      value += rank * Math.pow(15, 4 - index);
    });
    return value;
  }

  function highLabel(rank) {
    return RANK_LABELS[rank] || String(rank);
  }

  function evaluateFive(cards) {
    if (!Array.isArray(cards) || cards.length !== 5) {
      throw new Error('evaluateFive 需要正好 5 张牌');
    }

    const ranks = cards.map((card) => card.rank).sort((a, b) => b - a);
    const rankCounts = new Map();
    ranks.forEach((rank) => rankCounts.set(rank, (rankCounts.get(rank) || 0) + 1));
    const groups = Array.from(rankCounts.entries())
      .map(([rank, count]) => ({ rank, count }))
      .sort((a, b) => b.count - a.count || b.rank - a.rank);
    const flush = cards.every((card) => card.suit === cards[0].suit);
    const uniqueRanks = Array.from(new Set(ranks));
    let straightHigh = 0;

    if (uniqueRanks.length === 5) {
      if (uniqueRanks[0] - uniqueRanks[4] === 4) straightHigh = uniqueRanks[0];
      if (uniqueRanks.join(',') === '14,5,4,3,2') straightHigh = 5;
    }

    let category;
    let kickers;
    let name;

    if (flush && straightHigh) {
      category = 8;
      kickers = [straightHigh];
      name = straightHigh === 14 ? '皇家同花顺' : highLabel(straightHigh) + '高同花顺';
    } else if (groups[0].count === 4) {
      category = 7;
      kickers = [groups[0].rank, groups[1].rank];
      name = '四条 ' + highLabel(groups[0].rank);
    } else if (groups[0].count === 3 && groups[1].count === 2) {
      category = 6;
      kickers = [groups[0].rank, groups[1].rank];
      name = '葫芦 ' + highLabel(groups[0].rank) + ' 满 ' + highLabel(groups[1].rank);
    } else if (flush) {
      category = 5;
      kickers = ranks;
      name = highLabel(ranks[0]) + '高同花';
    } else if (straightHigh) {
      category = 4;
      kickers = [straightHigh];
      name = highLabel(straightHigh) + '高顺子';
    } else if (groups[0].count === 3) {
      category = 3;
      kickers = [groups[0].rank].concat(
        groups.filter((group) => group.count === 1).map((group) => group.rank).sort((a, b) => b - a)
      );
      name = '三条 ' + highLabel(groups[0].rank);
    } else if (groups[0].count === 2 && groups[1].count === 2) {
      const pairs = groups.filter((group) => group.count === 2).map((group) => group.rank).sort((a, b) => b - a);
      const kicker = groups.find((group) => group.count === 1).rank;
      category = 2;
      kickers = [pairs[0], pairs[1], kicker];
      name = '两对 ' + highLabel(pairs[0]) + ' 和 ' + highLabel(pairs[1]);
    } else if (groups[0].count === 2) {
      category = 1;
      kickers = [groups[0].rank].concat(
        groups.filter((group) => group.count === 1).map((group) => group.rank).sort((a, b) => b - a)
      );
      name = '一对 ' + highLabel(groups[0].rank);
    } else {
      category = 0;
      kickers = ranks;
      name = highLabel(ranks[0]) + '高牌';
    }

    return {
      category,
      kickers,
      value: scoreValue(category, kickers),
      name,
      cards: cards.slice()
    };
  }

  function evaluateHand(cards) {
    if (!Array.isArray(cards) || cards.length < 5 || cards.length > 7) {
      throw new Error('evaluateHand 需要 5 至 7 张牌');
    }
    return combinations(cards, 5)
      .map(evaluateFive)
      .sort((a, b) => b.value - a.value)[0];
  }

  function compareHands(left, right) {
    return evaluateHand(left).value - evaluateHand(right).value;
  }

  function preflopStrength(cards) {
    if (!Array.isArray(cards) || cards.length !== 2) return 0;
    const high = Math.max(cards[0].rank, cards[1].rank);
    const low = Math.min(cards[0].rank, cards[1].rank);
    const pair = high === low;
    const suited = cards[0].suit === cards[1].suit;
    const gap = high - low;

    if (pair) return Math.min(1, 0.52 + (high - 2) * 0.04);

    let strength = 0.18 + (high - 2) * 0.035 + (low - 2) * 0.015;
    if (suited) strength += 0.06;
    if (gap === 1) strength += 0.06;
    else if (gap === 2) strength += 0.025;
    else if (gap >= 4) strength -= Math.min(0.12, (gap - 3) * 0.025);
    if (high >= 11 && low >= 10) strength += 0.08;
    if (high === 14) strength += 0.04;
    return Math.max(0.08, Math.min(0.96, strength));
  }

  function buildSidePots(players) {
    const levels = Array.from(
      new Set(players.filter((player) => player.totalBet > 0).map((player) => player.totalBet))
    ).sort((a, b) => a - b);
    const pots = [];
    let previous = 0;

    levels.forEach((level) => {
      const contributors = players.filter((player) => player.totalBet >= level);
      const amount = (level - previous) * contributors.length;
      const eligible = contributors.filter((player) => !player.folded);
      if (amount > 0) pots.push({ amount, cap: level, eligible });
      previous = level;
    });

    return pots;
  }

  function cardText(card) {
    return highLabel(card.rank) + SUIT_SYMBOLS[card.suit];
  }

  return {
    SUITS,
    SUIT_SYMBOLS,
    RANK_LABELS,
    createDeck,
    shuffle,
    combinations,
    evaluateFive,
    evaluateHand,
    compareHands,
    preflopStrength,
    buildSidePots,
    cardText
  };
});
