const SCHEDULE_URL = 'https://www.skstoa.com/tv_schedule';
const DETAIL_URL_PREFIX = 'https://www.skstoa.com/display/goods/';
const https = require('https');
const sharedCache = require('./data-cache');
const PGMDR_DB_URL = 'https://pgmdr-87328-default-rtdb.asia-southeast1.firebasedatabase.app';
const COMPETITOR_DB_URL = 'https://schedule-7ec7a-default-rtdb.asia-southeast1.firebasedatabase.app';
const COMPETITOR_ROOT = 'competitorInfo';
const COMPETITOR_MAX_PARALLEL_READS = 30;
const RTDB_PROJECTS = [
  {
    projectName: 'pgmdr-87328',
    databaseUrl: PGMDR_DB_URL,
    features: ['방송 운영 세션', '잔여 편성 검색', '전역 실적 캐시', '실적 히스토리']
  },
  {
    projectName: 'schedule-7ec7a',
    databaseUrl: COMPETITOR_DB_URL,
    features: ['경쟁사 방송 정보 검색']
  }
];
const MAIN_GAS_URL = 'https://script.google.com/macros/s/AKfycbzlnzcV5DkCNwAZcOrdtJnCfGpCLmu5-tA9eF8N2Rs4hS15N61p0h8m7BQqTVxwX7g3/exec';
const OPS_GAS_URL = 'https://script.google.com/macros/s/AKfycbz9e0_2L6wX3Lm7uKWLfReZrm-LNRFxg8f_EeHVKwqaLZrx0neyHss9fORPhhvFppIA/exec';
const VERSION_OPS = 'ops';
let performanceCache = null;
let performanceCachePromise = null;
let cacheDirectory = '';

function configureCacheDirectory(directory) {
  cacheDirectory = directory || '';
}

function getRtdbProjects() {
  return RTDB_PROJECTS.map((project) => ({
    ...project,
    features: [...project.features]
  }));
}

function getCachePath(name) {
  if (!cacheDirectory) return '';
  return require('path').join(cacheDirectory, name);
}

async function readJsonCache(name) {
  const cachePath = getCachePath(name);
  if (!cachePath) return null;

  try {
    const fs = require('fs/promises');
    return JSON.parse(await fs.readFile(cachePath, 'utf8'));
  } catch {
    return null;
  }
}

