/* =============================================
   NITTY CASINO — Blackjack
   Solo vs dealer bot + Multiplayer via Firebase
   ============================================= */

/* ── Card engine ────────────────────────────── */
var BJ_SUITS  = ['♠','♥','♦','♣'];
var BJ_VALS   = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
var BJ_RED    = {'♥':1,'♦':1};

function bjDeck() {
  var d = [];
  for (var s of BJ_SUITS) for (var v of BJ_VALS) d.push({s:s,v:v});
  return bjShuffle(d);
}
function bjShuffle(a) {
  for (var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}
  return a;
}
function bjVal(c) {
  if ('JQK'.includes(c.v)) return 10;
  if (c.v==='A') return 11;
  return parseInt(c.v);
}
function bjTotal(hand) {
  var t=0,aces=0;
  for (var c of hand){t+=bjVal(c);if(c.v==='A')aces++;}
  while(t>21&&aces>0){t-=10;aces--;}
  return t;
}
function bjBust(h){return bjTotal(h)>21;}
function bjBJ(h){return h.length===2&&bjTotal(h)===21;}

function bjCardHTML(card, fd) {
  if (fd) return '<div class="card face-down"></div>';
  var col = BJ_RED[card.s] ? 'red' : 'black';
  return '<div class="card '+col+'">' +
    '<div class="card-corner-top">'+card.v+card.s+'</div>' +
    '<span>'+card.s+'</span>' +
    '<div class="card-corner-bottom">'+card.v+card.s+'</div>' +
    '</div>';
}

function bjRenderHands(hideDealer) {
  document.getElementById('dealer-hand').innerHTML =
    bj.dealer.map(function(c,i){return bjCardHTML(c, hideDealer&&i===1);}).join('');
  document.getElementById('player-hand').innerHTML =
    bj.player.map(function(c){return bjCardHTML(c,false);}).join('');
  document.getElementById('dealer-score').textContent =
    'Score: ' + (hideDealer ? '?' : bjTotal(bj.dealer));
  document.getElementById('player-score').textContent =
    'Score: ' + bjTotal(bj.player);
}

/* ── State ──────────────────────────────────── */
var bj = { deck:[], dealer:[], player:[], bet:0, active:false };
var bjMode   = 'solo';
var bjRoomId = null;
var bjIsHost = false;

/* ── Screens ────────────────────────────────── */
function bjShowScreen(id) {
  ['mode-screen','multi-lobby','waiting-room-screen','game-screen'].forEach(function(s){
    var el=document.getElementById(s); if(el) el.classList.add('hidden');
  });
  var t=document.getElementById(id); if(t) t.classList.remove('hidden');
}
function showModeScreen() { bjCleanup(); bjShowScreen('mode-screen'); }
function showMultiLobby() { bjShowScreen('multi-lobby'); bjWatchRooms(); }

/* ── Bet chips ───────────────────────────────── */
function addChip(n) {
  if (bj.active||!currentUser) return;
  bj.bet = Math.min(bj.bet+n, currentUser.balance);
  document.getElementById('current-bet-display').textContent = bj.bet;
}
function clearBet() {
  if (bj.active) return;
  bj.bet=0;
  document.getElementById('current-bet-display').textContent = 0;
}

/* ── Solo ───────────────────────────────────── */
function startSolo() {
  bjMode='solo'; bj.bet=0;
  document.getElementById('current-bet-display').textContent=0;
  document.getElementById('bet-bar').style.display='flex';
  bjBtns(false,false,false,true);
  bjClear();
  bjShowScreen('game-screen');
}

function bjDeal() {
  if (!currentUser) return;
  if (bj.bet<=0)               { bjResult('❌ Place a bet first!'); return; }
  if (bj.bet>currentUser.balance){ bjResult('❌ Not enough coins!'); return; }
  bj.deck=bjDeck();
  bj.player=[bj.deck.pop(),bj.deck.pop()];
  bj.dealer=[bj.deck.pop(),bj.deck.pop()];
  bj.active=true;
  bjRenderHands(true);
  bjStatus('','');
  bjResult('');
  bjBtns(true,true,true,false);
  if (bjBJ(bj.player)) bjStand();
}

