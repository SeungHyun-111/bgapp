const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { parse } = require('../src/commands/parser');
const { QueryStore } = require('../src/commands/query-store');
const { createCommandSystem } = require('../src/commands/handlers');
const { ProgramCodeIndex } = require('../src/program-code-index');

async function temporary(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'usagi-commands-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}
test('known performance phrases and conservative unknown routing', () => {
  for (const [input, keyword] of [['58225302 실적','58225302'],['홀베리 당근주스 실적','홀베리 당근주스'],['에이치엘사이언스 최근 실적','에이치엘사이언스']]) {
    assert.deepEqual(parse(input), { intent: 'PERFORMANCE_SEARCH', keyword });
  }
  assert.equal(parse('홀베리', { mode: 'search' }).keyword, '홀베리');
  assert.equal(parse('홀베리', { mode: 'talk' }).intent, null);
  for (const input of ['오늘 방송 중에 제일 잘 나온 게 뭐야?', '저 업체 마지막 방송 언제야?', '이 상품 수수료 몇 프로야?', '어제보다 실적 좋아?', '이번달 방송 몇 번 했어?', '오늘 방송 실적']) assert.equal(parse(input, { mode: 'search' }).intent, null);
  assert.equal(parse('안녕').intent, 'GREETING');
  assert.equal(parse('도움말').intent, 'HELP');
});
test('suspected credentials never enter the learning log or a search handler', async t => {
  const directory = await temporary(t);
  const store = new QueryStore(directory), commands = createCommandSystem(store);
  for (const input of ['password=synthetic-value', '인증 토큰 test', 'sample@example.invalid', 'bearer placeholder', 'Synthetic9!']) {
    assert.equal((await store.append(input)).blocked, true);
    assert.equal((await commands.execute(input, { mode: 'search' })).blocked, true);
  }
  await assert.rejects(fs.readFile(store.file), { code: 'ENOENT' });
});
test('concurrent append preserves JSONL; conversion uses an append-only status overlay', async t => {
  const store = new QueryStore(await temporary(t));
  await Promise.all(Array.from({ length: 50 }, (_, i) => store.append('아직 모르는 질문 ' + i + '\n추가 줄')));
  const before = await fs.readFile(store.file, 'utf8');
  const lines = before.trim().split('\n').map(JSON.parse);
  assert.equal(lines.length, 50); assert.equal(new Set(lines.map(r => r.id)).size, 50);
  assert(lines.every(r => r.status === 'unhandled' && r.timestamp.endsWith('+09:00')));
  await store.markConverted(lines[0].id, 'MARGIN');
  assert.equal(await fs.readFile(store.file, 'utf8'), before);
  const effective = await store.list();
  assert.equal(effective[0].status, 'converted'); assert.equal(effective[0].convertedIntent, 'MARGIN');
  assert.equal(effective[1].status, 'unhandled');
});
test('known local commands do not write notes; unknown questions do', async t => {
  const store = new QueryStore(await temporary(t)), commands = createCommandSystem(store);
  assert.equal((await commands.execute('안녕')).kind, 'reply');
  assert.equal((await commands.execute('홀베리 실적')).kind, 'search');
  assert.equal((await store.list()).length, 0);
  assert.equal((await commands.execute('이번달 방송 몇 번 했어?')).saved, true);
  assert.equal((await store.list()).length, 1);
});
test('autocomplete is local, ranked, Korean/whitespace normalized, cached and bounded', async t => {
  const file = path.join(await temporary(t), 'codes.json'), index = new ProgramCodeIndex(file);
  await index.add(['[홀베리]당근주스', '[선일금고]스페셜에디션', '[홀베리]당근주스', ...Array.from({ length: 20 }, (_, i) => '상품' + i)]);
  assert.deepEqual(index.suggest('홀베리 당근'), ['[홀베리]당근주스']);
  assert.equal(index.suggest('상품').length, 10);
  assert.equal(index.suggest('password=test').length, 0);
  assert.deepEqual(new ProgramCodeIndex(file).suggest('선일'), ['[선일금고]스페셜에디션']);
  const bridge = { query: async dax => {
    assert(dax.includes("DISTINCT('BO'[편성코드])"));
    return { results: [{ tables: [{ rows: [{ 'BO[편성코드]': '새 편성' }] }] }] };
  } };
  assert((await index.refresh(bridge)).count > 0);
  assert.deepEqual(index.suggest('새편'), ['새 편성']);
});
