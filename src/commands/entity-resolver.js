const normalize=value=>String(value||'').normalize('NFKC').replace(/[\s\[\]()?？!.·]/g,'').replace(/헬쓰/g,'헬스').toLowerCase();
const key=entity=>entity.kind+'|'+entity.value;
const confirmed=require('../../data/training/decisions.json').facts.filter(f=>f.status==='user-confirmed'&&f.aliases);
function aliases(entity) {
  const names=new Set([entity.value,entity.name,...(entity.aliases||[])]);
  if (entity.kind==='organization') {
    for(const fact of confirmed)if(normalize(fact.canonical)===normalize(entity.value))for(const name of fact.aliases)names.add(name);
    for (const name of [...names]) if (name) {
      names.add(name.replace(/팀$/,''));
      names.add(name.replace(/팀$/,'')+'팀');
      if (/헬[스쓰]푸드/.test(name)) {names.add('헬스');names.add('헬스푸드팀');}
    }
  } else {
    const brand=entity.value.match(/^\[([^\]]+)\]/)?.[1];
    if (brand) names.add(brand);
    names.add(entity.value.replace(/^\[[^\]]+\]/,''));
  }
  return [...names].filter(Boolean).map(normalize).filter(name=>name.length>=2);
}
function resolveEntities(input, entities) {
  const text=normalize(input), matched=[];
  if (/브랜드/.test(input)) {
    const brands=new Map();
    for(const entity of entities.filter(e=>e.kind==='product')) {
      const brand=entity.value.match(/^\[([^\]]+)\]/)?.[1];
      if(brand && text.includes(normalize(brand)))brands.set(normalize(brand),{kind:'brand',field:'편성코드',value:brand,name:`${brand} 브랜드 전체`});
    }
    if(brands.size)return [...brands.values()];
  }
  for (const entity of entities) {
    const lengths=aliases(entity).filter(name=>{
      if(!text.includes(name))return false;
      if(entity.kind!=='organization')return true;
      // Do not consume an organization stem inside a longer metric word.
      const words=String(input).normalize('NFKC').replace(/헬쓰/g,'헬스').toLowerCase();
      let at=words.indexOf(name);
      while(at>=0){
        const after=words.slice(at+name.length);
        if(!/[가-힣a-z]/i.test(words[at-1]||' ')&&/^(?:$|[^가-힣a-z]|팀|은|는|의|을|를|이|가|에서|으로|찾)/i.test(after))return true;
        at=words.indexOf(name,at+1);
      }
      return false;
    }).map(name=>name.length);
    if (lengths.length) matched.push({entity,score:Math.max(...lengths)});
  }
  const explicitTeam=/팀|조직/.test(input);
  const candidates=explicitTeam?matched.filter(m=>m.entity.kind==='organization'):matched;
  if (!candidates.length) return [];
  const max=Math.max(...candidates.map(m=>m.score));
  return [...new Map(candidates.filter(m=>m.score===max).map(m=>[key(m.entity),m.entity])).values()];
}
function isEntityReply(input,entities) {
  const text=normalize(input).replace(/^(그럼|그러면)/,'').replace(/(?:으로|은|는|이야|로|도)$/,'');
  return entities.some(entity=>aliases(entity).includes(text));
}
module.exports={resolveEntities,normalize,key,isEntityReply};
