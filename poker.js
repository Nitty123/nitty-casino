/* =============================================
   NITTY CASINO — Texas Hold'em Poker
   Solo vs 3 bots + Multiplayer via Firebase
   ============================================= */

var PK_SUITS  = ['♠','♥','♦','♣'];
var PK_VALS   = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
var PK_RED    = {'♥':1,'♦':1};
var PK_RMAP   = {2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,10:10,J:11,Q:12,K:13,A:14};
var BOT_NAMES = ['🤖 RoboCasey','🤖 Bot Bob','🤖 AI Alice'];
var STREETS   = ['PRE-FLOP','FLOP','TURN','RIVER','SHOWDOWN'];

/* ── Card helpers ────────────────────────────── */
function pkBuild(){ var d=[]; for(var s of PK_SUITS) for(var v of PK_VALS) d.push({s:s,v:v}); return pkShuf(d); }
function pkShuf(a){ for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;} return a; }
function pkCard(c,fd){
  if(fd) return '<div class="card face-down"></div>';
  var col=PK_RED[c.s]?'red':'black';
  return '<div class="card '+col+'"><div class="card-corner-top">'+c.v+c.s+'</div><span>'+c.s+'</span><div class="card-corner-bottom">'+c.v+c.s+'</div></div>';
}

/* ── Hand evaluator ─────────────────────────── */
function pkEval(cards){
  if(!cards||cards.length<2) return {rank:0,name:'High Card'};
  var vals=cards.map(function(c){return PK_RMAP[c.v]||parseInt(c.v);}).sort(function(a,b){return b-a;});
  var suits=cards.map(function(c){return c.s;});
  var freq={};vals.forEach(function(v){freq[v]=(freq[v]||0)+1;});
  var freqs=Object.values(freq).sort(function(a,b){return b-a;});
  var isF=cards.length===5&&suits.every(function(s){return s===suits[0];});
  var isS=cards.length===5&&vals[0]-vals[4]===4&&new Set(vals).size===5;
  if(isS&&isF) return {rank:8,name:vals[0]===14?'Royal Flush':'Straight Flush'};
  if(freqs[0]===4) return {rank:7,name:'Four of a Kind'};
  if(freqs[0]===3&&freqs[1]===2) return {rank:6,name:'Full House'};
  if(isF) return {rank:5,name:'Flush'};
  if(isS) return {rank:4,name:'Straight'};
  if(freqs[0]===3) return {rank:3,name:'Three of a Kind'};
  if(freqs[0]===2&&freqs[1]===2) return {rank:2,name:'Two Pair'};
  if(freqs[0]===2) return {rank:1,name:'One Pair'};
  return {rank:0,name:'High Card'};
}
function pkBestHand(hole,community){
  var all=[].concat(hole,community);
  if(all.length<5) return pkEval(all);
  var best=null;
  pkCombos(all,5).forEach(function(c){var r=pkEval(c);if(!best||r.rank>best.rank)best=r;});
  return best;
}
function pkCombos(arr,k){
  if(k===0)return[[]];if(arr.length<k)return[];
  var f=arr[0],r=arr.slice(1);
  return pkCombos(r,k-1).map(function(c){return[f].concat(c);}).concat(pkCombos(r,k));
}

/* ── State ───────────────────────────────────── */
var PG = null;
var pkMode   = 'solo';
var pkRoomId = null;
var pkIsHost = false;

/* ── Screens ─────────────────────────────────── */
function pkShowScreen(id){
  ['mode-screen','multi-lobby','waiting-room-screen','game-screen'].forEach(function(s){
    var el=document.getElementById(s); if(el) el.classList.add('hidden');
  });
  var t=document.getElementById(id); if(t) t.classList.remove('hidden');
}
function pkShowMode(){ pkCleanup(); pkShowScreen('mode-screen'); }
function pkShowLobby(){ pkShowScreen('multi-lobby'); pkWatchRooms(); }