function bjHit() {
  if (!bj.active) return;
  bj.player.push(bj.deck.pop());
  bjRenderHands(true);
  if (bjBust(bj.player)) bjEndRound('bust');
  else if (bjTotal(bj.player)===21) bjStand();
}

async function bjStand() {
  bjBtns(false,false,false,false);
  bjRenderHands(false);
  await bjWait(500);
  while (bjTotal(bj.dealer)<17) {
    bj.dealer.push(bj.deck.pop());
    bjRenderHands(false);
    await bjWait(600);
  }
  var p=bjTotal(bj.player),d=bjTotal(bj.dealer);
  if (bjBJ(bj.player)&&bjBJ(bj.dealer)) bjEndRound('push');
  else if (bjBJ(bj.player))             bjEndRound('blackjack');
  else if (bjBJ(bj.dealer))             bjEndRound('dealer-bj');
  else if (bjBust(bj.dealer))           bjEndRound('dealer-bust');
  else if (p>d)                         bjEndRound('win');
  else if (p===d)                       bjEndRound('push');
  else                                  bjEndRound('lose');
}

async function bjDouble() {
  if (!bj.active||!currentUser) return;
  if (bj.bet*2>currentUser.balance){ bjResult('❌ Not enough coins!'); return; }
  bj.bet*=2;
  document.getElementById('current-bet-display').textContent=bj.bet;
  bj.player.push(bj.deck.pop());
  bjRenderHands(true);
  if (bjBust(bj.player)){ bjEndRound('bust'); return; }
  await bjStand();
}

async function bjEndRound(outcome) {
  bj.active=false;
  bjRenderHands(false);
  if (!currentUser) return;
  var win=0, txt='', cls='', act='lose';
  if      (outcome==='blackjack')   { win=Math.floor(bj.bet*2.5); txt='🎉 BLACKJACK! +'+win;      cls='win';  act='win'; }
  else if (outcome==='win')         { win=bj.bet*2;               txt='✅ You win! +'+win;          cls='win';  act='win'; }
  else if (outcome==='dealer-bust') { win=bj.bet*2;               txt='💥 Dealer bust! +'+win;     cls='win';  act='win'; }
  else if (outcome==='push')        { win=bj.bet;                 txt='🤝 Push — bet returned';    cls='push'; act='win'; }
  else if (outcome==='bust')        {                              txt='💥 Bust! You lose.';        cls='bust';            }
  else if (outcome==='dealer-bj')   {                              txt='😔 Dealer Blackjack!';     cls='lose';            }
  else                              {                              txt='❌ Dealer wins.';           cls='lose';            }

  bjStatus(txt, cls);
  var newBal = currentUser.balance - bj.bet + win;
  await updateBalance(newBal);
  await incrementGames();
  try { dbLogActivity(act, currentUser.username+' — Blackjack — '+txt+' (bet:'+bj.bet+')'); } catch(e){}
  if (win>bj.bet) coinAnimation();
  bjResult('Bet: '+bj.bet + (win>0 ? ' | Won: '+win+' coins' : ' | No payout'));
  bjBtns(false,false,false,true);
  bj.bet=0;
  document.getElementById('current-bet-display').textContent=0;
}

/* ── Helpers ─────────────────────────────────── */
function bjStatus(txt,cls) {
  var el=document.getElementById('bj-status');
  if(el){ el.textContent=txt; el.className='bj-status '+(cls||''); }
}
function bjResult(txt) {
  var el=document.getElementById('bj-result-msg'); if(el) el.textContent=txt;
}
function bjBtns(hit,stand,dbl,deal) {
  document.getElementById('btn-hit').disabled   =!hit;
  document.getElementById('btn-stand').disabled =!stand;
  document.getElementById('btn-double').disabled=!dbl;
  document.getElementById('btn-deal').disabled  =!deal;
}
function bjClear() {
  ['dealer-hand','player-hand'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.innerHTML='';
  });
  document.getElementById('dealer-score').textContent='—';
  document.getElementById('player-score').textContent='—';
  bjStatus('',''); bjResult('');
}
function bjWait(ms){ return new Promise(function(r){setTimeout(r,ms);}); }

