const dragHandle = document.querySelector('#dragHandle');
const searchForm = document.querySelector('#searchForm');
const searchInput = document.querySelector('#remainingSearch');
const searchButton = document.querySelector('#searchButton');
const searchSummary = document.querySelector('#searchSummary');
const searchResults = document.querySelector('#searchResults');
const DRAG_THRESHOLD_PX = 4;

let drag = null;

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function resizeToContent(rowCount = 0) {
  const baseHeight = 128;
  const rowHeight = 76;
  const visibleRows = Math.min(rowCount, 5);
  const nextHeight = rowCount ? baseHeight + visibleRows * rowHeight : baseHeight;
  window.scheduleApi.setWindowHeight(nextHeight);
}

async function beginDrag() {
  if (!drag || drag.dragging) return;
  const [windowX, windowY] = await window.scheduleApi.getWindowPosition();
  const cursor = await window.scheduleApi.getCursorPosition();
  drag.dragging = true;
  drag.offsetX = cursor.x - windowX;
  drag.offsetY = cursor.y - windowY;
  dragHandle.classList.add('is-dragging');
}

async function moveWindowToCursor() {
  if (!drag?.dragging) return;
  const cursor = await window.scheduleApi.getCursorPosition();
  await window.scheduleApi.setWindowPosition(cursor.x - drag.offsetX, cursor.y - drag.offsetY);
}

function clearDrag() {
  dragHandle.classList.remove('is-dragging');
  drag = null;
}

function renderSearchResults(payload) {
  const rows = payload.results || [];
  searchSummary.textContent = `"${payload.keyword}" 검색 결과 ${payload.count.toLocaleString('ko-KR')}건`;

  if (!rows.length) {
    searchResults.innerHTML = '<p class="empty">검색 결과가 없습니다.</p>';
    resizeToContent(0);
    return;
  }

  searchResults.innerHTML = rows.map((row) => `
    <article class="result-row">
      <div class="result-title" title="${escapeHtml(row.pgmCodeName)}">${escapeHtml(row.pgmCodeName)}</div>
      <div class="result-meta">
        <span class="pill is-time">${escapeHtml(row.displayTime)}</span>
        <span class="pill">${escapeHtml(row.weekKey)}</span>
        ${row.dealType ? `<span class="pill is-deal">${escapeHtml(row.dealType)}</span>` : ''}
        ${row.mdTeam ? `<span class="pill">${escapeHtml(row.mdTeam)}</span>` : ''}
      </div>
    </article>
  `).join('');
  resizeToContent(rows.length);
}

function clearSearchResults() {
  searchSummary.textContent = '오늘 이후 편성운영 버전에서 검색합니다.';
  searchResults.innerHTML = '';
  resizeToContent(0);
}

async function searchRemainingSchedules() {
  const keyword = searchInput.value.trim();

  if (!keyword) {
    searchSummary.textContent = '검색어를 입력하세요.';
    searchResults.innerHTML = '';
    resizeToContent(0);
    searchInput.focus();
    return;
  }

  searchButton.disabled = true;
  searchButton.classList.add('is-working');
  searchButton.textContent = '검색중';
  searchSummary.textContent = '오늘 이후 편성운영 버전을 검색하는 중입니다.';
  searchResults.innerHTML = '';
  resizeToContent(0);

  try {
    const result = await window.scheduleApi.searchRemainingSchedules(keyword);
    renderSearchResults(result);
  } catch (error) {
    console.error(error);
    searchSummary.textContent = error.message || '검색 실패';
    searchResults.innerHTML = '';
    resizeToContent(0);
  } finally {
    searchButton.disabled = false;
    searchButton.classList.remove('is-working');
    searchButton.textContent = '검색';
  }
}

searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  searchRemainingSchedules();
});

searchInput.addEventListener('input', () => {
  if (!searchInput.value.trim()) {
    clearSearchResults();
  }
});

dragHandle.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  dragHandle.setPointerCapture(event.pointerId);
  drag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    dragging: false
  };
});

dragHandle.addEventListener('pointermove', (event) => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
  if (!drag.dragging && moved >= DRAG_THRESHOLD_PX) beginDrag();
  if (drag.dragging) moveWindowToCursor();
});

dragHandle.addEventListener('pointerup', (event) => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  clearDrag();
});

dragHandle.addEventListener('pointercancel', clearDrag);

resizeToContent(0);
