const refs=text=>[...new Set((text||'').match(/'[^']+'\[(?:[^\]]|\]\])+\]/g)||[])];
function argumentsOf(text,name,startAt=0) {
  const match=new RegExp('\\b'+name+'\\s*\\(','gi');match.lastIndex=startAt;
  const found=match.exec(text);if(!found)return null;
  let depth=1,begin=match.lastIndex,quote=null;const args=[];
  for(let i=begin;i<text.length;i++) {
    const c=text[i];
    if(quote){if(c===quote){if(text[i+1]===quote)i++;else quote=null;}continue;}
    if(c==='"'||c==="'"){quote=c;continue;}if(c==='['){quote=']';continue;}
    if(c==='(')depth++;else if(c===')'){if(--depth===0){args.push(text.slice(begin,i).trim());return {args,start:found.index,end:i+1};}}
    else if(c===','&&depth===1){args.push(text.slice(begin,i).trim());begin=i+1;}
  }
  throw Error('Unbalanced '+name+' call');
}
function outputsOf(query) {
  const call=argumentsOf(query,'SUMMARIZECOLUMNS')||argumentsOf(query,'ROW');if(!call)return [];
  const outputs=[];
  for(let i=0;i+1<call.args.length;i++)if(/^"(?:[^"]|"")*"$/.test(call.args[i])) {
    const alias=call.args[i].slice(1,-1).replace(/""/g,'"'),expression=call.args[++i];
    outputs.push({alias,expression,references:refs(expression),contextSensitive:/ALLSELECTED|ISINSCOPE|HASONEVALUE/i.test(expression)});
  }
  return outputs;
}
function filtersOf(query) {
  const filters=[];let at=0,call;
  while((call=argumentsOf(query,'TREATAS',at))){filters.push({kind:'TREATAS',values:call.args[0],fields:refs(call.args.slice(1).join(','))});at=call.end;}
  const dates=[...query.matchAll(/DATE\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g)].map(m=>`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`);
  return {treatAs:filters,dateLiterals:[...new Set(dates)],hasAllSelected:/ALLSELECTED\s*\(/i.test(query)};
}
module.exports={refs,argumentsOf,outputsOf,filtersOf};
