const clock = document.querySelector('#clock');
const schedule = document.querySelector('.schedule');
const refreshScheduleButton = document.querySelector('#refreshSchedule');
const DEFAULT_RTDB_PROJECTS = [
  {
    projectName: 'pgmdr-87328',
    databaseUrl: 'https://pgmdr-87328-default-rtdb.asia-southeast1.firebasedatabase.app',
    features: ['방송 운영 세션', '잔여 편성 검색', '전역 실적 캐시', '실적 히스토리']
  },
  {
    projectName: 'schedule-7ec7a',
    databaseUrl: 'https://schedule-7ec7a-default-rtdb.asia-southeast1.firebasedatabase.app',
    features: ['경쟁사 방송 정보 검색']
  }
];

let scheduleGroups = [];
let statusTimer = null;

function updateClock() {
  const now = new Date();
  clock.textContent = new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(now);
}

function minutesFromTime(value) {
  const [hour, minute] = String(value || '').split(':').map(Number);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }

  return hour * 60 + minute;
}

function getAdjustedRange(item, now = new Date()) {
  const current = now.getHours() * 60 + now.getMinutes();
  const rawStart = minutesFromTime(item.startTime);
  const rawEnd = minutesFromTime(item.endTime);

  if (rawStart === null || rawEnd === null) {
    return null;
  }

  let start = rawStart;
  let end = rawEnd;
  let currentAdjusted = current;

  if (end <= start) {
    end += 24 * 60;

    if (current < start) {
      currentAdjusted += 24 * 60;
    }
  }

  return { current: currentAdjusted, start, end };
}

function getStatus(item, now = new Date()) {
  const range = getAdjustedRange(item, now);

  if (!range) {
    return 'next';
  }

  if (range.current >= range.start && range.current < range.end) {
    return 'live';
  }

  if (range.current < range.start) {
    return 'next';
  }

  return 'past';
}

