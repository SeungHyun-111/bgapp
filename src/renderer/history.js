const dragHandle = document.querySelector('#dragHandle');
const cacheStatus = document.querySelector('#cacheStatus');
const form = document.querySelector('#historyForm');
const input = document.querySelector('#historySearch');
const button = document.querySelector('#historyButton');
const summary = document.querySelector('#summary');
const viz = document.querySelector('#viz');
const results = document.querySelector('#results');

let drag = null;
let lastRows = [];
let lastKeyword = '';
let selectedCodes = new Set();
let detailOpen = false;

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function fmt(value) {
  return Number(value || 0).toLocaleString('ko-KR');
}

function compactFmt(value) {
  const number = Number(value || 0);
  if (number >= 100000000) return `${Math.round(number / 10000000) / 10}억`;
  if (number >= 10000) return `${Math.round(number / 10000)}만`;
  return number.toLocaleString('ko-KR');
}

function resizeToContent(rowCount = 0, hasViz = false) {
  const base = hasViz ? 858 : 198;
  const nextHeight = base + (detailOpen ? Math.min(rowCount, 4) * 62 : 0);
  window.scheduleApi.setWindowHeight(nextHeight);
}

async function refreshCacheStatus() {
  try {
    const status = await window.scheduleApi.getPerformanceCacheStatus();
    const prefix = status.fromCache ? '저장본 캐시' : '캐시';
    cacheStatus.textContent = `${prefix} ${status.rowCount.toLocaleString('ko-KR')}건 · JSON ${status.compactJsonMB}MB · 메모리 약 ${status.estimatedHeapMB}MB`;
  } catch (error) {
    cacheStatus.textContent = '실적 캐시 로딩 전';
  }
}

function clearResults() {
  lastRows = [];
  lastKeyword = '';
  selectedCodes = new Set();
  detailOpen = false;
  summary.textContent = '전역 실적 DB에서 과거 방송 실적을 검색합니다.';
  viz.innerHTML = '';
  results.innerHTML = '';
  resizeToContent(0, false);
}

function getFilteredRows() {
  if (!selectedCodes.size) return lastRows;
  return lastRows.filter((row) => selectedCodes.has(row.pgmCodeName));
}

function buildSummary(rows) {
  const salesValues = rows.map((row) => Number(row.salesPerWeightedMin || 0)).filter((value) => value > 0);
  const profitValues = rows.map((row) => Number(row.profitPerWeightedMin || 0)).filter((value) => value > 0);
  const average = (values) => values.length
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : 0;

  return {
    avgSales: average(salesValues),
    avgProfit: average(profitValues),
    maxSales: salesValues.length ? Math.max(...salesValues) : 0,
    maxProfit: profitValues.length ? Math.max(...profitValues) : 0,
    latestDate: rows[0]?.broadcastDate || ''
  };
}

function renderCodeFilters() {
  const counts = new Map();
  lastRows.forEach((row) => {
    if (!row.pgmCodeName) return;
    counts.set(row.pgmCodeName, (counts.get(row.pgmCodeName) || 0) + 1);
  });

  const chips = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko-KR'))
    .slice(0, 18)
    .map(([code, count]) => `
      <button class="code-chip ${selectedCodes.has(code) ? 'is-active' : ''}" type="button" data-code="${escapeHtml(code)}" title="${escapeHtml(code)}">
        ${escapeHtml(code)} (${count})
      </button>
    `)
    .join('');

  return chips ? `<div class="code-filters">${chips}</div>` : '';
}

