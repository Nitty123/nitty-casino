/* =============================================
   NITTY CASINO — Blackjack (Solo + Multiplayer)
   ============================================= */

import {
  bjCreateRoom, bjJoinRoom, bjListenRoom,
  bjUpdateRoom, bjDeleteRoom, bjListenLobbies
} from './firebase.js';
import {
  currentUser, currentUid,
  updateBalance, incrementGames, refreshBalance
} from './auth.js';
import { dbLogActivity } from './firebase.js';

/* ─────────────────────────────────────────────
   CARD ENGINE
───────────────────────────────────────────── */
const SUITS  = ['♠','♥','♦','♣'];
const VALUES = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RED_SUITS = new Set(['♥','♦']);

function buildDeck() {
  const deck = [];
  for (const s of SUITS) for (const v of VALUES) deck.push({ suit: s, value: v });
  return shuffle(deck);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function cardValue(card) {
  if (['J','Q','K'].includes(card.value)) return 10;
  if (card.value === 'A') return 11;
  return parseInt(card.value);
}

function handTotal(hand) {
  let total = 0, aces = 0;
  for (const c of hand) {
    total += cardValue(c);
    if (c.value === 'A') aces++;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function isBust(hand)      { return handTotal(hand) > 21; }
function isBlackjack(hand) { return hand.length === 2 && handTotal(hand) === 21; }

function renderCard(card, faceDown = false) {
  if (faceDown) return `<div class="card face-down"></div>`;
  const color = RED_SUITS.has(card.suit) ? 'red' : 'black';
  return `
    <div class="card ${color}">
      <div class="card-corner-top">${card.value}${card.suit}</div>
      <span>${card.suit}</span>
      <div class="card-corner-bottom">${card.value}${card.suit}</div>
    </div>`;
}

function renderHand(hand, el, hideSecond = false) {
  el.innerHTML = hand.map((c, i) => renderCard(c, hideSecond && i === 1)).join('');
}

/* ─────────────────────────────────────────────
   STATE
───────────────────────────────────────────── */
let deck        = [];
let playerHand  = [];
let dealerHand  = [];
let currentBet  = 0;
let gameActive  = false;
let mode        = 'solo';   // 'solo' | 'multi'
let roomId      = null;
let unsubRoom   = null;
let unsubLobbies = null;
let isHost      = false;

/* ─────────────────────────────────────────────
   SCREEN HELPERS
───────────────────────────────────────────── */
function showScreen(id) {
  ['mode-screen','multi-lobby','waiting-room-screen','game-screen']
    .forEach(s => document.getElementById(s).classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

window.showModeScreen = function() {
  cleanupRoom();
  showScreen('mode-screen');
};
window.backToModeScreen = window.showModeScreen;

window.showMultiLobby = function() {
  showScreen('multi-lobby');
  listenLobbies();
};

/* ─────────────────────────────────────────────
   SOLO MODE
───────────────────────────────────────────── */
window.startSolo = function() {
  mode = 'solo';
  currentBet = 0;
  updateBetDisplay();
  document.getElementById('bet-bar').style.display = 'flex';
  setButtons(false, false, false, true);
  clearTable();
  showScreen('game-screen');
};

/* Bet chips */
window.addChip = function(amount) {
  if (gameActive) return;
  const user = waitForUser();
  if (!user) return;
  if (currentBet + amount > user.balance) {
    currentBet = user.balance;
  } else {
    currentBet += amount;
  }
  updateBetDisplay();
};

window.clearBet = function() {
  if (gameActive) return;
  currentBet = 0;
  updateBetDisplay();
};

function updateBetDisplay() {
  const el = document.getElementById('current-bet-display');
  if (el) el.textContent = currentBet;
}

/* Deal */
window.deal = async function() {
  const user = waitForUser();
  if (!user) return;

  if (currentBet <= 0) {
    showResult('❌ Place a bet first!', false); return;
  }
  if (currentBet > user.balance) {
    showResult('❌ Not enough coins!', false); return;
  }

  deck       = buildDeck();
  playerHand = [deck.pop(), deck.pop()];
  dealerHand = [deck.pop(), deck.pop()];
  gameActive = true;

  renderHands(true);
  setStatus('');
  showResult('', false);
  setButtons(true, true, true, false);

  // Auto-check blackjack
  if (isBlackjack(playerHand)) {
    await stand(); // reveal dealer
  }
};

/* Hit */
window.hit = function() {
  if (!gameActive) return;
  playerHand.push(deck.pop());
  renderHands(true);

  if (isBust(playerHand)) {
    endRound('bust');
  } else if (handTotal(playerHand) === 21) {
    stand();
  }
};

/* Stand */
window.stand = async function() {
  if (!gameActive && !isBlackjack(playerHand)) return;
  setButtons(false, false, false, false);

  // Dealer plays
  renderHands(false);
  await delay(500);

  while (handTotal(dealerHand) < 17) {
    dealerHand.push(deck.pop());
    renderHands(false);
    await delay(600);
  }

  const pTotal = handTotal(playerHand);
  const dTotal = handTotal(dealerHand);
  const pBJ    = isBlackjack(playerHand);
  const dBJ    = isBlackjack(dealerHand);

  if (pBJ && dBJ)            endRound('push');
  else if (pBJ)              endRound('blackjack');
  else if (dBJ)              endRound('dealer-blackjack');
  else if (isBust(dealerHand)) endRound('dealer-bust');
  else if (pTotal > dTotal)  endRound('win');
  else if (pTotal === dTotal) endRound('push');
  else                        endRound('lose');
};

/* Double Down */
window.doubleDown = async function() {
  const user = waitForUser();
  if (!user || !gameActive) return;
  if (currentBet * 2 > user.balance) {
    showResult('❌ Not enough coins to double!', false); return;
  }
  currentBet *= 2;
  updateBetDisplay();
  playerHand.push(deck.pop());
  renderHands(true);
  if (isBust(playerHand)) { endRound('bust'); return; }
  await stand();
};

async function endRound(outcome) {
  gameActive = false;
  renderHands(false);

  const user = waitForUser();
  if (!user) return;

  let winnings = 0;
  let statusText = '';
  let statusClass = '';
  let actType = 'lose';

  switch (outcome) {
    case 'blackjack':
      winnings    = Math.floor(currentBet * 2.5);
      statusText  = '🎉 BLACKJACK! You win!';
      statusClass = 'win'; actType = 'win'; break;
    case 'win':
    case 'dealer-bust':
      winnings    = currentBet * 2;
      statusText  = outcome === 'dealer-bust' ? '💥 Dealer bust! You win!' : '✅ You win!';
      statusClass = 'win'; actType = 'win'; break;
    case 'push':
      winnings    = currentBet;
      statusText  = '🤝 Push — bet returned';
      statusClass = 'push'; actType = 'win'; break;
    case 'bust':
      statusText  = '💥 Bust! You lose.';
      statusClass = 'bust'; break;
    case 'lose':
    case 'dealer-blackjack':
      statusText  = outcome === 'dealer-blackjack' ? '😔 Dealer Blackjack!' : '❌ Dealer wins.';
      statusClass = 'lose'; break;
  }

  setStatus(statusText, statusClass);

  const newBal = user.balance - currentBet + winnings;
  await updateBalance(newBal);
  await incrementGames();
  await dbLogActivity(actType,
    `${user.username} played Blackjack — ${statusText.replace(/[🎉✅💥❌😔🤝]/g,'').trim()} (bet: ${currentBet})`);

  if (winnings > currentBet) coinAnim();

  showResult(`Bet: ${currentBet} | ${winnings > 0 ? '+ ' + winnings + ' coins' : 'No payout'}`, winnings > 0);
  setButtons(false, false, false, true);
  currentBet = 0;
  updateBetDisplay();
}

function setStatus(text, cls = '') {
  const el = document.getElementById('bj-status');
  if (!el) return;
  el.textContent = text;
  el.className   = 'bj-status ' + cls;
}

function showResult(text, win) {
  const el = document.getElementById('bj-result-msg');
  if (!el) return;
  el.textContent = text;
  el.style.color = win ? 'var(--gold)' : 'var(--text-dim)';
}

function renderHands(hideDealer) {
  renderHand(dealerHand, document.getElementById('dealer-hand'), hideDealer);
  renderHand(playerHand, document.getElementById('player-hand'));
  const dShow = hideDealer ? '?' : handTotal(dealerHand);
  document.getElementById('dealer-score').textContent = `Score: ${dShow}`;
  document.getElementById('player-score').textContent = `Score: ${handTotal(playerHand)}`;
}

function clearTable() {
  ['dealer-hand','player-hand'].forEach(id => { const el = document.getElementById(id); if(el) el.innerHTML=''; });
  ['dealer-score','player-score'].forEach(id => { const el = document.getElementById(id); if(el) el.textContent='—'; });
  setStatus('');
  showResult('', false);
}

function setButtons(hit, stand, dbl, deal) {
  document.getElementById('btn-hit').disabled    = !hit;
  document.getElementById('btn-stand').disabled  = !stand;
  document.getElementById('btn-double').disabled = !dbl;
  document.getElementById('btn-deal').disabled   = !deal;
}

/* ─────────────────────────────────────────────
   MULTIPLAYER MODE
───────────────────────────────────────────── */
function listenLobbies() {
  if (unsubLobbies) unsubLobbies();
  unsubLobbies = bjListenLobbies(rooms => {
    const list = document.getElementById('bj-rooms-list');
    if (!list) return;
    if (!rooms || rooms.length === 0) {
      list.innerHTML = '<p class="no-rooms">No open rooms. Create one below!</p>'; return;
    }
    list.innerHTML = rooms.map(r => `
      <div class="room-item">
        <div class="room-info">
          <div class="room-host">${r.hostName}'s Room</div>
          <div class="room-meta">Bet: 💰${r.bet} &nbsp;|&nbsp; Players: ${Object.keys(r.players||{}).length}/4</div>
        </div>
        <button class="btn-join" onclick="joinRoom('${r.id}')">Join</button>
      </div>
    `).join('');
  });
}

window.createMultiRoom = async function() {
  const user = waitForUser();
  if (!user) return;
  const betEl = document.getElementById('bj-room-bet');
  const bet   = parseInt(betEl.value, 10);
  const msgEl = document.getElementById('create-room-msg');

  if (!bet || bet < 10) { msgEl.style.color='var(--red)'; msgEl.textContent='❌ Min bet is 10'; return; }
  if (bet > user.balance) { msgEl.style.color='var(--red)'; msgEl.textContent='❌ Not enough coins'; return; }

  msgEl.textContent = '';
  isHost  = true;
  mode    = 'multi';
  roomId  = await bjCreateRoom(currentUid, user.username, bet);
  enterWaitingRoom();
};

window.joinRoom = async function(id) {
  const user = waitForUser();
  if (!user) return;
  isHost = false;
  mode   = 'multi';
  roomId = id;
  await bjJoinRoom(roomId, currentUid, user.username);
  enterWaitingRoom();
};

function enterWaitingRoom() {
  if (unsubLobbies) { unsubLobbies(); unsubLobbies = null; }
  showScreen('waiting-room-screen');
  document.getElementById('room-id-display').textContent = '🔑 Room: ' + roomId;

  unsubRoom = bjListenRoom(roomId, (room) => {
    if (!room) { cleanupRoom(); showScreen('mode-screen'); return; }

    // Render player list
    const players = Object.values(room.players || {});
    document.getElementById('waiting-players-list').innerHTML = players.map(p => `
      <div class="waiting-player">
        <span class="pname">👤 ${p.name}</span>
        <span class="${p.uid === room.host ? 'ready-badge' : 'not-ready-badge'}">
          ${p.uid === room.host ? '👑 Host' : 'Waiting'}
        </span>
      </div>
    `).join('');

    const startBtn = document.getElementById('start-multi-btn');
    if (startBtn) {
      startBtn.disabled = !(isHost && players.length >= 2);
      startBtn.textContent = players.length < 2
        ? `🎮 Need ${2 - players.length} more player${2-players.length!==1?'s':''}`
        : '🎮 Start Game';
    }

    // If game started by host
    if (room.status === 'playing' && room.gameState) {
      startMultiGameFromState(room);
    }
  });
}

window.startMultiGame = async function() {
  if (!isHost || !roomId) return;
  const room = await getRoom();
  if (!room) return;
  const players = Object.values(room.players || {});

  // Build initial game state
  const newDeck = buildDeck();
  const gs = {
    deck:    newDeck,
    dealer:  [newDeck.pop(), newDeck.pop()],
    hands:   {},
    bets:    {},
    status:  {},  // 'playing' | 'stand' | 'bust'
    turn:    0,
    turnOrder: players.map(p => p.uid)
  };
  players.forEach(p => {
    gs.hands[p.uid]  = [newDeck.pop(), newDeck.pop()];
    gs.bets[p.uid]   = room.bet;
    gs.status[p.uid] = 'playing';
  });

  await bjUpdateRoom(roomId, { status: 'playing', gameState: gs });
};

function startMultiGameFromState(room) {
  if (unsubRoom) { /* keep listening */ }
  showScreen('game-screen');
  document.getElementById('bet-bar').style.display = 'none';

  const gs = room.gameState;
  renderMultiState(gs, room);
}

function renderMultiState(gs, room) {
  if (!gs) return;
  const myHand    = gs.hands[currentUid] || [];
  const myStatus  = gs.status[currentUid] || 'playing';
  const turnUid   = gs.turnOrder[gs.turn];
  const isMyTurn  = turnUid === currentUid;

  renderHand(gs.dealer, document.getElementById('dealer-hand'), gs.turn < gs.turnOrder.length);
  renderHand(myHand, document.getElementById('player-hand'));
  document.getElementById('dealer-score').textContent = 'Dealer: ?';
  document.getElementById('player-score').textContent = `Score: ${handTotal(myHand)}`;

  const statusEl = document.getElementById('bj-status');
  const who = room.players[turnUid] ? room.players[turnUid].name : '?';
  statusEl.textContent = isMyTurn ? '🎯 Your turn!' : `⏳ ${who}'s turn...`;
  statusEl.className   = 'bj-status ' + (isMyTurn ? 'win' : '');

  setButtons(isMyTurn && myStatus==='playing', isMyTurn && myStatus==='playing', false, false);

  // Override hit/stand for multiplayer
  document.getElementById('btn-hit').onclick   = multiHit;
  document.getElementById('btn-stand').onclick  = multiStand;

  // Check if all done
  const allDone = gs.turnOrder.every(uid => gs.status[uid] !== 'playing');
  if (allDone && isHost) resolveMultiRound(gs, room);
}

async function multiHit() {
  const room = await getRoom();
  if (!room) return;
  const gs = room.gameState;
  const myHand = gs.hands[currentUid];
  myHand.push(gs.deck.pop());

  if (isBust(myHand)) {
    gs.status[currentUid] = 'bust';
    advanceTurn(gs);
  }
  gs.hands[currentUid] = myHand;
  await bjUpdateRoom(roomId, { gameState: gs });
}

async function multiStand() {
  const room = await getRoom();
  if (!room) return;
  const gs = room.gameState;
  gs.status[currentUid] = 'stand';
  advanceTurn(gs);
  await bjUpdateRoom(roomId, { gameState: gs });
}

function advanceTurn(gs) {
  gs.turn++;
  while (gs.turn < gs.turnOrder.length && gs.status[gs.turnOrder[gs.turn]] !== 'playing') {
    gs.turn++;
  }
}

async function resolveMultiRound(gs, room) {
  // Dealer plays
  while (handTotal(gs.dealer) < 17) gs.dealer.push(gs.deck.pop());

  const dTotal = handTotal(gs.dealer);
  const dBust  = isBust(gs.dealer);
  const results = {};

  for (const uid of gs.turnOrder) {
    const hand   = gs.hands[uid];
    const pTotal = handTotal(hand);
    const pBust  = gs.status[uid] === 'bust';
    const bet    = gs.bets[uid] || room.bet;

    if (pBust)                results[uid] = { outcome:'lose', payout:0 };
    else if (isBlackjack(hand)) results[uid] = { outcome:'blackjack', payout: Math.floor(bet*2.5) };
    else if (dBust || pTotal>dTotal) results[uid] = { outcome:'win', payout: bet*2 };
    else if (pTotal===dTotal) results[uid] = { outcome:'push', payout: bet };
    else                      results[uid] = { outcome:'lose', payout:0 };
  }

  await bjUpdateRoom(roomId, { status:'finished', gameState: { ...gs, results } });

  // Pay out each player
  for (const uid of gs.turnOrder) {
    const r    = results[uid];
    const user = await import('./firebase.js').then(m => m.dbGetUser(uid));
    if (!user) continue;
    const newBal = (user.balance||0) - (gs.bets[uid]||room.bet) + r.payout;
    await import('./firebase.js').then(m => m.dbUpdateUser(uid, { balance: newBal, gamesPlayed:(user.gamesPlayed||0)+1 }));
  }

  setTimeout(() => { cleanupRoom(); showScreen('mode-screen'); }, 5000);
}

window.leaveRoom = async function() {
  if (roomId) {
    if (isHost) await bjDeleteRoom(roomId);
  }
  cleanupRoom();
  showScreen('mode-screen');
};

function cleanupRoom() {
  if (unsubRoom)    { unsubRoom();    unsubRoom    = null; }
  if (unsubLobbies) { unsubLobbies(); unsubLobbies = null; }
  roomId = null; isHost = false;
}

async function getRoom() {
  if (!roomId) return null;
  const snap = await import('./firebase.js').then(m =>
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js').then(db =>
      db.get(db.ref(m.db, `blackjack_rooms/${roomId}`))
    )
  );
  return snap && snap.exists() ? snap.val() : null;
}

/* ─────────────────────────────────────────────
   UTILITIES
───────────────────────────────────────────── */
function waitForUser() {
  if (currentUser) return currentUser;
  return null;
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function coinAnim() {
  for (let i = 0; i < 6; i++) {
    setTimeout(() => {
      const c = document.createElement('div');
      c.className = 'coin-fly'; c.textContent = '💰';
      c.style.left = (Math.random()*80+10)+'%';
      c.style.top  = (Math.random()*40+30)+'%';
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 950);
    }, i*110);
  }
}