async function writeJsonCache(name, payload) {
  const cachePath = getCachePath(name);
  if (!cachePath) return;

  try {
    const fs = require('fs/promises');
    await fs.mkdir(cacheDirectory, { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify(payload, null, 2), 'utf8');
  } catch (error) {
    console.error(`Failed to write ${name}:`, error);
  }
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function getAttribute(html, name) {
  const match = html.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i'));
  return decodeEntities(match?.[1]);
}

function getFirstMatch(html, pattern) {
  return decodeEntities(html.match(pattern)?.[1]);
}

function normalizeAssetUrl(url) {
  if (!url) {
    return '';
  }

  if (url.startsWith('//')) {
    return `https:${url}`;
  }

  if (url.startsWith('/')) {
    return `https://www.skstoa.com${url}`;
  }

  return url;
}

function parseDetailUrl(block, id) {
  const detailPath = getFirstMatch(block, /goGoodsDetail\('([^']+)'\)/i);

  if (detailPath) {
    return `${DETAIL_URL_PREFIX}${detailPath}`;
  }

  return id ? `${DETAIL_URL_PREFIX}${id}` : '';
}

function parsePrice(block, fallbackPrice) {
  const price = getFirstMatch(block, /<span class="price">\s*<span>([^<]+)<\/span>\s*원\s*<\/span>/i);

  if (price) {
    return `${price}원`;
  }

  const number = Number(fallbackPrice);

  if (Number.isFinite(number)) {
    return `${number.toLocaleString('ko-KR')}원`;
  }

  return '';
}

function parseProductImageUrl(block, title) {
  const playArea = block.match(/<td class="play_area">[\s\S]*?<\/td>/i)?.[0] || '';
  const playImage = getFirstMatch(playArea, /<img[^>]*class="lazyload"[^>]*data-src="([^"]+)"/i);

  if (playImage) {
    return normalizeAssetUrl(playImage);
  }

  const images = [...block.matchAll(/<img[^>]*class="lazyload"[^>]*data-src="([^"]+)"[^>]*alt="([^"]*)"/gi)];
  const productImage = images.find((match) => decodeEntities(match[2]) === title)?.[1] || images[0]?.[1] || '';

  return normalizeAssetUrl(productImage);
}

function parseSchedule(html) {
  const listMatches = [...html.matchAll(/<div class="list ga-prd">/g)];
  let lastTimeRange = '';

  return listMatches
    .map((match, index) => {
      const listStart = match.index;
      const nextStart = listMatches[index + 1]?.index ?? html.length;
      const block = html.slice(listStart, nextStart);
      const timeRange = getFirstMatch(block, /<div class="[^"]*\btimebox\b[^"]*">([^<]+)<\/div>/i) || lastTimeRange;

      if (timeRange) {
        lastTimeRange = timeRange;
      }

      const id = getAttribute(block, 'p-id');
      const title = getAttribute(block, 'p-name');
      const brand = getAttribute(block, 'p-brand').trim();
      const rawPrice = getAttribute(block, 'p-price');
      const [startTime = '', endTime = ''] = timeRange.split('~').map((time) => time.trim());
      const imageUrl = parseProductImageUrl(block, title);

      return {
        id,
        startTime,
        endTime,
        timeRange,
        title,
        brand,
        price: parsePrice(block, rawPrice),
        imageUrl,
        url: parseDetailUrl(block, id)
      };
    })
    .filter((item) => item.id && item.title && item.timeRange);
}

async function loadSchedule() {
  const sharedScheduleUrl = 'https://newnavi-329ad-default-rtdb.asia-southeast1.firebasedatabase.app/schedule/tvSchedule.json';
  try {
    const payload = await sharedCache.get(sharedScheduleUrl, {
      marker: sharedScheduleUrl.replace('.json', '/loadedAt.json')
    });
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replace(/-/g, '');
    if (String(payload?.refreshDate || '').replace(/-/g, '') === today && Array.isArray(payload.items) && payload.items.length) {
      return { items: payload.items, loadedAt: payload.loadedAt, fromCache: sharedCache.status(sharedScheduleUrl).offline, source: 'shared-rtdb' };
    }
  } catch { /* The official page remains a fallback when the shared schedule is unavailable. */ }
  try {
    const html = await sharedCache.get(SCHEDULE_URL, {
      type: 'text', ttl: 3600000,
      headers: {
        'user-agent': 'Mozilla/5.0 BroadcastOverlayWidget/0.1',
        accept: 'text/html,application/xhtml+xml'
      }
    });

    const items = parseSchedule(html);
    await writeJsonCache('schedule-cache.json', { items, loadedAt: Date.now() });
    return { items, fromCache: false, loadedAt: Date.now() };
  } catch (error) {
    const cached = await readJsonCache('schedule-cache.json');
    if (Array.isArray(cached?.items) && cached.items.length) {
      return { items: cached.items, fromCache: true, loadedAt: cached.loadedAt || null, error: error.message };
    }
    throw error;
  }
}

function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getTodayKey() {
  return toDateKey(new Date());
}

function getFallbackEndDate(startDate) {
  const date = new Date(`${startDate}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  date.setDate(date.getDate() + 6);
  return toDateKey(date);
}

function getWeekStartDate(dateKey) {
  const date = new Date(`${dateKey || getTodayKey()}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return getTodayKey();
  }

  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return toDateKey(date);
}

function parseWeekKey(weekKey) {
  const match = String(weekKey || '').match(/^(\d{4}-\d{2}-\d{2})_([^_]+)$/);

  if (!match) {
    return null;
  }

  return {
    weekKey,
    startDate: match[1],
    poolType: match[2]
  };
}

function getDealTypeChar(dealType) {
  return String(dealType || '').match(/\[(.)\]/)?.[1] || '';
}

function normalizeDealType(dealType) {
  const value = String(dealType || '').trim();

  if (!value) {
    return '';
  }

  if (/^\[.\]$/.test(value)) {
    return value;
  }

  const paren = value.match(/\((.)\)/);
  if (paren) {
    return `[${paren[1]}]`;
  }

  return value;
}

function makePerfKey(dealType, pgmCodeName) {
  const cleanName = String(pgmCodeName || '').trim();

  if (!cleanName) {
    return null;
  }

  return `${normalizeDealType(dealType)}${cleanName}`;
}

function buildSlot(row) {
  const number = (value) => {
    const parsed = Number(String(value || '').replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };

  return {
    slotId: row.slotId,
    dateKey: row.dateKey,
    timeText: row.timeText,
    durationMin: number(row.durationMin),
    weightedMin: number(row.weightedMin),
    channel: 'ALL'
  };
}

function extractEntityFields(block) {
  const fields = [
    'pgmCodeName',
    'mdTeam',
    'orgName',
    'mdCategory',
    'dealType',
    'dealTypeConverted',
    'dealTypeChar',
    'memoCode',
    'memoCodeCode',
    'memoCode2',
    'memoCode2Code',
    'requestNote',
    'scheduleComment',
    'annotation',
    'newProductType',
    'perfKey'
  ];
  const result = {};

  fields.forEach((field) => {
    if (block[field] !== undefined) {
      result[field] = block[field];
    }
  });

  return result;
}

function normalizeOpsNewProductType(value) {
  const raw = String(value || '').trim();

  if (!raw) {
    return '湲곗〈';
  }

  return raw;
}

function normalizeOpsBlockBeforeSave(block) {
  const mdTeam = String(block.mdTeam || block.orgName || '').trim();

  return {
    ...block,
    mdTeam,
    orgName: mdTeam,
    newProductType: normalizeOpsNewProductType(block.newProductType)
  };
}

async function firebaseGet(path, { force = false } = {}) {
  const url = `${PGMDR_DB_URL}/${path}.json`;
  if (path === 'performanceEntries') {
    return sharedCache.get(url, { marker: `${PGMDR_DB_URL}/performanceMeta.json`, force });
  }
  if (/^sessions\/.+\/versions\/ops$/.test(path)) {
    return sharedCache.get(url, { marker: `${PGMDR_DB_URL}/${path}/updatedAt.json` });
  }
  if (path === 'activeSessions' || path === 'performanceMeta') return sharedCache.get(url);
  return jsonRequest(`${PGMDR_DB_URL}/${path}.json`);
}

async function firebasePut(path, payload) {
  return jsonRequest(`${PGMDR_DB_URL}/${path}.json`, {
    method: 'PUT',
    payload
  });
}

async function firebasePatch(path, payload) {
  return jsonRequest(`${PGMDR_DB_URL}/${path}.json`, {
    method: 'PATCH',
    payload
  });
}

function competitorUrl(path) {
  const [pathname, query] = String(path || '').split('?');
  const cleanPath = pathname.replace(/^\/+/, '');
  return `${COMPETITOR_DB_URL}/${cleanPath}.json${query ? `?${query}` : ''}`;
}

async function competitorGet(path) {
  return jsonRequest(competitorUrl(path));
}

async function syncOpsFromGas({ startDate, endDate, poolType, userName }) {
  const params = new URLSearchParams({
    action: 'syncSheetToOps',
    startDate,
    endDate,
    poolType,
    userName,
    sheetName: 'PGM'
  });
  const json = await jsonRequest(`${OPS_GAS_URL}?${params}`);

  if (json.success === false || json.ok === false) {
    throw new Error(json.error || 'GAS request failed');
  }

  return json.data;
}

function jsonRequest(url, { method = 'GET', payload, redirectCount = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const body = payload === undefined ? null : JSON.stringify(payload);
    const request = https.request(url, {
      method,
      rejectUnauthorized: false,
      headers: body
        ? {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(body)
          }
        : undefined
    }, (response) => {
      let data = '';

      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        data += chunk;
      });
      response.on('end', () => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          if (redirectCount >= 5) {
            reject(new Error('Too many redirects'));
            return;
          }

          const nextUrl = new URL(response.headers.location, url).toString();
          jsonRequest(nextUrl, { method, payload, redirectCount: redirectCount + 1 })
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Request failed: ${response.statusCode} ${data.slice(0, 300)}`));
          return;
        }

        try {
          resolve(data ? JSON.parse(data) : null);
        } catch (error) {
          reject(new Error(`Invalid JSON response: ${error.message}`));
        }
      });
    });

    request.on('error', reject);
    if (body) {
      request.write(body);
    }
    request.end();
  });
}

function buildOpsVersionPayload(payload, userName) {
  const updatedAt = Date.now();
  const updatedBy = userName || '';
  const scheduleBlocks = {};
  const entityProps = {};
  const scheduledUniqueKeys = {};

  Object.entries(payload.scheduleBlocks || {}).forEach(([blockKey, block]) => {
    if (!block) {
      return;
    }

    const uniqueKey = block.uniqueKey || `bgops_${updatedAt}_${Math.random().toString(36).slice(2)}`;
    const normalized = normalizeOpsBlockBeforeSave({ ...block, uniqueKey });
    const dealType = normalizeDealType(normalized.dealTypeConverted || normalized.dealType);
    const nextBlock = {
      ...normalized,
      dealType,
      dealTypeConverted: dealType,
      dealTypeChar: getDealTypeChar(dealType),
      perfKey: makePerfKey(dealType, normalized.pgmCodeName)
    };

    scheduleBlocks[blockKey] = nextBlock;
    entityProps[uniqueKey] = extractEntityFields(nextBlock);
    scheduledUniqueKeys[uniqueKey] = true;
  });

  return {
    version: {
      pgmSlots: (payload.pgmSlots || []).map(buildSlot),
      proposalItems: [],
      scheduleBlocks,
      entityProps,
      splitSlots: payload.splitSlots || {},
      customSlots: {},
      starred: {},
      scheduledItemIds: {},
      scheduledUniqueKeys,
      manualInputs: {},
      updatedAt,
      updatedBy,
      sourceVersionId: 'ops_sheet'
    },
    meta: {
      updatedAt,
      updatedBy,
      sourceVersionId: 'ops_sheet',
      sheetName: payload.sheetName || 'PGM'
    }
  };
}

async function refreshFutureOpsVersions() {
  const todayKey = getTodayKey();
  const activeSessions = await firebaseGet('activeSessions');
  const sessions = Object.keys(activeSessions || {})
    .map(parseWeekKey)
    .filter(Boolean)
    .filter((session) => getFallbackEndDate(session.startDate) >= todayKey)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.poolType.localeCompare(b.poolType));
  const userName = 'bgapp';
  const results = [];

  for (const session of sessions) {
    const endDate = getFallbackEndDate(session.startDate);
    const payload = await syncOpsFromGas({
      startDate: session.startDate,
      endDate,
      poolType: session.poolType,
      userName
    });
    const built = buildOpsVersionPayload(payload, userName);

    await firebasePut(`sessions/${session.weekKey}/versions/${VERSION_OPS}`, built.version);
    await firebasePut(`sessions/${session.weekKey}/versionMeta/${VERSION_OPS}`, built.meta);
    await firebasePatch(`sessions/${session.weekKey}/gasData/meta`, {
      startDate: payload.startDate || session.startDate,
      endDate: payload.endDate || endDate,
      poolType: session.poolType,
      opsSyncedAt: built.meta.updatedAt,
      opsSyncedBy: userName,
      opsSlotCount: (payload.pgmSlots || []).length
    });

    results.push({
      weekKey: session.weekKey,
      slotCount: (payload.pgmSlots || []).length,
      blockCount: Object.keys(payload.scheduleBlocks || {}).length
    });
  }

  return {
    todayKey,
    count: results.length,
    results
  };
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/\s+/g, '');
}

function encodeFirebaseKey(value) {
  return String(value || '').replace(/\[/g, '__LB__').replace(/\]/g, '__RB__');
}

function normalizePerfDate(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (!match) return raw;
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

function normalizePerfTime(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,2})(?::(\d{1,2}))?/);
  if (!match) return '00:00';
  const hour = String(Math.min(23, Math.max(0, Number(match[1]) || 0))).padStart(2, '0');
  const minute = String(Math.min(59, Math.max(0, Number(match[2] || 0) || 0))).padStart(2, '0');
  return `${hour}:${minute}`;
}

function makeBroadcastTimestamp(dateKey, timeText = '00:00') {
  const date = normalizePerfDate(dateKey);
  if (!date) return null;
  const time = normalizePerfTime(timeText);
  return Number(`${date.replace(/\D/g, '')}${time.replace(/\D/g, '')}`);
}

function normalizePerfEntry(entry, fallbackPerfKey = '') {
  if (!entry) return null;
  const broadcastDate = normalizePerfDate(entry.broadcastDate || entry.dateKey);
  const broadcastTime = normalizePerfTime(entry.broadcastStartTime || entry.startTime || entry.broadcastTime || entry.timeText);
  const broadcastTimestamp = Number(entry.broadcastTimestamp || makeBroadcastTimestamp(broadcastDate, broadcastTime));
  if (!Number.isFinite(broadcastTimestamp)) return null;

  return {
    ...entry,
    perfKey: entry.perfKey || fallbackPerfKey,
    broadcastDate,
    broadcastTime,
    broadcastTimestamp,
    salesPerWeightedMin: toNullableNumber(entry.salesPerWeightedMin),
    profitPerWeightedMin: toNullableNumber(entry.profitPerWeightedMin),
    sourceRow: Number(entry.sourceRow || 0)
  };
}

function normalizePerformanceRows(raw = []) {
  const rows = Array.isArray(raw)
    ? raw
    : Object.entries(raw || {}).map(([rowId, value]) => ({ rowId, ...value }));

  return rows
    .map((row, index) => normalizePerfEntry({
      ...row,
      perfKey: row.perfKey || row.key || row.Key,
      sourceRow: row.sourceRow || row.rowNumber || index + 2
    }, row.perfKey || row.key || row.Key || ''))
    .filter(Boolean)
    .sort(comparePerfEntries);
}

function buildHistoryByKeyFromRows(rawRows = []) {
  const result = {};
  normalizePerformanceRows(rawRows).forEach((entry) => {
    if (!entry.perfKey) return;
    if (!result[entry.perfKey]) result[entry.perfKey] = [];
    result[entry.perfKey].push(entry);
  });
  Object.keys(result).forEach((perfKey) => {
    result[perfKey].sort(comparePerfEntries);
  });
  return result;
}

function buildLatestByKeyFromHistory(historyByKey = {}) {
  const result = {};
  Object.entries(historyByKey || {}).forEach(([perfKey, history]) => {
    const normalized = normalizePerformanceRows(history.map((entry) => ({ ...entry, perfKey })));
    if (normalized.length > 0) result[perfKey] = normalized[normalized.length - 1];
  });
  return result;
}

function getPerformanceRowsSource(rawData, rawPerfMap) {
  if (rawData?.performanceRows) return rawData.performanceRows;
  if (rawData?.perfRows) return rawData.perfRows;
  if (rawData?.rows) return rawData.rows;
  if (rawData?.perfHistory) return flattenHistory(rawData.perfHistory);
  if (rawData?.performanceHistory) return flattenHistory(rawData.performanceHistory);

  const source = rawData?.perfMap || rawPerfMap || {};
  const rows = [];
  Object.entries(source || {}).forEach(([perfKey, value]) => {
    if (Array.isArray(value)) {
      value.forEach((row) => rows.push({ ...row, perfKey: row?.perfKey || perfKey }));
    } else if (value && typeof value === 'object') {
      rows.push({ ...value, perfKey: value.perfKey || perfKey });
    }
  });
  return rows;
}

function flattenHistory(history = {}) {
  const rows = [];
  Object.entries(history || {}).forEach(([perfKey, entries]) => {
    normalizePerformanceRows(Array.isArray(entries) ? entries : Object.values(entries || {}))
      .forEach((entry) => rows.push({ ...entry, perfKey: entry.perfKey || perfKey }));
  });
  return rows;
}

function getLatestEntry(rows = []) {
  return (rows || []).reduce((latest, entry) => {
    if (!entry) return latest;
    if (!latest) return entry;
    if (entry.broadcastTimestamp !== latest.broadcastTimestamp) {
      return entry.broadcastTimestamp > latest.broadcastTimestamp ? entry : latest;
    }
    return Number(entry.sourceRow || 0) > Number(latest.sourceRow || 0) ? entry : latest;
  }, null);
}

function comparePerfEntries(a, b) {
  if (a.broadcastTimestamp !== b.broadcastTimestamp) return a.broadcastTimestamp - b.broadcastTimestamp;
  return Number(a.sourceRow || 0) - Number(b.sourceRow || 0);
}

function toNullableNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(number) ? number : null;
}

function makePerformanceEntryId(entry) {
  return `${entry.broadcastTimestamp}_${encodeFirebaseKey(entry.perfKey || '')}`;
}

function compactPerformanceEntry(entry) {
  const perfKey = entry.perfKey || '';
  const pgmCodeName = entry.pgmCodeName || String(perfKey).replace(/^\[[^\]]+\]/, '');

  return {
    id: makePerformanceEntryId(entry),
    perfKey,
    pgmCodeName,
    broadcastDate: entry.broadcastDate || '',
    dayOfWeek: entry.dayOfWeek || '',
    mdTeam: entry.mdTeam || entry.orgName || '',
    mdName: entry.mdName || '',
    multiChannel: entry.multiChannel || '',
    weightedMin: toNullableNumber(entry.weightedMin),
    expectedSales: toNullableNumber(entry.expectedSales),
    contributionProfit: toNullableNumber(entry.contributionProfit),
    lateNightPgmYn: String(entry.lateNightPgmYn || '').trim().toUpperCase(),
    broadcastTime: entry.broadcastTime || '',
    broadcastTimestamp: Number(entry.broadcastTimestamp || 0),
    salesPerWeightedMin: Number(entry.salesPerWeightedMin || 0),
    profitPerWeightedMin: Number(entry.profitPerWeightedMin || 0),
    sourceRow: Number(entry.sourceRow || 0),
    searchText: normalizeSearchText([
      perfKey,
      pgmCodeName,
      entry.brand,
      entry.mdTeam,
      entry.orgName,
      entry.dealType,
      entry.dealTypeConverted
    ].join(' '))
  };
}
async function loadPerformanceCache({ force = false } = {}) {
  if (!force && performanceCache && Date.now() - performanceCache.loadedAt < 300000) return performanceCache;
  if (!force && performanceCachePromise) return performanceCachePromise;

  performanceCachePromise = (async () => {
    try {
      const entries = await firebaseGet('performanceEntries', { force });
      const rows = normalizePerformanceRows(entries || {})
        .map(compactPerformanceEntry)
        .filter((row) => row.perfKey && row.broadcastTimestamp)
        .sort((a, b) => b.broadcastTimestamp - a.broadcastTimestamp);

      performanceCache = {
        rows,
        loadedAt: Date.now(),
        rowCount: rows.length,
        fromCache: false
      };
      await writeJsonCache('performance-cache.json', performanceCache);
      return performanceCache;
    } catch (error) {
      const cached = await readJsonCache('performance-cache.json');
      if (Array.isArray(cached?.rows) && cached.rows.length) {
        performanceCache = {
          rows: cached.rows,
          loadedAt: cached.loadedAt || null,
          rowCount: cached.rowCount || cached.rows.length,
          fromCache: true,
          error: error.message
        };
        return performanceCache;
      }
      throw error;
    }
  })();

  try {
    return await performanceCachePromise;
  } finally {
    performanceCachePromise = null;
  }
}

function invalidatePerformanceCache() {
  performanceCache = null;
  performanceCachePromise = null;
}

async function warmPerformanceCache() {
  try {
    return await loadPerformanceCache();
  } catch (error) {
    console.error('Performance cache warm-up failed:', error);
    return null;
  }
}

async function getPerformanceCacheStatus() {
  const cache = await loadPerformanceCache();
  const jsonBytes = Buffer.byteLength(JSON.stringify(cache.rows), 'utf8');
  return {
    loaded: true,
    rowCount: cache.rowCount,
    loadedAt: cache.loadedAt,
    fromCache: Boolean(cache.fromCache),
    compactJsonMB: Number((jsonBytes / 1024 / 1024).toFixed(2)),
    estimatedHeapMB: `${Math.ceil(jsonBytes * 2 / 1024 / 1024)}~${Math.ceil(jsonBytes * 4 / 1024 / 1024)}`
  };
}

async function getGlobalPerformanceCursor() {
  const meta = await firebaseGet('performanceMeta');
  if (meta) {
    return { latestDate: meta.latestDate || '' };
  }

  const entries = await firebaseGet('performanceEntries');
  const legacyRows = entries ? null : await firebaseGet('performanceRows');
  const rows = normalizePerformanceRows(entries || legacyRows || {});
  const latestEntry = getLatestEntry(rows);
  return { latestDate: latestEntry?.broadcastDate || '' };
}

async function fetchRefreshPerformance(afterDate = '') {
  const params = new URLSearchParams({ action: 'refreshPerformance', afterDate });
  const json = await jsonRequest(`${MAIN_GAS_URL}?${params}`);

  if (json.success === false || json.ok === false) {
    throw new Error(json.error || 'GAS performance request failed');
  }

  return json.data;
}

async function refreshGlobalPerformance() {
  const cursor = await getGlobalPerformanceCursor();
  const rawData = await fetchRefreshPerformance(cursor.latestDate || '');
  const rawPerfMap = rawData?.perfMap ? rawData.perfMap : rawData;
  const performanceRows = getPerformanceRowsSource(rawData, rawPerfMap);
  const normalizedRows = normalizePerformanceRows(performanceRows);
  const historyByKey = buildHistoryByKeyFromRows(normalizedRows);
  const latestByKey = buildLatestByKeyFromHistory(historyByKey);
  const updates = {};

  normalizedRows.forEach((entry) => {
    updates[`performanceEntries/${makePerformanceEntryId(entry)}`] = entry;
  });

  Object.entries(latestByKey).forEach(([perfKey, entry]) => {
    updates[`latestPerfMap/${encodeFirebaseKey(perfKey)}`] = entry;
  });

  const latestEntry = getLatestEntry(normalizedRows);
  if (latestEntry) {
    updates.performanceMeta = {
      latestTimestamp: latestEntry.broadcastTimestamp,
      latestDate: latestEntry.broadcastDate || '',
      latestTime: latestEntry.broadcastTime || '',
      latestPerfKey: latestEntry.perfKey || '',
      updatedAt: Date.now()
    };
  }

  if (Object.keys(updates).length) {
    await firebasePatch('', updates);
  }
  invalidatePerformanceCache();
  await loadPerformanceCache({ force: true });

  return {
    afterDate: cursor.latestDate || '',
    rowCount: normalizedRows.length,
    latestDate: latestEntry?.broadcastDate || cursor.latestDate || '',
    latestTime: latestEntry?.broadcastTime || ''
  };
}

function blockMatchesQuery(block, query) {
  const haystack = [
    block.pgmCodeName,
    block.mdTeam,
    block.orgName,
    block.mdCategory,
    block.dealTypeConverted,
    block.dealType,
    block.memoCode,
    block.scheduleComment,
    block.annotation
  ].map(normalizeSearchText).join(' ');

  return haystack.includes(query);
}

function formatScheduleTime(block) {
  const date = block.dateKey || '';
  const time = block.timeText || '';
  const channel = block.channel && block.channel !== 'ALL' ? ` ${block.channel}` : '';

  return `${date} ${time}${channel}`.trim();
}

async function searchRemainingSchedules(keyword = '') {
  const query = normalizeSearchText(keyword);

  if (!query) {
    return {
      keyword,
      count: 0,
      results: []
    };
  }

  const todayKey = getTodayKey();
  const activeSessions = await firebaseGet('activeSessions');
  const sessions = Object.keys(activeSessions || {})
    .map(parseWeekKey)
    .filter(Boolean)
    .filter((session) => getFallbackEndDate(session.startDate) >= todayKey)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.poolType.localeCompare(b.poolType));
  const results = [];

  for (const session of sessions) {
    const version = await firebaseGet(`sessions/${session.weekKey}/versions/${VERSION_OPS}`);
    const entityProps = version?.entityProps || {};

    Object.entries(version?.scheduleBlocks || {}).forEach(([blockKey, rawBlock]) => {
      if (!rawBlock || rawBlock.isDefault || rawBlock.dateKey < todayKey) {
        return;
      }

      const block = rawBlock.uniqueKey && entityProps[rawBlock.uniqueKey]
        ? { ...rawBlock, ...entityProps[rawBlock.uniqueKey] }
        : rawBlock;

      if (!blockMatchesQuery(block, query)) {
        return;
      }

      results.push({
        weekKey: session.weekKey,
        poolType: session.poolType,
        blockKey,
        dateKey: block.dateKey || '',
        timeText: block.timeText || '',
        channel: block.channel || 'ALL',
        pgmCodeName: block.pgmCodeName || '',
        mdTeam: block.mdTeam || block.orgName || '',
        dealType: block.dealTypeConverted || block.dealType || '',
        displayTime: formatScheduleTime(block)
      });
    });
  }

  results.sort((a, b) => (
    a.dateKey.localeCompare(b.dateKey)
    || a.timeText.localeCompare(b.timeText)
    || a.weekKey.localeCompare(b.weekKey)
    || a.channel.localeCompare(b.channel)
  ));

  return {
    keyword,
    count: results.length,
    results
  };
}

function encodeCompetitorGram(value) {
  return Buffer.from(String(value || ''), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function getCompetitorQueryGrams(query) {
  const characters = Array.from(query);
  const gramLength = characters.length >= 2 ? 2 : 1;
  const grams = new Set();

  for (let index = 0; index <= characters.length - gramLength; index += 1) {
    grams.add(characters.slice(index, index + gramLength).join(''));
  }

  return [...grams];
}

function intersectCompetitorDocumentIds(documentMaps) {
  if (!documentMaps.length) return [];
  const [first, ...rest] = documentMaps;
  return Object.keys(first || {}).filter((id) => rest.every((map) => map?.[id]));
}

function parseCompetitorDocumentId(documentId) {
  const matched = String(documentId).match(/^(SSG|SK|K)_(\d+)$/);
  if (!matched) return null;
  return { company: matched[1], rowIndex: matched[2] };
}

async function mapWithConcurrency(items, mapper, limit = COMPETITOR_MAX_PARALLEL_READS) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function getCompetitorBroadcastSortValue(row) {
  const compactDate = String(row?.date || row?.sourceMonth || '').replace(/\D/g, '');
  const hour = String(row?.hour ?? '').padStart(2, '0');
  const minute = String(row?.minute ?? '').padStart(2, '0');
  return Number(`${compactDate}${hour}${minute}`) || 0;
}

function compareCompetitorBroadcastDesc(a, b) {
  return getCompetitorBroadcastSortValue(b) - getCompetitorBroadcastSortValue(a)
    || Number(b.sourceRowIndex || 0) - Number(a.sourceRowIndex || 0);
}

function competitorMatches(row, type, query) {
  if (type === 'brand') {
    return normalizeSearchText(row?.brand).includes(query);
  }

  return [row?.dataProductName, row?.productName]
    .some((value) => normalizeSearchText(value).includes(query));
}

function getCompetitorWeightedMinutes(row) {
  return Number(row?.weightedMin ?? row?.brandWeightedMin ?? row?.simpleMin ?? 0) || 0;
}

function getCompetitorRevenuePerMinute(row) {
  const minutes = getCompetitorWeightedMinutes(row);
  return minutes > 0 ? Math.round(Number(row?.revenue || 0) / minutes) : 0;
}

function normalizeCompetitorRow(row) {
  const companyKey = String(row.companyKey || row.company || '').toUpperCase();
  const time = row.time || `${String(row.hour ?? '').padStart(2, '0')}:${String(row.minute ?? '').padStart(2, '0')}`;
  return {
    companyKey,
    sourceMonth: row.sourceMonth || row.month || '',
    sourceRowIndex: Number(row.sourceRowIndex || 0),
    date: row.date || '',
    time,
    brand: row.brand || '',
    productName: row.productName || row.dataProductName || '',
    revenue: Number(row.revenue || 0),
    weightedMin: getCompetitorWeightedMinutes(row),
    revenuePerMinute: getCompetitorRevenuePerMinute(row)
  };
}

async function getCompetitorSearchMonths() {
  const payload = await competitorGet(`${COMPETITOR_ROOT}/searchIndex?shallow=true`);
  return Object.keys(payload || {}).sort((a, b) => b.localeCompare(a));
}

async function searchCompetitorMonth({ month, type, query }) {
  const grams = getCompetitorQueryGrams(query);
  const documentMaps = await Promise.all(
    grams.map((gram) => competitorGet(`${COMPETITOR_ROOT}/searchIndex/${month}/grams/${type}/${encodeCompetitorGram(gram)}`))
  );
  const references = intersectCompetitorDocumentIds(documentMaps)
    .map(parseCompetitorDocumentId)
    .filter(Boolean);

  const rows = await mapWithConcurrency(references, async ({ company, rowIndex }) => {
    const row = await competitorGet(`${COMPETITOR_ROOT}/monthly/${month}/data/${company}/${rowIndex}`);
    if (!row || !competitorMatches(row, type, query)) return null;
    return normalizeCompetitorRow({ ...row, companyKey: company, sourceMonth: month, sourceRowIndex: rowIndex });
  });

  return rows.filter(Boolean);
}

async function searchCompetitorInfo({ keyword = '', type = 'brand', month = 'all' } = {}) {
  const query = normalizeSearchText(keyword);
  const searchType = type === 'product' ? 'product' : 'brand';
  if (!query) return { keyword, type: searchType, month, months: [], count: 0, results: [] };

  const months = await getCompetitorSearchMonths();
  const targetMonths = month && month !== 'all' ? [month] : months;
  const monthlyResults = await Promise.all(
    targetMonths.map((targetMonth) => searchCompetitorMonth({ month: targetMonth, type: searchType, query }))
  );
  const rows = monthlyResults.flat().sort(compareCompetitorBroadcastDesc);

  return {
    keyword,
    type: searchType,
    month,
    months,
    count: rows.length,
    results: rows
  };
}

async function searchPerformanceHistory(keyword = '') {
  const query = normalizeSearchText(keyword);
  if (!query) return { keyword, count: 0, results: [], summary: null };

  const cache = await loadPerformanceCache();
  const rows = cache.rows
    .filter((entry) => entry.searchText.includes(query))
    .slice(0, 80);

  const salesValues = rows.map((row) => Number(row.salesPerWeightedMin || 0)).filter((value) => value > 0);
  const profitValues = rows.map((row) => Number(row.profitPerWeightedMin || 0)).filter((value) => value > 0);
  const average = (values) => values.length
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : 0;

  return {
    keyword,
    count: rows.length,
    summary: {
      avgSales: average(salesValues),
      avgProfit: average(profitValues),
      maxSales: salesValues.length ? Math.max(...salesValues) : 0,
      maxProfit: profitValues.length ? Math.max(...profitValues) : 0,
      latestDate: rows[0]?.broadcastDate || ''
    },
    results: rows.map((row) => ({
      perfKey: row.perfKey || '',
      pgmCodeName: row.pgmCodeName || String(row.perfKey || '').replace(/^\[[^\]]+\]/, ''),
      broadcastDate: row.broadcastDate || '',
      broadcastTime: row.broadcastTime || '',
      broadcastTimestamp: row.broadcastTimestamp || 0,
      salesPerWeightedMin: Number(row.salesPerWeightedMin || 0),
      profitPerWeightedMin: Number(row.profitPerWeightedMin || 0),
      sourceRow: row.sourceRow || 0
    }))
  };
}

let momongaReportCache = null;
let momongaReportPending = null;
async function loadMomongaReport() {
  if (momongaReportCache && Date.now() - momongaReportCache.loadedAt < 60000) return momongaReportCache;
  if (momongaReportPending) return momongaReportPending;
  momongaReportPending = buildMomongaReport();
  try { return await momongaReportPending; } finally { momongaReportPending = null; }
}
async function buildMomongaReport() {
  const now = Date.now();
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  const active = await firebaseGet('activeSessions');
  const sessions = Object.keys(active || {}).map(parseWeekKey).filter(Boolean)
    .filter(s => getFallbackEndDate(s.startDate) >= today);
  const versions = await Promise.all(sessions.map(s => firebaseGet(`sessions/${s.weekKey}/versions/${VERSION_OPS}`)));
  const current = new Map();
  const future = new Map();
  for (const version of versions) {
    for (const raw of Object.values(version?.scheduleBlocks || {})) {
      if (!raw || raw.isDefault) continue;
      const block = raw.uniqueKey && version.entityProps?.[raw.uniqueKey] ? { ...raw, ...version.entityProps[raw.uniqueKey] } : raw;
      const time = normalizePerfTime(block.timeText);
      const start = Date.parse(`${block.dateKey}T${time}:00+09:00`);
      const duration = Number(block.durationMin);
      if (!Number.isFinite(start) || !(duration > 0)) continue;
      const key = makePerfKey(block.dealTypeConverted || block.dealType, block.pgmCodeName);
      if (!key) continue;
      if (start > now) {
        const id = `${key}|${block.dateKey}|${time}|${block.channel || 'ALL'}`;
        if (!future.has(id)) future.set(id, { perfKey: key, date: block.dateKey, time,
          channel: block.channel || 'ALL', pgmCodeName: block.pgmCodeName || '',
          mdTeam: block.mdTeam || block.orgName || '', dealType: block.dealTypeConverted || block.dealType || '',
          memoCode: block.memoCode || '', scheduleComment: block.scheduleComment || '',
          weightedMin: Number(block.weightedMin || 0), start });
        continue;
      }
      if (now >= start + duration * 60000) continue;
      current.set(key, { perfKey: key, pgmCodeName: block.pgmCodeName, startTime: time,
        timestamp: makeBroadcastTimestamp(block.dateKey, time) });
    }
  }
  const cache = await loadPerformanceCache();
  const products = [...current.values()].map(product => {
    const seen = new Set();
    const history = cache.rows.filter(row => row.perfKey === product.perfKey && row.lateNightPgmYn === 'N' && row.broadcastTimestamp < product.timestamp)
      .sort((a, b) => b.broadcastTimestamp - a.broadcastTimestamp || b.sourceRow - a.sourceRow)
      .filter(row => { const key = `${row.broadcastDate}|${row.broadcastTime}`; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 3);
    const remaining = [...future.values()].filter(slot => slot.perfKey === product.perfKey).sort((a, b) => a.start - b.start);
    return { ...product, history, remaining };
  });
  momongaReportCache = { products, fromCache: Boolean(cache.fromCache), loadedAt: Date.now() };
  return momongaReportCache;
}

module.exports = {
  loadPerformanceCache,
  loadMomongaReport,
  loadSchedule,
  parseSchedule,
  configureCacheDirectory,
  getRtdbProjects,
  refreshFutureOpsVersions,
  searchRemainingSchedules,
  refreshGlobalPerformance,
  searchPerformanceHistory,
  searchCompetitorInfo,
  warmPerformanceCache,
  getPerformanceCacheStatus
};
