const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const { containsCredential } = require('./privacy');
const timestamp = () => new Date(Date.now() + 9 * 3600000).toISOString().replace('Z', '+09:00');

class QueryStore {
  constructor(directory) {
    this.directory = directory;
    this.file = path.join(directory, 'unhandled-queries.jsonl');
    this.eventsFile = path.join(directory, 'query-status-events.jsonl');
    this.queue = Promise.resolve();
  }
  appendLine(file, record) {
    const task = this.queue.then(async () => {
      await fs.mkdir(this.directory, { recursive: true });
      await fs.appendFile(file, JSON.stringify(record) + '\n', { encoding: 'utf8', mode: 0o600 });
    });
    this.queue = task.catch(() => {});
    return task;
  }
  async append(input, source = 'talk') {
    if (typeof input !== 'string' || !input.trim() || input.length > 2000) throw Error('입력 길이를 확인해주세요.');
    if (containsCredential(input)) return { blocked: true };
    const record = { id: randomUUID(), timestamp: timestamp(), input: input.trim(), status: 'unhandled', source };
    await this.appendLine(this.file, record);
    return { id: record.id, status: record.status };
  }
  async readLines(file) {
    let value;
    try { value = await fs.readFile(file, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    return value.split(/\r?\n/).filter(Boolean).map((line, index) => {
      try { return JSON.parse(line); } catch { throw Error('학습 노트의 JSON 형식을 확인해주세요. 줄: ' + (index + 1)); }
    });
  }
  async list() {
    await this.queue;
    const records = await this.readLines(this.file);
    const changes = await this.readLines(this.eventsFile);
    const latest = new Map(changes.map(event => [event.id, event]));
    return records.map(record => latest.has(record.id) ? { ...record, status: 'converted', convertedIntent: latest.get(record.id).convertedIntent, convertedAt: latest.get(record.id).timestamp } : record);
  }
  async markConverted(id, intent) {
    if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(intent || '')) throw Error('Intent 이름은 대문자 영문과 밑줄로 입력해주세요.');
    if (!(await this.list()).some(record => record.id === id)) throw Error('해당 질문 ID를 찾을 수 없습니다.');
    await this.appendLine(this.eventsFile, { id, timestamp: timestamp(), status: 'converted', convertedIntent: intent });
  }
}
module.exports = { QueryStore };
