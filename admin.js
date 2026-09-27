/* =============================================
   NITTY CASINO — Admin Panel
   Uses username as DB key (no Firebase Auth)
   ============================================= */

var allUsers    = [];
var deleteTarget = null;

var adminInitInterval = setInterval(function() {
  if (!currentUser) return;
  clearInterval(adminInitInterval);
  if (currentUser.username !== ADMIN_USERNAME) {
    window.location.href = 'casino.html'; return;
  }
  loadAll();
  dbListenActivity(renderActivityLog);
}, 150);

/* ── Load all users ────────────────────────── */
async function loadAll() {
  allUsers = await dbGetAllUsers();
  renderStats();
  renderUsersTable();
  populateSelects();
}

/* ── Stats cards ───────────────────────────── */
function renderStats() {
  document.getElementById('stat-users').textContent = allUsers.length;
  var totalGames = allUsers.reduce(function(s,u){ return s+(u.gamesPlayed||0); }, 0);
  document.getElementById('stat-games').textContent = totalGames.toLocaleString('en-US');
  var totalCoins = allUsers.reduce(function(s,u){ return s+(u.balance||0); }, 0);
  document.getElementById('stat-coins').textContent = totalCoins.toLocaleString('en-US');
  var sorted = allUsers.slice().sort(function(a,b){ return b.balance-a.balance; });
  document.getElementById('stat-top').textContent = sorted[0] ? sorted[0].username : '—';
}

/* ── Users table ───────────────────────────── */
function renderUsersTable(filter) {
  filter = filter || '';
  var tbody = document.getElementById('users-tbody');
  if (!tbody) return;
  var list = allUsers;
  if (filter) {
    var f = filter.toLowerCase();
    list = list.filter(function(u){ return u.username.toLowerCase().includes(f); });
  }
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-dim);padding:20px">No players found</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(function(u, i) {
    var isAdmin = u.username === ADMIN_USERNAME;
    return '<tr>' +
      '<td>' + (i+1) + '</td>' +
      '<td><strong>' + u.username + '</strong>' + (u.isAdmin ? ' <span style="color:var(--gold);font-size:.74rem">👑 ADMIN</span>' : '') + '</td>' +
      '<td style="color:var(--gold);font-weight:700">💰 ' + Number(u.balance||0).toLocaleString('en-US') + '</td>' +
      '<td style="color:var(--text-dim)">' + (u.gamesPlayed||0) + '</td>' +
      '<td><span class="status-badge ' + (u.banned ? 'status-banned' : 'status-active') + '">' + (u.banned ? '🚫 Banned' : '✅ Active') + '</span></td>' +
      '<td>' + (isAdmin ? '<span style="color:var(--text-dim);font-size:.8rem">—</span>' :
        '<div class="table-actions">' +
        '<button class="tbl-btn tbl-btn-ban" onclick="toggleBan(\'' + u.username + '\')">' + (u.banned ? '✅ Unban' : '🚫 Ban') + '</button>' +
        '<button class="tbl-btn tbl-btn-del" onclick="promptDelete(\'' + u.username + '\')">🗑️ Delete</button>' +
        '</div>') + '</td>' +
      '</tr>';
  }).join('');
}

function filterUsers() {
  renderUsersTable(document.getElementById('user-search').value);
}

/* ── Ban / Unban ───────────────────────────── */
async function toggleBan(username) {
  var user = allUsers.find(function(u){ return u.username === username; });
  if (!user) return;
  user.banned = !user.banned;
  await dbUpdateUser(username, { banned: user.banned });
  await dbLogActivity('admin', 'Nitty ' + (user.banned ? 'banned' : 'unbanned') + ' ' + username);
  await loadAll();
}

/* ── Delete ────────────────────────────────── */
function promptDelete(username) {
  deleteTarget = username;
  document.getElementById('delete-username-display').textContent = 'Player: ' + username;
  document.getElementById('delete-modal').classList.remove('hidden');
}
async function confirmDelete() {
  if (!deleteTarget) return;
  await dbUpdateUser(deleteTarget, { username: '[deleted]', banned: true, balance: 0 });
  await dbLogActivity('admin', 'Nitty deleted player ' + deleteTarget);
  deleteTarget = null;
  document.getElementById('delete-modal').classList.add('hidden');
  await loadAll();
}
function cancelDelete() {
  deleteTarget = null;
  document.getElementById('delete-modal').classList.add('hidden');
}

