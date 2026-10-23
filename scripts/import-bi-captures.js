// Import captures without touching power-bi-visuals.json or the existing model.
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {refs,argumentsOf,outputsOf,filtersOf}=require('./lib/dax-capture');
const root=path.resolve(__dirname,'..');
const model=require('../src/power-bi-model.json');
const columns=new Set(model.tables.flatMap(t=>t.columns.map(c=>`'${t.name}'[${c.name}]`)));
const previous=new Set(model.measures.map(m=>m.reference));
const files=fs.readdirSync(root).filter(f=>/^PowerBIPerformanceData(?: \(\d+\))?\.json$/i.test(f)).sort((a,b)=>a.localeCompare(b,'en',{numeric:true}));
if(!files.length)throw Error('No performance captures found');
const output=path.join(root,'src/bi-reference');
const archive=path.join(root,'docs/power-bi/captures');
fs.mkdirSync(output,{recursive:true});fs.mkdirSync(path.join(archive,'queries'),{recursive:true});
const sources=[],queries=[],measureSources=new Map();
for(const [fileIndex,file]of files.entries()) {
  const raw=fs.readFileSync(path.join(root,file));
  const doc=JSON.parse(raw.toString('utf8').replace(/^\uFEFF/,''));if(!Array.isArray(doc.events))throw Error('Invalid capture '+file);
  fs.copyFileSync(path.join(root,file),path.join(archive,file));
  const byId=new Map(doc.events.map(e=>[e.id,e]));
  const events=doc.events.filter(e=>typeof e.metrics?.QueryText==='string');
  sources.push({file,archiveFile:'docs/power-bi/captures/'+file,sha256:crypto.createHash('sha256').update(raw).digest('hex'),queryCount:events.length});
  for(const [index,event]of events.entries()) {
    let owner=event;const visited=new Set();
    while(owner&&!owner.metrics?.visualId&&!visited.has(owner.id)){visited.add(owner.id);owner=byId.get(owner.parentId);}
    const text=event.metrics.QueryText.replace(/\r\n/g,'\n');
    const id=`capture-${fileIndex+1}-${index+1}`;
    const queryFile=`docs/power-bi/captures/queries/${id}.dax`;
    fs.writeFileSync(path.join(root,queryFile),text+'\n','utf8');
    const outputs=outputsOf(text),allReferences=refs(text);
    const measures=allReferences.filter(r=>!columns.has(r));
    for(const reference of measures) {
      if(!measureSources.has(reference))measureSources.set(reference,[]);
      measureSources.get(reference).push(id);
    }
    const group=argumentsOf(text,'ROLLUPGROUP');
    const core=argumentsOf(text,'SUMMARIZECOLUMNS');
    const grouping=group?refs(group.args.join(',')):(core?.args||[]).filter(a=>/^'BO'\[/.test(a)&&!a.includes('(')).flatMap(refs);
    queries.push({id,sourceFile:file,visualId:owner?.metrics?.visualId||null,title:owner?.metrics?.visualTitle||null,
      visualType:owner?.metrics?.visualType||null,recordedAt:event.start,rowCount:event.metrics.RowCount??null,
      queryFile,groupingReferences:grouping,allReferences,measureReferences:measures,outputs,recordedFilters:filtersOf(text),
      execution:'reference-only: captured constants/filters must not be executed as a generic query'});
  }
}
const measures=[...measureSources].map(([reference,sourceQueries])=>({reference,sourceQueries,alreadyRegistered:previous.has(reference),definition:null,status:'referenced-in-capture-not-definition'}));
const catalog={version:1,sources,queryCount:queries.length,referenceCount:new Set(queries.flatMap(q=>q.allReferences)).size,measures,queries,
  limitations:['No full model definitions or result data.','Captured dates, product and type filters are examples, not application defaults.','Model measures are invoked by reference; their formulas are not reconstructed.','ALLSELECTED ratios depend on the selected dimensions and filters.','Captures do not embed a verified dataset/page binding.']};
fs.writeFileSync(path.join(output,'catalog.json'),JSON.stringify(catalog,null,2)+'\n','utf8');
const lines=['# BI 성능 기록 분석','','기존 상품 검색 설정을 덮어쓰지 않는 별도 참조 카탈로그다.','',`- 원본 ${sources.length}개 / DAX 조회 ${queries.length}개 / 참조 항목 ${catalog.referenceCount}개`,`- 기존 모델에 없던 측정값 참조 ${measures.filter(m=>!m.alreadyRegistered).length}개`,'','## 원본과 조회식','','| 파일 | 조회 수 | 주요 시각화 |','|---|---:|---|',
  ...sources.map(s=>`| ${s.file} | ${s.queryCount} | ${[...new Set(queries.filter(q=>q.sourceFile===s.file).map(q=>q.title||q.visualType||'기타'))].join(' / ')} |`),
  '','## 계산식과 출처','','기록에 등장한 실제 식을 아래에 보관한다. 측정값 참조만 있는 경우 모델 내부 식은 알 수 없으므로 새로 추측하지 않는다.'];
for(const query of queries){lines.push('',`### ${query.id}: ${query.title||query.visualType||'조회'}`,'',`원본: ${query.sourceFile} / DAX: ${query.queryFile}`,'',`기록 필터: ${JSON.stringify(query.recordedFilters)}`,'');for(const o of query.outputs)lines.push(`- ${o.alias}${o.contextSensitive?' [문맥 의존]':''}:`, '```dax',o.expression,'```');}
lines.push('','## 실행 반영 원칙','','새 측정값 참조는 bi-metrics.js에 병합한다. 원본 DAX는 자동 실행하지 않는다.','조직별 가중분 비중과 방송일시 고유 개수 비중은 별도 템플릿으로 구현한다. 기간과 분모 범위는 답변에 표시한다.','(1) 원형 차트는 2026년 9월 조직별 가중분 합계이며, (4) 비중 표는 2025-11-01 이상 2026-01-01 미만 + 유형 필터를 포함한다. 이 두 조건을 섞지 않는다.');
fs.writeFileSync(path.join(archive,'ANALYSIS.md'),lines.join('\n')+'\n','utf8');
console.log(JSON.stringify({files:sources.length,queries:queries.length,references:catalog.referenceCount,newMeasures:measures.filter(m=>!m.alreadyRegistered).length}));
