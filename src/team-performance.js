const mdTeamMap = require('./assets/mdTeamMap.json');
const TEAMS = ['가전팀', '식품팀', '헬스푸드팀'];
const goals = {
  handling: require('./assets/targets/handlingGoal2026.json'),
  profit: require('./assets/targets/marginalProfitGoal2026.json'),
  share: require('./assets/targets/weightedMinutesGoal2026.json')
};
let cached = null, pending = null;
const number = value => Number(String(value ?? '').replace(/,/g, '')) || 0;
function dateKey(value) {
  const raw = String(value || '').trim();
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6)}`;
  const match = raw.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : '';
}
function aggregate(payload, month) {
  const entries = Array.isArray(payload) ? payload.filter(Boolean) : Object.values(payload || {});
  const programs = new Map();
  for (const entry of entries) {
    const row = entry?.raw || [];
    const date = dateKey(entry.broadcastDate || row[0]);
    if (!date.startsWith(month)) continue;
    const rawTeam = String(entry.mdTeam || entry.mdName || row[29] || '').trim();
    const mapped = mdTeamMap[rawTeam] || rawTeam;
    const team = TEAMS.includes(mapped) ? mapped : `${mapped}팀`;
    if (!TEAMS.includes(team)) continue;
    // Match NAVI: one record per date/channel/time/program/team; largest weighted minutes wins.
    const match = String(entry.broadcastTime || row[2] || '').trim().match(/^(\d{1,2})(?::?(\d{2}))?/);
    const time = match ? `${String(Math.min(23, Number(match[1]) || 0)).padStart(2, '0')}:${String(Math.min(59, Number(match[2] || 0) || 0)).padStart(2, '0')}` : '';
    const key = [date, time, String(entry.dayOfWeek || row[1] || 'SK Stoa').trim(), String(entry.pgmCodeName || row[8] || row[6] || row[4] || '').trim(), team].join('|');
    // Incomplete historical records cannot be treated as zero actuals.
    if (!entry.raw && [entry.weightedMin, entry.expectedSales, entry.contributionProfit].some(value => value == null)) continue;
    const next = { team, date, share: number(entry.weightedMin ?? row[11]), handling: number(entry.expectedSales ?? row[13]), profit: number(entry.contributionProfit ?? row[21]) };
    if (!programs.has(key) || next.share > programs.get(key).share) programs.set(key, next);
  }
  return TEAMS.map(team => {
    const rows = [...programs.values()].filter(row => row.team === team);
    const targets = Object.fromEntries(Object.entries(goals).map(([key, data]) => [key,
      Number(month.slice(0, 4)) === data.year ? data.rows.find(row => row.name === team)?.monthly[Number(month.slice(5)) - 1] ?? null : null]));
    return { team, targets, count: rows.length, latestDate: rows.map(row => row.date).sort().at(-1) || '',
      share: rows.reduce((sum, row) => sum + row.share, 0),
      handling: rows.reduce((sum, row) => sum + row.handling, 0),
      profit: rows.reduce((sum, row) => sum + row.profit, 0) };
  });
}
async function loadTeamPerformance() {
  const month = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date());
  if (cached?.month === month && Date.now() - cached.loadedAt < 300000) return cached;
  if (pending) return pending;
  pending = (async () => {
    const source = await require('./schedule').loadPerformanceCache();
    if (source.rows.some(row => dateKey(row.broadcastDate).startsWith(month) && row.expectedSales === undefined)) {
      throw new Error('Stored performance cache needs the team-aggregation fields');
    }
    cached = { month, teams: aggregate(source.rows, month), loadedAt: Date.now(), fromCache: Boolean(source.fromCache) };
    return cached;
  })();
  try { return await pending; } finally { pending = null; }
}
module.exports = { loadTeamPerformance, aggregate };
