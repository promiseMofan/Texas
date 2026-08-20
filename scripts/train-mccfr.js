const fs = require('fs');
const path = require('path');

const ACTIONS = {
  openRoot: ['check', 'bet_small', 'bet_large'],
  afterCheck: ['check', 'bet_small', 'bet_large'],
  versusBet: ['fold', 'call'],
  versusSmallBet: ['fold', 'call', 'raise'],
  versusRaise: ['fold', 'call'],
  facingRoot: ['fold', 'call', 'raise'],
  versusFacingRaise: ['fold', 'call']
};

const CONTEXTS = ['open', 'facing_low', 'facing_medium', 'facing_high'];
const nodes = new Map();
let seed = 0x51f15e;

function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

function sampleBucket() {
  return Math.floor(random() * 5);
}

function nodeFor(key, actions) {
  if (!nodes.has(key)) {
    nodes.set(key, {
      actions: actions.slice(),
      regrets: actions.map(() => 0),
      strategySum: actions.map(() => 0)
    });
  }
  return nodes.get(key);
}

function regretStrategy(node) {
  const positive = node.regrets.map((value) => Math.max(0, value));
  const total = positive.reduce((sum, value) => sum + value, 0);
  if (total <= 1e-12) return positive.map(() => 1 / positive.length);
  return positive.map((value) => value / total);
}

function averageStrategy(node) {
  const total = node.strategySum.reduce((sum, value) => sum + value, 0);
  if (total <= 1e-12) return node.actions.map(() => 1 / node.actions.length);
  return node.strategySum.map((value) => value / total);
}

function makeInitialState(context, ranks) {
  if (context === 'open') {
    return {
      context,
      ranks,
      history: 'start',
      player: 0,
      contributions: [1, 1],
      terminal: null
    };
  }
  const pressure = context === 'facing_low' ? 1 : context === 'facing_medium' ? 2 : 4;
  return {
    context,
    ranks,
    history: 'start',
    player: 0,
    pressure,
    contributions: [1, 1 + pressure],
    terminal: null
  };
}

function legalActions(state) {
  if (state.terminal) return [];
  if (state.context !== 'open') {
    return state.history === 'start' ? ACTIONS.facingRoot : ACTIONS.versusFacingRaise;
  }
  if (state.history === 'start') return ACTIONS.openRoot;
  if (state.history === 'check') return ACTIONS.afterCheck;
  if (state.history === 'check-bet_small' || state.history === 'check-bet_large') return ACTIONS.versusBet;
  if (state.history === 'bet_small') return ACTIONS.versusSmallBet;
  if (state.history === 'bet_large') return ACTIONS.versusBet;
  if (state.history === 'bet_small-raise') return ACTIONS.versusRaise;
  throw new Error('未知训练状态：' + state.context + '/' + state.history);
}

function transition(state, action) {
  const next = {
    context: state.context,
    ranks: state.ranks,
    history: state.history,
    player: 1 - state.player,
    pressure: state.pressure,
    contributions: state.contributions.slice(),
    terminal: null
  };

  if (state.context !== 'open') return transitionFacing(next, state, action);

  if (state.history === 'start') {
    if (action === 'check') next.history = 'check';
    if (action === 'bet_small') {
      next.history = 'bet_small';
      next.contributions[0] = 2;
    }
    if (action === 'bet_large') {
      next.history = 'bet_large';
      next.contributions[0] = 4;
    }
    return next;
  }

  if (state.history === 'check') {
    if (action === 'check') next.terminal = { type: 'showdown' };
    if (action === 'bet_small') {
      next.history = 'check-bet_small';
      next.contributions[1] = 2;
    }
    if (action === 'bet_large') {
      next.history = 'check-bet_large';
      next.contributions[1] = 4;
    }
    return next;
  }

  if (state.history === 'check-bet_small' || state.history === 'check-bet_large') {
    if (action === 'fold') next.terminal = { type: 'fold', player: 0 };
    if (action === 'call') {
      next.contributions[0] = next.contributions[1];
      next.terminal = { type: 'showdown' };
    }
    return next;
  }

  if (state.history === 'bet_small') {
    if (action === 'fold') next.terminal = { type: 'fold', player: 1 };
    if (action === 'call') {
      next.contributions[1] = next.contributions[0];
      next.terminal = { type: 'showdown' };
    }
    if (action === 'raise') {
      next.history = 'bet_small-raise';
      next.contributions[1] = 4;
    }
    return next;
  }

  if (state.history === 'bet_large') {
    if (action === 'fold') next.terminal = { type: 'fold', player: 1 };
    if (action === 'call') {
      next.contributions[1] = next.contributions[0];
      next.terminal = { type: 'showdown' };
    }
    return next;
  }

  if (state.history === 'bet_small-raise') {
    if (action === 'fold') next.terminal = { type: 'fold', player: 0 };
    if (action === 'call') {
      next.contributions[0] = next.contributions[1];
      next.terminal = { type: 'showdown' };
    }
    return next;
  }

  throw new Error('无法推进训练状态：' + state.history + '/' + action);
}

