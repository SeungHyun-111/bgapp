const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const sections=['cards','year','month','hour','image'];
const filterKeys=['program','deal','night','video'];
let schema,revision=0,visualRevision=0,searchId=null,data=null,selected=null,sortKey='BO[방송일시]',sortDirection=-1;
let suggestionRevision=0, suggestionTimer=null, suggested=[], activeSuggestion=-1, composing=false, talkComposing=false, commandPending=false, commandToken=0;
let activeCommand=null;
const talkRequests=new Map();
window.powerBi.engine().then(info=>{if(info)$('engine-status').textContent=`${info.engine} · ${info.execution}`;}).catch(()=>{$('engine-status').textContent='대화 엔진 상태를 확인하지 못했어';});
window.powerBi.onReplyProgress(result=>{
 const queued=talkRequests.get(result.requestId);
 if(queued){if(queued.revision!==revision)return;queued.firstResultMs=performance.now()-queued.startedTick;queued.result=result;paintReply(queued.draft,result,queued.timing());return;}
 const active=activeCommand;if(!active||result.requestId!==active.id||active.revision!==revision||active.token!==commandToken)return;
 active.firstResultMs=performance.now()-active.startedTick;active.result=result;
 active.draft=showReply(active.input,result,active.timing());
 status('실제 BI 결과를 먼저 표시했어. 설명을 기다리는 중이야 🐰');
});
const status=m=>{$('status').textContent=m;$('status').hidden=!m;};
function format(value,column={}){
 if(value==null)return '—';
 if(column.key==='BO[YEAR(DAX)]'||column.key==='BO[MONTH(DAX)]')return String(value);
 if(column.percent)return (Number(value)*100).toLocaleString('ko-KR',{minimumFractionDigits:column.digits??1,maximumFractionDigits:column.digits??1})+'%';
 if(column.million)return (Number(value)/1000000).toLocaleString('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:2})+'백만';
 if(typeof value==='number')return value.toLocaleString('ko-KR',{maximumFractionDigits:column.digits??0});
 if(column.label==='방송일시')return String(value).replace('T',' ').slice(0,16);
 return String(value);
}
function clearView(clearInput=false){
 for(const request of talkRequests.values())clearInterval(request.timer);talkRequests.clear();
 activeCommand=null;
 commandToken++;commandPending=false;$('talk-send').disabled=false;
 closeSuggestions();
 revision++;visualRevision++;searchId=null;data=null;selected=null;
 for(const id of ['top-cards','results','ratios','year','month','hour','image','extra-content'])$(id).replaceChildren();
 $('content').hidden=true;$('all').hidden=true;$('search').disabled=false;$('context').textContent='';$('extra').open=false;$('bubble').scrollTop=0;
 if(clearInput){$('conversation').replaceChildren();$('conversation').hidden=true;$('keyword').value='';$('talk-input').value='';$('talk-send').disabled=false;}
 status('');
}
window.powerBi.onReset(()=>clearView(true));
window.powerBi.onFocus(()=>$('keyword').focus());
window.powerBi.onStatus(m=>{if(talkRequests.size||commandPending||!$('content').hidden||$('search').disabled)status(m);});
$('hide').onclick=()=>window.powerBi.hide();
$('clear').onclick=()=>{clearView(true);window.powerBi.reset();$('keyword').focus();};
$('keyword').addEventListener('input',()=>{
 if(data||searchId!=null||$('search').disabled){clearView();window.powerBi.reset();}
 scheduleSuggestions();
});
const resize=()=>window.powerBi.resize(Math.max(200,$('bubble').scrollHeight+2)+26,!$('content').hidden);
new ResizeObserver(resize).observe($('bubble'));
new MutationObserver(resize).observe($('bubble'),{childList:true,subtree:true,characterData:true});
function message(id,text){$(id).replaceChildren(el('p',text,'block-message'));}
function buildTable(rows,columns,{total=null,selectable=false,mini=false,heat=false}={}){
 const wrap=el('div',null,'table-wrap'),table=el('table',null,heat?'mini-table heatmap':mini?'mini-table':'');
 if(columns.every(c=>c.width))table.style.width=columns.reduce((sum,c)=>sum+c.width,0)+'px';
 const cg=el('colgroup');for(const c of columns){const col=el('col');if(c.width)col.style.width=c.width+'px';cg.append(col);}table.append(cg);
 const hr=el('tr');
 for(const c of columns){const th=el('th',c.label,c.numeric?'numeric':null);th.title=c.fullLabel||c.label;if(selectable){th.tabIndex=0;const sort=()=>{if(sortKey===c.key)sortDirection*=-1;else{sortKey=c.key;sortDirection=1;}renderMainTable();};th.onclick=sort;th.onkeydown=e=>{if(e.key==='Enter')sort();};}hr.append(th);}
 const head=el('thead');head.append(hr);table.append(head);
 function tr(row,isTotal=false){
  const result=el('tr');
  if(selectable&&selected!=null&&data.rows[selected]===row)result.classList.add('selected');
  for(const [i,c] of columns.entries()){
   const value=isTotal&&i===0?'합계':(isTotal&&c.key.startsWith('BO[')?'':row[c.key]==null?'':format(row[c.key],c));
   const td=el('td',value,c.numeric?'numeric':null);td.title=value;
   if(heat&&!isTotal&&i>0&&row[c.key]!=null){
    const amount=Math.max(0,Math.min(1,Number(row[c.key])/2.5));
    td.style.backgroundColor='hsl(205 100% '+(100-amount*52)+'%)';
   }
   result.append(td);
  }
  if(selectable){
   const choose=()=>{const index=data.rows.indexOf(row);selected=selected===index?null:index;renderMainTable();renderExtra();loadAllVisuals();};
   result.tabIndex=0;result.setAttribute('role','button');result.onclick=choose;result.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}};
  }
  return result;
 }
 const body=el('tbody');for(const row of rows)body.append(tr(row));table.append(body);
 if(total){const foot=el('tfoot');foot.append(tr(total,true));table.append(foot);}
 wrap.append(table);return wrap;
}
function mainColumns(){
 const get=(key,label,width,numeric=false)=>{const source=schema.columns.find(c=>c.key===key);return {...source,key,label,width,numeric,fullLabel:source?.label};};
 const first=[
  get('BO[방송일시]','방송일시',115),get('BO[다원구분]','다원구분',75),
  get('[Sum노출분]','노출분',48,true),get('[Sum가중분]','가중분',48,true),
  get('BO[MD분류]','MD분류',85),get('BO[편성코드]','편성코드',170),
  get('BO[대표업체명]','대표업체명',150),get('BO[대표상품명]','대표상품명',270),
  get('[v_전체_한계_분_]','(전체)한계(분)',95,true),
  get('[Sumv_전체_방송중_제휴포인트]','(전체/방송중)제휴포인트',85,true),
  get('BO[편성 Comment]','편성 Comment',150)
 ];
 const used=new Set(first.map(c=>c.key));
 return [...first,...schema.columns.filter(c=>!used.has(c.key)).map(c=>({...c,width:150,numeric:c.key.startsWith('[')}))];
}
function renderMainTable(){
 const rows=[...data.rows].sort((a,b)=>{const av=a[sortKey],bv=b[sortKey];return (typeof av==='number'&&typeof bv==='number'?av-bv:String(av??'').localeCompare(String(bv??''),'ko'))*sortDirection;});
 $('results').replaceChildren(buildTable(rows,mainColumns(),{total:data.total,selectable:true}));
 const row=selected==null?null:data.rows[selected];
 $('context').textContent=row?'선택 방송: '+format(row['BO[방송일시]'],{label:'방송일시'})+' · '+row['BO[편성코드]']:'';
 $('all').hidden=selected==null;
}
function renderExtra(){
 const root=$('extra-content');root.replaceChildren();
 const source=selected==null?data.total:data.rows[selected];if(!source)return;
 const grid=el('div',null,'field-grid');
 for(const c of schema.columns){const item=el('div');item.append(el('span',c.label),el('strong',format(source[c.key],c)));grid.append(item);}root.append(grid);
}
function kpi(parent,value,label,options={}){
 const box=el('div',null,'kpi'+(options.highlight?' highlight':''));
 box.append(el('strong',format(value,options)),el('span',label));parent.append(box);
}
function renderCards(rows){
 const c=rows[0]||{};$('top-cards').replaceChildren();$('ratios').replaceChildren();
 kpi($('top-cards'),c['[card0]'],'(전체/미리주문)예상취급액(V-)',{million:true});
 kpi($('top-cards'),c['[card1]'],'(전체/미리주문)한계이익',{million:true});
 kpi($('top-cards'),c['[card2]'],'(전체/미리주문)한익률(%)',{percent:true,digits:2});
 kpi($('top-cards'),c['[card3]'],'(전체)한계(분)',{million:true,highlight:true});
 kpi($('ratios'),c['[card4]'],'(전체/방송중)한계이익률(C/A)',{percent:true,digits:1});
 kpi($('ratios'),c['[card5]'],'(전체/방송중)변동비율(B/A)',{percent:true,digits:1});
 $('ratios').append(el('p','ARS매출에서 적용, 수수료율\nGAP발생','note'));
 schema.cards.forEach((definition,i)=>{const parent=i<4?$('top-cards'):$('ratios');parent.children[i<4?i:i-4].title=definition.label;});
}
function renderPeriod(section,rows){
 const year=section==='year',period='BO['+(year?'YEAR':'MONTH')+'(DAX)]';
 const sales=schema[section].find(c=>c.label==='(연동/방송중)예상취급(%)');
 const profit=schema[section].find(c=>c.label==='(전체/방송중)한계달성률(%)');
 const columns=[{key:period,label:year?'YEAR(DAX)':'MONTH(DAX)',width:year?48:52},
 {...sales,label:'취급(%)',width:62,numeric:true},{...profit,label:'한계(%)',width:62,numeric:true}];
 $(section).replaceChildren(buildTable(rows.filter(r=>!r['[IsGrandTotalRowTotal]']),columns,{total:rows.find(r=>r['[IsGrandTotalRowTotal]']),mini:true}));
}
function renderHeatmap(rows){
 const rowId=r=>r['[IsGrandTotalRowTotal]']?'합계':String(r['BO[HOUR(DAX)]']??'빈 값');
 const colId=r=>r['[IsGrandTotalColumnTotal]']?'합계':String(r['BO[WEEKDAY(DAX)]']??'빈 값');
 const cols=[...new Set(rows.map(colId))].sort((a,b)=>a==='합계'?1:b==='합계'?-1:Number(a)-Number(b)),grouped=new Map();
 for(const row of rows){const id=rowId(row);if(!grouped.has(id))grouped.set(id,{hour:id});grouped.get(id)[colId(row)]=row[schema.hour[0].key];}
 const all=[...grouped.values()];
 const columns=[{key:'hour',label:'HOUR(DAX)',width:44},...cols.map(c=>({key:c,label:c,percent:true,digits:1,width:45}))];
 const total=all.find(r=>r.hour==='합계');
 $('hour').replaceChildren(buildTable(all.filter(r=>r!==total),columns,{total,heat:true}));
}
function renderImages(rows){
 $('image').replaceChildren();
 for(const row of rows){const value=row['BO[이미지]'];if(!value)continue;
  try{const url=new URL(String(value));if(url.protocol!=='https:')throw Error();const img=el('img');img.src=url.href;img.alt='대표상품 이미지';img.referrerPolicy='no-referrer';img.onerror=()=>img.replaceWith(el('p','이미지를 불러올 수 없습니다.','block-message'));$('image').append(img);}catch{$('image').append(el('p','표시할 수 없는 이미지 주소입니다.','block-message'));}
 }
 if(!$('image').childElementCount)message('image','등록된 이미지가 없습니다.');
}
async function loadAllVisuals(){
 if(!data||searchId==null)return;
 const current=++visualRevision,currentSearch=revision,index=selected;
 renderCards([]);for(const s of ['year','month','hour','image'])message(s,'조회 중…');
 const results=await Promise.allSettled(sections.map(async section=>{
  const response=await window.powerBi.visual({searchId,section,index});
  if(current!==visualRevision||currentSearch!==revision||response.stale)return;
  if(response.error)throw Error(response.error);
  const rows=response.rows;
  if(section==='cards')renderCards(rows);
  else if(section==='year'||section==='month')renderPeriod(section,rows);
  else if(section==='hour')renderHeatmap(rows);
  else renderImages(rows);
 }));
 if(current!==visualRevision||currentSearch!==revision)return;
 const failed=results.map((r,i)=>r.status==='rejected'?sections[i]:null).filter(Boolean);
 for(const section of failed){if(section==='cards'){message('top-cards','카드를 불러오지 못했습니다.');message('ratios','조회 실패');}else message(section,'데이터를 불러오지 못했습니다.');}
 status(failed.length?'일부 지표 조회 실패: '+failed.join(', '):(data.limited?'최근 최대 501건 표시 · ':'')+(index==null?'검색 전체 기준':'선택 방송 기준')+' · 표 행을 선택하면 관련 지표가 바뀝니다.'+(data.optionsLimited?' · 필터 목록은 최대 1,001개 조합입니다.':''));
}
function renderOptions(options,filters){
 for(const key of filterKeys){
  const select=$('filter-'+key);select.replaceChildren(el('option','모두'));select.firstChild.value='';
  for(const value of options[key]||[]){const option=el('option',value||'(빈 값)');option.value=value;select.append(option);}
  if(filters[key]&&![...select.options].some(o=>o.value===filters[key])){const option=el('option',filters[key]);option.value=filters[key];select.append(option);}
  select.value=filters[key]||(key==='program'&&options[key]?.length===1?options[key][0]:'');
 }
}
async function runSearch(filters={}, resolvedKeyword=null){
 const keyword=resolvedKeyword??$('keyword').value.trim();clearView();
 if(!keyword){status('검색어를 입력해주세요.');return;}
 const current=revision;$('search').disabled=true;status('Power BI에서 조회 중…');
 try{
  schema=await window.powerBi.schema();if(current!==revision)return;
  const response=await window.powerBi.search({keyword,filters});
  if(current!==revision||response.stale)return;if(response.error)throw Error(response.error);
  data=response;searchId=response.searchId;$('content').hidden=false;
  renderOptions(response.options||{},filters);renderMainTable();renderExtra();$('search').disabled=false;
  if(!response.rows.length){renderCards([]);status('선택한 필터에 일치하는 방송이 없습니다.');return;}
  await loadAllVisuals();
 }catch(error){if(current===revision){clearView();status(error.message);}}
 finally{if(current===revision)$('search').disabled=false;}
}
for(const key of filterKeys)$('filter-'+key).onchange=()=>runSearch(Object.fromEntries(filterKeys.map(k=>[k,$('filter-'+k).value])));
$('all').onclick=()=>{selected=null;renderMainTable();renderExtra();loadAllVisuals();};
$('search-form').onsubmit=event=>{event.preventDefault();submitCommand();};
function closeSuggestions(){
 clearTimeout(suggestionTimer);suggestionRevision++;suggested=[];activeSuggestion=-1;
 $('suggestions').hidden=true;$('suggestions').replaceChildren();$('keyword').setAttribute('aria-expanded','false');$('keyword').removeAttribute('aria-activedescendant');
}
function paintReply(turn,result,timing){
 const reply=turn.querySelector('.usagi-message');reply.replaceChildren(el('div',result.message));
 if(result.biResult){
  const data=result.biResult;
  if(data.basis)reply.append(el('div',data.basis,'bi-result-basis'));
  const wrap=el('div',null,'bi-chat-data'),table=el('table');
  const header=el('tr');for(const column of data.columns)header.append(el('th',column.label+(column.unit?` (${column.unit})`:'')));
  const head=el('thead');head.append(header);table.append(head);
  const body=el('tbody');for(const row of data.rows){const tr=el('tr');for(const column of data.columns)tr.append(el('td',row[column.key]));body.append(tr);}table.append(body);wrap.append(table);reply.append(wrap);
  if(!data.rows.length)reply.append(el('div','조건에 맞는 데이터가 없어.','bi-result-basis'));
  if(data.limited)reply.append(el('div','조회 결과 중 표시 개수까지만 보여줬어.','bi-result-basis'));
 }
 if(timing){
  const stamp=value=>new Date(value).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const meta=turn.querySelector('.conversation-timing');meta.textContent=`질문 ${stamp(timing.startedAt)} → 답변 ${stamp(timing.finishedAt)} · ${(timing.elapsedMs/1000).toFixed(1)}초`+(timing.firstResultMs!=null?` · BI 결과 ${(timing.firstResultMs/1000).toFixed(1)}초`:'');
  meta.title=`${new Date(timing.startedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})} → ${new Date(timing.finishedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})} (한국 시간)`;
 }
}
function showReply(input,result,timing){
 $('conversation').hidden=false;
 const turn=el('div',null,'conversation-turn');
 turn.append(el('div',result.blocked?'인증 정보는 표시하지 않음':input,'user-message'),el('div',null,'usagi-message'),el('div',null,'conversation-timing'));
 paintReply(turn,result,timing);
 $('conversation').append(turn);
 while($('conversation').childElementCount>20)$('conversation').firstChild.remove();
 $('conversation').scrollTop=$('conversation').scrollHeight;
 status(result.saved?'이 기기의 학습 노트에 기록했어요.':result.blocked?'저장하거나 전송하지 않았어요.':'');
 return turn;
}
async function submitTalk(){
 if(talkComposing)return;
 const inputElement=$('talk-input'),input=inputElement.value.trim();if(!input)return;
 const startedAt=Date.now(),startedTick=performance.now(),request={id:crypto.randomUUID(),revision,startedTick};
 request.timing=()=>({startedAt,finishedAt:Date.now(),elapsedMs:performance.now()-startedTick,firstResultMs:request.firstResultMs});
 request.draft=showReply(input,{message:talkRequests.size?'앞선 답변 뒤에 이어서 답할게 🐰':'우응, 답을 생각하고 있어 🐰'},request.timing());
 talkRequests.set(request.id,request);inputElement.value='';$('talk-send').disabled=false;
 request.timer=setInterval(()=>{if(request.revision===revision){const meta=request.draft.querySelector('.conversation-timing');meta.textContent=`응답 대기 ${(performance.now()-startedTick)/1000|0}초 · 다음 메시지도 보낼 수 있어`; }},1000);
 try{
  const result=await window.powerBi.command({text:input,mode:'talk',requestId:request.id});
  if(request.revision!==revision)return;
  if(result.error)throw Error(result.error);
  paintReply(request.draft,{...result,biResult:result.biResult||request.result?.biResult},request.timing());
 }catch(error){if(request.revision===revision)paintReply(request.draft,{message:error.message,biResult:request.result?.biResult},request.timing());}
 finally{clearInterval(request.timer);talkRequests.delete(request.id);$('talk-send').disabled=false;status(talkRequests.size?'남은 메시지도 순서대로 답하는 중이야 🐰':'');}
}
async function submitCommand(mode='search'){
 if(mode==='talk')return submitTalk();
 if((mode==='search'?composing:talkComposing)||commandPending)return;
 const inputElement=mode==='search'?$('keyword'):$('talk-input');
 const button=mode==='search'?$('search'):$('talk-send');
 const input=inputElement.value.trim();if(!input){status('입력할 내용을 적어주세요.');return;}
 closeSuggestions();commandPending=true;button.disabled=true;const current=revision, token=++commandToken;
 const startedAt=Date.now(),startedTick=performance.now();
 const active={id:crypto.randomUUID(),revision:current,token,input,startedTick};
 const timing=()=>({startedAt,finishedAt:Date.now(),elapsedMs:performance.now()-startedTick,firstResultMs:active.firstResultMs});active.timing=timing;activeCommand=active;
 status(mode==='talk'?'하! 질문을 살펴보는 중이야. 로컬 엔진을 처음 켤 때는 잠깐 걸려 🐰':'검색 요청을 처리하는 중…');
 try{
  const result=await window.powerBi.command({text:input,mode,requestId:active.id});
  if(current!==revision||token!==commandToken)return;
  if(result.error)throw Error(result.error);
  if(result.kind==='search'){
   button.disabled=false;
   if(mode==='talk'&&inputElement.value.trim()===input)inputElement.value='';
   $('keyword').value=result.keyword;await runSearch({},result.keyword);
  }else{if(active.draft)paintReply(active.draft,{...result,biResult:result.biResult||active.result.biResult},timing());else showReply(input,result,timing());status(result.loggingError?'대화 기록 저장에 문제가 있지만 조회 결과는 유지했어.':'');if(inputElement.value.trim()===input)inputElement.value='';}
 }catch(error){if(current===revision&&token===commandToken){if(active.draft)paintReply(active.draft,{...active.result,message:'실제 BI 결과는 아래에 남겨뒀어. 후속 처리에 문제가 생겼어 🐰'},timing());else if(mode==='talk')showReply(input,{message:error.message},timing());else status(error.message);}}
 finally{if(token===commandToken){commandPending=false;button.disabled=false;if(activeCommand===active)activeCommand=null;}}
}
function activateSuggestion(index){
 activeSuggestion=index;
 for(const [i,option] of [...$('suggestions').children].entries())option.setAttribute('aria-selected',String(i===index));
 const selected=$('suggestions').children[index];if(selected){$('keyword').setAttribute('aria-activedescendant',selected.id);selected.scrollIntoView({block:'nearest'});}
}
function chooseSuggestion(index){
 if(!suggested[index])return;$('keyword').value=suggested[index];closeSuggestions();submitCommand();
}
async function updateSuggestions(){
 const input=$('keyword').value.trim();closeSuggestions();
 if(!input||input.length>150)return;
 const current=suggestionRevision;
 try{
  const result=await window.powerBi.suggestions(input);
  if(current!==suggestionRevision||$('keyword').value.trim()!==input)return;
  suggested=result.codes;
  if(!suggested.length)return;
  suggested.forEach((code,index)=>{const option=el('div',code,'suggestion');option.id='suggestion-'+index;option.setAttribute('role','option');option.setAttribute('aria-selected','false');option.onmousedown=e=>e.preventDefault();option.onclick=()=>chooseSuggestion(index);$('suggestions').append(option);});
  $('suggestions').hidden=false;$('keyword').setAttribute('aria-expanded','true');
 }catch{ /* Suggestions never interrupt a manual search. */ }
}
function scheduleSuggestions(){closeSuggestions();suggestionTimer=setTimeout(updateSuggestions,120);}
$('keyword').addEventListener('compositionstart',()=>{composing=true;closeSuggestions();});
$('keyword').addEventListener('compositionend',()=>{composing=false;scheduleSuggestions();});
$('talk-form').onsubmit=event=>{event.preventDefault();submitCommand('talk');};
$('talk-input').addEventListener('focus',closeSuggestions);
$('talk-input').addEventListener('compositionstart',()=>{talkComposing=true;});
$('talk-input').addEventListener('compositionend',()=>{talkComposing=false;});
$('keyword').addEventListener('keydown',event=>{
 if(event.isComposing||composing)return;
 if(!$('suggestions').hidden&&suggested.length){
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();activateSuggestion((activeSuggestion+(event.key==='ArrowDown'?1:-1)+suggested.length)%suggested.length);}
  else if(event.key==='Enter'&&activeSuggestion>=0){event.preventDefault();chooseSuggestion(activeSuggestion);}
  else if(event.key==='Escape'){event.preventDefault();closeSuggestions();}
 }
});
document.addEventListener('pointerdown',event=>{if(!event.target.closest('.input-wrap'))closeSuggestions();});
$('keyword').focus();
