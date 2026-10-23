function currentYear(now = new Date()) { return new Date(now.getTime()+9*3600000).getUTCFullYear(); }
const {yearSuggestions,clarificationMessage}=require('./clarification');
function parsePeriod(input, now = new Date(), context = {}) {
  const monthTypo=input.match(/(?:^|[^\d])(\d{1,2})\s*(?:얼|웗)/);
  if(monthTypo&&Number(monthTypo[1])>=1&&Number(monthTypo[1])<=12){
    const suggestions=[{label:monthTypo[1]+'월',input:input.replace(/(\d{1,2})\s*(?:얼|웗)/,'$1월')}];
    return {error:clarificationMessage('아? 월에 오타가 난 것 같아. 이 뜻일까?',suggestions),suggestions};
  }
  // Business shorthand: 26년 -> 2026년; keep four-digit years intact.
  input = input.replace(/(^|[^\d])(\d{2})\s*년/g, (_,prefix,year)=>`${prefix}${2000+Number(year)}년`);
  const rawYears=[...input.matchAll(/(\d+)\s*년/g)];
  if(rawYears.length===1&&(rawYears[0][1].length!==4||Number(rawYears[0][1])<1900||Number(rawYears[0][1])>2100)){
    const suggestions=yearSuggestions(input,now);
    return {error:clarificationMessage(suggestions.length?'아? 연도에 오타가 있는 것 같아. 혹시 이 중 하나를 말한 걸까?':'아? 어느 연도를 뜻하는지 확신이 안 서. 원한 연도를 알려줄래?',suggestions),suggestions};
  }
  const monthly = /월별|매월|매달|월마다|달마다|월\s*단위/.test(input);
  if (/지난\s*달|이전\s*달/.test(input)) return { period:'previous_month' };
  if (/이번\s*달/.test(input)) return { period:'current_month' };
  if (/\d+\s*월\s*(?:부터|~|에서|-)|\d+\s*월.*\d+\s*월/.test(input)) return { error:'기간은 한 달씩 알려줘! 예: 2026년 9월 🐰' };
  const years=[...input.matchAll(/(\d{4})\s*년/g)];
  const months=[...input.matchAll(/(?:^|[^\d])(\d{1,2})\s*월/g)];
  if (/\d+\s*년/.test(input)&&!years.length)return {error:'아? 어느 연도인지 확인해줘. 26년이나 2026년처럼 알려주면 돼 🐰'};
  if (years.length>1 || months.length>1) return {error:'조회할 연도와 월을 하나씩 알려줘 🐰'};
  if (months.length) {
    const month=Number(months[0][1]), relativePast=/작년|지난해/.test(input), year=years.length?Number(years[0][1]):currentYear(now)-(relativePast?1:0);
    if (month<1 || month>12 || year<1900 || year>2100) return {error:'연도와 월을 다시 확인해줘! 월은 1~12월이야 🐰'};
    return {period:{year,month},groupBy:monthly?'month':null,defaultedYear:years.length===0&&!relativePast};
  }
  if (years.length || /작년|지난해|올해/.test(input) || monthly) {
    const explicit = years.length || /작년|지난해|올해/.test(input);
    const year = years.length ? Number(years[0][1]) : /작년|지난해/.test(input) ? currentYear(now)-1 : /올해/.test(input) ? currentYear(now) : context.period?.year || currentYear(now);
    if (year<1900 || year>2100) return {error:'연도를 다시 확인해줘 🐰'};
    return {period:{year}, groupBy:monthly?'month':context.groupBy, defaultedYear:!explicit&&!context.period?.year};
  }
  return {};
}
module.exports={parsePeriod,currentYear};
