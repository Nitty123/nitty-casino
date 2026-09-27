/* =============================================
   NITTY CASINO — Admin Panel (Firebase)
   ============================================= */

import {
  dbGetAllUsers, dbUpdateUser, dbLogActivity,
  dbListenActivity, dbSetBroadcast
} from './firebase.js';
import { currentUser, currentUid, ADMIN_USERNAME } from './auth.js';

let allUsers    = [];
let deleteUid   = null;
let deleteUname = null;
let unsubActivity = null;

/* ── Init ──────────────────────────────────── */
// Wait for auth to set currentUser, then init
const initInterval = setInterval(async () => {
  if (!currentUser) return;
  clearInterval(initInterval);

  if (currentUser.username !== ADMIN_USERNAME) {
    window.location.href = 'casino.html';
    return;
  }

  await loadAll();
  startActivityListener();
}, 200);

async function loadAll() {
  allUsers = await dbGetAllUsers();
  renderStats();
  renderUsersTable();
  populateSelects();
}

/* ── Stats ─────────────────────────────────── */
function renderStats() {
  document.getElementById('stat-users').textContent  = allUsers.length;

  const totalGames = allUsers.reduce((s, u) => s + (u.gamesPlayed || 0), 0);
  document.getElementById('stat-games').textContent  = totalGames.toLocaleString('en-US');

  const totalCoins = allUsers.reduce((s, u) => s + (u.balance || 0), 0);
  document.getElementById('stat-coins').textContent  = totalCoins.toLocaleString('en-US');

  const top = [...allUsers].sort((a, b) => b.balance - a.balance)[0];
  document.getElementById('stat-top').textContent    = top ? top.username : '—';
}