/* ── Solo vs bots ────────────────────────────── */
function pkStartSolo(){
  if(!currentUser) return;
  pkMode='solo';
  var blind=20, deck=pkBuild();
  PG={
    deck:deck,
    players:[
      {id:'player',name:currentUser.username,balance:currentUser.balance,isBot:false,folded:false,bet:0,allIn:false},
      {id:'bot1',name:BOT_NAMES[0],balance:1000,isBot:true,folded:false,bet:0,allIn:false},
      {id:'bot2',name:BOT_NAMES[1],balance:1000,isBot:true,folded:false,bet:0,allIn:false},
      {id:'bot3',name:BOT_NAMES[2],balance:1000,isBot:true,folded:false,bet:0,allIn:false}
    ],
    hands:{},community:[],pot:0,street:0,dealer:0,turn:3%4,currentBet:blind,log:[],done:false
  };
  PG.players.forEach(function(p){PG.hands[p.id]=[PG.deck.pop(),PG.deck.pop()];});
  PG.players[1].bet=Math.floor(blind/2); PG.players[1].balance-=Math.floor(blind/2);
  PG.players[2].bet=blind;               PG.players[2].balance-=blind;
  PG.pot=blind+Math.floor(blind/2);
  pkLog('--- New Hand --- Blind: '+blind);
  pkShowScreen('game-screen');
  pkRender();
  pkNext();
}

/* ── Game loop ───────────────────────────────── */
function pkNext(){
  if(!PG||PG.done) return;
  var active=PG.players.filter(function(p){return !p.folded&&!p.allIn;});
  if(active.length<=1){pkAdvance();return;}
  var actor=PG.players[PG.turn];
  if(!actor||actor.folded||actor.allIn){pkTurnNext();return;}
  if(actor.isBot) setTimeout(function(){pkBotMove(PG.turn);}, 800+Math.random()*600);
  else { pkRender(); pkShowActions(actor); }
}
function pkTurnNext(){ PG.turn=(PG.turn+1)%PG.players.length; pkNext(); }

function pkAction(action){
  if(!PG) return;
  var me=PG.players.find(function(p){return p.id==='player';});
  if(!me||me.folded) return;
  pkHideActions();
  var toCall=PG.currentBet-me.bet;
  if(action==='fold'){ me.folded=true; pkLog(me.name+' folds'); }
  else if(action==='check'){
    if(toCall>0){pkSetStatus('❌ Must call or fold');pkShowActions(me);return;}
    pkLog(me.name+' checks');
  } else if(action==='call'){
    var amt=Math.min(toCall,me.balance);
    me.balance-=amt;me.bet+=amt;PG.pot+=amt;
    pkLog(me.name+' calls '+amt);
  } else if(action==='raise'){
    var rt=parseInt(document.getElementById('raise-amount').value,10);
    if(!rt||rt<=PG.currentBet){pkSetStatus('❌ Must exceed current bet');pkShowActions(me);return;}
    var diff=rt-me.bet;
    if(diff>me.balance){pkSetStatus('❌ Not enough coins');pkShowActions(me);return;}
    me.balance-=diff;PG.pot+=diff;me.bet=rt;PG.currentBet=rt;
    pkLog(me.name+' raises to '+rt);
  } else if(action==='allin'){
    var a=me.balance;
    me.bet+=a;PG.pot+=a;me.balance=0;
    if(me.bet>PG.currentBet)PG.currentBet=me.bet;
    me.allIn=true;pkLog(me.name+' goes ALL-IN!');
  }
  pkRender(); pkCheckEnd();
}

