const {actionIntents,SLOT_FIELDS}=require('./query-capabilities');
const clone=value=>JSON.parse(JSON.stringify(value));
// Generic action semantics. No utterance matching or BI calls.
function applyQueryState(previous,{action='query',patch={},removeFields=[],removeMetrics=[]}){
  if(!actionIntents.has(action))throw Error('Unknown dialogue action');
  if(action==='cancel')return {};
  const state=clone(previous);
  if(action==='confirm')return state;
  if(action==='remove_condition'){
    if(removeFields.some(f=>!SLOT_FIELDS.includes(f)))throw Error('Unknown removal field');
    if(removeMetrics.length)state.metrics=(state.metrics||[]).filter(m=>!removeMetrics.includes(m));
    for(const field of removeFields){
      if(field==='metric')state.metrics=[];
      else if(field==='period')delete state.period;
      else if(field==='groupBy'){state.groupBy=null;delete state.limit;}
      else if(field==='productType'){state.filters={...state.filters};delete state.filters.productType;}
      else if(field==='target'||field==='scope'){
        state.target={kind:'all_products',field:'편성코드',value:'전체 상품',name:'전체 상품'};
        delete state.product;if(state.groupBy==='organization')state.groupBy=null;
      }
    }
  }else{
    if(action==='add_condition'){
      if(patch.period&&state.period&&JSON.stringify(patch.period)!==JSON.stringify(state.period))throw Error('여러 기간을 동시에 추가하는 조회는 아직 지원하지 않아. 기존 기간을 바꿀까? 🐰');
      if(patch.target&&state.target&&JSON.stringify(patch.target)!==JSON.stringify(state.target))throw Error('여러 대상을 동시에 추가하는 조회는 아직 지원하지 않아. 기존 대상을 바꿀지 알려줘 🐰');
      for(const [key,value] of Object.entries(patch.filters||{}))if(state.filters?.[key]!==undefined&&state.filters[key]!==value)throw Error('같은 필터에 다른 값을 추가할 수는 없어. 기존 조건을 바꿀까? 🐰');
    }
    for(const [field,value] of Object.entries(patch)){
      if(value===undefined)continue;
      if(field==='limit'&&value===null){delete state.limit;continue;}
      if(field==='metrics')state.metrics=action==='add_condition'?[...new Set([...(state.metrics||[]),...value])]:[...new Set(value)];
      else if(field==='filters')state.filters={...state.filters,...value};
      else state[field]=clone(value);
    }
  }
  if((state.metrics||[]).length>8)throw Error('한 번에 지표 8개까지 볼 수 있어! 조금 나눠줘 🐰');
  state.metric=state.metrics?.[0];
  if(state.target)state.product=state.target.value;
  if(state.groupBy==='organization'&&state.target?.kind!=='organization_group')state.groupBy=null;
  return state;
}
module.exports={applyQueryState};