/* ── Populate selects ──────────────────────── */
function populateSelects() {
  var opts = allUsers
    .filter(function(u){ return u.username !== ADMIN_USERNAME && !u.banned && u.username !== '[deleted]'; })
    .map(function(u){ return '<option value="' + u.username + '">' + u.username + ' (💰' + (u.balance||0) + ')</option>'; })
    .join('');
  var empty = '<option value="">— Select player —</option>';
  ['give-user','reset-user'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.innerHTML = empty + opts;
  });
}

/* ── Give coins ────────────────────────────── */
async function giveCoins() {
  var username = document.getElementById('give-user').value;
  var amount   = parseInt(document.getElementById('give-amount').value, 10);
  var msgEl    = document.getElementById('give-msg');
  msgEl.textContent = '';
  if (!username)         { msgEl.style.color='var(--red)'; msgEl.textContent='❌ Select a player'; return; }
  if (!amount||amount<=0){ msgEl.style.color='var(--red)'; msgEl.textContent='❌ Enter a valid amount'; return; }
  var user = allUsers.find(function(u){ return u.username===username; });
  if (!user) return;
  var newBal = (user.balance||0) + amount;
  await dbUpdateUser(username, { balance: newBal });
  await dbLogActivity('admin', 'Nitty gave ' + amount + ' coins to ' + username);
  msgEl.style.color = 'var(--green)';
  msgEl.textContent = '✅ ' + username + ' received ' + amount + ' coins! New balance: ' + newBal;
  document.getElementById('give-amount').value = '';
  setTimeout(function(){ msgEl.textContent=''; }, 3500);
  await loadAll();
}

/* ── Reset balance ─────────────────────────── */
async function resetBalance() {
  var username = document.getElementById('reset-user').value;
  var amount   = parseInt(document.getElementById('reset-amount').value, 10);
  var msgEl    = document.getElementById('reset-msg');
  msgEl.textContent = '';
  if (!username)            { msgEl.style.color='var(--red)'; msgEl.textContent='❌ Select a player'; return; }
  if (isNaN(amount)||amount<0){ msgEl.style.color='var(--red)'; msgEl.textContent='❌ Invalid amount'; return; }
  await dbUpdateUser(username, { balance: amount });
  await dbLogActivity('admin', 'Nitty reset ' + username + '\'s balance to ' + amount);
  msgEl.style.color = 'var(--green)';
  msgEl.textContent = '✅ ' + username + '\'s balance set to ' + amount;
  setTimeout(function(){ msgEl.textContent=''; }, 3500);
  await loadAll();
}

/* ── Broadcast ─────────────────────────────── */
async function broadcastMessage() {
  var msg    = document.getElementById('broadcast-msg').value.trim();
  var statEl = document.getElementById('broadcast-status');
  if (!msg) { statEl.style.color='var(--red)'; statEl.textContent='❌ Enter a message'; return; }
  await dbSetBroadcast(msg);
  await dbLogActivity('admin', 'Nitty broadcast: "' + msg + '"');
  statEl.style.color = 'var(--green)';
  statEl.textContent = '✅ Message sent to all players!';
  document.getElementById('broadcast-msg').value = '';
  setTimeout(function(){ statEl.textContent=''; }, 4000);
}

/* ── Activity log ──────────────────────────── */
function renderActivityLog(log) {
  var container = document.getElementById('activity-log');
  if (!container) return;
  if (!log || !log.length) {
    container.innerHTML = '<p style="color:var(--text-dim);text-align:center;padding:16px">No activity yet</p>'; return;
  }
  var icons = { win:'🏆', lose:'💸', register:'🆕', login:'👤', admin:'⚙️' };
  container.innerHTML = log.map(function(item) {
    return '<div class="activity-item type-' + item.type + '">' +
      '<span style="font-size:1.1rem">' + (icons[item.type]||'📋') + '</span>' +
      '<span class="activity-text">' + item.text + '</span>' +
      '<span class="activity-time">' + item.time + '</span>' +
      '</div>';
  }).join('');
}
