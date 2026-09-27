/* =============================================
   NITTY CASINO — Firebase DB helpers
   firebase-app.js + firebase-database.js
   must be loaded before this file
   ============================================= */

var firebaseConfig = {
  apiKey:            "AIzaSyC25opJgTxCJacH1r2gS9iaqfYHjGzADus",
  authDomain:        "nitty-casino.firebaseapp.com",
  databaseURL:       "https://nitty-casino-default-rtdb.firebaseio.com",
  projectId:         "nitty-casino",
  storageBucket:     "nitty-casino.firebasestorage.app",
  messagingSenderId: "609501277778",
  appId:             "1:609501277778:web:56871266b5a9a39cf7798b"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Single shared DB reference used everywhere
var DB = firebase.database();

/* ══ USERS ═════════════════════════════════ */
function dbGetUser(username) {
  return DB.ref('users/' + username.toLowerCase()).once('value').then(function(s){
    return s.exists() ? s.val() : null;
  });
}
function dbUpdateUser(username, data) {
  return DB.ref('users/' + username.toLowerCase()).update(data);
}
function dbGetAllUsers() {
  return DB.ref('users').once('value').then(function(s){
    if (!s.exists()) return [];
    return Object.values(s.val()).filter(function(u){ return u && u.username; });
  });
}

/* ══ ACTIVITY ══════════════════════════════ */
function dbLogActivity(type, text) {
  return DB.ref('activity').push({
    type: type, text: text, ts: Date.now(),
    time: new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})
  });
}
function dbListenActivity(cb) {
  DB.ref('activity').on('value', function(s){
    if (!s.exists()) { cb([]); return; }
    cb(Object.values(s.val()).sort(function(a,b){return b.ts-a.ts;}).slice(0,60));
  });
}

/* ══ BROADCAST ═════════════════════════════ */
function dbSetBroadcast(msg) {
  return DB.ref('broadcast').set({ message: msg, ts: Date.now() });
}

/* ══ BLACKJACK ROOMS ═══════════════════════ */
function bjCreateRoom(host, bet) {
  var r = DB.ref('blackjack_rooms').push();
  return r.set({ id:r.key, host:host, bet:bet, status:'waiting', players:{}, createdAt:Date.now() })
          .then(function(){ return r.key; });
}
function bjJoinRoom(roomId, username) {
  return DB.ref('blackjack_rooms/'+roomId+'/players/'+username).set({ username:username });
}
function bjListenRoom(roomId, cb) {
  DB.ref('blackjack_rooms/'+roomId).on('value', function(s){ if(s.exists()) cb(s.val()); });
}
function bjUpdateRoom(roomId, data) { return DB.ref('blackjack_rooms/'+roomId).update(data); }
function bjDeleteRoom(roomId)       { return DB.ref('blackjack_rooms/'+roomId).remove(); }
function bjListenLobbies(cb) {
  DB.ref('blackjack_rooms').on('value', function(s){
    cb(s.exists() ? Object.values(s.val()).filter(function(r){return r.status==='waiting';}) : []);
  });
}

/* ══ POKER ROOMS ═══════════════════════════ */
function pkCreateRoom(host, bet) {
  var r = DB.ref('poker_rooms').push();
  return r.set({ id:r.key, host:host, bet:bet, status:'waiting', players:{}, createdAt:Date.now() })
          .then(function(){ return r.key; });
}
function pkJoinRoom(roomId, username) {
  return DB.ref('poker_rooms/'+roomId+'/players/'+username).set({ username:username });
}
function pkListenRoom(roomId, cb) {
  DB.ref('poker_rooms/'+roomId).on('value', function(s){ if(s.exists()) cb(s.val()); });
}
function pkUpdateRoom(roomId, data) { return DB.ref('poker_rooms/'+roomId).update(data); }
function pkDeleteRoom(roomId)       { return DB.ref('poker_rooms/'+roomId).remove(); }
function pkListenLobbies(cb) {
  DB.ref('poker_rooms').on('value', function(s){
    cb(s.exists() ? Object.values(s.val()).filter(function(r){return r.status==='waiting';}) : []);
  });
}
