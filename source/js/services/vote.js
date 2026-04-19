function getVoteKey(id) {
  return `vote-${id}`;
}

function getVoteCacheKey(id) {
  return `vote-cache-${id}`;
}

function readVoteCache(id) {
  try {
    const raw = sessionStorage.getItem(getVoteCacheKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const ts = Number(parsed.ts || 0);
    const ttl = 1000 * 60 * 10;
    if (!ts || Date.now() - ts > ttl) {
      sessionStorage.removeItem(getVoteCacheKey(id));
      return null;
    }
    return {
      up: parseVoteCount(parsed.up),
      down: parseVoteCount(parsed.down)
    };
  } catch (e) {
    return null;
  }
}

function writeVoteCache(id, votes) {
  try {
    sessionStorage.setItem(getVoteCacheKey(id), JSON.stringify({
      up: parseVoteCount(votes?.up),
      down: parseVoteCount(votes?.down),
      ts: Date.now()
    }));
  } catch (e) {
    // ignore storage failures
  }
}

function hasVoted(id) {
  return !!localStorage.getItem(getVoteKey(id));
}

function getVotedValue(id) {
  return localStorage.getItem(getVoteKey(id)); // 'up' 或 'down'
}

function storeVote(id, value) {
  localStorage.setItem(getVoteKey(id), value);
}

function removeVote(id) {
  localStorage.removeItem(getVoteKey(id));
}

function parseVoteCount(value) {
  const num = parseInt(value, 10);
  return Number.isFinite(num) ? num : 0;
}

function updateVoteCounts(el, votes) {
  const upEl = el.querySelector('.up');
  const downEl = el.querySelector('.down');
  if (upEl) upEl.textContent = parseVoteCount(votes?.up);
  if (downEl) downEl.textContent = parseVoteCount(votes?.down);
}

function markVoted(el, value) {
  el.classList.add('voted');
  el.querySelector('.vote-up')?.classList.remove('active');
  el.querySelector('.vote-down')?.classList.remove('active');
  if (value === 'up') {
    el.querySelector('.vote-up')?.classList.add('active');
  } else if (value === 'down') {
    el.querySelector('.vote-down')?.classList.add('active');
  }
}

function clearVoted(el) {
  el.classList.remove('voted', 'active');
  el.querySelector('.vote-up')?.classList.remove('active');
  el.querySelector('.vote-down')?.classList.remove('active');
  el.querySelectorAll('button').forEach(button => {
    button.disabled = false;
  });
}

function revertVote(el, value) {
  const id = el.dataset.id;

  // 回退数值
  if (value === 'up') {
    const upEl = el.querySelector('.up');
    if (upEl) upEl.textContent = Math.max(0, parseInt(upEl.textContent || '1') - 1);
  } else if (value === 'down') {
    const downEl = el.querySelector('.down');
    if (downEl) downEl.textContent = Math.max(0, parseInt(downEl.textContent || '1') - 1);
  }

  // 回退样式和状态
  clearVoted(el);
  removeVote(id);
}

function currentVoteCounts(el) {
  return {
    up: parseVoteCount(el.querySelector('.up')?.textContent),
    down: parseVoteCount(el.querySelector('.down')?.textContent)
  };
}

function adjustVoteCount(el, value, delta) {
  const nextVotes = currentVoteCounts(el);
  if (value === 'up') {
    nextVotes.up = Math.max(0, nextVotes.up + delta);
  } else if (value === 'down') {
    nextVotes.down = Math.max(0, nextVotes.down + delta);
  }
  updateVoteCounts(el, nextVotes);
  writeVoteCache(el.dataset.id, nextVotes);
  return nextVotes;
}

async function loadVote(el) {
  const id = el.dataset.id;
  const api = el.dataset.api;
  if (!id || !api) return;

  const cachedVotes = readVoteCache(id);
  if (cachedVotes) {
    updateVoteCounts(el, cachedVotes);
  }

  try {
    if (!cachedVotes) {
      el.classList.add('is-loading');
    }
    const res = await fetch(`${api}/info?id=${encodeURIComponent(id)}`);
    const data = await res.json();
    updateVoteCounts(el, data.votes);
    writeVoteCache(id, data.votes);
  } catch (e) {
    console.warn(`[vote] 加载失败: id=${id}`, e);
  } finally {
    el.classList.remove('is-loading');
  }
}

async function submitVote(el, value) {
  const id = el.dataset.id;
  const api = el.dataset.api;
  if (!id || !api || hasVoted(id)) return;

  // 乐观更新
  const nextVotes = adjustVoteCount(el, value, 1);

  storeVote(id, value);
  writeVoteCache(id, nextVotes);
  markVoted(el, value);

  try {
    const res = await fetch(`${api}/update?id=${encodeURIComponent(id)}&value=${encodeURIComponent(value)}`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    console.warn(`[vote] 后台同步失败，撤销投票: id=${id}`, e);
    revertVote(el, value);
  }
}

async function cancelVote(el, value) {
  const id = el.dataset.id;
  const api = el.dataset.api;
  if (!id || !api || getVotedValue(id) !== value) return;

  const confirmed = await utils.confirmAction({
    title: '要取消这次反馈吗？',
    message: '取消后会同步更新这一项的统计数字。',
    confirmText: '确认取消',
    cancelText: '保留反馈'
  });
  if (!confirmed) return;

  const previousVotes = currentVoteCounts(el);
  adjustVoteCount(el, value, -1);
  removeVote(id);
  clearVoted(el);

  try {
    const res = await fetch(`${api}/cancel?id=${encodeURIComponent(id)}&value=${encodeURIComponent(value)}`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data?.votes) {
      updateVoteCounts(el, data.votes);
      writeVoteCache(id, data.votes);
    }
  } catch (e) {
    console.warn(`[vote] 取消失败，恢复投票: id=${id}`, e);
    updateVoteCounts(el, previousVotes);
    writeVoteCache(id, previousVotes);
    storeVote(id, value);
    markVoted(el, value);
  }
}

function initVotes() {
  document.querySelectorAll('.ds-vote').forEach(el => {
    const { id, api } = el.dataset;
    if (!id || !api) return;
    if (el.dataset.voteReady === 'true') return;
    el.dataset.voteReady = 'true';

    loadVote(el);

    const votedValue = getVotedValue(id);
    if (votedValue) {
      markVoted(el, votedValue);
    }

    el.querySelector('.vote-up')?.addEventListener('click', () => {
      if (el.querySelector('.vote-up')?.classList.contains('active')) {
        cancelVote(el, 'up');
      } else if (!hasVoted(id)) {
        submitVote(el, 'up');
      }
    });

    el.querySelector('.vote-down')?.addEventListener('click', () => {
      if (el.querySelector('.vote-down')?.classList.contains('active')) {
        cancelVote(el, 'down');
      } else if (!hasVoted(id)) {
        submitVote(el, 'down');
      }
    });
  });
}

window.StellarVote = window.StellarVote || {};
window.StellarVote.init = initVotes;

if (document.body) {
  initVotes();
} else {
  window.addEventListener('DOMContentLoaded', initVotes, { once: true });
}
