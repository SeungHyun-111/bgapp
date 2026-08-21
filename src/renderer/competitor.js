const dragHandle = document.querySelector('#dragHandle');
const monthSelect = document.querySelector('#searchMonth');
const brandForm = document.querySelector('#brandForm');
const productForm = document.querySelector('#productForm');
const brandInput = document.querySelector('#brandSearch');
const productInput = document.querySelector('#productSearch');
const brandButton = document.querySelector('#brandButton');
const productButton = document.querySelector('#productButton');
const criteriaEl = document.querySelector('#criteria');
const summary = document.querySelector('#summary');
const filters = document.querySelector('#filters');
const viz = document.querySelector('#viz');
const results = document.querySelector('#results');

let drag = null;
let criteria = [];
let baseRows = [];
let detailOpen = false;
let selectedCompanies = new Set();
let selectedBrands = new Set();
let selectedProducts = new Set();

const companyLabels = { K: 'K', SK: 'SK스토아', SSG: 'SSG' };
const companyClasses = { K: 'company-k', SK: 'company-sk', SSG: 'company-ssg' };
const CHART_CAP_REVENUE_PER_MINUTE = 5000000;

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function normalizeText(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, '');
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

function formatTime(value) {
  const [hour = '', minute = ''] = String(value || '').split(':');
  const normalizedHour = String(Number(hour) || 0).padStart(2, '0');
  const normalizedMinute = String(Number(minute) || 0).padStart(2, '0');
  return `${normalizedHour}:${normalizedMinute}`;
}

function getBroadcastValue(row) {
  return Number(`${String(row.date || '').replace(/\D/g, '')}${formatTime(row.time).replace(':', '')}`) || 0;
}

function getChartRows(rows) {
  const latestRows = rows.slice(0, 16);
  const maxRow = rows.reduce((best, row) => (
    Number(row.revenuePerMinute || 0) > Number(best?.revenuePerMinute || 0) ? row : best
  ), null);

  if (!maxRow || latestRows.includes(maxRow)) {
    return latestRows;
  }

  return [...rows.slice(0, 15), maxRow]
    .sort((a, b) => getBroadcastValue(b) - getBroadcastValue(a));
}

function resizeToContent(rowCount = 0, hasViz = false) {
  const base = hasViz ? 710 : 250;
  const nextHeight = base + (detailOpen ? Math.min(rowCount, 5) * 64 : 0);
  window.scheduleApi.setWindowHeight(nextHeight);
}

function rowMatchesCriterion(row, criterion) {
  const query = normalizeText(criterion.text);
  if (criterion.type === 'brand') return normalizeText(row.brand).includes(query);
  return normalizeText(row.productName).includes(query);
}

function getCriteriaRows() {
  if (!criteria.length) return [];
  return baseRows.filter((row) => criteria.every((criterion) => rowMatchesCriterion(row, criterion)));
}

function getFilteredRows() {
  return getCriteriaRows().filter((row) => {
    if (selectedCompanies.size && !selectedCompanies.has(row.companyKey)) return false;
    if (selectedBrands.size && !selectedBrands.has(row.brand)) return false;
    if (selectedProducts.size && !selectedProducts.has(row.productName)) return false;
    return true;
  });
}

function resetFilters() {
  selectedCompanies = new Set();
  selectedBrands = new Set();
  selectedProducts = new Set();
  detailOpen = false;
}

function clearAll() {
  criteria = [];
  baseRows = [];
  resetFilters();
  render();
}

function buildSummary(rows) {
  const values = rows.map((row) => Number(row.revenuePerMinute || 0)).filter((value) => value > 0);
  const avg = values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
  const max = values.length ? Math.max(...values) : 0;
  return { avg, max, latestDate: rows[0]?.date || '' };
}

