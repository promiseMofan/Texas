(function attachHoldemAI(root, factory) {
  const poker = typeof module !== 'undefined' && module.exports
    ? require('./poker-engine')
    : root.PokerEngine;
  const policy = typeof module !== 'undefined' && module.exports
    ? require('./mccfr-policy')
    : root.MCCFR_POLICY;
  const api = factory(poker, policy);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.HoldemAI = api;
})(typeof window !== 'undefined' ? window : globalThis, function createAI(Poker, MCCFRPolicy) {
  const DIFFICULTIES = {
    easy: {
      label: '简单',
      simulations: 55,
      policyWeight: 0.08,
      temperature: 1.55,
      mistakeRate: 0.16,
      equityNoise: 0.09
    },
    normal: {
      label: '一般',
      simulations: 190,
      policyWeight: 0.38,
      temperature: 0.92,
      mistakeRate: 0.045,
      equityNoise: 0.035
    },
    hard: {
      label: '困难',
      simulations: 620,
      policyWeight: 0.72,
      temperature: 0.58,
      mistakeRate: 0.008,
      equityNoise: 0.012
    }
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalize(weights) {
    const entries = Object.entries(weights).filter((entry) => Number.isFinite(entry[1]) && entry[1] > 0);
    const total = entries.reduce((sum, entry) => sum + entry[1], 0);
    if (total <= 0) {
      const equal = entries.length ? 1 / entries.length : 0;
      return Object.fromEntries(entries.map((entry) => [entry[0], equal]));
    }
    return Object.fromEntries(entries.map((entry) => [entry[0], entry[1] / total]));
  }

  function soften(distribution, temperature) {
    const powered = {};
    Object.entries(distribution).forEach(([action, probability]) => {
      powered[action] = Math.pow(Math.max(0.000001, probability), 1 / temperature);
    });
    return normalize(powered);
  }

  function blend(left, right, rightWeight) {
    const result = {};
    const actions = new Set(Object.keys(left).concat(Object.keys(right)));
    actions.forEach((action) => {
      result[action] = (left[action] || 0) * (1 - rightWeight) + (right[action] || 0) * rightWeight;
    });
    return normalize(result);
  }

  function sample(distribution, random) {
    const rng = random || Math.random;
    let cursor = rng();
    const entries = Object.entries(distribution);
    for (let index = 0; index < entries.length; index += 1) {
      cursor -= entries[index][1];
      if (cursor <= 0) return entries[index][0];
    }
    return entries.length ? entries[entries.length - 1][0] : null;
  }

  function remainingDeck(knownCards) {
    const knownIds = new Set(knownCards.map((card) => card.id || (card.suit + '-' + card.rank)));
    return Poker.createDeck().filter((card) => !knownIds.has(card.id));
  }

  function calculateEquity(options) {
    const holeCards = options.holeCards || [];
    const community = options.community || [];
    const opponents = Math.max(1, options.opponents || 1);
    const iterations = Math.max(1, options.iterations || 100);
    const rng = options.random || Math.random;
    const baseDeck = remainingDeck(holeCards.concat(community));
    const boardNeeded = 5 - community.length;
    const cardsNeeded = boardNeeded + opponents * 2;
    if (holeCards.length !== 2 || boardNeeded < 0 || cardsNeeded > baseDeck.length) {
      throw new Error('无法为当前牌面计算胜率');
    }

    let equity = 0;
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const deck = baseDeck.slice();
      for (let index = 0; index < cardsNeeded; index += 1) {
        const target = index + Math.floor(rng() * (deck.length - index));
        const value = deck[index];
        deck[index] = deck[target];
        deck[target] = value;
      }

      let cursor = 0;
      const board = community.concat(deck.slice(cursor, cursor + boardNeeded));
      cursor += boardNeeded;
      const heroValue = Poker.evaluateHand(holeCards.concat(board)).value;
      let bestValue = heroValue;
      let tiedWinners = 1;

      for (let opponent = 0; opponent < opponents; opponent += 1) {
        const opponentCards = deck.slice(cursor, cursor + 2);
        cursor += 2;
        const opponentValue = Poker.evaluateHand(opponentCards.concat(board)).value;
        if (opponentValue > bestValue) {
          bestValue = opponentValue;
          tiedWinners = 1;
        } else if (opponentValue === bestValue) {
          tiedWinners += 1;
        }
      }

      if (heroValue === bestValue) equity += 1 / tiedWinners;
    }
    return equity / iterations;
  }

  function normalizedStrength(equity, opponents) {
    const fairShare = 1 / (Math.max(1, opponents) + 1);
    if (equity <= fairShare) return clamp(0.5 * equity / fairShare, 0, 0.5);
    return clamp(0.5 + 0.5 * (equity - fairShare) / (1 - fairShare), 0.5, 1);
  }

  function equityBucket(equity, opponents) {
    const strength = normalizedStrength(equity, opponents);
    if (strength < 0.34) return 0;
    if (strength < 0.49) return 1;
    if (strength < 0.62) return 2;
    if (strength < 0.78) return 3;
    return 4;
  }

  function pressureBucket(callAmount, pot) {
    const potOdds = callAmount / Math.max(1, pot + callAmount);
    if (potOdds < 0.18) return 'low';
    if (potOdds < 0.34) return 'medium';
    return 'high';
  }

  function policyDistribution(callAmount, pot, bucket) {
    if (!MCCFRPolicy) return {};
    if (callAmount <= 0) return Object.assign({}, MCCFRPolicy.open[bucket] || {});
    const pressure = pressureBucket(callAmount, pot);
    return Object.assign({}, (MCCFRPolicy.facing[pressure] || {})[bucket] || {});
  }

  function heuristicDistribution(options) {
    const equity = options.equity;
    const opponents = Math.max(1, options.opponents || 1);
    const callAmount = Math.max(0, options.callAmount || 0);
    const pot = Math.max(1, options.pot || 1);
    const profile = Object.assign({ aggression: 0.55, looseness: 0.45, bluff: 0.08 }, options.profile);
    const strength = normalizedStrength(equity, opponents);
    const potOdds = callAmount / Math.max(1, pot + callAmount);
    const position = clamp(Number.isFinite(options.position) ? options.position : 0.5, 0, 1);
    const spr = Math.max(0.1, Number.isFinite(options.spr) ? options.spr : 8);
    const previousRaises = Math.max(0, options.previousRaises || 0);
    const pressureFromHistory = clamp(previousRaises * 0.08, 0, 0.3);

    if (callAmount <= 0) {
      const check = clamp(1.34 - strength * 1.18 - profile.aggression * 0.16 - position * 0.14, 0.06, 1.3);
      const betSmall = clamp(0.1 + strength * 0.72 + profile.aggression * 0.28 + position * 0.16, 0.04, 1.15);
      const betLarge = clamp(
        (strength - 0.51) * 1.45 + profile.aggression * 0.2 + position * 0.08 + (spr < 4 ? 0.1 : 0),
        0.015,
        1.25
      );
      const bluffBoost = strength < 0.38 ? profile.bluff * 1.4 : 0;
      return normalize({ check, bet_small: betSmall + bluffBoost, bet_large: betLarge + bluffBoost * 0.45 });
    }

    const edge = equity - potOdds;
    const fold = clamp(
      0.18 + (potOdds - equity) * 3.9 + (1 - profile.looseness) * 0.14 + pressureFromHistory * (1 - strength) + (spr > 8 ? 0.05 : 0),
      0.01,
      1.65
    );
    const call = clamp(
      0.42 + edge * 2.25 + (1 - Math.abs(strength - 0.59)) * 0.28 + (spr < 3 ? 0.08 : 0),
      0.015,
      1.55
    );
    const valueRaise = clamp(
      (strength - 0.61) * 2.15 + profile.aggression * 0.26 + position * 0.08 + (spr < 4 ? 0.13 : 0) - pressureFromHistory * 0.45,
      0.008,
      1.45
    );
    const bluffRaise = strength < 0.44 && potOdds < 0.32 ? profile.bluff * 0.7 : 0;
    return normalize({ fold, call, raise: valueRaise + bluffRaise });
  }

  function decisionDistribution(options) {
    const config = DIFFICULTIES[options.difficulty] || DIFFICULTIES.normal;
    const bucket = equityBucket(options.equity, options.opponents);
    const heuristic = heuristicDistribution(options);
    const solved = policyDistribution(options.callAmount, options.pot, bucket);
    let distribution = Object.keys(solved).length
      ? blend(heuristic, solved, config.policyWeight)
      : heuristic;
    distribution = soften(distribution, config.temperature);

    if (options.canRaise === false) {
      delete distribution.raise;
      delete distribution.bet_small;
      delete distribution.bet_large;
      distribution = normalize(distribution);
    }
    return distribution;
  }

  function chooseRaiseTarget(options, semanticAction, equity, random) {
    const rng = random || Math.random;
    const min = options.raiseMin;
    const max = options.raiseMax;
    const potAfterCall = options.pot + Math.max(0, options.callAmount || 0);
    let fraction;

    if (semanticAction === 'bet_small') fraction = 0.36;
    else if (semanticAction === 'bet_large') fraction = 0.78;
    else {
      const strength = normalizedStrength(equity, options.opponents);
      const choices = strength > 0.84 ? [0.52, 0.76, 1.05] : [0.4, 0.62, 0.82];
      fraction = choices[Math.floor(rng() * choices.length)];
    }

    const desired = options.currentBet + Math.round(potAfterCall * fraction / 5) * 5;
    return clamp(desired, min, max);
  }

  function estimateEquity(options, config) {
    if (options.phase === 'preflop' && options.difficulty === 'easy') {
      const base = Poker.preflopStrength(options.holeCards);
      const opponents = Math.max(1, options.opponents || 1);
      return clamp(base * Math.pow(0.84, opponents - 1), 0.03, 0.94);
    }
    const opponentCount = Math.max(1, options.opponents || 1);
    if (options.phase === 'preflop') {
      const preflopIterations = Math.max(35, Math.round((options.simulations || config.simulations) * 0.42));
      const simulated = calculateEquity({
        holeCards: options.holeCards,
        community: options.community,
        opponents: opponentCount,
        iterations: preflopIterations,
        random: options.random
      });
      const heuristic = clamp(Poker.preflopStrength(options.holeCards) * Math.pow(0.84, opponentCount - 1), 0.03, 0.94);
      return simulated * 0.7 + heuristic * 0.3;
    }
    return calculateEquity({
      holeCards: options.holeCards,
      community: options.community,
      opponents: opponentCount,
      iterations: options.simulations || config.simulations,
      random: options.random
    });
  }

  function decide(options) {
    const difficulty = options.difficulty || 'normal';
    const config = DIFFICULTIES[difficulty] || DIFFICULTIES.normal;
    const rng = options.random || Math.random;
    let equity = Number.isFinite(options.equity) ? options.equity : estimateEquity(options, config);
    const draws = options.community && options.community.length >= 3
      ? Poker.detectDraws(options.holeCards.concat(options.community))
      : null;
    if (draws) {
      if (draws.comboDraw) equity += 0.025;
      else if (draws.flushDraw || draws.openEndedStraightDraw) equity += 0.012;
      else if (draws.gutshotStraightDraw) equity += 0.004;
    }
    equity = clamp(equity + (rng() - 0.5) * config.equityNoise * 2, 0.001, 0.999);
    const distribution = decisionDistribution(Object.assign({}, options, { equity, difficulty }));
    let semanticAction = sample(distribution, rng);

    if (rng() < config.mistakeRate) {
      const alternatives = Object.keys(distribution).filter((action) => action !== semanticAction);
      if (alternatives.length) semanticAction = alternatives[Math.floor(rng() * alternatives.length)];
    }

    let action = semanticAction;
    let amount;
    if (semanticAction === 'bet_small' || semanticAction === 'bet_large' || semanticAction === 'raise') {
      if (options.canRaise === false || options.raiseMax <= options.currentBet) {
        action = options.callAmount > 0 ? 'call' : 'check';
      } else {
        action = 'raise';
        amount = chooseRaiseTarget(options, semanticAction, equity, rng);
      }
    }

    return {
      type: action,
      amount,
      equity,
      bucket: equityBucket(equity, options.opponents),
      distribution,
      semanticAction,
      draws,
      difficulty
    };
  }

  return {
    DIFFICULTIES,
    calculateEquity,
    normalizedStrength,
    equityBucket,
    pressureBucket,
    heuristicDistribution,
    policyDistribution,
    decisionDistribution,
    decide,
    sample
  };
});
