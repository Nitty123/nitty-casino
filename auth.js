/* =============================================
   NITTY CASINO — Auth (no Firebase Auth)
   Username + password stored in Realtime DB
   Session kept in sessionStorage
   ============================================= */

const ADMIN_USERNAME   = 'Nitty';
const STARTING_BALANCE = 1000;
const SESSION_KEY      = 'nc_user';

var currentUser = null;  // full profile object

/* ── Simple hash (password obfuscation) ──── */
function hashPass(str) {
  // djb2 hash → hex string (not cryptographic, but avoids plain text)
  var hash = 5381;
  for (var i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // 32-bit int
  }
  return (hash >>> 0).toString(16);
}

/* ══ TAB SWITCH ════════════════════════════ */
function switchTab(tab) {
  var lf   = document.getElementById('login-form');
  var rf   = document.getElementById('register-form');
  var tabs = document.querySelectorAll('.tab-btn');
  if (tab === 'login') {
    lf.classList.remove('hidden'); rf.classList.add('hidden');
    tabs[0].classList.add('active'); tabs[1].classList.remove('active');
  } else {
    lf.classList.add('hidden'); rf.classList.remove('hidden');
    tabs[0].classList.remove('active'); tabs[1].classList.add('active');
  }
  ['login-error','register-error','register-success'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.textContent = '';
  });
}

/* ══ REGISTER ══════════════════════════════ */
async function handleRegister(e) {
  e.preventDefault();

  var username  = document.getElementById('reg-username').value.trim();
  var password  = document.getElementById('reg-password').value;
  var password2 = document.getElementById('reg-password2').value;
  var errEl     = document.getElementById('register-error');
  var okEl      = document.getElementById('register-success');
  var btn       = document.getElementById('register-btn');

  errEl.textContent = ''; okEl.textContent = '';

  if (username.length < 3)               { errEl.textContent = '❌ Username min 3 chars'; return; }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) { errEl.textContent = '❌ Letters, numbers and _ only'; return; }
  if (password.length < 6)               { errEl.textContent = '❌ Password min 6 chars'; return; }
  if (password !== password2)            { errEl.textContent = '❌ Passwords do not match'; return; }

  btn.disabled = true; btn.textContent = 'Creating...';

  try {
    // Check username taken
    var existing = await dbGetUser(username);
    if (existing) {
      errEl.textContent = '❌ Username already taken';
      btn.disabled = false; btn.textContent = '🎉 Create Account'; return;
    }

    var profile = {
      username:    username,
      password:    hashPass(password),
      balance:     STARTING_BALANCE,
      gamesPlayed: 0,
      banned:      false,
      isAdmin:     username === ADMIN_USERNAME,
      createdAt:   new Date().toISOString()
    };

    await dbCreateUser(profile);
    try { dbLogActivity('register', 'New player: ' + username); } catch(e) {}

    okEl.textContent = '✅ Account created! Logging in...';

    // Auto-login
    sessionStorage.setItem(SESSION_KEY, username);
    setTimeout(function() { window.location.href = 'casino.html'; }, 1000);

  } catch (err) {
    console.error('Register error:', err);
    errEl.textContent = '❌ Could not save account. Check your connection.';
    btn.disabled = false; btn.textContent = '🎉 Create Account';
  }
}

/* ══ LOGIN ═════════════════════════════════ */
async function handleLogin(e) {
  e.preventDefault();

  var username = document.getElementById('login-username').value.trim();
  var password = document.getElementById('login-password').value;
  var errEl    = document.getElementById('login-error');
  var btn      = document.getElementById('login-btn');

  errEl.textContent = '';
  btn.disabled = true; btn.textContent = 'Logging in...';

  try {
    var profile = await dbGetUser(username);

    if (!profile) {
      errEl.textContent = '❌ User not found';
      btn.disabled = false; btn.textContent = '🎲 Enter Casino'; return;
    }
    if (profile.password !== hashPass(password)) {
      errEl.textContent = '❌ Wrong password';
      btn.disabled = false; btn.textContent = '🎲 Enter Casino'; return;
    }
    if (profile.banned) {
      errEl.textContent = '🚫 Your account has been banned';
      btn.disabled = false; btn.textContent = '🎲 Enter Casino'; return;
    }

    sessionStorage.setItem(SESSION_KEY, username);
    try { dbLogActivity('login', username + ' logged in'); } catch(e) {}
    window.location.href = 'casino.html';

  } catch (err) {
    console.error('Login error:', err);
    errEl.textContent = '❌ Connection error. Try again.';
    btn.disabled = false; btn.textContent = '🎲 Enter Casino';
  }
}

/* ══ LOGOUT ════════════════════════════════ */
async function logout() {
  if (currentUser) {
    try { dbLogActivity('login', currentUser.username + ' logged out'); } catch(e) {}
  }
  sessionStorage.removeItem(SESSION_KEY);
  window.location.href = 'index.html';
}