/* ── Users Table ───────────────────────────── */
function renderUsersTable(filter = '') {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;

  let list = allUsers;
  if (filter) {
    const f = filter.toLowerCase();
    list = list.filter(u => u.username.toLowerCase().includes(f) || (u.email || '').toLowerCase().includes(f));
  }

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-dim);padding:20px">No players found</td></tr>';
    return;
  }

  tbody.innerHTML = list.map((u, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>
        <strong>${u.username}</strong>
        ${u.isAdmin ? ' <span style="color:var(--gold);font-size:.74rem">👑 ADMIN</span>' : ''}
      </td>
      <td style="color:var(--text-dim);font-size:.84rem">${u.email || '—'}</td>
      <td style="color:var(--gold);font-weight:700">💰 ${Number(u.balance || 0).toLocaleString('en-US')}</td>
      <td style="color:var(--text-dim)">${u.gamesPlayed || 0}</td>
      <td>
        <span class="status-badge ${u.banned ? 'status-banned' : 'status-active'}">
          ${u.banned ? '🚫 Banned' : '✅ Active'}
        </span>
      </td>
      <td>
        ${u.username !== ADMIN_USERNAME ? `
          <div class="table-actions">
            <button class="tbl-btn tbl-btn-ban" onclick="toggleBan('${u.uid}','${u.username}')">
              ${u.banned ? '✅ Unban' : '🚫 Ban'}
            </button>
            <button class="tbl-btn tbl-btn-del" onclick="promptDelete('${u.uid}','${u.username}')">
              🗑️ Delete
            </button>
          </div>
        ` : '<span style="color:var(--text-dim);font-size:.8rem">—</span>'}
      </td>
    </tr>
  `).join('');
}

window.filterUsers = function() {
  renderUsersTable(document.getElementById('user-search').value);
};

/* ── Toggle Ban ────────────────────────────── */
window.toggleBan = async function(uid, username) {
  const user = allUsers.find(u => u.uid === uid);
  if (!user) return;
  user.banned = !user.banned;
  await dbUpdateUser(uid, { banned: user.banned });
  const action = user.banned ? 'banned' : 'unbanned';
  await dbLogActivity('admin', `Nitty ${action} player ${username}`);
  await loadAll();
};

/* ── Delete ────────────────────────────────── */
window.promptDelete = function(uid, username) {
  deleteUid   = uid;
  deleteUname = username;
  document.getElementById('delete-username-display').textContent = `Player: ${username}`;
  document.getElementById('delete-modal').classList.remove('hidden');
};

window.confirmDelete = async function() {
  if (!deleteUid) return;
  // Firebase Auth user deletion requires Admin SDK — we just mark as banned & wipe data
  await dbUpdateUser(deleteUid, { banned: true, username: `[deleted]`, balance: 0, email: '' });
  await dbLogActivity('admin', `Nitty deleted player ${deleteUname}`);
  deleteUid = deleteUname = null;
  document.getElementById('delete-modal').classList.add('hidden');
  await loadAll();
};

window.cancelDelete = function() {
  deleteUid = deleteUname = null;
  document.getElementById('delete-modal').classList.add('hidden');
};

/* ── Populate Selects ──────────────────────── */
function populateSelects() {
  const non = allUsers.filter(u => u.username !== ADMIN_USERNAME && !u.banned);
  const opts = non.map(u => `<option value="${u.uid}" data-name="${u.username}">${u.username} (💰${u.balance})</option>`).join('');
  const empty = '<option value="">— Select player —</option>';
  ['give-user', 'reset-user'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = empty + opts;
  });
}

/* ── Give Coins ────────────────────────────── */
window.giveCoins = async function() {
  const sel    = document.getElementById('give-user');
  const uid    = sel.value;
  const amount = parseInt(document.getElementById('give-amount').value, 10);
  const msgEl  = document.getElementById('give-msg');
  msgEl.textContent = '';

  if (!uid)             { msgEl.style.color='var(--red)'; msgEl.textContent='❌ Select a player'; return; }
  if (!amount || amount<=0) { msgEl.style.color='var(--red)'; msgEl.textContent='❌ Enter a valid amount'; return; }

  const user = allUsers.find(u => u.uid === uid);
  if (!user) return;

  const newBal = (user.balance || 0) + amount;
  await dbUpdateUser(uid, { balance: newBal });
  await dbLogActivity('admin', `Nitty gave ${amount} coins to ${user.username}`);

  msgEl.style.color = 'var(--green)';
  msgEl.textContent = `✅ ${user.username} received ${amount} coins! New balance: ${newBal}`;
  document.getElementById('give-amount').value = '';
  setTimeout(() => { msgEl.textContent=''; }, 3500);
  await loadAll();
};

/* ── Reset Balance ─────────────────────────── */
window.resetBalance = async function() {
  const sel    = document.getElementById('reset-user');
  const uid    = sel.value;
  const amount = parseInt(document.getElementById('reset-amount').value, 10);
  const msgEl  = document.getElementById('reset-msg');
  msgEl.textContent = '';

  if (!uid)             { msgEl.style.color='var(--red)'; msgEl.textContent='❌ Select a player'; return; }
  if (isNaN(amount) || amount<0) { msgEl.style.color='var(--red)'; msgEl.textContent='❌ Enter a valid balance'; return; }

  const user = allUsers.find(u => u.uid === uid);
  if (!user) return;
  const old = user.balance;
  await dbUpdateUser(uid, { balance: amount });
  await dbLogActivity('admin', `Nitty reset ${user.username}'s balance: ${old} → ${amount}`);

  msgEl.style.color = 'var(--green)';
  msgEl.textContent = `✅ Balance set to ${amount} for ${user.username}`;
  setTimeout(() => { msgEl.textContent=''; }, 3500);
  await loadAll();
};

/* ── Broadcast ─────────────────────────────── */
window.broadcastMessage = async function() {
  const msg    = document.getElementById('broadcast-msg').value.trim();
  const statEl = document.getElementById('broadcast-status');
  if (!msg) { statEl.style.color='var(--red)'; statEl.textContent='❌ Enter a message'; return; }

  await dbSetBroadcast(msg);
  await dbLogActivity('admin', `Nitty broadcast: "${msg}"`);

  statEl.style.color = 'var(--green)';
  statEl.textContent = '✅ Message sent to all players!';
  document.getElementById('broadcast-msg').value = '';
  setTimeout(() => { statEl.textContent=''; }, 4000);
};

/* ── Activity Log ──────────────────────────── */
function startActivityListener() {
  unsubActivity = dbListenActivity(renderActivityLog);
}

function renderActivityLog(log) {
  const container = document.getElementById('activity-log');
  if (!container) return;

  if (!log || log.length === 0) {
    container.innerHTML = '<p style="color:var(--text-dim);text-align:center;padding:16px">No activity yet</p>';
    return;
  }

  const icons = { win:'🏆', lose:'💸', register:'🆕', login:'👤', admin:'⚙️' };
  container.innerHTML = log.map(item => `
    <div class="activity-item type-${item.type}">
      <span style="font-size:1.1rem">${icons[item.type] || '📋'}</span>
      <span class="activity-text">${item.text}</span>
      <span class="activity-time">${item.time}</span>
    </div>
  `).join('');
}