function pkBotMove(idx){
  if(!PG) return;
  var bot=PG.players[idx];
  if(!bot||bot.folded||bot.allIn){pkTurnNext();return;}
  var str=pkBestHand(PG.hands[bot.id],PG.community);
  var rank=str?str.rank:0;
  var toCall=PG.currentBet-bot.bet;
  var r=Math.random();
  if(rank>=3||r<0.3){
    if(r<0.2&&bot.balance>PG.currentBet*2){
      var rt=PG.currentBet+Math.floor(PG.pot*0.4);
      var diff=Math.min(rt-bot.bet,bot.balance);
      bot.balance-=diff;bot.bet+=diff;PG.pot+=diff;
      PG.currentBet=Math.max(PG.currentBet,bot.bet);
      pkLog(bot.name+' raises to '+bot.bet);
    } else if(toCall>0&&toCall<=bot.balance){
      bot.balance-=toCall;bot.bet+=toCall;PG.pot+=toCall;pkLog(bot.name+' calls '+toCall);
    } else if(toCall===0) pkLog(bot.name+' checks');
    else {bot.folded=true;pkLog(bot.name+' folds');}
  } else if(r<0.6){
    if(toCall===0) pkLog(bot.name+' checks');
    else if(toCall<=bot.balance*0.2){bot.balance-=toCall;bot.bet+=toCall;PG.pot+=toCall;pkLog(bot.name+' calls '+toCall);}
    else {bot.folded=true;pkLog(bot.name+' folds');}
  } else {bot.folded=true;pkLog(bot.name+' folds');}
  pkRender(); pkCheckEnd();
}

function pkCheckEnd(){
  if(!PG) return;
  if(PG.players.filter(function(p){return !p.folded;}).length===1){pkAdvance(true);return;}
  var active=PG.players.filter(function(p){return !p.folded&&!p.allIn;});
  if(active.every(function(p){return p.bet===PG.currentBet;})) pkAdvance();
  else pkTurnNext();
}

function pkAdvance(skip){
  if(!PG) return;
  PG.street++;
  PG.players.forEach(function(p){p.bet=0;});
  PG.currentBet=0;
  PG.turn=(PG.dealer+1)%PG.players.length;
  if(skip||PG.street>=4){pkShowdown();return;}
  if(PG.street===1){PG.community.push(PG.deck.pop(),PG.deck.pop(),PG.deck.pop());pkLog('--- Flop ---');}
  else if(PG.street===2){PG.community.push(PG.deck.pop());pkLog('--- Turn ---');}
  else if(PG.street===3){PG.community.push(PG.deck.pop());pkLog('--- River ---');}
  var sl=document.getElementById('street-label');
  if(sl) sl.textContent=STREETS[PG.street]||'';
  pkRender(); pkNext();
}

function pkShowdown(){
  if(!PG) return;
  PG.done=true;
  var alive=PG.players.filter(function(p){return !p.folded;});
  var winner=null,bestR=-1;
  alive.forEach(function(p){
    var r=pkBestHand(PG.hands[p.id],PG.community);
    pkLog(p.name+': '+(r?r.name:'High Card'));
    if(r&&r.rank>bestR){bestR=r.rank;winner=p;}
  });
  if(!winner) winner=alive[0];
  winner.balance+=PG.pot;
  pkLog('🏆 '+winner.name+' wins '+PG.pot+' coins!');
  PG.pot=0;
  pkRender(true);
  pkSetStatus('🏆 '+winner.name+' wins!');
  if(pkMode==='solo'){
    var me=PG.players.find(function(p){return p.id==='player';});
    if(me){
      var won=winner.id==='player';
      updateBalance(me.balance).then(function(){incrementGames();});
      try{dbLogActivity(won?'win':'lose',currentUser.username+' — Poker — '+(won?'Won':'Lost')+' (pot:'+PG.pot+')');}catch(e){}
      if(won) coinAnimation();
    }
  }
  setTimeout(function(){
    pkSetStatus('');
    if(pkMode==='solo'){
      var me=PG.players.find(function(p){return p.id==='player';});
      if(me&&me.balance>=20) pkStartSolo();
      else{pkSetStatus('💸 Out of coins!');setTimeout(function(){window.location.href='casino.html';},2500);}
    }
  },5000);
}

