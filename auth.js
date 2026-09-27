/* =============================================
   NITTY CASINO — Shared Auth & Helpers
   Loaded on casino.html, admin.html, game pages
   ============================================= */

var ADMIN_USERNAME = 'Nitty';
var SESSION_KEY    = 'nc_session';
var currentUser    = null;

// DB reference — set after Firebase init in each page
var DB;

function initDB() {
  if (!DB) DB = firebase.database();
}

/* ── Get current session username ─────────── */
function getSessionUser() {
  return sessionStorage.getItem(SESSION_KEY);
}

/* ── Load current user from DB ────────────── */
function loadCurrentUser(callback) {
  initDB();
  var username = getSessionUser();
  if (!username) { callback(null); return; }
  DB.ref('users/' + username.toLowerCase()).once('value').then(function(snap) {
    if (!snap.exists()) { sessionStorage.removeItem(SESSION_KEY); callback(null); return; }
    var profile = snap.val();
    if (profile.banned) { sessionStorage.removeItem(SESSION_KEY); callback(null); return; }
    currentUser = profile;
    callback(profile);
  }).catch(function(err) {
    console.error('loadCurrentUser error:', err);
    callback(null);
  });
}

/* ── Logout ────────────────────────────────── */
function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  window.location.href = 'index.html';
}

/* ── Balance display ────────────────────────── */
function refreshBalance(balance) {
  var el = document.getElementById('balance-amount');
  if (el) el.textContent = Number(balance).toLocaleString('en-US');
}

function updateBalance(newBal) {
  if (!currentUser) return Promise.resolve();
  currentUser.balance = newBal;
  refreshBalance(newBal);
  return DB.ref('users/' + currentUser.username.toLowerCase()).update({ balance: newBal });
}

function incrementGames() {
  if (!currentUser) return Promise.resolve();
  var gp = (currentUser.gamesPlayed || 0) + 1;
  currentUser.gamesPlayed = gp;
  return DB.ref('users/' + currentUser.username.toLowerCase()).update({ gamesPlayed: gp });
}

/* ── Leaderboard ─────────────────────────────── */
function buildLeaderboard(users) {
  var el = document.getElementById('leaderboard');
  if (!el) return;
  if (!users || !users.length) {
    el.innerHTML = '<p class="lb-loading">No players yet</p>'; return;
  }
  var medals = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
  el.innerHTML = users.map(function(u, i) {
    return '<div class="leaderboard-item">' +
      '<span class="rank rank-' + Math.min(i+1,3) + '">' + (medals[i]||i+1) + '</span>' +
      '<span class="lb-name">' + u.username + (u.isAdmin?' 👑':'') + '</span>' +
      '<span class="lb-coins">💰 ' + Number(u.balance).toLocaleString('en-US') + '</span>' +
      '</div>';
  }).join('');
}

/* ── Notification ────────────────────────────── */
function showNotification(message) {
  var area = document.getElementById('notification-area') || document.body;
  var el = document.createElement('div');
  el.className = 'system-notification';
  el.innerHTML = '<div class="notif-title">📢 SYSTEM MESSAGE</div>' +
    '<div class="notif-msg">' + message + '</div>' +
    '<button class="notif-close" onclick="this.parentElement.remove()">✕</button>';
  area.appendChild(el);
  setTimeout(function() { if (el.parentElement) el.remove(); }, 9000);
}

/* ── Coin animation ──────────────────────────── */
function coinAnimation() {
  for (var i = 0; i < 8; i++) {
    (function(n) {
      setTimeout(function() {
        var c = document.createElement('div');
        c.className = 'coin-fly'; c.textContent = '💰';
        c.style.left = (Math.random()*80+10)+'%';
        c.style.top  = (Math.random()*40+30)+'%';
        document.body.appendChild(c);
        setTimeout(function(){ c.remove(); }, 950);
      }, n * 110);
    })(i);
  }
}

/* ── Page init (runs on all protected pages) ── */
window.addEventListener('load', function() {
  initDB();
  var path    = window.location.pathname;
  var onIndex = path.endsWith('index.html') || path === '/' || path === '' || path.endsWith('/');

  if (onIndex) return; // index.html handles itself

  loadCurrentUser(function(profile) {
    if (!profile) {
      window.location.href = 'index.html'; return;
    }

    // Admin guard
    if (path.endsWith('admin.html') && !profile.isAdmin) {
      window.location.href = 'casino.html'; return;
    }

    // Nav UI (all pages)
    var nu = document.getElementById('nav-username');
    if (nu) nu.textContent = '👤 ' + profile.username;
    refreshBalance(profile.balance);
    if (profile.isAdmin) {
      var al = document.getElementById('admin-link');
      if (al) al.classList.remove('hidden');
    }

    // Casino page extras
    if (path.endsWith('casino.html')) {
      var wn = document.getElementById('welcome-name');
      if (wn) wn.textContent = profile.username;

      // Live leaderboard
      DB.ref('users').on('value', function(snap) {
        if (!snap.exists()) return;
        var list = Object.values(snap.val())
          .filter(function(u){ return u && u.username && !u.banned && u.username !== '[deleted]'; })
          .sort(function(a,b){ return b.balance - a.balance; })
          .slice(0, 10);
        buildLeaderboard(list);
      });

      // Broadcast
      DB.ref('broadcast').on('value', function(snap) {
        if (!snap.exists()) return;
        var d = snap.val();
        if (d && d.ts && Date.now() - d.ts < 30000) showNotification(d.message);
      });

      // Room counts
      DB.ref('blackjack_rooms').on('value', function(snap) {
        var rooms = snap.exists() ? Object.values(snap.val()).filter(function(r){return r.status==='waiting';}) : [];
        var el = document.getElementById('bj-online');
        if (el) el.textContent = rooms.length + ' room' + (rooms.length!==1?'s':'') + ' open';
      });
      DB.ref('poker_rooms').on('value', function(snap) {
        var rooms = snap.exists() ? Object.values(snap.val()).filter(function(r){return r.status==='waiting';}) : [];
        var el = document.getElementById('pk-online');
        if (el) el.textContent = rooms.length + ' room' + (rooms.length!==1?'s':'') + ' open';
      });
    }
  });
});
