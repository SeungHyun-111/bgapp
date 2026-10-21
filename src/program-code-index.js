const fs = require('fs');
const path = require('path');
const { containsCredential } = require('./commands/privacy');
const normalize = value => value.normalize('NFKC').replace(/[\s\[\]]/g, '').toLocaleLowerCase('ko');
class ProgramCodeIndex {
  constructor(file) {
    this.file = file; this.codes = new Set(); this.queue = Promise.resolve();
    try { const cached = JSON.parse(fs.readFileSync(file, 'utf8')); if (cached.source === 'BO[편성코드]' && Array.isArray(cached.codes)) this.add(cached.codes, false); } catch { /* No local index yet. */ }
  }
  add(values, save = true) {
    for (const raw of values) {
      const code = typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : raw;
      if (typeof code === 'string' && code.trim() && code.length <= 300 && !containsCredential(code)) this.codes.add(code.trim());
    }
    if (!save) return Promise.resolve();
    const payload = JSON.stringify({ source: 'BO[편성코드]', updatedAt: new Date().toISOString(), codes: [...this.codes] });
    const task = this.queue.then(async () => {
      await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
      await fs.promises.writeFile(this.file, payload, 'utf8');
    });
    this.queue = task.catch(() => {}); return task;
  }
  suggest(input) {
    if (typeof input !== 'string' || input.length > 150 || containsCredential(input)) return [];
    const query = normalize(input.trim()); if (!query) return [];
    return [...this.codes].map(code => ({ code, normalized: normalize(code) })).filter(item => item.normalized.includes(query))
      .sort((a,b) => Number(b.normalized.startsWith(query)) - Number(a.normalized.startsWith(query)) || a.code.localeCompare(b.code,'ko')).slice(0,10).map(item => item.code);
  }
  async refresh(bridge) {
    const { extractRows } = require('./power-bi-search');
    const rows = extractRows(await bridge.query("EVALUATE TOPN(20001, DISTINCT('BO'[편성코드]), 'BO'[편성코드], ASC)"));
    await this.add(rows.slice(0,20000).map(row => row['BO[편성코드]']));
    return { count: this.codes.size, truncated: rows.length > 20000 };
  }
}
module.exports = { ProgramCodeIndex };