function transitionFacing(next, state, action) {
  const pressure = state.pressure;
  if (state.history === 'start') {
    if (action === 'fold') next.terminal = { type: 'fold', player: 0 };
    if (action === 'call') {
      next.contributions[0] = next.contributions[1];
      next.terminal = { type: 'showdown' };
    }
    if (action === 'raise') {
      next.history = 'raise';
      next.contributions[0] = 1 + pressure * 3;
    }
    return next;
  }

  if (state.history === 'raise') {
    if (action === 'fold') next.terminal = { type: 'fold', player: 1 };
    if (action === 'call') {
      next.contributions[1] = next.contributions[0];
      next.terminal = { type: 'showdown' };
    }
    return next;
  }

  throw new Error('无法推进面对下注状态：' + state.history + '/' + action);
}

function terminalUtility(state) {
  if (state.terminal.type === 'fold') {
    return state.terminal.player === 0 ? -state.contributions[0] : state.contributions[1];
  }
  if (state.ranks[0] > state.ranks[1]) return state.contributions[1];
  if (state.ranks[0] < state.ranks[1]) return -state.contributions[0];
  return 0;
}

function informationKey(state) {
  return [state.context, state.player, state.ranks[state.player], state.history].join('|');
}

function cfr(state, reach0, reach1) {
  if (state.terminal) return terminalUtility(state);
  const actions = legalActions(state);
  const node = nodeFor(informationKey(state), actions);
  const strategy = regretStrategy(node);
  const actionUtilities = [];
  let nodeUtility = 0;

  for (let index = 0; index < actions.length; index += 1) {
    const child = transition(state, actions[index]);
    const utility = state.player === 0
      ? cfr(child, reach0 * strategy[index], reach1)
      : cfr(child, reach0, reach1 * strategy[index]);
    actionUtilities[index] = utility;
    nodeUtility += strategy[index] * utility;
  }

  const ownReach = state.player === 0 ? reach0 : reach1;
  const opponentReach = state.player === 0 ? reach1 : reach0;
  for (let index = 0; index < actions.length; index += 1) {
    const regret = state.player === 0
      ? actionUtilities[index] - nodeUtility
      : nodeUtility - actionUtilities[index];
    node.regrets[index] += opponentReach * regret;
    node.strategySum[index] += ownReach * strategy[index];
  }
  return nodeUtility;
}

function train(iterations) {
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const context = CONTEXTS[iteration % CONTEXTS.length];
    const ranks = [sampleBucket(), sampleBucket()];
    cfr(makeInitialState(context, ranks), 1, 1);
  }
}

function strategyObject(node) {
  const probabilities = averageStrategy(node);
  const output = {};
  node.actions.forEach((action, index) => {
    output[action] = Number(probabilities[index].toFixed(6));
  });
  return output;
}

function extractPolicy(iterations) {
  const policy = {
    metadata: {
      algorithm: 'chance-sampled MCCFR',
      game: 'heads-up abstract no-limit betting subgame',
      iterations,
      buckets: 5,
      generatedAt: new Date().toISOString()
    },
    open: {},
    facing: { low: {}, medium: {}, high: {} }
  };

  for (let bucket = 0; bucket < 5; bucket += 1) {
    policy.open[bucket] = strategyObject(nodes.get(['open', 0, bucket, 'start'].join('|')));
    ['low', 'medium', 'high'].forEach((pressure) => {
      policy.facing[pressure][bucket] = strategyObject(
        nodes.get(['facing_' + pressure, 0, bucket, 'start'].join('|'))
      );
    });
  }
  return policy;
}

const iterations = Number(process.env.MCCFR_ITERATIONS || 320000);
train(iterations);
const policy = extractPolicy(iterations);
const outputPath = path.join(__dirname, '..', 'src', 'mccfr-policy.js');
const source = [
  '(function attachPolicy(root) {',
  '  const policy = ' + JSON.stringify(policy, null, 2) + ';',
  "  if (typeof module !== 'undefined' && module.exports) module.exports = policy;",
  '  if (root) root.MCCFR_POLICY = policy;',
  "})(typeof window !== 'undefined' ? window : globalThis);",
  ''
].join('\n');
fs.writeFileSync(outputPath, source);
console.log('已生成抽象MCCFR平均策略：' + outputPath);
console.log('训练迭代：' + iterations + '，信息集：' + nodes.size);