function renderFromState() {
  const rows = getFilteredRows();
  const currentSummary = buildSummary(rows);
  const suffix = selectedCodes.size ? ` / ${selectedCodes.size}개 편성코드 선택` : '';
  summary.textContent = `"${lastKeyword}" 이전 실적 ${rows.length.toLocaleString('ko-KR')}건${suffix}`;

  if (!rows.length) {
    viz.innerHTML = renderCodeFilters();
    results.innerHTML = '<p class="empty">검색 결과가 없습니다.</p>';
    resizeToContent(0, !!lastRows.length);
    wireCodeFilters();
    return;
  }

  const maxSales = Math.max(1, currentSummary.maxSales || 0);
  const maxProfit = Math.max(1, currentSummary.maxProfit || 0);
  const chartRows = [...rows.slice(0, 8)].reverse();

  const salesColumns = chartRows.map((row) => {
    const height = Math.max(2, Math.round(row.salesPerWeightedMin / maxSales * 100));
    return `
      <div class="column-wrap" title="${escapeHtml(row.broadcastDate)} ${escapeHtml(row.broadcastTime)}\n분취 ${fmt(row.salesPerWeightedMin)}">
        <span class="column-value">${escapeHtml(compactFmt(row.salesPerWeightedMin))}</span>
        <div class="column-track"><div class="column sales" style="height:${height}%"></div></div>
        <span class="column-label">${escapeHtml(row.broadcastDate.slice(5))}</span>
      </div>
    `;
  }).join('');

  const profitColumns = chartRows.map((row) => {
    const height = Math.max(2, Math.round(row.profitPerWeightedMin / maxProfit * 100));
    return `
      <div class="column-wrap" title="${escapeHtml(row.broadcastDate)} ${escapeHtml(row.broadcastTime)}\n분한익 ${fmt(row.profitPerWeightedMin)}">
        <span class="column-value">${escapeHtml(compactFmt(row.profitPerWeightedMin))}</span>
        <div class="column-track"><div class="column profit" style="height:${height}%"></div></div>
        <span class="column-label">${escapeHtml(row.broadcastDate.slice(5))}</span>
      </div>
    `;
  }).join('');

  viz.innerHTML = `
    ${renderCodeFilters()}
    <div class="cards">
      <div class="card"><span>평균 취급/분</span><strong>${fmt(currentSummary.avgSales)}</strong></div>
      <div class="card"><span>평균 한익/분</span><strong>${fmt(currentSummary.avgProfit)}</strong></div>
      <div class="card"><span>최근 방송</span><strong>${escapeHtml(currentSummary.latestDate || '-')}</strong></div>
    </div>
    <div class="charts">
      <div class="chart">
        <div class="chart-title">분취 <span>최대 ${fmt(currentSummary.maxSales)}</span></div>
        <div class="columns">${salesColumns}</div>
      </div>
      <div class="chart">
        <div class="chart-title">분한익 <span>최대 ${fmt(currentSummary.maxProfit)}</span></div>
        <div class="columns">${profitColumns}</div>
      </div>
    </div>
  `;

  wireCodeFilters();
  renderDetailsButtonOnly();
  resizeToContent(rows.length, true);
}

function wireCodeFilters() {
  viz.querySelectorAll('.code-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const code = chip.dataset.code || '';
      if (!code) return;
      if (selectedCodes.has(code)) selectedCodes.delete(code);
      else selectedCodes.add(code);
      detailOpen = false;
      renderFromState();
    });
  });
}

function renderDetailsButtonOnly() {
  results.innerHTML = '<button id="detailToggle" class="detail-toggle" type="button">?곸꽭?닿린</button>';
  document.querySelector('#detailToggle').addEventListener('click', toggleDetails);
}

function renderDetails() {
  const rows = getFilteredRows();
  results.innerHTML = `
    <button id="detailToggle" class="detail-toggle" type="button">${detailOpen ? '?곸꽭?リ린' : '?곸꽭?닿린'}</button>
    ${detailOpen ? rows.map((row) => `
      <article class="row">
        <div class="title" title="${escapeHtml(row.pgmCodeName)}">${escapeHtml(row.pgmCodeName)}</div>
        <div class="meta">
          <span class="pill">${escapeHtml(row.broadcastDate)} ${escapeHtml(row.broadcastTime)}</span>
          <span class="pill sales">痍④툒 ${fmt(row.salesPerWeightedMin)}</span>
          <span class="pill profit">?쒖씡 ${fmt(row.profitPerWeightedMin)}</span>
        </div>
      </article>
    `).join('') : ''}
  `;
  document.querySelector('#detailToggle').addEventListener('click', toggleDetails);
  resizeToContent(rows.length, true);
}

function toggleDetails() {
  detailOpen = !detailOpen;
  renderDetails();
}

function render(payload) {
  lastRows = payload.results || [];
  lastKeyword = payload.keyword || '';
  selectedCodes = new Set();
  detailOpen = false;
  renderFromState();
}

async function runSearch() {
  const keyword = input.value.trim();
  if (!keyword) {
    clearResults();
    input.focus();
    return;
  }

  button.disabled = true;
  button.classList.add('is-working');
  button.textContent = '검색중';
  summary.textContent = '실적 DB를 검색하는 중입니다.';
  viz.innerHTML = '';
  results.innerHTML = '';
  resizeToContent(0, false);

  try {
    render(await window.scheduleApi.searchPerformanceHistory(keyword));
    refreshCacheStatus();
  } catch (error) {
    console.error(error);
    summary.textContent = error.message || '검색 실패';
    resizeToContent(0, false);
  } finally {
    button.disabled = false;
    button.classList.remove('is-working');
    button.textContent = '검색';
  }
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

form.addEventListener('submit', (event) => {
  event.preventDefault();
  runSearch();
});

input.addEventListener('input', () => {
  if (!input.value.trim()) clearResults();
});

dragHandle.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  dragHandle.setPointerCapture(event.pointerId);
  drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, dragging: false };
});

dragHandle.addEventListener('pointermove', (event) => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (!drag.dragging && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 4) beginDrag();
  if (drag.dragging) moveWindowToCursor();
});

dragHandle.addEventListener('pointerup', (event) => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  clearDrag();
});

dragHandle.addEventListener('pointercancel', clearDrag);

clearResults();
refreshCacheStatus();