function countBy(rows, getter) {
  const counts = new Map();
  rows.forEach((row) => {
    const key = getter(row);
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko-KR'));
}

function renderCriteria() {
  if (!criteria.length) {
    criteriaEl.innerHTML = '<span class="criteria-hint">검색하면 조건 뱃지가 여기에 쌓입니다.</span>';
    return;
  }

  criteriaEl.innerHTML = `
    ${criteria.map((criterion) => `
      <button class="criterion-chip" type="button" data-id="${escapeHtml(criterion.id)}" title="조건 삭제">
        <span>${criterion.type === 'brand' ? '브랜드' : '상품'} · ${escapeHtml(criterion.text)}</span>
        <strong>×</strong>
      </button>
    `).join('')}
    <button class="clear-chip" id="clearCriteria" type="button">전체해제</button>
  `;
  criteriaEl.querySelectorAll('.criterion-chip').forEach((chip) => {
    chip.addEventListener('click', () => removeCriterion(chip.dataset.id));
  });
  document.querySelector('#clearCriteria')?.addEventListener('click', clearAll);
}

function renderFilterGroup(title, entries, selectedSet, dataName, max = 18) {
  if (!entries.length) return '';
  return `
    <div class="filter-group">
      <div class="filter-title">${title}</div>
      <div class="filter-chips">
        ${entries.slice(0, max).map(([key, count]) => `
          <button class="filter-chip ${selectedSet.has(key) ? 'is-active' : ''}" type="button" data-filter="${dataName}" data-value="${escapeHtml(key)}" title="${escapeHtml(key)}">
            ${escapeHtml(key)} (${fmt(count)})
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function renderFilters(rows) {
  if (!criteria.length || !rows.length) {
    filters.innerHTML = '';
    return;
  }

  const companyChips = ['K', 'SK', 'SSG'].map((company) => {
    const count = rows.filter((row) => row.companyKey === company).length;
    if (!count) return '';
    return `
      <button class="filter-chip channel ${selectedCompanies.has(company) ? 'is-active' : ''}" type="button" data-filter="company" data-value="${company}">
        <span class="legend-dot ${companyClasses[company]}"></span>${companyLabels[company]} (${fmt(count)})
      </button>
    `;
  }).join('');

  filters.innerHTML = `
    <div class="filter-group">
      <div class="filter-title">채널</div>
      <div class="filter-chips">${companyChips}</div>
    </div>
    ${renderFilterGroup('포함 브랜드', countBy(rows, (row) => row.brand), selectedBrands, 'brand')}
    ${renderFilterGroup('포함 상품명', countBy(rows, (row) => row.productName), selectedProducts, 'product', 24)}
  `;
  filters.querySelectorAll('.filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => toggleFilter(chip.dataset.filter, chip.dataset.value));
  });
}

function renderChart(rows, maxValue) {
  return [...getChartRows(rows)].reverse().map((row) => {
    const value = Number(row.revenuePerMinute || 0);
    const height = Math.max(2, Math.min(100, Math.round(value / Math.max(1, maxValue) * 100)));
    const companyClass = companyClasses[row.companyKey] || 'company-sk';
    return `
      <div class="column-wrap" title="${escapeHtml(companyLabels[row.companyKey] || row.companyKey)} ${escapeHtml(row.date)} ${escapeHtml(row.time)}\n분당매출 ${fmt(value)}">
        <span class="column-value">${escapeHtml(compactFmt(value))}</span>
        <div class="column-track"><div class="column ${companyClass}" style="height:${height}%"></div></div>
        <span class="column-label">${escapeHtml(row.date.slice(5))}<br>${escapeHtml(formatTime(row.time))}</span>
      </div>
    `;
  }).join('');
}

function renderViz(rows) {
  if (!rows.length) {
    viz.innerHTML = '';
    return;
  }

  const current = buildSummary(rows);
  const chartMax = current.max > CHART_CAP_REVENUE_PER_MINUTE
    ? CHART_CAP_REVENUE_PER_MINUTE
    : current.max;
  viz.innerHTML = `
    <div class="cards">
      <div class="card"><span>평균 분당매출</span><strong>${fmt(current.avg)}</strong></div>
      <div class="card"><span>최대 분당매출</span><strong>${fmt(current.max)}</strong></div>
      <div class="card"><span>최근 방송</span><strong>${escapeHtml(current.latestDate || '-')}</strong></div>
    </div>
    <div class="chart">
      <div class="chart-title">분당매출 <span>${current.max > CHART_CAP_REVENUE_PER_MINUTE ? `상한 ${fmt(CHART_CAP_REVENUE_PER_MINUTE)}` : `최대 ${fmt(current.max)}`}</span></div>
      <div class="columns">${renderChart(rows, chartMax)}</div>
    </div>
  `;
}

function renderDetails(rows) {
  if (!criteria.length) {
    results.innerHTML = '';
    return;
  }
  if (!rows.length) {
    results.innerHTML = '<p class="empty">검색 결과가 없습니다.</p>';
    return;
  }

  results.innerHTML = `
    <button id="detailToggle" class="detail-toggle" type="button">${detailOpen ? '상세닫기' : '상세열기'}</button>
    ${detailOpen ? rows.map((row) => {
      const companyClass = String(row.companyKey || '').toLowerCase();
      return `
        <article class="row">
          <div class="title" title="${escapeHtml(row.productName)}">${escapeHtml(row.brand || '-')} · ${escapeHtml(row.productName || '-')}</div>
          <div class="meta">
            <span class="pill ${companyClass}">${escapeHtml(companyLabels[row.companyKey] || row.companyKey)}</span>
            <span class="pill">${escapeHtml(row.date)} ${escapeHtml(row.time)}</span>
            <span class="pill">매출 ${fmt(row.revenue)}</span>
            <span class="pill">분당 ${fmt(row.revenuePerMinute)}</span>
          </div>
        </article>
      `;
    }).join('') : ''}
  `;
  document.querySelector('#detailToggle').addEventListener('click', () => {
    detailOpen = !detailOpen;
    render();
  });
}

function render() {
  renderCriteria();
  const criteriaRows = getCriteriaRows();
  const rows = getFilteredRows();
  renderFilters(criteriaRows);
  renderViz(rows);
  renderDetails(rows);

  if (!criteria.length) {
    summary.textContent = '브랜드나 상품명을 검색하면 조건 뱃지가 쌓입니다. 캐시는 사용하지 않습니다.';
    resizeToContent(0, false);
    return;
  }

  const filterCount = selectedCompanies.size + selectedBrands.size + selectedProducts.size;
  summary.textContent = `${criteria.length}개 조건 검색 결과 ${rows.length.toLocaleString('ko-KR')}건${filterCount ? ` · 필터 ${filterCount}개 적용` : ''}`;
  resizeToContent(rows.length, !!rows.length);
}

function populateMonths(months = [], selected = 'all') {
  const current = selected || monthSelect.value || 'all';
  monthSelect.innerHTML = '<option value="all">전체</option>' + months.map((month) => `
    <option value="${escapeHtml(month)}"${month === current ? ' selected' : ''}>${escapeHtml(month.slice(0, 4))}-${escapeHtml(month.slice(4))}</option>
  `).join('');
  if (current === 'all') monthSelect.value = 'all';
}

async function applyCriteria(nextCriteria) {
  resetFilters();
  if (!nextCriteria.length) {
    clearAll();
    return;
  }

  const first = nextCriteria[0];
  setWorking(true);
  summary.textContent = '경쟁사 검색 인덱스를 조회하는 중입니다.';
  filters.innerHTML = '';
  viz.innerHTML = '';
  results.innerHTML = '';
  resizeToContent(0, false);

  try {
    const payload = await window.scheduleApi.searchCompetitorInfo({
      keyword: first.text,
      type: first.type,
      month: monthSelect.value
    });
    populateMonths(payload.months, payload.month);
    baseRows = payload.results || [];
    criteria = nextCriteria;
    render();
  } catch (error) {
    console.error(error);
    summary.textContent = error.message || '검색 실패';
    resizeToContent(0, false);
  } finally {
    setWorking(false);
  }
}

async function addCriterion(type) {
  const input = type === 'brand' ? brandInput : productInput;
  const text = input.value.trim();
  if (!text) {
    input.focus();
    return;
  }

  const nextCriteria = [...criteria, { id: `${Date.now()}_${Math.random().toString(36).slice(2)}`, type, text }];
  if (!criteria.length) {
    await applyCriteria(nextCriteria);
  } else {
    criteria = nextCriteria;
    resetFilters();
    render();
  }
  input.value = '';
}

function removeCriterion(id) {
  applyCriteria(criteria.filter((criterion) => criterion.id !== id));
}

function toggleFilter(type, value) {
  const target = type === 'company' ? selectedCompanies : type === 'brand' ? selectedBrands : selectedProducts;
  if (target.has(value)) target.delete(value);
  else target.add(value);
  detailOpen = false;
  render();
}

function setWorking(isWorking) {
  [brandButton, productButton].forEach((btn) => {
    btn.disabled = isWorking;
    btn.classList.toggle('is-working', isWorking);
  });
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

brandForm.addEventListener('submit', (event) => {
  event.preventDefault();
  addCriterion('brand');
});

productForm.addEventListener('submit', (event) => {
  event.preventDefault();
  addCriterion('product');
});

monthSelect.addEventListener('change', clearAll);

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

render();
