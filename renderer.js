(() => {
  'use strict';

  const Poker = window.PokerEngine;
  const HoldemAI = window.HoldemAI;
  const STARTING_CHIPS = 2000;
  const PHASES = ['preflop', 'flop', 'turn', 'river'];
  const PHASE_NAMES = {
    idle: '等待开始',
    dealing: '发牌中',
    preflop: '翻牌前',
    flop: '翻牌',
    turn: '转牌',
    river: '河牌',
    showdown: '摊牌'
  };
  const BOT_PROFILES = {
    1: { aggression: 0.42, looseness: 0.34, bluff: 0.05 },
    2: { aggression: 0.76, looseness: 0.6, bluff: 0.16 },
    3: { aggression: 0.63, looseness: 0.28, bluff: 0.09 }
  };
  const TIPS = [
    ['位置优势', '位置越靠后，你掌握的信息越多，可以适当扩大起手牌范围。'],
    ['控制底池', '中等牌力更适合控制底池，不必每次都把对手赶走。'],
    ['观察下注', '下注尺度往往比动作本身透露更多信息，留意电脑玩家的筹码变化。'],
    ['计算赔率', '跟注前比较需要投入的筹码与当前底池，避免用弱听牌付出过高代价。'],
    ['适时弃牌', '弃牌也是盈利决策。保存筹码，等待更有优势的局面。']
  ];

  const dom = {};
  let audioContext = null;

  const state = {
    players: [],
    deck: [],
    community: [],
    dealer: -1,
    smallBlindIndex: -1,
    bigBlindIndex: -1,
    smallBlind: 10,
    bigBlind: 20,
    phase: 'idle',
    currentBet: 0,
    minRaise: 20,
    streetRaises: 0,
    currentPlayer: null,
    handNumber: 0,
    handComplete: true,
    resultReady: false,
    revealCards: false,
    winnerIds: [],
    awards: {},
    lastPot: 0,
    raiseTarget: null,
    handToken: 0,
    turnToken: 0,
    animating: false,
    sessionStart: STARTING_CHIPS,
    sessionOver: false,
    settings: loadSettings(),
    stats: loadStats()
  };

  function cacheDom() {
    const ids = [
      'hand-number', 'blind-level', 'difficulty-label', 'session-profit', 'phase-label', 'community-cards',
      'pot-amount', 'action-panel', 'turn-title', 'turn-detail', 'bet-control',
      'raise-slider', 'raise-input', 'fold-button', 'check-call-button',
      'check-call-label', 'raise-button', 'raise-label', 'history-list',
      'stat-hands', 'stat-wins', 'stat-rate', 'stat-pot', 'style-name',
      'style-meter-fill', 'style-description', 'tip-title', 'tip-text',
      'result-modal', 'result-emblem', 'result-eyebrow', 'result-title',
      'result-copy', 'result-winners', 'next-hand-button', 'difficulty-modal', 'settings-modal',
      'help-modal', 'settings-button', 'help-button', 'sound-button',
      'difficulty-select', 'speed-select', 'confirm-allin', 'sound-toggle', 'restart-button',
      'start-game-button', 'version-line', 'toast-region', 'poker-table', 'dealer-station',
      'dealer-status', 'dealer-deck', 'muck-area', 'muck-card-stack', 'card-animation-layer',
      'show-result-button'
    ];
    ids.forEach((id) => { dom[id] = document.getElementById(id); });
    for (let index = 0; index < 4; index += 1) {
      dom['seat-' + index] = document.getElementById('seat-' + index);
    }
  }

  function loadSettings() {
    try {
      const stored = JSON.parse(localStorage.getItem('holdem-settings') || '{}');
      return {
        difficulty: ['easy', 'normal', 'hard'].includes(stored.difficulty) ? stored.difficulty : 'normal',
        speed: stored.speed || 'normal',
        confirmAllin: stored.confirmAllin !== false,
        sound: stored.sound !== false
      };
    } catch (error) {
      return { difficulty: 'normal', speed: 'normal', confirmAllin: true, sound: true };
    }
  }

  function saveSettings() {
    localStorage.setItem('holdem-settings', JSON.stringify(state.settings));
  }

  function loadStats() {
    const empty = { hands: 0, wins: 0, maxPot: 0, actions: 0, folds: 0, raises: 0 };
    try {
      return Object.assign(empty, JSON.parse(localStorage.getItem('holdem-stats') || '{}'));
    } catch (error) {
      return empty;
    }
  }

  function saveStats() {
    localStorage.setItem('holdem-stats', JSON.stringify(state.stats));
  }

  function makePlayers() {
    return [
      { id: 0, name: '你', style: '本机玩家', initials: 'YOU', isHuman: true },
      { id: 1, name: '林舟', style: '稳健型', initials: '林', isHuman: false },
      { id: 2, name: 'Mika', style: '进攻型', initials: 'M', isHuman: false },
      { id: 3, name: '老K', style: '紧凶型', initials: 'K', isHuman: false }
    ].map((player) => Object.assign(player, {
      chips: STARTING_CHIPS,
      hand: [],
      inHand: false,
      folded: false,
      allIn: false,
      totalBet: 0,
      roundBet: 0,
      acted: false,
      lastAction: '',
      visibleCardCount: 0
    }));
  }

  function resetGame() {
    state.handToken += 1;
    state.turnToken += 1;
    state.players = makePlayers();
    state.deck = [];
    state.community = [];
    state.dealer = -1;
    state.smallBlindIndex = -1;
    state.bigBlindIndex = -1;
    state.phase = 'idle';
    state.currentBet = 0;
    state.streetRaises = 0;
    state.currentPlayer = null;
    state.handNumber = 0;
    state.handComplete = true;
    state.resultReady = false;
    state.animating = false;
    state.revealCards = false;
    state.winnerIds = [];
    state.awards = {};
    state.lastPot = 0;
    state.sessionStart = STARTING_CHIPS;
    state.sessionOver = false;
    clearAnimationLayer();
    clearMuck();
    setDealerStatus('荷官已就位');
    closeModal('settings-modal');
    closeModal('result-modal');
    clearHistory();
    addLog('欢迎来到 Royal Room，初始筹码 2,000。', 'phase');
    render();
    startHand();
  }

  function updateBlindLevel() {
    const levels = [
      [10, 20], [15, 30], [25, 50], [40, 80], [60, 120], [100, 200]
    ];
    const index = Math.min(levels.length - 1, Math.floor((state.handNumber - 1) / 6));
    state.smallBlind = levels[index][0];
    state.bigBlind = levels[index][1];
    state.minRaise = state.bigBlind;
  }

  function activePlayers() {
    return state.players.filter((player) => player.inHand && !player.folded);
  }

  function nextPlayerIndex(fromIndex, predicate) {
    for (let offset = 1; offset <= state.players.length; offset += 1) {
      const index = (fromIndex + offset + state.players.length) % state.players.length;
      if (predicate(state.players[index])) return index;
    }
    return -1;
  }

  function nextInHand(fromIndex) {
    return nextPlayerIndex(fromIndex, (player) => player.inHand);
  }

  function nextPending(fromIndex) {
    return nextPlayerIndex(fromIndex, (player) => (
      player.inHand && !player.folded && !player.allIn && (!player.acted || player.roundBet < state.currentBet)
    ));
  }

  async function startHand() {
    closeModal('result-modal');
    state.handToken += 1;
    state.turnToken += 1;
    const token = state.handToken;
    state.sessionOver = false;
    state.animating = true;

    const funded = state.players.filter((player) => player.chips > 0);
    if (state.players[0].chips <= 0 || funded.length < 2) {
      state.animating = false;
      showSessionEnd();
      return;
    }

    state.handNumber += 1;
    updateBlindLevel();
    state.deck = Poker.shuffle(Poker.createDeck());
    state.community = [];
    state.phase = 'dealing';
    state.currentBet = 0;
    state.streetRaises = 0;
    state.currentPlayer = null;
    state.handComplete = false;
    state.resultReady = false;
    state.revealCards = false;
    state.winnerIds = [];
    state.awards = {};
    state.lastPot = 0;
    state.raiseTarget = null;

    state.players.forEach((player) => {
      player.hand = [];
      player.inHand = player.chips > 0;
      player.folded = false;
      player.allIn = false;
      player.totalBet = 0;
      player.roundBet = 0;
      player.acted = false;
      player.lastAction = player.inHand ? '' : '出局';
      player.visibleCardCount = 0;
    });

    state.dealer = nextInHand(state.dealer);
    const playerCount = state.players.filter((player) => player.inHand).length;
    if (playerCount === 2) {
      state.smallBlindIndex = state.dealer;
      state.bigBlindIndex = nextInHand(state.smallBlindIndex);
    } else {
      state.smallBlindIndex = nextInHand(state.dealer);
      state.bigBlindIndex = nextInHand(state.smallBlindIndex);
    }

    clearAnimationLayer();
    clearMuck();
    postBlind(state.smallBlindIndex, state.smallBlind, '小盲');
    postBlind(state.bigBlindIndex, state.bigBlind, '大盲');
    state.currentBet = Math.max(
      state.players[state.smallBlindIndex].roundBet,
      state.players[state.bigBlindIndex].roundBet
    );

    addLog('第 ' + state.handNumber + ' 手开始 · 盲注 ' + state.smallBlind + '/' + state.bigBlind, 'phase');
    addLog(
      state.players[state.smallBlindIndex].name + ' 下小盲 ' + state.players[state.smallBlindIndex].roundBet +
      '，' + state.players[state.bigBlindIndex].name + ' 下大盲 ' + state.players[state.bigBlindIndex].roundBet,
      'action'
    );
    rotateTip();
    render();
    setDealerStatus('洗牌中…', 'speaking');
    await wait(360);
    if (token !== state.handToken) return;

    setDealerStatus('盲注已下，开始发牌', 'speaking');
    await wait(240);
    if (token !== state.handToken) return;

    const dealt = await dealHoleCards(token);
    if (!dealt || token !== state.handToken) return;

    state.phase = 'preflop';
    state.animating = false;
    addLog('你的底牌：' + state.players[0].hand.map(Poker.cardText).join(' '), 'action');
    setDealerStatus('翻牌前，请行动');
    render();

    const first = nextPending(state.bigBlindIndex);
    if (first === -1) {
      await runoutBoard(token);
    } else {
      setCurrentPlayer(first);
    }
  }

  async function dealHoleCards(token) {
    const count = state.players.filter((player) => player.inHand).length;
    for (let round = 0; round < 2; round += 1) {
      setDealerStatus('发第 ' + (round + 1) + ' 轮底牌', 'speaking');
      let index = state.smallBlindIndex;
      for (let dealt = 0; dealt < count; dealt += 1) {
        if (token !== state.handToken) return false;
        const player = state.players[index];
        const card = state.deck.pop();
        player.hand.push(card);
        await animateCardToSeat(player, player.hand.length - 1, token);
        if (token !== state.handToken) return false;
        playSound('deal');
        await wait(45);
        index = nextInHand(index);
      }
    }
    return token === state.handToken;
  }

  function postBlind(index, amount, label) {
    const player = state.players[index];
    commitChips(player, Math.min(amount, player.chips));
    player.lastAction = label + ' ' + player.roundBet;
  }

  function commitChips(player, amount) {
    const paid = Math.max(0, Math.min(player.chips, Math.round(amount)));
    player.chips -= paid;
    player.roundBet += paid;
    player.totalBet += paid;
    if (player.chips === 0) player.allIn = true;
    return paid;
  }

  function potAmount() {
    return state.players.reduce((sum, player) => sum + player.totalBet, 0);
  }

  function isBettingRoundComplete() {
    const contenders = activePlayers();
    if (contenders.length <= 1) return true;
    const actionable = contenders.filter((player) => !player.allIn);
    if (actionable.length === 0) return true;
    if (actionable.length === 1) return actionable[0].roundBet >= state.currentBet;
    return actionable.every((player) => player.acted && player.roundBet === state.currentBet);
  }

  function setCurrentPlayer(index) {
    if (index < 0 || state.handComplete || state.animating) return;
    state.currentPlayer = index;
    state.raiseTarget = null;
    state.turnToken += 1;
    setDealerStatus(state.players[index].isHuman ? '轮到你，请行动' : state.players[index].name + ' 思考中');
    render();
    if (!state.players[index].isHuman) runBotTurn(index, state.handToken, state.turnToken);
  }

  async function runBotTurn(index, handToken, turnToken) {
    const delays = { fast: 280, normal: 680, slow: 1180 };
    const delay = delays[state.settings.speed] || delays.normal;
    await wait(delay + Math.floor(Math.random() * delay * 0.45));
    if (
      handToken !== state.handToken || turnToken !== state.turnToken ||
      state.currentPlayer !== index || state.handComplete || state.animating
    ) return;
    const decision = chooseBotAction(state.players[index]);
    performAction(decision.type, decision.amount);
  }

  function legalRaiseRange(player) {
    const max = player.roundBet + player.chips;
    const standardMin = state.currentBet === 0
      ? Math.max(state.bigBlind, player.roundBet + state.bigBlind)
      : state.currentBet + state.minRaise;
    const min = Math.min(max, standardMin);
    return { min, max, canRaise: max > state.currentBet };
  }

  function chooseBotAction(player) {
    const callAmount = Math.max(0, state.currentBet - player.roundBet);
    const pot = Math.max(state.bigBlind, potAmount());
    const range = legalRaiseRange(player);
    const opponents = activePlayers().filter((opponent) => opponent.id !== player.id).length;
    const effectiveStack = activePlayers()
      .filter((opponent) => opponent.id !== player.id)
      .reduce((maximum, opponent) => Math.max(maximum, Math.min(player.chips, opponent.chips)), 0);
    return HoldemAI.decide({
      holeCards: player.hand,
      community: state.community,
      opponents: Math.max(1, opponents),
      phase: state.phase,
      callAmount,
      pot,
      currentBet: state.currentBet,
      raiseMin: range.min,
      raiseMax: range.max,
      canRaise: range.canRaise,
      position: positionScore(player.id),
      spr: effectiveStack / Math.max(1, pot),
      previousRaises: state.streetRaises,
      difficulty: state.settings.difficulty,
      profile: BOT_PROFILES[player.id]
    });
  }

  async function performAction(type, amount) {
    const index = state.currentPlayer;
    if (index === null || state.handComplete || state.animating) return;
    const player = state.players[index];
    const callAmount = Math.max(0, state.currentBet - player.roundBet);
    const token = state.handToken;

    state.currentPlayer = null;
    state.turnToken += 1;
    player.acted = true;

    if (type === 'fold') {
      state.animating = true;
      setDealerStatus(player.name + ' 弃牌，收牌', 'speaking');
      render();
      await animateFoldCards(player, token);
      if (token !== state.handToken) return;
      player.folded = true;
      player.lastAction = '弃牌';
      state.animating = false;
      addLog(player.name + ' 弃牌', 'fold');
      if (player.isHuman) {
        state.stats.actions += 1;
        state.stats.folds += 1;
      }
      playSound('fold');
    } else if (type === 'check' && callAmount === 0) {
      player.lastAction = '过牌';
      addLog(player.name + ' 过牌', 'action');
      if (player.isHuman) state.stats.actions += 1;
      playSound('check');
    } else if (type === 'raise') {
      const range = legalRaiseRange(player);
      const target = clamp(Math.round(amount || range.min), range.min, range.max);
      const previousBet = state.currentBet;
      commitChips(player, target - player.roundBet);

      if (player.roundBet > previousBet) {
        const raiseSize = player.roundBet - previousBet;
        state.currentBet = player.roundBet;
        state.streetRaises += 1;
        if (raiseSize >= state.minRaise) state.minRaise = raiseSize;
        state.players.forEach((other) => {
          if (other.id !== player.id && other.inHand && !other.folded && !other.allIn) other.acted = false;
        });
        player.acted = true;
        player.lastAction = player.allIn ? '全下 ' + player.roundBet : (previousBet === 0 ? '下注 ' : '加注至 ') + player.roundBet;
        addLog(player.name + ' ' + player.lastAction, 'action');
        if (player.isHuman) {
          state.stats.actions += 1;
          state.stats.raises += 1;
        }
        playSound('chips');
      } else {
        const paid = commitChips(player, callAmount);
        player.lastAction = player.allIn ? '全下跟注 ' + paid : '跟注 ' + paid;
        addLog(player.name + ' ' + player.lastAction, 'action');
      }
    } else {
      const paid = commitChips(player, callAmount);
      if (callAmount === 0) {
        player.lastAction = '过牌';
        addLog(player.name + ' 过牌', 'action');
        playSound('check');
      } else {
        player.lastAction = player.allIn ? '全下跟注 ' + paid : '跟注 ' + paid;
        addLog(player.name + ' ' + player.lastAction, 'action');
        playSound('chips');
      }
      if (player.isHuman) state.stats.actions += 1;
    }

    saveStats();
    render();
    await wait(420);
    if (token !== state.handToken || state.handComplete) return;

    const contenders = activePlayers();
    if (contenders.length === 1) {
      settleUncontested(contenders[0]);
      return;
    }

    if (isBettingRoundComplete()) {
      advanceRound(token);
      return;
    }

    const next = nextPending(index);
    if (next === -1) advanceRound(token);
    else setCurrentPlayer(next);
  }

  async function advanceRound(token) {
    if (token !== state.handToken || state.handComplete) return;
    if (state.phase === 'river') {
      showdown();
      return;
    }

    state.players.forEach((player) => {
      player.roundBet = 0;
      player.acted = false;
      if (player.inHand && !player.folded && !player.allIn) player.lastAction = '';
    });
    state.currentBet = 0;
    state.streetRaises = 0;
    state.minRaise = state.bigBlind;
    const dealt = await dealNextStreet(token);
    if (!dealt) return;
    await wait(240);
    if (token !== state.handToken || state.handComplete) return;

    const actionable = activePlayers().filter((player) => !player.allIn);
    if (actionable.length <= 1) {
      runoutBoard(token);
      return;
    }

    const next = nextPending(state.dealer);
    if (next === -1) runoutBoard(token);
    else setCurrentPlayer(next);
  }

  async function dealNextStreet(token) {
    if (token !== state.handToken || state.handComplete) return false;
    state.currentPlayer = null;
    state.animating = true;
    render();

    const burnCard = state.deck.pop();
    setDealerStatus('烧牌', 'speaking');
    await animateBurnCard(burnCard, token);
    if (token !== state.handToken || state.handComplete) return false;

    let cardCount = 0;
    if (state.phase === 'preflop') {
      state.phase = 'flop';
      cardCount = 3;
    } else if (state.phase === 'flop') {
      state.phase = 'turn';
      cardCount = 1;
    } else if (state.phase === 'turn') {
      state.phase = 'river';
      cardCount = 1;
    } else {
      state.animating = false;
      return false;
    }

    setDealerStatus(PHASE_NAMES[state.phase] + '，请看牌', 'speaking');
    render();
    for (let dealt = 0; dealt < cardCount; dealt += 1) {
      const card = state.deck.pop();
      const animated = await animateCommunityCard(card, state.community.length, token);
      if (!animated || token !== state.handToken) return false;
      playSound('deal');
      await wait(55);
    }

    addLog(PHASE_NAMES[state.phase] + '：' + state.community.map(Poker.cardText).join(' '), 'phase');
    rotateTip();
    state.animating = false;
    setDealerStatus(PHASE_NAMES[state.phase] + '已发出，请行动');
    render();
    return true;
  }

  async function runoutBoard(token) {
    state.currentPlayer = null;
    render();
    while (state.phase !== 'river') {
      await wait(420);
      if (token !== state.handToken || state.handComplete) return;
      state.players.forEach((player) => {
        player.roundBet = 0;
        player.acted = true;
      });
      state.currentBet = 0;
      const dealt = await dealNextStreet(token);
      if (!dealt) return;
    }
    await wait(520);
    if (token === state.handToken && !state.handComplete) showdown();
  }

  function showdown() {
    const token = state.handToken;
    state.currentPlayer = null;
    state.animating = false;
    state.handComplete = true;
    state.resultReady = true;
    state.revealCards = true;
    state.phase = 'showdown';
    setDealerStatus('摊牌，请亮牌', 'speaking');
    state.lastPot = potAmount();
    state.awards = {};
    const pots = Poker.buildSidePots(state.players);
    const handScores = new Map();

    activePlayers().forEach((player) => {
      const score = Poker.evaluateHand(player.hand.concat(state.community));
      handScores.set(player.id, score);
      addLog(player.name + ' 摊牌 ' + player.hand.map(Poker.cardText).join(' ') + ' · ' + score.name, 'phase');
    });

    pots.forEach((pot, potIndex) => {
      const bestValue = Math.max.apply(null, pot.eligible.map((player) => handScores.get(player.id).value));
      const winners = pot.eligible.filter((player) => handScores.get(player.id).value === bestValue);
      const ordered = orderFromDealer(winners);
      const share = Math.floor(pot.amount / winners.length);
      let remainder = pot.amount - share * winners.length;
      ordered.forEach((winner) => {
        const bonus = remainder > 0 ? 1 : 0;
        remainder -= bonus;
        const award = share + bonus;
        winner.chips += award;
        state.awards[winner.id] = (state.awards[winner.id] || 0) + award;
      });
      addLog(
        (potIndex === 0 ? '主池' : '边池 ' + potIndex) + ' ' + pot.amount + ' 由 ' +
        winners.map((winner) => winner.name).join('、') + ' 赢得',
        'win'
      );
    });

    state.winnerIds = Object.keys(state.awards).map(Number);
    const announcement = state.winnerIds.map((id) => state.players[id].name).join('、') + ' 赢得底池';
    recordCompletedHand(Boolean(state.awards[0]), state.lastPot);
    render();
    playSound(state.awards[0] ? 'win' : 'lose');
    window.setTimeout(() => {
      if (token === state.handToken && state.handComplete) setDealerStatus(announcement, 'winner');
    }, 320);
  }

  function orderFromDealer(players) {
    return players.slice().sort((left, right) => {
      const leftDistance = (left.id - state.dealer + state.players.length) % state.players.length;
      const rightDistance = (right.id - state.dealer + state.players.length) % state.players.length;
      return leftDistance - rightDistance;
    });
  }

  function settleUncontested(winner) {
    state.currentPlayer = null;
    state.animating = false;
    state.handComplete = true;
    state.resultReady = true;
    state.revealCards = false;
    state.lastPot = potAmount();
    winner.chips += state.lastPot;
    state.awards = { [winner.id]: state.lastPot };
    state.winnerIds = [winner.id];
    winner.lastAction = '赢得 ' + state.lastPot;
    setDealerStatus(winner.name + ' 赢得底池', 'winner');
    addLog(winner.name + ' 赢得无人争夺的底池 ' + state.lastPot, 'win');
    recordCompletedHand(winner.id === 0, state.lastPot);
    render();
    playSound(winner.id === 0 ? 'win' : 'lose');
  }

  function recordCompletedHand(humanWon, pot) {
    state.stats.hands += 1;
    if (humanWon) state.stats.wins += 1;
    state.stats.maxPot = Math.max(state.stats.maxPot, pot);
    saveStats();
  }

  function showHandResult() {
    const alive = state.players.filter((player) => player.chips > 0);
    state.sessionOver = state.players[0].chips <= 0 || alive.length === 1;
    const humanAward = state.awards[0] || 0;

    if (state.sessionOver) {
      const humanChampion = alive.length === 1 && alive[0].id === 0;
      dom['result-eyebrow'].textContent = humanChampion ? '牌桌冠军' : '本局结束';
      dom['result-title'].textContent = humanChampion ? '你赢下了整场牌局' : '你的筹码已经用完';
      dom['result-copy'].textContent = humanChampion
        ? '漂亮的胜利。你击败了全部三名电脑玩家。'
        : '可以重新开始，尝试更耐心地选择起手牌和下注时机。';
      dom['result-emblem'].textContent = humanChampion ? '♛' : '♠';
      dom['next-hand-button'].textContent = '重新开始整局';
    } else if (humanAward > 0) {
      dom['result-eyebrow'].textContent = '本手胜利';
      dom['result-title'].textContent = '你赢得了 ' + humanAward + ' 筹码';
      dom['result-copy'].textContent = resultDescription(0);
      dom['result-emblem'].textContent = '♠';
      dom['next-hand-button'].textContent = '开始下一手';
    } else {
      const primaryWinner = state.players[state.winnerIds[0]];
      dom['result-eyebrow'].textContent = '本手结束';
      dom['result-title'].textContent = primaryWinner.name + ' 赢得底池';
      dom['result-copy'].textContent = resultDescription(primaryWinner.id);
      dom['result-emblem'].textContent = '♦';
      dom['next-hand-button'].textContent = '开始下一手';
    }

    dom['result-winners'].innerHTML = state.winnerIds.map((id) => (
      '<span class="winner-pill">' + state.players[id].name + ' +' + state.awards[id] + '</span>'
    )).join('');
    openModal('result-modal');
  }

  function showSessionEnd() {
    state.sessionOver = true;
    setDealerStatus('本局结束');
    const alive = state.players.filter((player) => player.chips > 0);
    const humanChampion = alive.length === 1 && alive[0].id === 0;
    dom['result-eyebrow'].textContent = humanChampion ? '牌桌冠军' : '本局结束';
    dom['result-title'].textContent = humanChampion ? '你赢下了整场牌局' : '你的筹码已经用完';
    dom['result-copy'].textContent = '点击下方按钮即可用 2,000 初始筹码开启新牌局。';
    dom['result-winners'].innerHTML = '';
    dom['next-hand-button'].textContent = '重新开始整局';
    openModal('result-modal');
  }

  function resultDescription(playerId) {
    const player = state.players[playerId];
    if (!state.revealCards || player.folded) return '其他玩家均已弃牌，本手没有进入摊牌。';
    const score = Poker.evaluateHand(player.hand.concat(state.community));
    return player.name + ' 的最佳牌型是“' + score.name + '”。本手总底池 ' + state.lastPot + '。';
  }

  function render() {
    if (!state.players.length) return;
    dom['hand-number'].textContent = '#' + Math.max(1, state.handNumber);
    dom['blind-level'].textContent = state.smallBlind + ' / ' + state.bigBlind;
    dom['difficulty-label'].textContent = HoldemAI.DIFFICULTIES[state.settings.difficulty].label;
    const profit = state.players[0].chips - state.sessionStart;
    dom['session-profit'].textContent = (profit > 0 ? '+' : profit < 0 ? '' : '±') + profit.toLocaleString('zh-CN');
    dom['session-profit'].style.color = profit < 0 ? '#dc8f8f' : '';
    dom['phase-label'].textContent = PHASE_NAMES[state.phase] || '';
    dom['pot-amount'].textContent = potAmount().toLocaleString('zh-CN');
    renderCommunity();
    state.players.forEach(renderPlayer);
    renderActions();
    renderStats();
  }

  function renderCommunity() {
    const cards = [];
    for (let index = 0; index < 5; index += 1) {
      cards.push(index < state.community.length ? cardHtml(state.community[index], false) : cardHtml(null, false));
    }
    dom['community-cards'].innerHTML = cards.join('');
  }

  function renderPlayer(player) {
    const seat = dom['seat-' + player.id];
    const visible = player.isHuman || (state.revealCards && !player.folded);
    const cards = player.inHand && !player.folded
      ? player.hand.slice(0, player.visibleCardCount).map((card) => cardHtml(card, !visible)).join('')
      : '';
    const panelClasses = ['player-panel'];
    if (state.currentPlayer === player.id) panelClasses.push('active');
    if (player.folded) panelClasses.push('folded');
    if (state.winnerIds.includes(player.id)) panelClasses.push('winner');
    const position = positionLabel(player.id);
    const status = playerStatus(player);
    const thinking = state.currentPlayer === player.id && !player.isHuman
      ? '<span class="thinking-dots"><i></i><i></i><i></i></span>'
      : '';
    const bet = player.roundBet > 0
      ? '<span class="bet-bubble"><span class="chip-stack mini"></span>' + player.roundBet + '</span>'
      : '';

    seat.innerHTML =
      '<div class="seat-inner">' +
        '<div class="seat-cards">' + cards + '</div>' +
        '<div class="' + panelClasses.join(' ') + '">' +
          (position ? '<span class="position-badge">' + position + '</span>' : '') +
          '<div class="avatar ' + (player.isHuman ? 'human' : 'bot-' + player.id) + '">' + player.initials + '</div>' +
          '<div class="player-copy">' +
            '<div class="player-name-row"><span class="player-name">' + player.name + '</span><span class="player-style">' + player.style + '</span></div>' +
            '<div class="player-chips">' + player.chips.toLocaleString('zh-CN') + '</div>' +
          '</div>' +
          thinking + status +
        '</div>' +
        bet +
      '</div>';
  }

  function positionLabel(id) {
    if (!state.players[id].inHand) return '';
    if (id === state.dealer) return 'D';
    if (id === state.smallBlindIndex) return 'SB';
    if (id === state.bigBlindIndex) return 'BB';
    return '';
  }

  function positionScore(id) {
    const seats = [];
    let cursor = state.dealer;
    const activeCount = state.players.filter((player) => player.inHand && !player.folded).length;
    for (let offset = 0; offset < activeCount; offset += 1) {
      cursor = nextPlayerIndex(cursor, (player) => player.inHand && !player.folded);
      if (cursor >= 0) seats.push(cursor);
    }
    const index = seats.indexOf(id);
    return index < 0 || seats.length <= 1 ? 0.5 : index / (seats.length - 1);
  }

  function playerStatus(player) {
    if (!player.inHand) return '<span class="state-badge fold">出局</span>';
    if (player.folded) return '<span class="state-badge fold">弃牌</span>';
    if (player.allIn) return '<span class="state-badge allin">全下</span>';
    if (player.lastAction && state.currentPlayer !== player.id) {
      return '<span class="state-badge">' + player.lastAction + '</span>';
    }
    return '';
  }

  function cardHtml(card, hidden) {
    if (!card) return '<div class="card placeholder"></div>';
    if (hidden) return '<div class="card back" aria-label="暗牌"></div>';
    const red = card.suit === 'hearts' || card.suit === 'diamonds';
    const rank = Poker.RANK_LABELS[card.rank];
    const suit = Poker.SUIT_SYMBOLS[card.suit];
    return '<div class="card' + (red ? ' red' : '') + '" aria-label="' + rank + suit + '">' +
      '<span class="corner">' + rank + '<small>' + suit + '</small></span>' +
      '<span class="suit-center">' + suit + '</span>' +
    '</div>';
  }

  function setDealerStatus(message, tone) {
    if (!dom['dealer-status'] || !dom['dealer-station']) return;
    dom['dealer-status'].textContent = message;
    dom['dealer-station'].classList.toggle('is-speaking', tone === 'speaking');
    dom['dealer-station'].classList.toggle('winner', tone === 'winner');
  }

  function clearAnimationLayer() {
    if (dom['card-animation-layer']) dom['card-animation-layer'].replaceChildren();
  }

  function clearMuck() {
    if (dom['muck-card-stack']) dom['muck-card-stack'].replaceChildren();
  }

  function addMuckCards(count) {
    if (!dom['muck-card-stack']) return;
    for (let index = 0; index < count; index += 1) {
      if (dom['muck-card-stack'].children.length >= 8) {
        dom['muck-card-stack'].firstElementChild.remove();
      }
      const card = document.createElement('i');
      card.className = 'muck-card';
      dom['muck-card-stack'].appendChild(card);
    }
  }

  function createFlyingCard(card, hidden) {
    const holder = document.createElement('div');
    holder.innerHTML = cardHtml(card, hidden);
    const element = holder.firstElementChild;
    element.classList.add('flying-card');
    return element;
  }

  function createFlyingFlip(card) {
    const shell = document.createElement('div');
    shell.className = 'flying-flip';
    const inner = document.createElement('div');
    inner.className = 'flying-flip-inner';

    const backHolder = document.createElement('div');
    backHolder.innerHTML = cardHtml(card, true);
    const back = backHolder.firstElementChild;
    back.classList.add('flight-back');

    const frontHolder = document.createElement('div');
    frontHolder.innerHTML = cardHtml(card, false);
    const front = frontHolder.firstElementChild;
    front.classList.add('flight-front');

    inner.append(back, front);
    shell.appendChild(inner);
    return { shell, inner };
  }

  async function animateElement(element, keyframes, options) {
    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reducedMotion ? Math.min(90, options.duration) : options.duration;
    if (!element.animate) {
      await wait(duration);
      return;
    }
    try {
      const animation = element.animate(keyframes, Object.assign({}, options, { duration }));
      await animation.finished;
    } catch (error) {
      // Starting a new hand intentionally cancels any animation from the previous hand.
    }
  }

  async function flyElement(element, sourceRect, target, options) {
    const layer = dom['card-animation-layer'];
    const tableRect = dom['poker-table'].getBoundingClientRect();
    const startX = sourceRect.left + sourceRect.width / 2;
    const startY = sourceRect.top + sourceRect.height / 2;
    const startScale = options.startScale || Math.max(0.55, sourceRect.width / 58);
    const endScale = options.endScale || Math.max(0.45, target.width / 58);
    const dx = target.x - startX;
    const dy = target.y - startY;
    const rotation = options.rotation || 0;
    const lift = options.lift === undefined ? -14 : options.lift;

    element.style.left = (startX - tableRect.left - 29) + 'px';
    element.style.top = (startY - tableRect.top - 41) + 'px';
    layer.appendChild(element);

    await animateElement(element, [
      { opacity: 0.98, transform: 'translate3d(0, 0, 0) scale(' + startScale + ') rotate(-5deg)' },
      { offset: 0.56, opacity: 1, transform: 'translate3d(' + (dx * 0.58) + 'px, ' + (dy * 0.58 + lift) + 'px, 0) scale(' + ((startScale + endScale) / 2) + ') rotate(' + (rotation * 0.45) + 'deg)' },
      { opacity: 1, transform: 'translate3d(' + dx + 'px, ' + dy + 'px, 0) scale(' + endScale + ') rotate(' + rotation + 'deg)' }
    ], {
      duration: options.duration || 250,
      easing: 'cubic-bezier(0.2, 0.82, 0.28, 1)',
      fill: 'forwards'
    });
  }

  async function animateCardToSeat(player, cardIndex, token) {
    const seat = dom['seat-' + player.id];
    const cardArea = seat && seat.querySelector('.seat-cards');
    if (!seat || !cardArea || !dom['dealer-deck']) {
      player.visibleCardCount = player.hand.length;
      renderPlayer(player);
      return;
    }

    const sourceRect = dom['dealer-deck'].getBoundingClientRect();
    const seatRect = seat.getBoundingClientRect();
    const cardAreaRect = cardArea.getBoundingClientRect();
    const flight = createFlyingCard(player.hand[cardIndex], true);
    await flyElement(flight, sourceRect, {
      x: seatRect.left + seatRect.width / 2 + (cardIndex === 0 ? -8 : 8),
      y: cardAreaRect.bottom - 27,
      width: 39
    }, {
      duration: 225,
      endScale: 39 / 58,
      rotation: cardIndex === 0 ? -4 : 5,
      lift: -17
    });

    if (token === state.handToken) {
      player.visibleCardCount = Math.max(player.visibleCardCount, cardIndex + 1);
      renderPlayer(player);
      await wait(16);
    }
    flight.remove();
  }

  async function animateBurnCard(card, token) {
    if (!card || !dom['dealer-deck'] || !dom['muck-area']) return false;
    const sourceRect = dom['dealer-deck'].getBoundingClientRect();
    const muckRect = dom['muck-area'].getBoundingClientRect();
    const flight = createFlyingCard(card, true);
    await flyElement(flight, sourceRect, {
      x: muckRect.left + muckRect.width / 2,
      y: muckRect.top + muckRect.height / 2 - 4,
      width: 29
    }, {
      duration: 235,
      endScale: 0.5,
      rotation: 17,
      lift: -10
    });
    if (token === state.handToken) addMuckCards(1);
    flight.remove();
    return token === state.handToken;
  }

  async function animateCommunityCard(card, targetIndex, token) {
    const targetCard = dom['community-cards'] && dom['community-cards'].children[targetIndex];
    if (!card || !targetCard || !dom['dealer-deck']) return false;
    const sourceRect = dom['dealer-deck'].getBoundingClientRect();
    const targetRect = targetCard.getBoundingClientRect();
    const flight = createFlyingFlip(card);

    await flyElement(flight.shell, sourceRect, {
      x: targetRect.left + targetRect.width / 2,
      y: targetRect.top + targetRect.height / 2,
      width: targetRect.width
    }, {
      duration: 255,
      endScale: 1,
      rotation: targetIndex % 2 === 0 ? -1 : 1,
      lift: -13
    });
    if (token !== state.handToken) {
      flight.shell.remove();
      return false;
    }

    await animateElement(flight.inner, [
      { transform: 'rotateY(0deg)' },
      { transform: 'rotateY(180deg)' }
    ], {
      duration: 215,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      fill: 'forwards'
    });
    if (token !== state.handToken) {
      flight.shell.remove();
      return false;
    }

    state.community.push(card);
    renderCommunity();
    await wait(16);
    flight.shell.remove();
    return true;
  }

  async function animateFoldCards(player, token) {
    const seat = dom['seat-' + player.id];
    const sourceCards = seat ? Array.from(seat.querySelectorAll('.seat-cards .card')) : [];
    if (!sourceCards.length || !dom['muck-area']) return;
    const muckRect = dom['muck-area'].getBoundingClientRect();

    await Promise.all(sourceCards.map(async (sourceCard, index) => {
      const flight = createFlyingCard(player.hand[index], !player.isHuman);
      await flyElement(flight, sourceCard.getBoundingClientRect(), {
        x: muckRect.left + muckRect.width / 2 + (index === 0 ? -5 : 5),
        y: muckRect.top + muckRect.height / 2 - 4 + index * 2,
        width: 28
      }, {
        duration: 285 + index * 45,
        startScale: sourceCard.getBoundingClientRect().width / 58,
        endScale: 0.48,
        rotation: index === 0 ? -15 : 12,
        lift: -20 - index * 4
      });
      flight.remove();
    }));

    if (token === state.handToken) addMuckCards(Math.min(2, sourceCards.length));
  }

  function renderActions() {
    const player = state.players[0];
    const isTurn = state.currentPlayer === 0 && !state.handComplete && !state.animating;
    const canReview = state.handComplete && state.resultReady;
    const callAmount = Math.max(0, state.currentBet - player.roundBet);
    const range = legalRaiseRange(player);

    dom['action-panel'].classList.toggle('disabled', !isTurn && !canReview);
    dom['action-panel'].classList.toggle('review-ready', canReview);
    dom['fold-button'].disabled = !isTurn;
    dom['check-call-button'].disabled = !isTurn;
    dom['raise-button'].disabled = !isTurn || !range.canRaise;
    dom['fold-button'].hidden = canReview;
    dom['check-call-button'].hidden = canReview;
    dom['raise-button'].hidden = canReview;
    dom['show-result-button'].hidden = !canReview;
    dom['show-result-button'].disabled = !canReview;
    dom['bet-control'].classList.toggle('disabled', !isTurn || !range.canRaise);
    dom['bet-control'].querySelectorAll('button').forEach((button) => {
      button.disabled = !isTurn || !range.canRaise;
    });

    if (isTurn) {
      dom['turn-title'].textContent = '轮到你了';
      dom['turn-detail'].textContent = callAmount > 0
        ? '跟注需 ' + Math.min(callAmount, player.chips) + ' · 当前底池 ' + potAmount()
        : '可以过牌或主动下注 · 当前底池 ' + potAmount();
    } else if (state.animating) {
      dom['turn-title'].textContent = state.phase === 'dealing' ? '荷官正在发底牌' : '荷官正在处理牌面';
      dom['turn-detail'].textContent = dom['dealer-status'].textContent || '请稍候';
    } else if (state.handComplete) {
      dom['turn-title'].textContent = state.resultReady ? '本手结束，牌面已保留' : '本手已经结束';
      dom['turn-detail'].textContent = state.revealCards
        ? '看清对手底牌后，再点击“查看本手结算”'
        : '确认牌桌情况后，再查看本手结算';
    } else if (state.currentPlayer !== null) {
      dom['turn-title'].textContent = state.players[state.currentPlayer].name + ' 正在思考';
      dom['turn-detail'].textContent = '电脑玩家正在分析牌面与底池';
    } else {
      dom['turn-title'].textContent = '正在发牌或结算';
      dom['turn-detail'].textContent = '请稍候';
    }

    dom['check-call-label'].textContent = callAmount > 0
      ? (callAmount >= player.chips ? '全下跟注 ' + player.chips : '跟注 ' + callAmount)
      : '过牌';

    if (!range.canRaise) {
      dom['raise-label'].textContent = '无法加注';
      return;
    }

    if (state.raiseTarget === null) state.raiseTarget = range.min;
    state.raiseTarget = clamp(state.raiseTarget, range.min, range.max);
    const step = Math.max(1, Math.round(state.bigBlind / 2));
    dom['raise-slider'].min = range.min;
    dom['raise-slider'].max = range.max;
    dom['raise-slider'].step = step;
    dom['raise-slider'].value = state.raiseTarget;
    dom['raise-input'].min = range.min;
    dom['raise-input'].max = range.max;
    dom['raise-input'].step = step;
    dom['raise-input'].value = state.raiseTarget;
    updateRangeProgress();
    const allIn = state.raiseTarget >= range.max;
    dom['raise-label'].textContent = allIn
      ? '全下 ' + range.max
      : (state.currentBet === 0 ? '下注 ' : '加注至 ') + state.raiseTarget;
  }

  function renderStats() {
    dom['stat-hands'].textContent = state.stats.hands;
    dom['stat-wins'].textContent = state.stats.wins;
    dom['stat-rate'].textContent = state.stats.hands
      ? Math.round(state.stats.wins / state.stats.hands * 100) + '%'
      : '0%';
    dom['stat-pot'].textContent = state.stats.maxPot.toLocaleString('zh-CN');

    if (state.stats.actions < 5) {
      dom['style-name'].textContent = '观察中';
      dom['style-description'].textContent = '再完成几次操作后，将根据你的加注与弃牌频率分析风格。';
      dom['style-meter-fill'].style.width = Math.min(90, state.stats.actions * 18) + '%';
      return;
    }

    const aggression = state.stats.raises / Math.max(1, state.stats.actions);
    const foldRate = state.stats.folds / Math.max(1, state.stats.actions);
    let name = '均衡型';
    let description = '你的加注和弃牌频率较均衡，打法不容易被简单归类。';
    if (aggression > 0.42) {
      name = '进攻型';
      description = '你偏好掌握主动权。留意不要在弱牌时构建过大的底池。';
    } else if (foldRate > 0.48) {
      name = '谨慎型';
      description = '你很重视牌力与风险，也可以尝试在有利位置增加主动下注。';
    } else if (foldRate < 0.18) {
      name = '宽松型';
      description = '你愿意参与很多底池。注意边缘牌的长期跟注成本。';
    }
    dom['style-name'].textContent = name;
    dom['style-description'].textContent = description;
    dom['style-meter-fill'].style.width = Math.round(clamp(aggression * 130, 12, 100)) + '%';
  }

  function bindEvents() {
    dom['fold-button'].addEventListener('click', () => performAction('fold'));
    dom['check-call-button'].addEventListener('click', () => {
      const human = state.players[0];
      performAction(state.currentBet > human.roundBet ? 'call' : 'check');
    });
    dom['raise-button'].addEventListener('click', () => {
      const human = state.players[0];
      const range = legalRaiseRange(human);
      if (state.settings.confirmAllin && state.raiseTarget >= range.max) {
        if (!window.confirm('确定要将剩余 ' + human.chips + ' 筹码全部投入底池吗？')) return;
      }
      performAction('raise', state.raiseTarget);
    });

    dom['raise-slider'].addEventListener('input', (event) => setRaiseTarget(Number(event.target.value)));
    dom['raise-input'].addEventListener('change', (event) => setRaiseTarget(Number(event.target.value)));
    dom['bet-control'].querySelectorAll('[data-bet]').forEach((button) => {
      button.addEventListener('click', () => setBetPreset(button.dataset.bet));
    });

    dom['settings-button'].addEventListener('click', () => openModal('settings-modal'));
    dom['help-button'].addEventListener('click', () => openModal('help-modal'));
    dom['sound-button'].addEventListener('click', toggleSound);
    document.querySelectorAll('[data-close]').forEach((button) => {
      button.addEventListener('click', () => closeModal(button.dataset.close));
    });
    document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
      backdrop.addEventListener('click', (event) => {
        if (
          event.target === backdrop &&
          backdrop.id !== 'result-modal' &&
          backdrop.id !== 'difficulty-modal'
        ) closeModal(backdrop.id);
      });
    });

    document.querySelectorAll('.difficulty-option').forEach((button) => {
      button.addEventListener('click', () => selectDifficulty(button.dataset.difficulty));
    });
    dom['start-game-button'].addEventListener('click', () => {
      closeModal('difficulty-modal');
      saveSettings();
      startHand();
      window.setTimeout(() => showToast('当前难度：' + HoldemAI.DIFFICULTIES[state.settings.difficulty].label), 500);
    });
    dom['difficulty-select'].addEventListener('change', (event) => {
      state.settings.difficulty = event.target.value;
      saveSettings();
      render();
      showToast('难度已改为“' + HoldemAI.DIFFICULTIES[state.settings.difficulty].label + '”，电脑下一次行动起生效');
    });

    dom['speed-select'].addEventListener('change', (event) => {
      state.settings.speed = event.target.value;
      saveSettings();
    });
    dom['confirm-allin'].addEventListener('change', (event) => {
      state.settings.confirmAllin = event.target.checked;
      saveSettings();
    });
    dom['sound-toggle'].addEventListener('change', (event) => {
      state.settings.sound = event.target.checked;
      updateSoundButton();
      saveSettings();
    });
    dom['restart-button'].addEventListener('click', () => {
      if (window.confirm('确定重新开始吗？当前牌局筹码进度将被清空。')) resetGame();
    });
    dom['next-hand-button'].addEventListener('click', () => {
      if (state.sessionOver) resetGame();
      else startHand();
    });
    dom['show-result-button'].addEventListener('click', () => {
      if (state.resultReady) showHandResult();
    });

    document.querySelectorAll('.side-tab').forEach((tab) => {
      tab.addEventListener('click', () => switchSideTab(tab.dataset.tab));
    });

    document.addEventListener('keydown', (event) => {
      if (event.target.matches('input, select') || document.querySelector('.modal-backdrop.open')) return;
      if (state.resultReady && event.key === 'Enter') {
        dom['show-result-button'].click();
        return;
      }
      if (state.currentPlayer !== 0 || state.handComplete || state.animating) return;
      if (event.key.toLowerCase() === 'f') dom['fold-button'].click();
      if (event.key.toLowerCase() === 'c') dom['check-call-button'].click();
      if (event.key.toLowerCase() === 'r') dom['raise-button'].click();
    });
  }

  function selectDifficulty(difficulty) {
    if (!HoldemAI.DIFFICULTIES[difficulty]) return;
    state.settings.difficulty = difficulty;
    dom['difficulty-select'].value = difficulty;
    document.querySelectorAll('.difficulty-option').forEach((button) => {
      const selected = button.dataset.difficulty === difficulty;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-checked', selected ? 'true' : 'false');
    });
    dom['start-game-button'].textContent = '以' + HoldemAI.DIFFICULTIES[difficulty].label + '难度开始牌局';
    render();
  }

  function setRaiseTarget(value) {
    if (state.currentPlayer !== 0) return;
    const range = legalRaiseRange(state.players[0]);
    state.raiseTarget = clamp(Math.round(value || range.min), range.min, range.max);
    renderActions();
  }

  function setBetPreset(preset) {
    const range = legalRaiseRange(state.players[0]);
    const pot = Math.max(state.bigBlind, potAmount());
    let target;
    if (preset === 'allin') target = range.max;
    else {
      const fraction = preset === 'third' ? 1 / 3 : preset === 'half' ? 1 / 2 : 1;
      target = state.currentBet + Math.round(pot * fraction / 5) * 5;
    }
    setRaiseTarget(clamp(target, range.min, range.max));
  }

  function updateRangeProgress() {
    const min = Number(dom['raise-slider'].min);
    const max = Number(dom['raise-slider'].max);
    const value = Number(dom['raise-slider'].value);
    const progress = max === min ? 100 : (value - min) / (max - min) * 100;
    dom['raise-slider'].style.setProperty('--range-progress', progress + '%');
  }

  function switchSideTab(tabName) {
    document.querySelectorAll('.side-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    document.querySelectorAll('.side-content').forEach((content) => content.classList.remove('active'));
    document.getElementById(tabName + '-content').classList.add('active');
  }

  function rotateTip() {
    const tip = TIPS[(state.handNumber + PHASES.indexOf(state.phase) + 1) % TIPS.length];
    dom['tip-title'].textContent = tip[0];
    dom['tip-text'].textContent = tip[1];
  }

  function addLog(message, type) {
    if (!dom['history-list']) return;
    const entry = document.createElement('div');
    entry.className = 'history-entry ' + (type || '');
    const copy = document.createElement('strong');
    copy.textContent = message;
    const time = document.createElement('time');
    time.textContent = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    entry.append(copy, time);
    dom['history-list'].prepend(entry);
    while (dom['history-list'].children.length > 80) dom['history-list'].lastElementChild.remove();
  }

  function clearHistory() {
    dom['history-list'].innerHTML = '';
  }

  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function toggleSound() {
    state.settings.sound = !state.settings.sound;
    dom['sound-toggle'].checked = state.settings.sound;
    updateSoundButton();
    saveSettings();
    if (state.settings.sound) playSound('check');
  }

  function updateSoundButton() {
    dom['sound-button'].classList.toggle('muted', !state.settings.sound);
    dom['sound-button'].textContent = state.settings.sound ? '♪' : '×';
    dom['sound-button'].title = state.settings.sound ? '关闭音效' : '开启音效';
  }

  function playSound(type) {
    if (!state.settings.sound) return;
    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      const sounds = {
        deal: [[320, 0.035]],
        chips: [[520, 0.045], [660, 0.035]],
        check: [[260, 0.035]],
        fold: [[150, 0.055]],
        win: [[440, 0.08], [554, 0.08], [659, 0.12]],
        lose: [[280, 0.08], [210, 0.11]]
      };
      let offset = 0;
      (sounds[type] || sounds.check).forEach(([frequency, duration]) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = type === 'chips' ? 'triangle' : 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, audioContext.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.055, audioContext.currentTime + offset + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + offset + duration);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start(audioContext.currentTime + offset);
        oscillator.stop(audioContext.currentTime + offset + duration + 0.01);
        offset += duration * 0.75;
      });
    } catch (error) {
      // Audio is optional and may be blocked before the first user gesture.
    }
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    dom['toast-region'].appendChild(toast);
    window.setTimeout(() => toast.remove(), 2200);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function wait(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  async function initialize() {
    cacheDom();
    bindEvents();
    state.players = makePlayers();
    dom['difficulty-select'].value = state.settings.difficulty;
    dom['speed-select'].value = state.settings.speed;
    dom['confirm-allin'].checked = state.settings.confirmAllin;
    dom['sound-toggle'].checked = state.settings.sound;
    updateSoundButton();
    if (window.desktop) {
      try {
        const version = await window.desktop.getVersion();
        dom['version-line'].textContent = '德州扑克单机版 v' + version + ' · 完全离线';
      } catch (error) {
        dom['version-line'].textContent = '德州扑克单机版 · 完全离线';
      }
    }
    render();
    addLog('牌桌已准备就绪。祝你好运。', 'phase');
    selectDifficulty(state.settings.difficulty);
    openModal('difficulty-modal');
  }

  document.addEventListener('DOMContentLoaded', initialize);
})();