function classNameForStatus(status) {
  if (status === 'live') {
    return 'time-block is-live';
  }

  if (status === 'past') {
    return 'time-block is-past';
  }

  return 'time-block';
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function groupByTime(items) {
  const groups = [];
  const byTime = new Map();

  for (const item of items) {
    if (!byTime.has(item.timeRange)) {
      const group = {
        timeRange: item.timeRange,
        startTime: item.startTime,
        endTime: item.endTime,
        items: []
      };
      byTime.set(item.timeRange, group);
      groups.push(group);
    }

    byTime.get(item.timeRange).items.push(item);
  }

  return groups;
}

function renderProduct(item) {
  const image = item.imageUrl
    ? `<img class="thumb" src="${escapeHtml(item.imageUrl)}" alt="">`
    : '<div class="thumb is-empty"></div>';
  const meta = [item.brand, item.price].filter(Boolean).join(' · ');
  const tooltip = `${item.timeRange}\n${item.title}${meta ? `\n${meta}` : ''}`;
  const titleClass = item.title.length > 22 ? ' class="is-marquee"' : '';

  return `
    <article
      class="product-row"
      data-url="${escapeHtml(item.url)}"
      data-tooltip="${escapeHtml(tooltip)}"
      title="${escapeHtml(tooltip)}"
    >
      ${image}
      <div class="info">
        <h2><span${titleClass}>${escapeHtml(item.title)}</span></h2>
        <p>${escapeHtml(meta)}</p>
      </div>
    </article>
  `;
}

function renderRtdbInfo(projects = []) {
  const rows = projects.map((project) => `
    <li>
      <strong>${escapeHtml(project.projectName)}</strong>
      <code>${escapeHtml(project.databaseUrl)}</code>
      <span>${escapeHtml((project.features || []).join(', '))}</span>
    </li>
  `).join('');

  if (!rows) {
    return '';
  }

  return `
    <aside class="rtdb-info" aria-label="Realtime Database information">
      <p>사용 RTDB</p>
      <ul>${rows}</ul>
    </aside>
  `;
}

function updateStatuses({ scrollToLive = false } = {}) {
  let liveElement = null;

  scheduleGroups.forEach((group, index) => {
    const block = schedule.querySelector(`[data-index="${index}"]`);
    const badge = block?.querySelector('.live-badge');
    const status = getStatus(group);

    if (!block || !badge) {
      return;
    }

    block.className = classNameForStatus(status);
    badge.textContent = status === 'live' ? 'LIVE' : '';

    if (status === 'live') {
      liveElement = block;
    }
  });

  if (scrollToLive && liveElement) {
    liveElement.scrollIntoView({ block: 'center' });
  }

  scheduleNextStatusUpdate();
}

function getMillisecondsUntilNextChange() {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const currentSecond = now.getSeconds();
  const currentMillisecond = now.getMilliseconds();
  const dayMinutes = 24 * 60;
  let nextChangeMinutes = Infinity;

  for (const group of scheduleGroups) {
    for (const time of [group.startTime, group.endTime]) {
      const minute = minutesFromTime(time);

      if (minute === null) {
        continue;
      }

      let delta = minute - nowMinutes;

      if (delta <= 0) {
        delta += dayMinutes;
      }

      nextChangeMinutes = Math.min(nextChangeMinutes, delta);
    }
  }

  if (!Number.isFinite(nextChangeMinutes)) {
    return null;
  }

  return Math.max(1000, (nextChangeMinutes * 60 - currentSecond) * 1000 - currentMillisecond + 250);
}

function scheduleNextStatusUpdate() {
  clearTimeout(statusTimer);

  const delay = getMillisecondsUntilNextChange();

  if (delay === null) {
    return;
  }

  statusTimer = setTimeout(() => updateStatuses({ scrollToLive: true }), delay);
}

function renderSchedule(items, rtdbProjects = []) {
  scheduleGroups = groupByTime(items);

  if (!scheduleGroups.length) {
    schedule.innerHTML = `<p class="loading">표시할 편성표가 없습니다.</p>${renderRtdbInfo(rtdbProjects)}`;
    return;
  }

  schedule.innerHTML = `${scheduleGroups.map((group, index) => `
    <section class="${classNameForStatus(getStatus(group))}" data-index="${index}">
      <header class="time-head">
        <span>${escapeHtml(group.timeRange)}</span>
        <strong class="live-badge">${getStatus(group) === 'live' ? 'LIVE' : ''}</strong>
      </header>
      <div class="products">
        ${group.items.map(renderProduct).join('')}
      </div>
    </section>
  `).join('')}${renderRtdbInfo(rtdbProjects)}`;

  requestAnimationFrame(() => updateStatuses({ scrollToLive: true }));
}

function formatCacheTime(timestamp) {
  if (!timestamp) return '';

  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(timestamp));
}

function setRefreshWorking(isWorking) {
  refreshScheduleButton.disabled = isWorking;
  refreshScheduleButton.classList.toggle('is-working', isWorking);
}

async function loadSchedule() {
  setRefreshWorking(true);
  try {
    const rtdbProjectsPromise = typeof window.scheduleApi.getRtdbProjects === 'function'
      ? window.scheduleApi.getRtdbProjects().catch(() => DEFAULT_RTDB_PROJECTS)
      : Promise.resolve(DEFAULT_RTDB_PROJECTS);
    const result = await window.scheduleApi.reload();
    const items = Array.isArray(result) ? result : result.items;
    const rtdbProjects = await rtdbProjectsPromise;
    renderSchedule(items, rtdbProjects);

    if (result?.fromCache) {
      const loadedText = formatCacheTime(result.loadedAt);
      const status = document.createElement('p');
      status.className = 'cache-notice';
      status.textContent = loadedText
        ? `인터넷 연결 실패로 ${loadedText} 저장본을 표시 중입니다.`
        : '인터넷 연결 실패로 저장본을 표시 중입니다.';
      schedule.prepend(status);
    }
  } catch (error) {
    console.error(error);
    schedule.innerHTML = `<p class="loading">편성표를 불러오지 못했습니다.</p>${renderRtdbInfo(DEFAULT_RTDB_PROJECTS)}`;
  } finally {
    setRefreshWorking(false);
  }
}

schedule.addEventListener('click', (event) => {
  const row = event.target.closest('.product-row');
  const url = row?.dataset.url;

  if (url) {
    window.scheduleApi.openExternal(url);
  }
});

refreshScheduleButton.addEventListener('click', loadSchedule);

updateClock();
setInterval(updateClock, 1000);
loadSchedule();