/* ── Render ──────────────────────────────────── */
function pkRender(showAll){
  if(!PG) return;
  var cc=document.getElementById('community-cards');
  if(cc) cc.innerHTML=PG.community.map(function(c){return pkCard(c,false);}).join('')||
    '<span style="color:rgba(255,255,255,.2);font-size:.82rem;letter-spacing:2px">WAITING FOR FLOP</span>';
  var pe=document.getElementById('pot-display'); if(pe) pe.textContent=PG.pot;
  var seats=document.getElementById('poker-seats');
  if(seats){
    var actor=PG.players[PG.turn];
    seats.innerHTML=PG.players.map(function(p,i){
      var isD=i===PG.dealer, isA=!PG.done&&actor&&p.id===actor.id;
      var hand=PG.hands[p.id]||[];
      var show=(p.id==='player')||showAll;
      var hr=showAll&&!p.folded?pkBestHand(hand,PG.community):null;
      var stTxt='',stCls='';
      if(p.folded){stTxt='FOLD';stCls='fold';}
      else if(p.allIn){stTxt='ALL-IN';stCls='all-in';}
      return '<div class="poker-seat '+(isA?'active-turn':'')+' '+(p.folded?'folded':'')+' '+(p.isBot?'is-bot':'')+'">'+
        (isD?'<div class="dealer-chip">D</div>':'')+
        '<div class="seat-name">'+p.name+'</div>'+
        '<div class="seat-balance">💰 '+p.balance+'</div>'+
        (p.bet>0?'<div class="seat-bet">Bet: '+p.bet+'</div>':'')+
        '<div class="seat-cards">'+(show?hand.map(function(c){return pkCard(c,false);}).join(''):(p.folded?'':hand.map(function(){return pkCard(null,true);}).join('')))+'</div>'+
        (stTxt?'<span class="seat-status '+stCls+'">'+stTxt+'</span>':'')+
        (hr?'<div style="color:var(--gold);font-size:.72rem;margin-top:4px">'+hr.name+'</div>':'')+
        '</div>';
    }).join('');
  }
  var me=PG.players.find(function(p){return p.id==='player';});
  if(me){
    var hole=PG.hands['player']||[];
    var ph=document.getElementById('player-hole-cards');
    if(ph) ph.innerHTML=hole.map(function(c){return pkCard(c,false);}).join('');
    var hr2=document.getElementById('player-hand-rank');
    if(hr2&&PG.community.length>0) hr2.textContent=(pkBestHand(hole,PG.community)||{name:''}).name;
  }
  var logEl=document.getElementById('round-log');
  if(logEl) logEl.innerHTML=PG.log.slice().reverse().slice(0,20).map(function(l){
    return '<p class="'+(l.indexOf('---')===0||l.indexOf('🏆')===0?'highlight':'')+'">'+l+'</p>';
  }).join('');
}
function pkShowActions(p){
  var area=document.getElementById('poker-actions');if(!area)return;
  var toCall=PG.currentBet-p.bet;
  area.style.display='flex';
  document.getElementById('pk-check-btn').disabled=toCall>0;
  document.getElementById('pk-call-btn').disabled=toCall<=0;
  var ca=document.getElementById('call-amount');if(ca)ca.textContent=toCall>0?'('+toCall+')':'';
}
function pkHideActions(){var a=document.getElementById('poker-actions');if(a)a.style.display='none';}
function pkSetStatus(msg){var el=document.getElementById('pk-status-msg');if(el)el.textContent=msg;}
function pkLog(msg){
  if(!PG)return; PG.log.push(msg);
  var logEl=document.getElementById('round-log');
  if(logEl) logEl.innerHTML=PG.log.slice().reverse().slice(0,20).map(function(l){
    return '<p class="'+(l.indexOf('---')===0||l.indexOf('🏆')===0?'highlight':'')+'">'+l+'</p>';
  }).join('');
}

