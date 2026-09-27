/* =============================================
   NITTY CASINO — Texas Hold'em Poker
   Solo (vs bots) + Multiplayer (Firebase)
   ============================================= */

import {
  pkCreateRoom, pkJoinRoom, pkListenRoom,
  pkUpdateRoom, pkDeleteRoom, pkListenLobbies,
  dbLogActivity, dbGetUser, dbUpdateUser
} from './firebase.js';
import { currentUser, currentUid, updateBalance, incrementGames } from './auth.js';

/* ─────────────────────────────────────────────
   CARD ENGINE
───────────────────────────────────────────── */
const SUITS  = ['♠','♥','♦','♣'];
const VALUES = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RED    = new Set(['♥','♦']);

function buildDeck() {
  const d = [];
  for (const s of SUITS) for (const v of VALUES) d.push({s,v});
  return shuffle([...d]);
}
function shuffle(a) {
  for (let i=a.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function cardHTML(card, faceDown=false) {
  if (faceDown) return `<div class="card face-down"></div>`;
  const col = RED.has(card.s) ? 'red':'black';
  return `<div class="card ${col}">
    <div class="card-corner-top">${card.v}${card.s}</div>
    <span>${card.s}</span>
    <div class="card-corner-bottom">${card.v}${card.s}</div>
  </div>`;
}

/* ─────────────────────────────────────────────
   HAND EVALUATOR
───────────────────────────────────────────── */
const RANK_MAP = {'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14};

function rankCards(cards) {
  // Returns { rank: number, name: string } — higher is better
  const vals  = cards.map(c=>RANK_MAP[c.v]).sort((a,b)=>b-a);
  const suits = cards.map(c=>c.s);
  const vFreq = {};
  vals.forEach(v=>{vFreq[v]=(vFreq[v]||0)+1;});
  const freqs = Object.values(vFreq).sort((a,b)=>b-a);
  const isFlush    = suits.every(s=>s===suits[0]);
  const isStraight = vals.length===5 && (vals[0]-vals[4]===4) && new Set(vals).size===5;
  const isLowStraight = String(vals)===String([5,4,3,2,14].sort((a,b)=>b-a));

  if ((isStraight||isLowStraight) && isFlush) return {rank:8, name: vals[0]===14&&!isLowStraight ? 'Royal Flush':'Straight Flush'};
  if (freqs[0]===4)                  return {rank:7, name:'Four of a Kind'};
  if (freqs[0]===3 && freqs[1]===2)  return {rank:6, name:'Full House'};
  if (isFlush)                        return {rank:5, name:'Flush'};
  if (isStraight||isLowStraight)      return {rank:4, name:'Straight'};
  if (freqs[0]===3)                   return {rank:3, name:'Three of a Kind'};
  if (freqs[0]===2 && freqs[1]===2)   return {rank:2, name:'Two Pair'};
  if (freqs[0]===2)                   return {rank:1, name:'One Pair'};
  return {rank:0, name:'High Card'};
}

function bestHand(hole, community) {
  const all  = [...hole, ...community];
  if (all.length < 5) return rankCards(all);
  // Try all C(n,5) combinations
  let best = null;
  const combos = combinations(all, 5);
  for (const c of combos) {
    const r = rankCards(c);
    if (!best || r.rank > best.rank) best = r;
  }
  return best;
}

function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  return [...combinations(rest,k-1).map(c=>[first,...c]), ...combinations(rest,k)];
}

/* ─────────────────────────────────────────────
   GAME STATE
───────────────────────────────────────────── */
const STREETS = ['pre-flop','flop','turn','river','showdown'];

let G = null;       // game state object
let mode      = 'solo';
let roomId    = null;
let isHost    = false;
let unsubRoom = null;
let unsubLob  = null;
let actionTimeout = null;

/* ─────────────────────────────────────────────
   SCREEN HELPERS
───────────────────────────────────────────── */
function showScreen(id) {
  ['mode-screen','multi-lobby','waiting-room-screen','game-screen']
    .forEach(s=>document.getElementById(s).classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}
window.showModeScreen = function() { cleanupRoom(); showScreen('mode-screen'); };
window.backToModeScreen = window.showModeScreen;
window.showMultiLobby = function() { showScreen('multi-lobby'); listenLobbies(); };

/* ─────────────────────────────────────────────
   SOLO MODE — VS BOTS
───────────────────────────────────────────── */
const BOT_NAMES = ['🤖 RoboCasey','🤖 Bot Bob','🤖 AI Alice'];

window.startSolo = function() {
  mode = 'solo';
  const user = waitForUser();
  if (!user) return;

  const blind = 20;
  const deck  = buildDeck();

  const players = [
    { uid:'player', name: user.username, balance: user.balance, isBot:false, folded:false, bet:0, allIn:false },
    { uid:'bot1',   name: BOT_NAMES[0],  balance: 1000,         isBot:true,  folded:false, bet:0, allIn:false },
    { uid:'bot2',   name: BOT_NAMES[1],  balance: 1000,         isBot:true,  folded:false, bet:0, allIn:false },
    { uid:'bot3',   name: BOT_NAMES[2],  balance: 1000,         isBot:true,  folded:false, bet:0, allIn:false },
  ];

  G = {
    deck,
    players,
    community: [],
    pot:       0,
    street:    0,   // index into STREETS
    dealer:    0,
    turn:      1,   // index into players (after dealer)
    currentBet: blind,
    log:        [],
    hands:     {},
    done:      false
  };

  // Deal hole cards
  players.forEach(p => {
    G.hands[p.uid] = [G.deck.pop(), G.deck.pop()];
  });

  // Post blinds
  const sbIdx = 1, bbIdx = 2;
  G.players[sbIdx].bet = Math.floor(blind/2);
  G.players[sbIdx].balance -= Math.floor(blind/2);
  G.players[bbIdx].bet = blind;
  G.players[bbIdx].balance -= blind;
  G.pot = blind + Math.floor(blind/2);
  G.turn = (bbIdx+1) % players.length;

  addLog(`--- New Hand --- Blind: ${blind}`);
  addLog(`${G.players[sbIdx].name} posts small blind (${Math.floor(blind/2)})`);
  addLog(`${G.players[bbIdx].name} posts big blind (${blind})`);

  showScreen('game-screen');
  renderGame();
  processNextActor();
};

/* ─────────────────────────────────────────────
   GAME LOOP
───────────────────────────────────────────── */
function processNextActor() {
  if (!G) return;
  const active = G.players.filter(p=>!p.folded && !p.allIn);
  if (active.length <= 1) { advanceStreet(); return; }

  const actor = G.players[G.turn];
  if (!actor || actor.folded || actor.allIn) { nextTurn(); return; }

  if (actor.isBot) {
    clearTimeout(actionTimeout);
    actionTimeout = setTimeout(() => botAction(G.turn), 900 + Math.random()*700);
  } else {
    renderGame();
    showActions(actor);
  }
}

function nextTurn() {
  G.turn = (G.turn+1) % G.players.length;
  processNextActor();
}

/* Player action */
window.pkAction = function(action) {
  if (!G) return;
  const me = G.players.find(p=>p.uid==='player');
  if (!me || me.folded) return;

  hideActions();
  const toCall = G.currentBet - me.bet;

  switch (action) {
    case 'fold':
      me.folded = true;
      addLog(`${me.name} folds`);
      break;
    case 'check':
      if (toCall > 0) { showStatus('❌ Cannot check, must call or fold'); showActions(me); return; }
      addLog(`${me.name} checks`);
      break;
    case 'call': {
      const amount = Math.min(toCall, me.balance);
      me.balance -= amount; me.bet += amount; G.pot += amount;
      addLog(`${me.name} calls ${amount}`);
      break;
    }
    case 'raise': {
      const raiseTo = parseInt(document.getElementById('raise-amount').value,10);
      if (!raiseTo || raiseTo <= G.currentBet) {
        showStatus('❌ Raise must exceed current bet'); showActions(me); return;
      }
      const diff = raiseTo - me.bet;
      if (diff > me.balance) {
        showStatus('❌ Not enough coins'); showActions(me); return;
      }
      me.balance -= diff; G.pot += diff; me.bet = raiseTo; G.currentBet = raiseTo;
      addLog(`${me.name} raises to ${raiseTo}`);
      break;
    }
    case 'allin': {
      const amount = me.balance;
      me.bet += amount; G.pot += amount; me.balance = 0;
      if (me.bet > G.currentBet) G.currentBet = me.bet;
      me.allIn = true;
      addLog(`${me.name} goes ALL-IN (${amount})`);
      break;
    }
  }

  renderGame();
  checkRoundEnd();
};

/* Bot action */
function botAction(idx) {
  if (!G) return;
  const bot     = G.players[idx];
  if (!bot || bot.folded || bot.allIn) { nextTurn(); return; }

  const hand     = G.hands[bot.uid];
  const bestR    = bestHand(hand, G.community);
  const strength = bestR ? bestR.rank : 0;   // 0-8
  const toCall   = G.currentBet - bot.bet;
  const rand     = Math.random();

  // Simple bot logic: strength based decisions
  if (strength >= 3 || rand < 0.35) {
    // Strong hand or random aggression → raise/call
    if (rand < 0.25 && bot.balance > G.currentBet * 2) {
      // Raise
      const raiseTo = G.currentBet + Math.floor(G.pot * 0.5);
      const diff    = Math.min(raiseTo - bot.bet, bot.balance);
      bot.balance -= diff; bot.bet += diff; G.pot += diff;
      G.currentBet = Math.max(G.currentBet, bot.bet);
      addLog(`${bot.name} raises to ${bot.bet}`);
    } else if (toCall > 0 && toCall <= bot.balance) {
      bot.balance -= toCall; bot.bet += toCall; G.pot += toCall;
      addLog(`${bot.name} calls ${toCall}`);
    } else if (toCall === 0) {
      addLog(`${bot.name} checks`);
    } else {
      bot.folded = true;
      addLog(`${bot.name} folds`);
    }
  } else if (strength === 1 || rand < 0.6) {
    // Medium → call small amounts
    if (toCall === 0) {
      addLog(`${bot.name} checks`);
    } else if (toCall <= bot.balance * 0.2) {
      bot.balance -= toCall; bot.bet += toCall; G.pot += toCall;
      addLog(`${bot.name} calls ${toCall}`);
    } else {
      bot.folded = true;
      addLog(`${bot.name} folds`);
    }
  } else {
    bot.folded = true;
    addLog(`${bot.name} folds`);
  }

  renderGame();
  checkRoundEnd();
}

function checkRoundEnd() {
  if (!G) return;
  const active = G.players.filter(p=>!p.folded && !p.allIn);

  // One player left
  if (G.players.filter(p=>!p.folded).length === 1) {
    advanceStreet(true);
    return;
  }

  // All active players matched the bet
  const allCalled = active.every(p => p.bet === G.currentBet || p.allIn);
  if (allCalled) {
    advanceStreet();
  } else {
    nextTurn();
  }
}

function advanceStreet(skipToShowdown=false) {
  if (!G) return;
  G.street++;
  // Reset bets for new street
  G.players.forEach(p => { p.bet = 0; });
  G.currentBet = 0;
  G.turn = (G.dealer+1) % G.players.length;

  const streetName = STREETS[G.street];

  if (skipToShowdown || G.street >= 4) {
    showdown();
    return;
  }

  if (G.street === 1) { // Flop
    G.community.push(G.deck.pop(), G.deck.pop(), G.deck.pop());
    addLog('--- Flop ---');
  } else if (G.street === 2) { // Turn
    G.community.push(G.deck.pop());
    addLog('--- Turn ---');
  } else if (G.street === 3) { // River
    G.community.push(G.deck.pop());
    addLog('--- River ---');
  }

  document.getElementById('street-label').textContent = streetName.toUpperCase();
  renderGame();
  processNextActor();
}

function showdown() {
  if (!G) return;
  G.done = true;
  // Reveal all hands
  const alive = G.players.filter(p=>!p.folded);
  let winner   = null;
  let bestRank = -1;

  for (const p of alive) {
    const h = G.hands[p.uid];
    const r = bestHand(h, G.community);
    if (r.rank > bestRank) { bestRank = r.rank; winner = p; }
    addLog(`${p.name}: ${r.name}`);
  }

  if (!winner) winner = alive[0];
  winner.balance += G.pot;
  addLog(`🏆 ${winner.name} wins ${G.pot} coins with ${bestHand(G.hands[winner.uid], G.community).name}!`);
  G.pot = 0;

  renderGame(true);
  showStatus(`🏆 ${winner.name} wins!`);

  // Save outcome for real player
  if (mode === 'solo') {
    const me = G.players.find(p=>p.uid==='player');
    if (me) {
      const won = winner.uid === 'player';
      updateBalance(me.balance).then(()=>incrementGames());
      dbLogActivity(won?'win':'lose', `${currentUser?.username} played Poker — ${won?'WON':'lost'} (pot: ${G.pot})`);
      if (won) coinAnim();
    }
  }

  setTimeout(() => {
    document.getElementById('pk-status-msg').textContent = '';
    if (mode === 'solo') {
      const me = G.players.find(p=>p.uid==='player');
      if (me && me.balance >= 20) {
        startSolo();
      } else {
        showStatus('💸 Out of coins! Returning to lobby...');
        setTimeout(() => window.location.href='casino.html', 2500);
      }
    }
  }, 5000);
}

/* ─────────────────────────────────────────────
   RENDERING
───────────────────────────────────────────── */
function renderGame(showAllHands=false) {
  if (!G) return;

  // Community cards
  const cc = document.getElementById('community-cards');
  if (cc) {
    cc.innerHTML = G.community.map(c=>cardHTML(c)).join('') ||
      '<span style="color:rgba(255,255,255,.2);font-size:.85rem;letter-spacing:2px">WAITING FOR FLOP</span>';
  }

  // Pot
  const potEl = document.getElementById('pot-display');
  if (potEl) potEl.textContent = G.pot;

  // Seats
  const seatsEl = document.getElementById('poker-seats');
  if (seatsEl) {
    const turnPlayer = G.players[G.turn];
    seatsEl.innerHTML = G.players.map((p, i) => {
      const isDealer   = i === G.dealer;
      const isActive   = !G.done && turnPlayer && p.uid === turnPlayer.uid;
      const myHand     = G.hands[p.uid] || [];
      const showHand   = (p.uid==='player') || showAllHands;
      const handRank   = showAllHands && !p.folded ? bestHand(myHand, G.community)?.name : '';

      let statusText='', statusCls='';
      if (p.folded) { statusText='FOLD'; statusCls='fold'; }
      else if (p.allIn) { statusText='ALL-IN'; statusCls='all-in'; }

      return `<div class="poker-seat ${isActive?'active-turn':''} ${p.folded?'folded':''} ${p.isBot?'is-bot':''}">
        ${isDealer?'<div class="dealer-chip">D</div>':''}
        <div class="seat-name">${p.name}</div>
        <div class="seat-balance">💰 ${p.balance}</div>
        ${p.bet>0?`<div class="seat-bet">Bet: ${p.bet}</div>`:''}
        <div class="seat-cards">
          ${showHand
            ? myHand.map(c=>cardHTML(c)).join('')
            : (p.folded ? '' : myHand.map(()=>cardHTML(null,true)).join(''))}
        </div>
        ${statusText?`<span class="seat-status ${statusCls}">${statusText}</span>`:''}
        ${handRank?`<div style="color:var(--gold);font-size:.72rem;margin-top:4px">${handRank}</div>`:''}
      </div>`;
    }).join('');
  }

  // Player hole cards
  const me = G.players.find(p=>p.uid==='player');
  if (me) {
    const hole = G.hands['player'] || [];
    const ph   = document.getElementById('player-hole-cards');
    if (ph) ph.innerHTML = hole.map(c=>cardHTML(c)).join('');
    const hr = document.getElementById('player-hand-rank');
    if (hr && G.community.length > 0) {
      hr.textContent = bestHand(hole, G.community)?.name || '';
    }
  }

  // Log
  const logEl = document.getElementById('round-log');
  if (logEl) {
    logEl.innerHTML = [...G.log].reverse().slice(0,20)
      .map(l=>`<p class="${l.startsWith('---')||l.startsWith('🏆')?'highlight':''}">${l}</p>`)
      .join('');
  }
}

function showActions(player) {
  if (!player || player.uid !== 'player') return;
  const area    = document.getElementById('poker-actions');
  const callBtn = document.getElementById('pk-call');
  const callAmt = document.getElementById('call-amount');
  const checkBtn = document.getElementById('pk-check');
  if (!area) return;

  const toCall = G.currentBet - player.bet;
  area.style.display = 'flex';
  callBtn.disabled  = toCall <= 0;
  checkBtn.disabled = toCall > 0;
  if (callAmt) callAmt.textContent = toCall > 0 ? `(${toCall})` : '';
}

function hideActions() {
  const area = document.getElementById('poker-actions');
  if (area) area.style.display = 'none';
}

function showStatus(msg) {
  const el = document.getElementById('pk-status-msg');
  if (el) el.textContent = msg;
}

function addLog(msg) {
  if (!G) return;
  G.log.push(msg);
  const logEl = document.getElementById('round-log');
  if (logEl) {
    logEl.innerHTML = [...G.log].reverse().slice(0,20)
      .map(l=>`<p class="${l.startsWith('---')||l.startsWith('🏆')?'highlight':''}">${l}</p>`)
      .join('');
  }
}

/* ─────────────────────────────────────────────
   MULTIPLAYER MODE
───────────────────────────────────────────── */
function listenLobbies() {
  if (unsubLob) unsubLob();
  unsubLob = pkListenLobbies(rooms => {
    const list = document.getElementById('pk-rooms-list');
    if (!list) return;
    if (!rooms || rooms.length===0) { list.innerHTML='<p class="no-rooms">No open rooms. Create one!</p>'; return; }
    list.innerHTML = rooms.map(r=>`
      <div class="room-item">
        <div class="room-info">
          <div class="room-host">${r.hostName}'s Table</div>
          <div class="room-meta">Blind: 💰${r.bet} &nbsp;|&nbsp; Seats: ${Object.keys(r.players||{}).length}/6</div>
        </div>
        <button class="btn-join" onclick="pkJoinRoom('${r.id}')">Join</button>
      </div>
    `).join('');
  });
}

window.createMultiRoom = async function() {
  const user = waitForUser();
  if (!user) return;
  const bet   = parseInt(document.getElementById('pk-room-bet').value,10);
  const msgEl = document.getElementById('pk-create-msg');
  if (!bet||bet<10) { msgEl.style.color='var(--red)'; msgEl.textContent='❌ Min blind is 10'; return; }
  if (bet>user.balance) { msgEl.style.color='var(--red)'; msgEl.textContent='❌ Not enough coins'; return; }
  isHost=true; mode='multi';
  roomId = await pkCreateRoom(currentUid, user.username, bet);
  enterWaiting();
};

window.pkJoinRoom = async function(id) {
  const user=waitForUser(); if(!user) return;
  isHost=false; mode='multi'; roomId=id;
  await pkJoinRoom(roomId, currentUid, user.username);
  enterWaiting();
};

function enterWaiting() {
  if (unsubLob) { unsubLob(); unsubLob=null; }
  showScreen('waiting-room-screen');
  document.getElementById('room-id-display').textContent = '🔑 Room: '+roomId;

  unsubRoom = pkListenRoom(roomId, (room) => {
    if (!room) { cleanupRoom(); showScreen('mode-screen'); return; }
    const players = Object.values(room.players||{});
    document.getElementById('waiting-players-list').innerHTML = players.map(p=>`
      <div class="waiting-player">
        <span class="pname">👤 ${p.name}</span>
        <span class="${p.uid===room.host?'ready-badge':'not-ready-badge'}">${p.uid===room.host?'👑 Host':'Waiting'}</span>
      </div>`).join('');

    const btn = document.getElementById('start-multi-btn');
    if (btn) {
      btn.disabled = !(isHost && players.length>=2);
      btn.textContent = players.length<2 ? `🎮 Need ${2-players.length} more player${players.length===1?'':'s'}` : '🎮 Start Game';
    }
    if (room.status==='playing' && room.gameState) initMultiGame(room);
  });
}

window.startMultiGame = async function() {
  if (!isHost||!roomId) return;
  const snap  = await getRoom();
  if (!snap) return;
  const playerList = Object.values(snap.players||{});
  const blind  = snap.bet;
  const deck   = buildDeck();
  const gs = {
    deck, pot:0, community:[], street:0, dealer:0, currentBet:blind,
    turn: 1 % playerList.length,
    players: playerList.map(p=>({uid:p.uid,name:p.name,balance:1000,folded:false,bet:0,allIn:false})),
    hands: Object.fromEntries(playerList.map(p=>[p.uid,[deck.pop(),deck.pop()]])),
    log:[],done:false
  };
  gs.players[1%playerList.length].bet = Math.floor(blind/2);
  gs.players[1%playerList.length].balance -= Math.floor(blind/2);
  gs.players[2%playerList.length].bet = blind;
  gs.players[2%playerList.length].balance -= blind;
  gs.pot = blind + Math.floor(blind/2);
  await pkUpdateRoom(roomId, {status:'playing', gameState: gs});
};

function initMultiGame(room) {
  const gs = room.gameState;
  // Mirror the solo G state
  G = { ...gs, hands: gs.hands };
  mode = 'multi';
  showScreen('game-screen');
  renderGame();

  const me = G.players.find(p=>p.uid===currentUid);
  const actor = G.players[G.turn];
  if (actor && actor.uid===currentUid && me && !me.folded) {
    showActions(me);
  }
}

window.leaveRoom = async function() {
  if (roomId && isHost) await pkDeleteRoom(roomId);
  cleanupRoom(); showScreen('mode-screen');
};

function cleanupRoom() {
  if (unsubRoom) { unsubRoom(); unsubRoom=null; }
  if (unsubLob)  { unsubLob();  unsubLob=null;  }
  roomId=null; isHost=false; G=null;
}

async function getRoom() {
  if (!roomId) return null;
  const { db } = await import('./firebase.js');
  const { get, ref } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
  const snap = await get(ref(db,`poker_rooms/${roomId}`));
  return snap.exists() ? snap.val() : null;
}

/* ─────────────────────────────────────────────
   UTILS
───────────────────────────────────────────── */
function waitForUser() { return currentUser || null; }

function coinAnim() {
  for (let i=0;i<7;i++) setTimeout(()=>{
    const c=document.createElement('div');
    c.className='coin-fly'; c.textContent='💰';
    c.style.left=(Math.random()*80+10)+'%';
    c.style.top=(Math.random()*40+30)+'%';
    document.body.appendChild(c);
    setTimeout(()=>c.remove(),950);
  },i*110);
}
