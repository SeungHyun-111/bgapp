const REPORT_URL = 'https://app.powerbi.com/groups/me/reports/9cd0cf77-a071-4359-8817-1d66cc898b0b/ReportSection32e609eaa4cfa0f386ef?experience=power-bi';

function encodeIdentifier(value) {
  // Power BI URL identifiers use XML-style escapes, including Korean names.
  return String(value).replace(/_x[0-9a-f]{4}_|[^A-Za-z0-9_]|^[0-9]/gi,
    match => Array.from(match).map(char => char.split('').map(unit => `_x${unit.charCodeAt(0).toString(16).padStart(4, '0')}_`).join('')).join(''));
}

function buildReportUrl({ keyword = '', table = '', column = '' } = {}) {
  const url = new URL(REPORT_URL);
  keyword = String(keyword).trim();
  if (!keyword) return url.href;
  table = String(table).trim(); column = String(column).trim();
  if (!table || !column) throw new Error('먼저 설정에서 실제 테이블명과 열 이름을 입력해주세요.');
  if (keyword.length > 300 || table.length > 200 || column.length > 200) throw new Error('검색어나 필드 이름이 너무 깁니다.');
  url.searchParams.set('filter', `${encodeIdentifier(table)}/${encodeIdentifier(column)} eq '${keyword.replace(/'/g, "''")}'`);
  if (url.href.length > 8000) throw new Error('검색 주소가 너무 깁니다.');
  return url.href;
}

module.exports = { REPORT_URL, encodeIdentifier, buildReportUrl };
