const intents = require('./intents');
const { containsCredential } = require('./privacy');
function parse(input, { mode = 'talk' } = {}) {
  if (typeof input !== 'string' || !input.trim() || input.length > 2000) return { error: '1~2,000자 이내로 입력해주세요.' };
  if (containsCredential(input)) return { blocked: true };
  const value = input.trim().replace(/\s+/g, ' ');
  if (/^(안녕(?:하세요)?|하이|hello|hi)[!.~ ]*$/i.test(value)) return { intent: intents.GREETING };
  if (/^(도움말|사용법|뭐 할 수 있어|help)[?!. ]*$/i.test(value)) return { intent: intents.HELP };
  // Unknown comparisons, dates, rankings and other questions must not become
  // product keywords merely because they mention performance.
  const unsupported = /(?:[?？]|언제|몇\s*(?:번|프로|퍼센트)|수수료|마진|어제보다|전주\s*대비|지난주|이번\s*달|오늘\s|어제\s|제일|순위|비교|좋아|(?:나요|인가요|했어)[.!]*$)/.test(value);
  const explicit = value.match(/^(.+?)\s+(?:최근\s+)?실적(?:\s*(?:검색|조회|알려줘|보여줘|찾아줘))?[.!]*$/);
  if (!unsupported && explicit && explicit[1].length <= 150) return { intent: intents.PERFORMANCE_SEARCH, keyword: explicit[1].trim() };
  if (mode === 'search' && !unsupported && value.length <= 150 && !/(?:알려줘|보여줘|찾아줘|몇|얼마|뭐야|해줘)[.!]*$/.test(value)) return { intent: intents.PERFORMANCE_SEARCH, keyword: value };
  return { intent: null };
}
module.exports = { parse };
