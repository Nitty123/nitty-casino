/* =============================================
   NITTY CASINO — Firebase Realtime DB only
   No Firebase Auth — username + password login
   ============================================= */

const firebaseConfig = {
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

const _db = firebase.database();

/* ══ USERS ═════════════════════════════════ */

// Create a new user record
function dbCreateUser(data) {
  // Use username (lowercased) as the key so lookups are O(1)
  return _db.ref('users/' + data.username.toLowerCase()).set(data);
}

// Get user by username
async function dbGetUser(username) {
  var snap = await _db.ref('users/' + username.toLowerCase()).once('value');
  return snap.exists() ? snap.val() : null;
}

// Update user fields
function dbUpdateUser(username, data) {
  return _db.ref('users/' + username.toLowerCase()).update(data);
}

// Get all users (for admin panel)
async function dbGetAllUsers() {
  var snap = await _db.ref('users').once('value');
  if (!snap.exists()) return [];
  return Object.values(snap.val()).filter(function(u){ return u && u.username; });
}

/* ══ ACTIVITY ══════════════════════════════ */
function dbLogActivity(type, text) {
  return _db.ref('activity').push({
    type: type,
    text: text,
    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    ts:   Date.now()
  });
}
function dbListenActivity(cb) {
  _db.ref('activity').on('value', function(snap) {
    if (!snap.exists()) { cb([]); return; }
    var items = Object.values(snap.val()).sort(function(a,b){ return b.ts - a.ts; }).slice(0, 60);
    cb(items);
  });
}

/* ══ LEADERBOARD ═══════════════════════════ */
function dbListenLeaderboard(cb) {
  _db.ref('users').on('value', function(snap) {
    if (!snap.exists()) { cb([]); return; }
    var list = Object.values(snap.val())
      .filter(function(u) { return u && u.username && !u.banned && u.username !== '[deleted]'; })
      .sort(function(a, b) { return b.balance - a.balance; })
      .slice(0, 10);
    cb(list);
  });
}

/* ══ BROADCAST ═════════════════════════════ */
function dbSetBroadcast(msg) {
  return _db.ref('broadcast').set({ message: msg, ts: Date.now() });
}
function dbListenBroadcast(cb) {
  _db.ref('broadcast').on('value', function(snap) { if (snap.exists()) cb(snap.val()); });
}

/* ══ BLACKJACK ROOMS ═══════════════════════ */
function bjCreateRoom(hostUsername, bet) {
  var ref = _db.ref('blackjack_rooms').push();
  var id  = ref.key;
  return ref.set({
    id: id, host: hostUsername, bet: bet, status: 'waiting',
    players: {},
    createdAt: Date.now()
  }).then(function() { return id; });
}
function bjJoinRoom(roomId, username) {
  return _db.ref('blackjack_rooms/' + roomId + '/players/' + username).set({ username: username });
}
function bjListenRoom(roomId, cb) {
  _db.ref('blackjack_rooms/' + roomId).on('value', function(snap) { if (snap.exists()) cb(snap.val()); });
}
function bjUpdateRoom(roomId, data) {
  return _db.ref('blackjack_rooms/' + roomId).update(data);
}
function bjDeleteRoom(roomId) {
  return _db.ref('blackjack_rooms/' + roomId).remove();
}
function bjListenLobbies(cb) {
  _db.ref('blackjack_rooms').on('value', function(snap) {
    if (!snap.exists()) { cb([]); return; }
    cb(Object.values(snap.val()).filter(function(r) { return r.status === 'waiting'; }));
  });
}

/* ══ POKER ROOMS ═══════════════════════════ */
function pkCreateRoom(hostUsername, bet) {
  var ref = _db.ref('poker_rooms').push();
  var id  = ref.key;
  return ref.set({
    id: id, host: hostUsername, bet: bet, status: 'waiting',
    players: {},
    createdAt: Date.now()
  }).then(function() { return id; });
}
function pkJoinRoom(roomId, username) {
  return _db.ref('poker_rooms/' + roomId + '/players/' + username).set({ username: username });
}
function pkListenRoom(roomId, cb) {
  _db.ref('poker_rooms/' + roomId).on('value', function(snap) { if (snap.exists()) cb(snap.val()); });
}
function pkUpdateRoom(roomId, data) {
  return _db.ref('poker_rooms/' + roomId).update(data);
}
function pkDeleteRoom(roomId) {
  return _db.ref('poker_rooms/' + roomId).remove();
}
function pkListenLobbies(cb) {
  _db.ref('poker_rooms').on('value', function(snap) {
    if (!snap.exists()) { cb([]); return; }
    cb(Object.values(snap.val()).filter(function(r) { return r.status === 'waiting'; }));
  });
}
