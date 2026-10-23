const fs=require('fs');
const path=require('path');
const {createHash}=require('crypto');
const root=path.resolve(__dirname,'..');
const model=require('../src/power-bi-model.json');
const references=require('../src/bi-reference/catalog.json');
const {metrics}=require('../src/commands/bi-metrics');
const {templates}=require('../src/commands/bi-report-templates');
function buildCatalog(){
  const sources=['src/power-bi-model.json','src/power-bi-visuals.json','src/bi-reference/catalog.json','src/commands/bi-metrics.js','src/commands/bi-report-templates.js','src/commands/entity-resolver.js','src/commands/bi-query.js','PERFORMANCE.md','DATA_CACHE.md','docs/power-bi/REFERENCE_USAGE.md'];
  return {version:1,provenance:sources.map(file=>({file,sha256:createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')})),
    limitations:['관측된 열 목록이며 완전한 모델 DDL이 아님','열 자료형·관계·행의 고유 키·취소 반영 여부는 미확인','성능 기록의 고정 날짜·필터를 기본값으로 실행하지 않음','데스크톱 메모리 최적화 기록은 BI 테이블 생성 기록이 아님'],
    tables:model.tables.map(t=>({name:t.name,evidence:t.source,columns:t.columns.map(c=>({id:c.reference,name:c.name,type:c.name==='방송일시'?'datetime':'unknown',typeEvidence:c.name==='방송일시'?'existing date filter and result parser':'not exported',source:'src/power-bi-model.json'}))})),
    dimensions:{brand:{source:'BO[편성코드]',derivation:'leading-bracket',definition:'맨 앞 [브랜드]가 정확히 같은 모든 상품',status:'user-confirmed'},organization:{source:'BO[표준조직]',fallback:'BO[조직명]',definition:'표준조직을 사용하며 역사적 조직명은 기존 캐시 별칭으로 대조',status:'existing-code'},product:{source:'BO[편성코드]',definition:'개별 편성코드',status:'observed'}},
    metrics:Object.fromEntries(metrics.map(m=>{const template=templates.find(t=>t.id===m.reportTemplate);return [m.id,{id:m.id,label:m.label,aliases:m.aliases,unit:m.unit||null,column:m.column?'BO['+m.column+']':null,expression:m.expression||null,
      aggregation:m.raw?'raw':template?'share':m.column?'sum':'model-measure',
      definition:template?{numerator:template.aggregate,denominator:'같은 기간·유/무형의 전체 조직, 선택 조직 조건 제거',basis:template.basis}:null,
      status:m.raw?'aggregation-not-defined':template?'capture-backed-template':m.column?'existing-code-sum':'opaque-model-measure',
      businessMeaning:m.id==='weighted_minutes'?'가중분의 업무 산정 방식은 미확인':m.id==='commission_rate'?'사용자 정의: 마진/상품수수료율은 제휴포인트 원본값. 임의 평균·퍼센트 변환 금지':'별칭은 탐색용이며 업무 정의를 확정하는 근거가 아님',
      sourceQueries:m.sourceQueries||template?.sources||[],source:'src/commands/bi-metrics.js'}];})),
    captures:{files:references.sources,queryCount:references.queryCount,queries:references.queries.map(q=>({id:q.id,file:q.queryFile,title:q.title,grouping:q.groupingReferences,outputs:q.outputs,filters:q.recordedFilters,execution:'reference-only'}))},
    unresolved:['BO 행의 grain/고유 키 및 중복 처리','가중분 산정 방식','취급고·주문금액·취급액의 동치 여부','취소/반품 반영 여부','모델 측정값 내부 수식·일부 표시 단위','BI 테이블 생성 DDL/Power Query/TMDL 및 관계 정보: 현재 자료에서 찾지 못함']};
}
if(require.main===module){const catalog=buildCatalog();fs.mkdirSync(path.join(root,'data'),{recursive:true});fs.writeFileSync(path.join(root,'data/bi-catalog.json'),JSON.stringify(catalog,null,2)+'\n');fs.writeFileSync(path.join(root,'data/bi-tools.json'),JSON.stringify({version:1,mode:'fake',tools:require('../src/planner/bi-tool-catalog').definitions,operators:require('../src/planner/bi-tool-catalog').operators,inputSchema:'src/planner/planner-input.schema.json',responseSchema:'src/planner/planner-response.schema.json',planSchema:'src/planner/plan-schema.json',turnSchema:'src/planner/turn-schema.json'},null,2)+'\n');console.log(`Catalog: ${catalog.tables.reduce((n,t)=>n+t.columns.length,0)} columns, ${Object.keys(catalog.metrics).length} metrics, ${catalog.captures.queryCount} captured queries`);}
module.exports={buildCatalog};