/* ── Multiplayer ─────────────────────────────── */
function bjWatchRooms() {
  bjListenLobbies(function(rooms) {
    var list=document.getElementById('bj-rooms-list'); if(!list) return;
    if(!rooms||!rooms.length){ list.innerHTML='<p class="no-rooms">No open rooms. Create one!</p>'; return; }
    list.innerHTML=rooms.map(function(r){
      var cnt=Object.keys(r.players||{}).length;
      return '<div class="room-item">'+
        '<div class="room-info">'+
          '<div class="room-host">'+r.host+'\'s Room</div>'+
          '<div class="room-meta">Bet: 💰'+r.bet+' | Players: '+cnt+'/4</div>'+
        '</div>'+
        '<button class="btn-join" onclick="bjJoinUI(\''+r.id+'\')">Join</button>'+
        '</div>';
    }).join('');
  });
}

async function createMultiRoom() {
  if (!currentUser) return;
  var bet   = parseInt(document.getElementById('bj-room-bet').value,10);
  var msgEl = document.getElementById('create-room-msg');
  msgEl.textContent='';
  if (!bet||bet<10)              { msgEl.style.color='var(--red)'; msgEl.textContent='❌ Min bet is 10'; return; }
  if (bet>currentUser.balance)   { msgEl.style.color='var(--red)'; msgEl.textContent='❌ Not enough coins'; return; }
  bjMode='multi'; bjIsHost=true;
  bjRoomId = await bjCreateRoom(currentUser.username, bet);
  bjEnterWaiting();
}

async function bjJoinUI(id) {
  if (!currentUser) return;
  bjMode='multi'; bjIsHost=false; bjRoomId=id;
  await bjJoinRoom(bjRoomId, currentUser.username);
  bjEnterWaiting();
}

function bjEnterWaiting() {
  bjShowScreen('waiting-room-screen');
  document.getElementById('room-id-display').textContent = '🔑 Room: '+bjRoomId;
  bjListenRoom(bjRoomId, function(room) {
    if (!room) { bjCleanup(); bjShowScreen('mode-screen'); return; }
    var players = Object.keys(room.players||{});
    document.getElementById('waiting-players-list').innerHTML = players.map(function(p){
      return '<div class="waiting-player">'+
        '<span class="pname">👤 '+p+'</span>'+
        '<span class="'+(p===room.host?'ready-badge':'not-ready-badge')+'">'+(p===room.host?'👑 Host':'Waiting')+'</span>'+
        '</div>';
    }).join('');
    var btn=document.getElementById('start-multi-btn');
    if(btn){
      btn.disabled=!(bjIsHost&&players.length>=2);
      btn.textContent=players.length<2?'Need more players':'🎮 Start Game';
    }
    if (room.status==='playing'&&room.gameState) bjLoadGame(room);
  });
}

async function startMultiGame() {
  if (!bjIsHost||!bjRoomId) return;
  var snap = await firebase.database().ref('blackjack_rooms/'+bjRoomId).once('value');
  var room = snap.val(); if (!room) return;
  var players = Object.keys(room.players||{});
  var deck = bjDeck();
  var gs = {
    deck: deck,
    dealer: [deck.pop(),deck.pop()],
    hands: {}, bets: {}, statuses: {},
    turn: 0, turnOrder: players
  };
  players.forEach(function(p){ gs.hands[p]=[deck.pop(),deck.pop()]; gs.bets[p]=room.bet; gs.statuses[p]='playing'; });
  await bjUpdateRoom(bjRoomId, {status:'playing', gameState: gs});
}

