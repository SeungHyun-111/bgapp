const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/analyze-power-bi-visuals.js <performance-json>');
const capture = JSON.parse(fs.readFileSync(input, 'utf8').replace(/^\uFEFF/, ''));
assert(Array.isArray(capture.events), 'Performance data must contain events.');
const modelPath = path.join(root, 'src/power-bi-model.json');
const model = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
const columns = new Set(model.tables.flatMap(t => t.columns.map(c => `'${t.name}'[${c.name}]`)));
const byId = new Map(capture.events.map(event => [event.id, event]));
const refs = text => [...new Set(text.match(/'[^']+'\[(?:[^\]]|\]\])+\]/g) || [])];

// Split DAX arguments without splitting commas inside functions or strings.
function argumentsOf(query, fn) {
  const start = query.indexOf(fn + '(');
  if (start < 0) return [];
  const args = []; let depth = 1, begin = start + fn.length + 1, quote = null;
  for (let i = begin; i < query.length; i++) {
    const c = query[i];
    if (quote) {
      if (c === quote) {
        if (query[i + 1] === quote) i++;
        else quote = null;
      }
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '[') { quote = ']'; continue; }
    if (c === '(') depth++;
    if (c === ')') {
      depth--;
      if (!depth) { args.push(query.slice(begin, i).trim()); return args; }
    }
    if (c === ',' && depth === 1) { args.push(query.slice(begin, i).trim()); begin = i + 1; }
  }
  throw new Error('Unbalanced DAX arguments.');
}

const queriesDir = path.join(root, 'docs/power-bi/queries');
fs.mkdirSync(queriesDir, { recursive: true });
const visuals = capture.events.filter(event => typeof event.metrics?.QueryText === 'string').map((event, index) => {
  let owner = event; const visited = new Set();
  while (owner && !owner.metrics?.visualId && !visited.has(owner.id)) { visited.add(owner.id); owner = byId.get(owner.parentId); }
  const query = event.metrics.QueryText;
  const id = owner?.metrics?.visualId || event.id;
  assert(/^[a-zA-Z0-9-]+$/.test(id), 'Unexpected visual identifier.');
  const queryFile = `docs/power-bi/queries/${index + 1}-${id}.dax`;
  fs.writeFileSync(path.join(root, queryFile), query.replace(/\r\n/g, '\n') + '\n');
  const args = argumentsOf(query, 'SUMMARIZECOLUMNS');
  const outputs = [];
  for (let i = 0; i + 1 < args.length; i++) {
    if (/^"(?:[^"]|"")*"$/.test(args[i])) {
      const expression = args[++i];
      outputs.push({ alias: args[i - 1].slice(1, -1).replace(/""/g, '"'), expression, references: refs(expression) });
    }
  }
  const groupArgs = argumentsOf(query, 'ROLLUPGROUP');
  const measures = [...new Set(outputs.flatMap(output => output.references).filter(ref => !columns.has(ref)))];
  return {
    id, title: owner?.metrics?.visualTitle || null, type: owner?.metrics?.visualType || null,
    recordedAt: event.start, recordedRowCount: event.metrics.RowCount ?? null,
    filterContext: /IN\s*\{\(\(DATE\(/.test(query) ? 'program-code-and-selected-broadcast-row' : 'program-code',
    programCodeValues: [...new Set([...query.matchAll(/\[편성코드\]\s+IN\s*\{([^}]+)\}|TREATAS\(\{([^}]+)\},\s*'BO'\[편성코드\]\)/g)].map(m => m[1] || m[2]))],
    groupingFields: groupArgs.length ? refs(groupArgs.join('\n')) : [],
    outputs, measureReferences: measures, allReferences: refs(query), queryFile,
    queryText: query,
  };
});

const summary = {
  reportId: model.reportId, reportPage: model.reportPage,
  sourceFile: path.basename(input), sourceVersion: capture.version,
  visualQueryCount: visuals.length,
  limitations: [
    'Recorded visual queries only; this is not the complete report definition.',
    'Measure references are captured; their internal model formulas are not included.',
    'Queries preserve recorded product filters and selected-row interactions; do not reuse these constants as universal search filters.',
    'Visual position, formatting, and display units are not established by these events.',
    'Row counts are recorded metadata; no query result values are present in this file.'
  ],
  visuals,
};
fs.writeFileSync(path.join(root, 'src/power-bi-visuals.json'), JSON.stringify(summary, null, 2) + '\n');
const measures = [...new Set(visuals.flatMap(v => v.measureReferences))];
for (const reference of measures) {
  if (!model.measures.some(m => m.reference === reference)) model.measures.push({
    reference, expression: null, status: 'referenced-in-visual-query',
    source: 'power-bi-visuals.json',
  });
}
model.visualAnalysis = { file: 'power-bi-visuals.json', visualQueryCount: visuals.length, measureDefinitionStatus: 'not-extracted' };
fs.writeFileSync(modelPath, JSON.stringify(model, null, 2) + '\n');
console.log(JSON.stringify({ visualQueries: visuals.length, measureReferences: measures.length,
  contexts: visuals.map(v => ({ type: v.type, context: v.filterContext, outputCount: v.outputs.length })) }, null, 2));
