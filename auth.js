/* =============================================
   NITTY CASINO — Auth & Session (Firebase)
   ============================================= */

import {
  fbRegister, fbLogin, fbLogout, fbOnAuthChange,
  dbCreateUser, dbGetUser, dbGetUserByUsername,
  dbUpdateUser, dbLogActivity, dbListenLeaderboard,
  dbSetBroadcast, dbListenBroadcast, dbSetOnline,
  bjListenLobbies, pkListenLobbies
} from './firebase.js';

export const ADMIN_USERNAME   = 'Nitty';
export const STARTING_BALANCE = 1000;

/* ── Session state ─────────────────────────── */
export let currentUser = null;
export let currentUid  = null;

/* ── Tab switching ─────────────────────────── */
window.switchTab = function(tab) {
  const loginForm    = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const tabs         = document.querySelectorAll('.tab-btn');

  if (tab === 'login') {
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    tabs[0].classList.add('active');
    tabs[1].classList.remove('active');
  } else {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
    tabs[0].classList.remove('active');
    tabs[1].classList.add('active');
  }
  ['login-error','register-error','register-success'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });
};

/* ── Register ──────────────────────────────── */
window.handleRegister = async function(e) {
  e.preventDefault();

  const username  = document.getElementById('reg-username').value.trim();
  const email     = document.getElementById('reg-email').value.trim().toLowerCase();
  const password  = document.getElementById('reg-password').value;
  const password2 = document.getElementById('reg-password2').value;
  const errorEl   = document.getElementById('register-error');
  const successEl = document.getElementById('register-success');
  const btn       = document.getElementById('register-btn');

  errorEl.textContent  = '';
  successEl.textContent = '';

  // Client-side validation
  if (username.length < 3) {
    errorEl.textContent = '❌ Username must be at least 3 characters'; return;
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    errorEl.textContent = '❌ Username can only contain letters, numbers and _'; return;
  }
  if (password !== password2) {
    errorEl.textContent = '❌ Passwords do not match'; return;
  }
  if (password.length < 6) {
    errorEl.textContent = '❌ Password must be at least 6 characters'; return;
  }

  btn.disabled    = true;
  btn.textContent = 'Creating account...';

  try {
    // 1. Create Firebase Auth user first
    const cred = await fbRegister(email, password);
    const uid  = cred.user.uid;

    // 2. Now we are authenticated — check username uniqueness via DB
    const existing = await dbGetUserByUsername(username);
    if (existing) {
      // Username taken — delete the just-created auth user and bail
      await cred.user.delete();
      errorEl.textContent = '❌ Username already taken';
      btn.disabled    = false;
      btn.textContent = '🎉 Create Account';
      return;
    }

    // 3. Write profile to Realtime DB
    const profile = {
      username,
      email,
      balance:     STARTING_BALANCE,
      gamesPlayed: 0,
      banned:      false,
      isAdmin:     username === ADMIN_USERNAME,
      createdAt:   new Date().toISOString()
    };

    await dbCreateUser(uid, profile);
    await dbLogActivity('register', `New player joined: ${username}`);

    successEl.textContent = '✅ Account created! Entering casino...';
    // onAuthStateChanged will fire and redirect automatically

  } catch (err) {
    console.error('Register error:', err);
    errorEl.textContent = '❌ ' + friendlyError(err.code);
    btn.disabled    = false;
    btn.textContent = '🎉 Create Account';
  }
};

/* ── Login ─────────────────────────────────── */
window.handleLogin = async function(e) {
  e.preventDefault();

  const usernameInput = document.getElementById('login-username').value.trim();
  const password      = document.getElementById('login-password').value;
  const errorEl       = document.getElementById('login-error');
  const btn           = document.getElementById('login-btn');

  errorEl.textContent = '';
  btn.disabled    = true;
  btn.textContent = 'Logging in...';

  try {
    // Step 1: sign in with a temp anonymous-like approach
    // We need email for Firebase Auth — use a hidden lookup trick:
    // Try to sign in with username@nitty-casino.placeholder and catch,
    // OR we store a username→email index in DB readable without auth.
    // Solution: we store emails in a public index node.
    const email = await getUserEmail(usernameInput);
    if (!email) {
      errorEl.textContent = '❌ User not found';
      btn.disabled = false; btn.textContent = '🎲 Enter Casino'; return;
    }

    await fbLogin(email, password);
    // onAuthStateChanged handles redirect

  } catch (err) {
    console.error('Login error:', err);
    errorEl.textContent = '❌ ' + friendlyError(err.code);
    btn.disabled    = false;
    btn.textContent = '🎲 Enter Casino';
  }
};

/* ── Get email from public username index ───── */
async function getUserEmail(username) {
  // We store a public username→email map that is readable without auth
  const { db } = await import('./firebase.js');
  const { get, ref } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
  const snap = await get(ref(db, `usernames/${username.toLowerCase()}`));
  return snap.exists() ? snap.val() : null;
}

/* ── Logout ────────────────────────────────── */
window.logout = async function() {
  if (currentUser) await dbLogActivity('login', `${currentUser.username} logged out`);
  await fbLogout();
  window.location.href = 'index.html';
};

/* ── Error messages ─────────────────────────── */
function friendlyError(code) {
  const map = {
    'auth/email-already-in-use':   'Email already in use',
    'auth/invalid-email':          'Invalid email address',
    'auth/weak-password':          'Password too weak (min 6 characters)',
    'auth/user-not-found':         'Incorrect username or password',
    'auth/wrong-password':         'Incorrect password',
    'auth/invalid-credential':     'Incorrect username or password',
    'auth/too-many-requests':      'Too many attempts. Try again later',
    'auth/network-request-failed': 'Network error. Check your connection',
  };
  return map[code] || `Something went wrong (${code})`;
}