function bjLoadGame(room) {
  bjShowScreen('game-screen');
  document.getElementById('bet-bar').style.display='none';
  var gs=room.gameState;
  var myHand=gs.hands[currentUser.username]||[];
  document.getElementById('dealer-hand').innerHTML=
    gs.dealer.map(function(c,i){return bjCardHTML(c,gs.turn<gs.turnOrder.length&&i===1);}).join('');
  document.getElementById('player-hand').innerHTML=myHand.map(function(c){return bjCardHTML(c,false);}).join('');
  document.getElementById('dealer-score').textContent='Dealer: ?';
  document.getElementById('player-score').textContent='Score: '+bjTotal(myHand);
  var isMyTurn = gs.turnOrder[gs.turn]===currentUser.username;
  var myStatus = gs.statuses[currentUser.username];
  bjStatus(isMyTurn?'🎯 Your turn!':'⏳ Waiting...', isMyTurn?'win':'');
  bjBtns(isMyTurn&&myStatus==='playing', isMyTurn&&myStatus==='playing', false, false);
  document.getElementById('btn-hit').onclick   = bjMultiHit;
  document.getElementById('btn-stand').onclick  = bjMultiStand;
  if (gs.results) bjShowMultiResults(gs.results);
}

async function bjMultiHit() {
  var snap=await firebase.database().ref('blackjack_rooms/'+bjRoomId).once('value');
  var room=snap.val(); if(!room) return;
  var gs=room.gameState;
  gs.hands[currentUser.username].push(gs.deck.pop());
  if (bjBust(gs.hands[currentUser.username])){ gs.statuses[currentUser.username]='bust'; bjAdvTurn(gs); }
  await bjUpdateRoom(bjRoomId,{gameState:gs});
}
async function bjMultiStand() {
  var snap=await firebase.database().ref('blackjack_rooms/'+bjRoomId).once('value');
  var room=snap.val(); if(!room) return;
  var gs=room.gameState;
  gs.statuses[currentUser.username]='stand'; bjAdvTurn(gs);
  await bjUpdateRoom(bjRoomId,{gameState:gs});
}
function bjAdvTurn(gs){
  gs.turn++;
  while(gs.turn<gs.turnOrder.length&&gs.statuses[gs.turnOrder[gs.turn]]!=='playing') gs.turn++;
  if(gs.turn>=gs.turnOrder.length&&bjIsHost) bjResolve(gs);
}
async function bjResolve(gs) {
  while(bjTotal(gs.dealer)<17) gs.dealer.push(gs.deck.pop());
  var dT=bjTotal(gs.dealer), dBust=bjBust(gs.dealer);
  gs.results={};
  gs.turnOrder.forEach(function(p){
    var h=gs.hands[p], pT=bjTotal(h), bet=gs.bets[p]||50;
    if(gs.statuses[p]==='bust')  gs.results[p]={outcome:'lose',payout:0};
    else if(bjBJ(h))             gs.results[p]={outcome:'blackjack',payout:Math.floor(bet*2.5)};
    else if(dBust||pT>dT)        gs.results[p]={outcome:'win',payout:bet*2};
    else if(pT===dT)             gs.results[p]={outcome:'push',payout:bet};
    else                         gs.results[p]={outcome:'lose',payout:0};
  });
  await bjUpdateRoom(bjRoomId,{status:'finished',gameState:gs});
  for (var p of gs.turnOrder) {
    var r=gs.results[p], bet=gs.bets[p]||50;
    var usnap=await firebase.database().ref('users/'+p.toLowerCase()).once('value');
    if(!usnap.exists()) continue;
    var u=usnap.val();
    await firebase.database().ref('users/'+p.toLowerCase()).update({
      balance:(u.balance||0)-bet+r.payout,
      gamesPlayed:(u.gamesPlayed||0)+1
    });
  }
  setTimeout(function(){ bjCleanup(); bjShowScreen('mode-screen'); },5000);
}
function bjShowMultiResults(results) {
  var r=results[currentUser.username];
  if(r) bjStatus(r.outcome==='win'||r.outcome==='blackjack'?'🏆 You Win!':r.outcome==='push'?'🤝 Push':'❌ You Lose',
    r.outcome==='lose'||r.outcome==='bust'?'lose':'win');
}

async function leaveRoom() {
  if(bjRoomId&&bjIsHost) await bjDeleteRoom(bjRoomId);
  bjCleanup(); bjShowScreen('mode-screen');
}
function bjCleanup(){ bjRoomId=null; bjIsHost=false; bjMode='solo'; }
