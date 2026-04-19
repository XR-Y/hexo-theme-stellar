function getRatingKey(id) {
  return `rating-${id}`;
}

function hasRated(id) {
  return !!localStorage.getItem(getRatingKey(id));
}

function getRatedValue(id) {
  return parseInt(localStorage.getItem(getRatingKey(id)) || '0');
}

function storeRating(id, value) {
  localStorage.setItem(getRatingKey(id), value);
}

function removeRating(id) {
  localStorage.removeItem(getRatingKey(id));
}

function clearHover(el) {
  el.querySelectorAll('.star').forEach(s => s.classList.remove('hover'));
}

function clearRated(el) {
  el.classList.remove('rated');
  el.querySelectorAll('.star').forEach(s => s.classList.remove('active'));
}

function markRated(el, value) {
  el.classList.add('rated');
  el.querySelectorAll('.star').forEach(star => {
    const v = parseInt(star.dataset.value);
    star.classList.toggle('active', v <= value);
  });
}

function updatePreview(el, avg) {
  const rounded = Math.floor(avg);
  el.querySelectorAll('.star').forEach(s => {
    const v = parseInt(s.dataset.value);
    s.classList.toggle('preview', v <= rounded);
  });
}

function setupHoverEffect(el) {
  const stars = el.querySelectorAll('.star');
  if (!stars.length) return;

  stars.forEach(star => {
    const value = parseInt(star.dataset.value);

    star.addEventListener('mouseenter', () => {
      stars.forEach(s => {
        s.classList.remove('preview');
        const v = parseInt(s.dataset.value);
        s.classList.toggle('hover', v <= value);
      });
    });

    star.addEventListener('mouseleave', () => {
      clearHover(el);
      // 恢复平均分预览
      const avg = parseFloat(el.querySelector('.avg')?.textContent.replace(/[()]/g, '') || '0');
      updatePreview(el, avg);
    });
  });
}

function calculateAverage(rating = {}) {
  const validScores = Object.entries(rating).filter(([k]) => !isNaN(Number(k)));
  const total = validScores.reduce((sum, [k, c]) => sum + Number(k) * c, 0);
  const votes = validScores.reduce((sum, [, c]) => sum + c, 0);
  return votes > 0 ? (total / votes).toFixed(1) : '0.0';
}

function renderRating(el, rating = {}) {
  const avg = calculateAverage(rating);

  // 计算评分人数
  const validScores = Object.entries(rating).filter(([k]) => !isNaN(Number(k)));
  const totalVotes = validScores.reduce((sum, [, c]) => sum + c, 0);

  // 设置平均分
  let avgEl = el.querySelector('.avg');
  if (!avgEl) {
    avgEl = document.createElement('span');
    avgEl.className = 'avg';
    el.appendChild(avgEl);
  }
  avgEl.textContent = `(${avg})`;

  // 设置评分人数
  let countEl = el.querySelector('.count');
  if (!countEl) {
    countEl = document.createElement('span');
    countEl.className = 'count';
    el.appendChild(countEl);
  }
  countEl.textContent = `${totalVotes}`;

  updatePreview(el, avg);
  const ratedValue = getRatedValue(el.dataset.id);
  if (ratedValue) {
    markRated(el, ratedValue);
  }
}

async function loadRating(el) {
  const id = el.dataset.id;
  const api = el.dataset.api;
  if (!id || !api) return;

  try {
    const res = await fetch(`${api}/info?id=${encodeURIComponent(id)}`);
    const data = await res.json();
    renderRating(el, data.rating || {});
  } catch (e) {
    console.warn(`[rating] 加载失败: id=${id}`, e);
  }
}

async function submitRating(el, value) {
  const id = el.dataset.id;
  const api = el.dataset.api;
  if (!id || !api || hasRated(id)) return;

  storeRating(id, value);
  markRated(el, parseInt(value));

  try {
    const res = await fetch(`${api}/update?id=${encodeURIComponent(id)}&value=${value}`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    loadRating(el);
  } catch (e) {
    console.warn(`[rating] 提交失败: id=${id}`, e);
    removeRating(id);
    clearRated(el);
    loadRating(el);
  }
}

async function cancelRating(el, value) {
  const id = el.dataset.id;
  const api = el.dataset.api;
  if (!id || !api || getRatedValue(id) !== parseInt(value)) return;

  const confirmed = await utils.confirmAction({
    title: '要取消这次评分吗？',
    message: '取消后会同步更新这篇文章的评分统计。',
    confirmText: '确认取消',
    cancelText: '保留评分'
  });
  if (!confirmed) return;

  removeRating(id);
  clearRated(el);

  try {
    const res = await fetch(`${api}/cancel?id=${encodeURIComponent(id)}&value=${value}`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data?.rating) {
      renderRating(el, data.rating);
    } else {
      loadRating(el);
    }
  } catch (e) {
    console.warn(`[rating] 取消失败，恢复评分: id=${id}`, e);
    storeRating(id, value);
    markRated(el, parseInt(value));
    loadRating(el);
  }
}

function initRatings() {
  document.querySelectorAll('.ds-rating').forEach(el => {
    const { id, api } = el.dataset;
    if (!id || !api) return;

    loadRating(el);
    setupHoverEffect(el);

    if (hasRated(id)) {
      markRated(el, getRatedValue(id));
    }

    el.querySelectorAll('.star').forEach(star => {
      const value = star.dataset.value;
      star.addEventListener('click', () => {
        if (parseInt(value) === getRatedValue(id)) {
          cancelRating(el, value);
        } else if (!hasRated(id)) {
          submitRating(el, value);
        }
      });
    });
  });
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initRatings);
} else {
  initRatings();
}
