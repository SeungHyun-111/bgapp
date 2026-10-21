const visuals = require('./power-bi-visuals.json').visuals;
const main = visuals.find(v => v.type === 'tableEx' && v.filterContext === 'program-code');
const cards = visuals.filter(v => v.type === 'card');
const text = v => '"' + String(v).replace(/"/g, '""') + '"';
function searchFilter(keyword) {
  if (typeof keyword !== 'string' || !keyword.trim() || keyword.length > 150) throw Error('검색어를 1~150자로 입력해주세요.');
  const literal = text(keyword.trim().replace(/~/g,'~~').replace(/\*/g,'~*').replace(/\?/g,'~?'));
  const filter = "FILTER(ALL('BO'), CONTAINSSTRING('BO'[편성코드], " + literal + ") || CONTAINSSTRING('BO'[대표업체명], " + literal + ") || CONTAINSSTRING('BO'[대표상품명], " + literal + "))";
  return filter;
}
const slicerFields = { program: '편성코드', deal: '거래형태', night: '심야구분', video: '영상구분' };
function reportFilter(keyword, filters = {}) {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) throw Error('필터 값이 올바르지 않습니다.');
  const conditions = [];
  for (const [key, field] of Object.entries(slicerFields)) {
    const value = filters[key];
    if (value == null || value === '') continue;
    if (typeof value !== 'string' || value.length > 300) throw Error('필터 값이 너무 깁니다.');
    conditions.push("'BO'["+field+'] = '+text(value));
  }
  return conditions.length ? 'FILTER('+searchFilter(keyword)+', '+conditions.join(' && ')+')' : searchFilter(keyword);
}
function searchDax(keyword, filters = {}) {
  return main.queryText.replace(/TREATAS\(\{[^}]*\},\s*'BO'\[편성코드\]\)/,reportFilter(keyword, filters));
}
function optionsDax(keyword) {
  return 'EVALUATE TOPN(1001, SUMMARIZE('+searchFilter(keyword)+", 'BO'[편성코드], 'BO'[거래형태], 'BO'[심야구분], 'BO'[영상구분]), 'BO'[편성코드], 1)";
}
function selectedFilter(row) {
  const conditions = main.groupingFields.map(ref => {
    const key = ref.replace(/^'BO'/,'BO');
    if (!(key in row)) throw Error('방송 구분 필드가 누락됐습니다.');
    const value = row[key];
    if (value == null) return 'ISBLANK(' + ref + ')';
    let literal = typeof value === 'number' && Number.isFinite(value) ? String(value) : text(value);
    if (ref === "'BO'[방송일시]") {
      const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
      if (!m) throw Error('방송일시 형식을 확인할 수 없습니다.');
      literal = '(DATE('+ +m[1]+','+ +m[2]+','+ +m[3]+')+TIME('+ +m[4]+','+ +m[5]+','+ +m[6]+'))';
    }
    return ref + ' = ' + literal;
  });
  return "FILTER(ALL('BO'), "+conditions.join(' && ')+')';
}
function cardsDax(filter) {
  const outputs = cards.map((v,i) => '"card'+i+'", '+v.outputs[0].expression).join(',\n');
  return 'DEFINE VAR __Selected = '+filter+'\nEVALUATE SUMMARIZECOLUMNS(__Selected, '+outputs+')';
}
function detailDax(row) { return cardsDax(selectedFilter(row)); }
function visualDax(section, filter) {
  if (section === 'cards') return cardsDax(filter);
  const ids = { year: '4d44c16cb5cd964873d8', month: 'f5c437d5797bbbbf2b46', hour: '1a280d82c19a30eebd37', image: 'f40317861c9460856e83' };
  const visual = visuals.find(v => v.id === ids[section]);
  if (!visual) throw Error('지원하지 않는 시각화입니다.');
  const core = visual.queryText.indexOf('VAR __DS0Core');
  if (core < 0) throw Error('원본 시각화 쿼리를 확인할 수 없습니다.');
  let query = 'DEFINE VAR __DS0FilterTable = '+filter+'\n'+visual.queryText.slice(core);
  // Execute Queries accepts one result table. Return the matrix core with its
  // actual weekday/hour keys instead of the report's three transport tables.
  if (section === 'hour') query = query.slice(0, query.indexOf('EVALUATE')) + "EVALUATE __DS0Core\nORDER BY [IsGrandTotalRowTotal], 'BO'[HOUR(DAX)], [IsGrandTotalColumnTotal], 'BO'[WEEKDAY(DAX)]";
  return query;
}
function extractRows(json) {
  if (json?.error || json?.results?.some(r=>r.error)) throw Error('Power BI 조회 오류가 발생했습니다.');
  const rows = json?.results?.[0]?.tables?.[0]?.rows;
  if (!Array.isArray(rows)) throw Error('Power BI 응답 형식이 올바르지 않습니다.');
  return rows;
}
module.exports = {searchDax,detailDax,extractRows,searchFilter,selectedFilter,visualDax,reportFilter,optionsDax,slicerFields};