/* ── Refresh balance display ─────────────────── */
export function refreshBalance(balance) {
  const el = document.getElementById('balance-amount');
  if (el) el.textContent = Number(balance).toLocaleString('en-US');
}

/* ── Update balance in DB ────────────────────── */
export async function updateBalance(newBalance) {
  if (!currentUid) return;
  currentUser.balance = newBalance;
  await dbUpdateUser(currentUid, { balance: newBalance });
  refreshBalance(newBalance);
}

/* ── Increment games played ──────────────────── */
export async function incrementGames() {
  if (!currentUid) return;
  const gp = (currentUser.gamesPlayed || 0) + 1;
  currentUser.gamesPlayed = gp;
  await dbUpdateUser(currentUid, { gamesPlayed: gp });
}

/* ── Leaderboard ─────────────────────────────── */
function buildLeaderboard(users) {
  const container = document.getElementById('leaderboard');
  if (!container) return;

  if (!users || users.length === 0) {
    container.innerHTML = '<p class="lb-loading">No players yet</p>';
    return;
  }

  const medals = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
  container.innerHTML = users.map((u, i) => `
    <div class="leaderboard-item">
      <span class="rank rank-${Math.min(i+1,3)}">${medals[i] || (i+1)}</span>
      <span class="lb-name">${u.username}${u.isAdmin ? ' 👑' : ''}</span>
      <span class="lb-coins">💰 ${Number(u.balance).toLocaleString('en-US')}</span>
    </div>
  `).join('');
}

/* ── System notification ────────────────────── */
export function showNotification(message) {
  const area = document.getElementById('notification-area') || document.body;
  const el   = document.createElement('div');
  el.className = 'system-notification';
  el.innerHTML = `
    <div class="notif-title">📢 SYSTEM MESSAGE</div>
    <div class="notif-msg">${message}</div>
    <button class="notif-close" onclick="this.parentElement.remove()">✕</button>
  `;
  area.appendChild(el);
  setTimeout(() => { if (el.parentElement) el.remove(); }, 9000);
}

/* ── Coin animation ─────────────────────────── */
export function coinAnimation() {
  for (let i = 0; i < 8; i++) {
    setTimeout(() => {
      const c = document.createElement('div');
      c.className  = 'coin-fly';
      c.textContent = '💰';
      c.style.left = (Math.random() * 80 + 10) + '%';
      c.style.top  = (Math.random() * 40 + 30) + '%';
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 950);
    }, i * 110);
  }
}

/* ── Auth state listener ─────────────────────── */
fbOnAuthChange(async (firebaseUser) => {
  const path = window.location.pathname;

  if (!firebaseUser) {
    // Not logged in — redirect to index unless already there
    const onIndex = path.endsWith('index.html') || path === '/' || path.endsWith('/');
    if (!onIndex) window.location.href = 'index.html';
    return;
  }

  // Load profile
  const profile = await dbGetUser(firebaseUser.uid);
  if (!profile) {
    // Auth user exists but no DB profile — sign out
    await fbLogout();
    window.location.href = 'index.html';
    return;
  }

  if (profile.banned) {
    await fbLogout();
    const el = document.getElementById('login-error');
    if (el) el.textContent = '🚫 Your account has been banned';
    return;
  }

  currentUid  = firebaseUser.uid;
  currentUser = { uid: firebaseUser.uid, ...profile };

  dbSetOnline(currentUid);

  // Index page → go to casino
  const onIndex = path.endsWith('index.html') || path === '/' || path.endsWith('/');
  if (onIndex) {
    window.location.href = 'casino.html';
    return;
  }

  // Admin page → check permission
  if (path.endsWith('admin.html') && !profile.isAdmin) {
    window.location.href = 'casino.html';
    return;
  }

  // Casino page → init UI
  if (path.endsWith('casino.html')) {
    const navUser     = document.getElementById('nav-username');
    const welcomeName = document.getElementById('welcome-name');
    if (navUser)      navUser.textContent     = '👤 ' + profile.username;
    if (welcomeName)  welcomeName.textContent  = profile.username;
    refreshBalance(profile.balance);

    if (profile.isAdmin) {
      const adminLink = document.getElementById('admin-link');
      if (adminLink) adminLink.classList.remove('hidden');
    }

    dbListenLeaderboard(buildLeaderboard);

    dbListenBroadcast((data) => {
      if (data && data.ts && Date.now() - data.ts < 30000) showNotification(data.message);
    });

    listenOnlineCounts();
    await dbLogActivity('login', `${profile.username} entered the casino`);
  }

  // Game pages → init nav
  if (path.endsWith('blackjack.html') || path.endsWith('poker.html')) {
    const navUser = document.getElementById('nav-username');
    if (navUser) navUser.textContent = '👤 ' + profile.username;
    refreshBalance(profile.balance);

    if (profile.isAdmin) {
      const adminLink = document.getElementById('admin-link');
      if (adminLink) adminLink.classList.remove('hidden');
    }
  }
});

/* ── Live room counts ────────────────────────── */
function listenOnlineCounts() {
  bjListenLobbies(rooms => {
    const el = document.getElementById('bj-online');
    if (el) el.textContent = `${rooms.length} room${rooms.length !== 1 ? 's' : ''} open`;
  });
  pkListenLobbies(rooms => {
    const el = document.getElementById('pk-online');
    if (el) el.textContent = `${rooms.length} room${rooms.length !== 1 ? 's' : ''} open`;
  });
}
