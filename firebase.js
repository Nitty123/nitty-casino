/* =============================================
   NITTY CASINO — Firebase Config & DB Helpers
   ============================================= */

import { initializeApp }   from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics }    from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, set, get, update, push, onValue, off, remove, serverTimestamp, onDisconnect }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey:            "AIzaSyC25opJgTxCJacH1r2gS9iaqfYHjGzADus",
  authDomain:        "nitty-casino.firebaseapp.com",
  databaseURL:       "https://nitty-casino-default-rtdb.firebaseio.com",
  projectId:         "nitty-casino",
  storageBucket:     "nitty-casino.firebasestorage.app",
  messagingSenderId: "609501277778",
  appId:             "1:609501277778:web:56871266b5a9a39cf7798b",
  measurementId:     "G-XP8ZLV0GR1"
};

const app       = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth      = getAuth(app);
const db        = getDatabase(app);

/* ─── Auth helpers ─────────────────────────────────────────────── */

async function fbRegister(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

async function fbLogin(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

async function fbLogout() {
  return signOut(auth);
}

function fbOnAuthChange(callback) {
  onAuthStateChanged(auth, callback);
}

/* ─── User profile in DB ───────────────────────────────────────── */

async function dbCreateUser(uid, data) {
  // Write profile
  await set(ref(db, `users/${uid}`), data);
  // Write public username→email index (readable without auth for login lookup)
  await set(ref(db, `usernames/${data.username.toLowerCase()}`), data.email);
}

async function dbGetUser(uid) {
  const snap = await get(ref(db, `users/${uid}`));
  return snap.exists() ? snap.val() : null;
}

async function dbGetUserByUsername(username) {
  const snap = await get(ref(db, 'users'));
  if (!snap.exists()) return null;
  const all = snap.val();
  const uid = Object.keys(all).find(k => all[k].username.toLowerCase() === username.toLowerCase());
  return uid ? { uid, ...all[uid] } : null;
}

async function dbUpdateUser(uid, data) {
  return update(ref(db, `users/${uid}`), data);
}

async function dbGetAllUsers() {
  const snap = await get(ref(db, 'users'));
  if (!snap.exists()) return [];
  const val = snap.val();
  return Object.entries(val).map(([uid, u]) => ({ uid, ...u }));
}

/* ─── Activity log ─────────────────────────────────────────────── */

function dbLogActivity(type, text) {
  const logRef = push(ref(db, 'activity'));
  return set(logRef, {
    type,
    text,
    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    ts: Date.now()
  });
}

function dbListenActivity(callback) {
  const r = ref(db, 'activity');
  onValue(r, snap => {
    if (!snap.exists()) { callback([]); return; }
    const items = Object.values(snap.val()).sort((a, b) => b.ts - a.ts).slice(0, 50);
    callback(items);
  });
  return () => off(r);
}

/* ─── Leaderboard ──────────────────────────────────────────────── */

function dbListenLeaderboard(callback) {
  const r = ref(db, 'users');
  onValue(r, snap => {
    if (!snap.exists()) { callback([]); return; }
    const users = Object.entries(snap.val())
      .map(([uid, u]) => ({ uid, ...u }))
      .filter(u => !u.banned)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 10);
    callback(users);
  });
  return () => off(r);
}

/* ─── Broadcast ────────────────────────────────────────────────── */

async function dbSetBroadcast(message) {
  return set(ref(db, 'broadcast'), { message, ts: Date.now() });
}

function dbListenBroadcast(callback) {
  const r = ref(db, 'broadcast');
  onValue(r, snap => { if (snap.exists()) callback(snap.val()); });
  return () => off(r);
}

/* ─── Blackjack rooms ──────────────────────────────────────────── */

async function bjCreateRoom(hostUid, hostName, bet) {
  const roomRef = push(ref(db, 'blackjack_rooms'));
  const roomId  = roomRef.key;
  await set(roomRef, {
    id: roomId,
    host: hostUid,
    hostName,
    bet,
    status: 'waiting',      // waiting | playing | finished
    players: { [hostUid]: { name: hostName, uid: hostUid, ready: false } },
    createdAt: Date.now()
  });
  return roomId;
}

async function bjJoinRoom(roomId, uid, name) {
  return update(ref(db, `blackjack_rooms/${roomId}/players/${uid}`), { name, uid, ready: false });
}

function bjListenRoom(roomId, callback) {
  const r = ref(db, `blackjack_rooms/${roomId}`);
  onValue(r, snap => { if (snap.exists()) callback(snap.val()); });
  return () => off(r);
}

async function bjUpdateRoom(roomId, data) {
  return update(ref(db, `blackjack_rooms/${roomId}`), data);
}

async function bjDeleteRoom(roomId) {
  return remove(ref(db, `blackjack_rooms/${roomId}`));
}

function bjListenLobbies(callback) {
  const r = ref(db, 'blackjack_rooms');
  onValue(r, snap => {
    if (!snap.exists()) { callback([]); return; }
    const rooms = Object.values(snap.val()).filter(r => r.status === 'waiting');
    callback(rooms);
  });
  return () => off(r);
}

/* ─── Poker rooms ──────────────────────────────────────────────── */

async function pkCreateRoom(hostUid, hostName, bet) {
  const roomRef = push(ref(db, 'poker_rooms'));
  const roomId  = roomRef.key;
  await set(roomRef, {
    id: roomId,
    host: hostUid,
    hostName,
    bet,
    status: 'waiting',
    players: { [hostUid]: { name: hostName, uid: hostUid, ready: false } },
    createdAt: Date.now()
  });
  return roomId;
}

async function pkJoinRoom(roomId, uid, name) {
  return update(ref(db, `poker_rooms/${roomId}/players/${uid}`), { name, uid, ready: false });
}

function pkListenRoom(roomId, callback) {
  const r = ref(db, `poker_rooms/${roomId}`);
  onValue(r, snap => { if (snap.exists()) callback(snap.val()); });
  return () => off(r);
}

async function pkUpdateRoom(roomId, data) {
  return update(ref(db, `poker_rooms/${roomId}`), data);
}

async function pkDeleteRoom(roomId) {
  return remove(ref(db, `poker_rooms/${roomId}`));
}

function pkListenLobbies(callback) {
  const r = ref(db, 'poker_rooms');
  onValue(r, snap => {
    if (!snap.exists()) { callback([]); return; }
    const rooms = Object.values(snap.val()).filter(r => r.status === 'waiting');
    callback(rooms);
  });
  return () => off(r);
}

/* ─── Presence (online status) ─────────────────────────────────── */

function dbSetOnline(uid) {
  const presRef = ref(db, `presence/${uid}`);
  set(presRef, { online: true, ts: Date.now() });
  onDisconnect(presRef).set({ online: false, ts: serverTimestamp() });
}

/* ─── Export everything ─────────────────────────────────────────── */
export {
  auth, db,
  fbRegister, fbLogin, fbLogout, fbOnAuthChange,
  dbCreateUser, dbGetUser, dbGetUserByUsername, dbUpdateUser, dbGetAllUsers,
  dbLogActivity, dbListenActivity,
  dbListenLeaderboard,
  dbSetBroadcast, dbListenBroadcast,
  bjCreateRoom, bjJoinRoom, bjListenRoom, bjUpdateRoom, bjDeleteRoom, bjListenLobbies,
  pkCreateRoom, pkJoinRoom, pkListenRoom, pkUpdateRoom, pkDeleteRoom, pkListenLobbies,
  dbSetOnline
};