/* ══ BALANCE HELPERS ═══════════════════════ */
function refreshBalance(balance) {
  var el = document.getElementById('balance-amount');
  if (el) el.textContent = Number(balance).toLocaleString('en-US');
}
async function updateBalance(newBal) {
  if (!currentUser) return;
  currentUser.balance = newBal;
  await dbUpdateUser(currentUser.username, { balance: newBal });
  refreshBalance(newBal);
}
async function incrementGames() {
  if (!currentUser) return;
  var gp = (currentUser.gamesPlayed || 0) + 1;
  currentUser.gamesPlayed = gp;
  await dbUpdateUser(currentUser.username, { gamesPlayed: gp });
}

/* ══ LEADERBOARD ═══════════════════════════ */
function buildLeaderboard(users) {
  var el = document.getElementById('leaderboard'); if (!el) return;
  if (!users || !users.length) { el.innerHTML = '<p class="lb-loading">No players yet</p>'; return; }
  var medals = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
  el.innerHTML = users.map(function(u, i) {
    return '<div class="leaderboard-item">' +
      '<span class="rank rank-' + Math.min(i+1,3) + '">' + (medals[i] || i+1) + '</span>' +
      '<span class="lb-name">' + u.username + (u.isAdmin ? ' 👑' : '') + '</span>' +
      '<span class="lb-coins">💰 ' + Number(u.balance).toLocaleString('en-US') + '</span>' +
      '</div>';
  }).join('');
}

/* ══ NOTIFICATION ══════════════════════════ */
function showNotification(message) {
  var area = document.getElementById('notification-area') || document.body;
  var el   = document.createElement('div');
  el.className = 'system-notification';
  el.innerHTML = '<div class="notif-title">📢 SYSTEM MESSAGE</div>' +
    '<div class="notif-msg">' + message + '</div>' +
    '<button class="notif-close" onclick="this.parentElement.remove()">✕</button>';
  area.appendChild(el);
  setTimeout(function() { if (el.parentElement) el.remove(); }, 9000);
}

/* ══ COIN ANIMATION ════════════════════════ */
function coinAnimation() {
  for (var i = 0; i < 8; i++) {
    (function(n) {
      setTimeout(function() {
        var c = document.createElement('div');
        c.className = 'coin-fly'; c.textContent = '💰';
        c.style.left = (Math.random()*80+10) + '%';
        c.style.top  = (Math.random()*40+30) + '%';
        document.body.appendChild(c);
        setTimeout(function() { c.remove(); }, 950);
      }, n * 110);
    })(i);
  }
}

/* ══ PAGE INIT ═════════════════════════════ */
document.addEventListener('DOMContentLoaded', async function() {
  var path    = window.location.pathname;
  var onIndex = path.endsWith('index.html') || path === '/' || path === '' || path.endsWith('/');
  var session = sessionStorage.getItem(SESSION_KEY);

  // No session → send to index (except if already there)
  if (!session) {
    if (!onIndex) { window.location.href = 'index.html'; return; }
    return;
  }

  // Load profile
  var profile;
  try { profile = await dbGetUser(session); } catch(e) {
    console.error('Profile load failed:', e);
    if (!onIndex) { window.location.href = 'index.html'; } return;
  }

  if (!profile) {
    sessionStorage.removeItem(SESSION_KEY);
    if (!onIndex) { window.location.href = 'index.html'; } return;
  }
  if (profile.banned) {
    sessionStorage.removeItem(SESSION_KEY);
    if (onIndex) {
      var bEl = document.getElementById('login-error');
      if (bEl) bEl.textContent = '🚫 Your account has been banned';
    } else {
      window.location.href = 'index.html';
    }
    return;
  }

  currentUser = profile;

  // ── Index → casino redirect
  if (onIndex) { window.location.href = 'casino.html'; return; }

  // ── Admin guard
  if (path.endsWith('admin.html') && !profile.isAdmin) {
    window.location.href = 'casino.html'; return;
  }

  // ── Casino UI
  if (path.endsWith('casino.html')) {
    var nu = document.getElementById('nav-username');
    var wn = document.getElementById('welcome-name');
    if (nu) nu.textContent = '👤 ' + profile.username;
    if (wn) wn.textContent = profile.username;
    refreshBalance(profile.balance);

    if (profile.isAdmin) {
      var al = document.getElementById('admin-link');
      if (al) al.classList.remove('hidden');
    }

    dbListenLeaderboard(buildLeaderboard);
    dbListenBroadcast(function(data) {
      if (data && data.ts && Date.now() - data.ts < 30000) showNotification(data.message);
    });
    bjListenLobbies(function(rooms) {
      var el = document.getElementById('bj-online');
      if (el) el.textContent = rooms.length + ' room' + (rooms.length !== 1 ? 's' : '') + ' open';
    });
    pkListenLobbies(function(rooms) {
      var el = document.getElementById('pk-online');
      if (el) el.textContent = rooms.length + ' room' + (rooms.length !== 1 ? 's' : '') + ' open';
    });
    try { dbLogActivity('login', profile.username + ' entered the casino'); } catch(e) {}
  }

  // ── Game page nav
  if (path.endsWith('blackjack.html') || path.endsWith('poker.html')) {
    var nu2 = document.getElementById('nav-username');
    if (nu2) nu2.textContent = '👤 ' + profile.username;
    refreshBalance(profile.balance);
    if (profile.isAdmin) {
      var al2 = document.getElementById('admin-link');
      if (al2) al2.classList.remove('hidden');
    }
  }
});