/* ── Multiplayer ─────────────────────────────── */
function pkWatchRooms(){
  pkListenLobbies(function(rooms){
    var list=document.getElementById('pk-rooms-list');if(!list)return;
    if(!rooms||!rooms.length){list.innerHTML='<p class="no-rooms">No open rooms. Create one!</p>';return;}
    list.innerHTML=rooms.map(function(r){
      var cnt=Object.keys(r.players||{}).length;
      return '<div class="room-item">'+
        '<div class="room-info"><div class="room-host">'+r.host+'\'s Table</div>'+
        '<div class="room-meta">Blind: 💰'+r.bet+' | Seats: '+cnt+'/6</div></div>'+
        '<button class="btn-join" onclick="pkJoinUI(\''+r.id+'\')">Join</button></div>';
    }).join('');
  });
}
async function pkCreateRoomUI(){
  if(!currentUser)return;
  var bet=parseInt(document.getElementById('pk-room-bet').value,10);
  var msgEl=document.getElementById('pk-create-msg');msgEl.textContent='';
  if(!bet||bet<10){msgEl.style.color='var(--red)';msgEl.textContent='❌ Min blind is 10';return;}
  if(bet>currentUser.balance){msgEl.style.color='var(--red)';msgEl.textContent='❌ Not enough coins';return;}
  pkMode='multi';pkIsHost=true;
  pkRoomId=await pkCreateRoom(currentUser.username,bet);
  pkEnterWaiting();
}
async function pkJoinUI(id){
  if(!currentUser)return;
  pkMode='multi';pkIsHost=false;pkRoomId=id;
  await pkJoinRoom(pkRoomId,currentUser.username);
  pkEnterWaiting();
}
function pkEnterWaiting(){
  pkShowScreen('waiting-room-screen');
  document.getElementById('room-id-display').textContent='🔑 Room: '+pkRoomId;
  pkListenRoom(pkRoomId,function(room){
    if(!room){pkCleanup();pkShowScreen('mode-screen');return;}
    var players=Object.keys(room.players||{});
    document.getElementById('waiting-players-list').innerHTML=players.map(function(p){
      return '<div class="waiting-player"><span class="pname">👤 '+p+'</span>'+
        '<span class="'+(p===room.host?'ready-badge':'not-ready-badge')+'">'+(p===room.host?'👑 Host':'Waiting')+'</span></div>';
    }).join('');
    var btn=document.getElementById('pk-start-btn');
    if(btn){btn.disabled=!(pkIsHost&&players.length>=2);btn.textContent=players.length<2?'Need more players':'🎮 Start Game';}
    if(room.status==='playing'&&room.gameState) pkInitMulti(room);
  });
}
async function pkStartMulti(){
  if(!pkIsHost||!pkRoomId)return;
  var snap=await firebase.database().ref('poker_rooms/'+pkRoomId).once('value');
  var room=snap.val();if(!room)return;
  var pList=Object.keys(room.players||{});
  var blind=room.bet,deck=pkBuild();
  var gs={
    deck:deck,pot:0,community:[],street:0,dealer:0,currentBet:blind,
    turn:1%pList.length,
    players:pList.map(function(p){return{id:p,name:p,balance:1000,folded:false,bet:0,allIn:false};}),
    hands:Object.fromEntries(pList.map(function(p){return[p,[deck.pop(),deck.pop()]];})),
    log:[],done:false
  };
  gs.players[1%pList.length].bet=Math.floor(blind/2);gs.players[1%pList.length].balance-=Math.floor(blind/2);
  if(pList.length>1){gs.players[2%pList.length].bet=blind;gs.players[2%pList.length].balance-=blind;}
  gs.pot=blind+Math.floor(blind/2);
  await pkUpdateRoom(pkRoomId,{status:'playing',gameState:gs});
}
function pkInitMulti(room){
  PG=Object.assign({},room.gameState);
  pkMode='multi';pkShowScreen('game-screen');pkRender();
  var me=PG.players.find(function(p){return p.id===currentUser.username;});
  var actor=PG.players[PG.turn];
  if(actor&&actor.id===currentUser.username&&me&&!me.folded) pkShowActions(me);
}
async function pkLeave(){
  if(pkRoomId&&pkIsHost) await pkDeleteRoom(pkRoomId);
  pkCleanup();pkShowScreen('mode-screen');
}
function pkCleanup(){pkRoomId=null;pkIsHost=false;PG=null;pkMode='solo';}
