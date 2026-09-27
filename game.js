/* =============================================
   NITTY CASINO - Slot Machine Game Logic
   ============================================= */

const SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '⭐', '7️⃣', '💎'];

const PAYOUTS = {
  '💎💎💎': 50,
  '7️⃣7️⃣7️⃣': 20,
  '⭐⭐⭐': 10,
  '🍇🍇🍇': 8,
  '🍊🍊🍊': 6,
  '🍋🍋🍋': 5,
  '🍒🍒🍒': 4
};

const TWO_MATCH_MULTIPLIER = 1.5;

let currentBet = 10;
let isSpinning = false;
let spinIntervals = [];

/* ---- Spin ---- */
function spin() {
  const user = getCurrentUser();
  if (!user || isSpinning) return;

  if (currentBet > user.balance) {
    showSpinResult('❌ Недостаточно монет!', 'lose-msg');
    return;
  }
  if (currentBet <= 0) {
    showSpinResult('❌ Ставка должна быть больше 0', 'lose-msg');
    return;
  }

  isSpinning = true;
  const spinBtn = document.getElementById('spin-btn');
  spinBtn.disabled = true;
  spinBtn.textContent = '⏳ Крутится...';

  // Deduct bet
  user.balance -= currentBet;
  saveCurrentUser(user);
  updateBalanceDisplay(user.balance);

  // Clear previous result
  showSpinResult('', '');
  clearWinEffects();

  // Start spinning animation
  const reelIds = ['reel1-inner', 'reel2-inner', 'reel3-inner'];
  const stopTimes = [600, 900, 1200];

  // Determine results
  const results = [
    SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
    SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
    SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
  ];

  // Start spin animations
  reelIds.forEach((id) => {
    const inner = document.getElementById(id);
    inner.classList.add('spinning');
    inner.querySelector('.reel-symbol').textContent = getRandomSymbol();
  });

  // Rapid symbol change during spin
  spinIntervals = reelIds.map((id) => {
    return setInterval(() => {
      const inner = document.getElementById(id);
      if (inner) inner.querySelector('.reel-symbol').textContent = getRandomSymbol();
    }, 80);
  });

  // Stop reels sequentially
  reelIds.forEach((id, i) => {
    setTimeout(() => {
      clearInterval(spinIntervals[i]);
      const inner = document.getElementById(id);
      if (inner) {
        inner.classList.remove('spinning');
        inner.querySelector('.reel-symbol').textContent = results[i];
      }

      // All reels stopped
      if (i === reelIds.length - 1) {
        setTimeout(() => evaluateResult(results, user), 150);
      }
    }, stopTimes[i]);
  });
}

function getRandomSymbol() {
  return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
}

/* ---- Evaluate Result ---- */
function evaluateResult(results, user) {
  const combo = results.join('');
  let multiplier = 0;
  let message = '';

  // Check three of a kind
  if (results[0] === results[1] && results[1] === results[2]) {
    multiplier = PAYOUTS[combo] || 3;
  }
  // Check two of a kind
  else if (results[0] === results[1] || results[1] === results[2] || results[0] === results[2]) {
    multiplier = TWO_MATCH_MULTIPLIER;
  }

  const freshUser = getCurrentUser();
  let winAmount = 0;

  if (multiplier > 0) {
    winAmount = Math.floor(currentBet * multiplier);
    freshUser.balance += winAmount;
    freshUser.spins = (freshUser.spins || 0) + 1;
    saveCurrentUser(freshUser);
    updateBalanceDisplay(freshUser.balance);
    buildLeaderboard();

    // Win effects
    if (multiplier >= 10) {
      showSpinResult(`🎉 ДЖЕКПОТ! +${winAmount} монет! (×${multiplier})`, 'win-msg');
      triggerCoinAnimation();
      highlightReels(true);
    } else if (multiplier >= 3) {
      showSpinResult(`🔥 ВЫИГРЫШ! +${winAmount} монет! (×${multiplier})`, 'win-msg');
      highlightReels(true);
    } else {
      showSpinResult(`✨ Маленький выигрыш +${winAmount} монет`, 'win-msg');
    }

    logActivity('win', `${freshUser.username} выиграл ${winAmount} монет (${combo})`);

  } else {
    freshUser.spins = (freshUser.spins || 0) + 1;
    saveCurrentUser(freshUser);
    message = getLoseMessage();
    showSpinResult(message, 'lose-msg');
    logActivity('lose', `${freshUser.username} проиграл ${currentBet} монет`);
  }

  // Re-enable spin
  isSpinning = false;
  const spinBtn = document.getElementById('spin-btn');
  spinBtn.disabled = false;
  spinBtn.textContent = '🎲 КРУТИТЬ!';

  // Update balance display
  updateBalanceDisplay(freshUser.balance);
}

function getLoseMessage() {
  const msgs = [
    '😔 Не повезло, попробуй ещё!',
    '💸 Мимо! Удача на следующем круге',
    '😅 Почти... Ещё разок!',
    '🎯 Везение придёт, продолжай!',
    '🌀 Промах! Не сдавайся!'
  ];
  return msgs[Math.floor(Math.random() * msgs.length)];
}

/* ---- UI Helpers ---- */
function showSpinResult(msg, cls) {
  const el = document.getElementById('spin-result');
  if (!el) return;
  el.textContent = msg;
  el.className = 'spin-result ' + cls;
}

function highlightReels(win) {
  ['reel1', 'reel2', 'reel3'].forEach(id => {
    const reel = document.getElementById(id);
    if (reel && win) reel.classList.add('win');
  });
}

function clearWinEffects() {
  ['reel1', 'reel2', 'reel3'].forEach(id => {
    const reel = document.getElementById(id);
    if (reel) reel.classList.remove('win');
  });
}

function updateBalanceDisplay(balance) {
  const el = document.getElementById('balance-amount');
  if (el) el.textContent = balance.toLocaleString('ru-RU');
}

function triggerCoinAnimation() {
  for (let i = 0; i < 8; i++) {
    setTimeout(() => {
      const coin = document.createElement('div');
      coin.className = 'coin-fly';
      coin.textContent = '💰';
      coin.style.left = (Math.random() * 80 + 10) + '%';
      coin.style.top  = (Math.random() * 40 + 30) + '%';
      document.body.appendChild(coin);
      setTimeout(() => coin.remove(), 900);
    }, i * 100);
  }
}

/* ---- Bet Controls ---- */
function changeBet(delta) {
  const user = getCurrentUser();
  if (!user) return;
  currentBet = Math.max(1, Math.min(currentBet + delta, user.balance));
  document.getElementById('bet-amount').textContent = currentBet;
}

function setBet(amount) {
  const user = getCurrentUser();
  if (!user) return;
  currentBet = Math.min(amount, user.balance);
  document.getElementById('bet-amount').textContent = currentBet;
}

function maxBet() {
  const user = getCurrentUser();
  if (!user) return;
  currentBet = user.balance;
  document.getElementById('bet-amount').textContent = currentBet;
}

/* ---- Modal Controls ---- */
function openSlots() {
  document.getElementById('slots-modal').classList.remove('hidden');
  // Refresh bet display
  const user = getCurrentUser();
  if (user) {
    currentBet = Math.min(currentBet, user.balance) || 10;
    const betEl = document.getElementById('bet-amount');
    if (betEl) betEl.textContent = currentBet;
  }
}

function closeSlots() {
  document.getElementById('slots-modal').classList.add('hidden');
  showSpinResult('', '');
}

/* ---- Keyboard shortcut (Space = spin) ---- */
document.addEventListener('keydown', (e) => {
  const modal = document.getElementById('slots-modal');
  if (modal && !modal.classList.contains('hidden') && e.code === 'Space') {
    e.preventDefault();
    spin();
  }
});
