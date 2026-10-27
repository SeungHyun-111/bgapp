// LEGACY DISABLED 2026-10-27: preserved during Gemini migration.
// // Artifact generation only: no inference, BI connection, or runtime activation.
// const fs = require('fs');
// const path = require('path');
// const {createHash} = require('crypto');
// const {buildCatalog} = require('./build-bi-catalog');
// const root = path.resolve(__dirname, '..');
// const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
// const base = buildCatalog();
// const references = read('src/bi-reference/catalog.json');
// const decisions = read('data/training/decisions.json');
// const entityCache = read('data/bi-entity-catalog.json');
// const sources = [...new Set([...base.provenance.map(p => p.file),
//   'data/training/decisions.json', 'data/bi-entity-catalog.json',
//   'src/planner/live-bi-executor.js', 'docs/bi-guide.md',
//   'docs/power-bi/captures/ANALYSIS.md', 'scripts/build-new-bi-catalog.js'])];
// const ratio = (numerator, denominator) => ({operation:'ratio', numerator, denominator,
//   zeroDenominator:'clarify_without_numeric_answer', nullPolicy:'must_define_before_execution'});
// const metrics = Object.values(base.metrics).map(m => ({
//   id:m.id, label:m.label, aliases:m.aliases, unit:m.unit,
//   sourceColumn:m.column, sourceMeasure:m.aggregation === 'model-measure' ? m.expression : null,
//   evidenceStatus:m.status, businessMeaning:m.businessMeaning,
//   sourceQueries:m.sourceQueries, source:m.source,
//   legacyAggregation:m.aggregation,
//   legacyExpression:m.expression,
//   appCalculation:m.aggregation === 'sum' ? {operation:'sum', field:m.column, nullPolicy:'must_define_before_execution'} :
//     m.aggregation === 'count_distinct' ? {operation:'distinct_count', field:m.column, blankPolicy:'must_define_before_execution'} :
//     m.aggregation === 'raw' ? {operation:'identity', field:m.column, multipleValues:'clarify', transform:'none'} : null,
//   newRuntimeStatus:'not_implemented',
//   restriction:m.aggregation === 'model-measure' ? '내부 산식 미확인. 원천 행으로 재계산 불가. 기존 BI 측정값 참조와 앱 계산을 구분한다.' :
//     m.aggregation === 'share' ? 'denominator_scope_requires_confirmation' : 'row_grain_and_null_policy_require_review'
// }));
// const get = id => metrics.find(m => m.id === id);
// get('organization_weighted_share').appCalculation = ratio('weighted_minutes:selected_scope', 'weighted_minutes:confirmed_denominator_scope');
// get('organization_broadcast_share').appCalculation = ratio('broadcast_count:selected_scope', 'broadcast_count:confirmed_denominator_scope');
// for (const [id, label, numerator] of [
//   ['weighted_sales_per_minute', '가중분 기준 분당취급액', 'sales'],
//   ['weighted_profit_per_minute', '가중분 기준 분당한계이익', 'profit']
// ]) {
//   const evidence = decisions.facts.find(f => f.id === id);
//   metrics.push({id, label, aliases:[label], unit:'원/분', evidenceStatus:'user-confirmed-definition',
//     appCalculation:ratio(numerator, 'weighted_minutes'), referenceExpression:evidence.expression,
//     source:'data/training/decisions.json#'+id, newRuntimeStatus:'not_implemented',
//     restriction:'분당혼합비·한계(분) 등 BI 측정값과 동치로 취급하지 않는다. 0분 처리 미확정.'});
// }
// metrics.push({id:'brand_weighted_share', label:'브랜드 가중분 편성비중', aliases:[], unit:'%',
//   evidenceStatus:'user-confirmed-definition', source:'data/training/decisions.json#brand_weighted_share',
//   appCalculation:ratio('weighted_minutes:all_products_of_exact_brand', 'weighted_minutes:all_organizations_and_brands_same_period'),
//   newRuntimeStatus:'not_implemented', restriction:'기타 필터의 분모 유지 여부 확인 필요'});
// const catalog = {
//   schemaVersion:2, name:'우사기 Gemini 전환용 신규 BI 카탈로그', preparedOn:'2026-10-27',
//   activation:{active:false, purpose:'catalog_draft', inferenceExecuted:false, biQueryExecuted:false,
//     note:'기존 런타임과 카탈로그는 유지. Gemini API 및 앱 계산 엔진은 아직 연결하지 않음.'},
//   architecture:{languageProvider:'Gemini API (planned)', languageOutput:['metricId','calculationId','period','target','filters','responseTemplate'],
//     prohibitedModelOutput:['DAX','executableCode','inventedResult'],
//     responsibilities:{gemini:'자연어 해석·등록 ID 선택·답변 틀', validator:'대상·기간·지표·계산 조합·분모 검증',
//       powerBI:'검증된 고정 조회기로 필요한 데이터 제공', usagi:'등록 산식 계산·값 삽입·전체 과정 로그'}},
//   businessRules:{margin:{metricId:'commission_rate', aliases:['마진','상품수수료율','수수료율'], transformation:'none', multipleValues:'clarify'},
//     defaultShareBasis:'weighted_minutes', broadcastCountRequiresExplicitRequest:true,
//     timezone:'Asia/Seoul', periodBounds:'start_inclusive_end_exclusive',
//     organization:'로컬 엔티티 캐시와 사용자 확인 별칭으로 대조. 일치하지 않으면 확인 질문.',
//     brand:'BO[편성코드] 맨 앞 [브랜드] 정확히 일치하는 전체 상품',
//     training:'실패 출력·조회 성공·생성 답변을 자동 정답 처리하지 않는다. 사용자 수정과 확인 여부를 별도로 보존한다.'},
//   denominatorConflict:{status:'requires_user_confirmation', blocks:['organization_weighted_share','organization_broadcast_share'],
//     alternatives:[{id:'preserve_period_and_product_type', keep:['period','BO[유/무형]'],
//       evidence:['src/commands/bi-report-templates.js','docs/power-bi/REFERENCE_USAGE.md','docs/bi-guide.md']},
//     {id:'preserve_period_only', keep:['period'], evidence:['src/planner/catalog-additions.json']}],
//     commonRule:'분자는 선택 대상·조건. 분모는 선택 조직·브랜드·상품을 제거. 기간별 그룹이면 같은 기간 버킷으로 계산.'},
//   fields:base.tables.flatMap(t => t.columns.map(c => ({...c, table:t.name,
//     type:c.id === 'BO[방송일시]' ? 'datetime' : 'unknown',
//     typeEvidence:c.id === 'BO[방송일시]' ? '기존 날짜 필터·파싱 코드. 서버 DDL 아님.' : '자료형 정보 미수집'}))),
//   dimensions:base.dimensions,
//   entities:{source:'data/bi-entity-catalog.json', updatedAt:entityCache.updatedAt, freshness:'not_refreshed',
//     organizations:entityCache.entities.filter(e => e.kind === 'organization'),
//     confirmedAliases:decisions.facts.filter(f => f.canonical),
//     note:'예시의 헬스푸드팀과 캐시의 헬쓰푸드 동치 여부는 임의 확정하지 않는다.'},
//   metrics,
//   calculationKinds:[{id:'sum', status:'definition_available_runtime_pending'},
//     {id:'distinct_count', status:'definition_available_blank_policy_pending'},
//     {id:'weighted_share', status:'denominator_confirmation_required'},
//     {id:'broadcast_share', status:'explicit_request_and_denominator_confirmation_required'},
//     {id:'ratio', status:'metric_specific_definition_required'},
//     ...['average','change','ranking'].map(id => ({id,status:'not_defined',
//       reason:'대상 지표·가중 방식·비교 기간·동률·결측 처리 계약을 별도 정의해야 함'}))],
//   capturedEvidence:{queryCount:references.queryCount, sources:references.sources,
//     measures:references.measures,
//     queries:references.queries.map(q => ({id:q.id, title:q.title, file:q.queryFile,
//       grouping:q.groupingReferences, outputs:q.outputs, recordedFilters:q.recordedFilters,
//       execution:'reference_only_never_execute_captured_constants'}))},
//   loggingContract:{fields:['turnId','conversationId','userText','contextTurnIds','catalogVersion','providerModel',
//     'rawModelResponse','plan','validatorResult','actualQueryConditions','calculationId','calculationInputs',
//     'calculationResult','finalAnswer','outcome','errorCause','userCorrection','labelStatus'],
//     labelStatusDefault:'unreviewed', exclude:['API key','authorization headers'],
//     note:'conversation-history.jsonl 확장 설계이며 아직 구현하지 않음'},
//   unresolved:[...base.unresolved,...decisions.unknowns,'편성비중 분모의 유/무형 유지 여부',
//     '원천 행 조회의 페이지 처리·누락 방지·데이터 크기 제한',
//     'null·BLANK·0분·0분모 처리 및 반올림·백분율 표시 계약',
//     'Gemini 공급자·요금제·모델·데이터 전송 설정 미연결'],
//   provenance:sources.map(file => ({file,sha256:createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')}))
// };
// const output = 'src/bi-reference/new-bi-catalog.json';
// fs.writeFileSync(path.join(root, output), JSON.stringify(catalog, null, 2)+'\n');
// const lines = ['# 신규 BI 카탈로그 정리', '',
//   '2026-10-27. 기존 코드·정리 자료·성능 기록을 읽어 만든 Gemini 전환용 초안이다. 런타임에 적용하지 않았다.', '',
//   `항목 ${catalog.fields.length}개, 지표 ${metrics.length}개, 성능 기록 ${references.queryCount}건을 수록했다.`, '',
//   '## 핵심 산식', '',
//   '| 지표 | 계산 | 상태 |', '|---|---|---|',
//   '| 가중분 | BO[가중분] 합계 | 기존 코드 근거. 가중분 자체 산정법·행 중복 미확인 |',
//   '| 방송횟수 | 방송일시 고유 개수 | 같은 시각 1회. 명시적으로 요청한 경우 사용 |',
//   '| 가중분 편성비중 | 선택 대상 가중분 / 동일 기간 전체 가중분 × 100 | 유/무형 분모 조건 충돌, 확정 필요 |',
//   '| 방송횟수 편성비중 | 선택 대상 고유 방송일시 수 / 전체 고유 방송일시 수 × 100 | 기준 명시·분모 확정 필요. 팀별 합계 100% 보장 안 됨 |',
//   '| 가중분 기준 분당취급액 | 예상취급액 합계 / 가중분 합계 | 사용자 확인 산식. 기존 BI 분당 측정값과 별개 |',
//   '| 가중분 기준 분당한계이익 | 한계이익 합계 / 가중분 합계 | 사용자 확인 산식. 0분 처리 미확정 |',
//   '| 브랜드 편성비중 | 정확한 브랜드 전체 상품 가중분 / 같은 기간 전체 조직·브랜드 가중분 | 사용자 확인 정의. 앱 실행 미구현 |',
//   '| 마진·상품수수료율 | BO[(전체/방송중)제휴포인트] 원본 | 합계·평균·퍼센트 변환 금지 |', '',
//   '비중 산식은 내부 ratio를 사용하고 표시할 때만 100을 곱하도록 구현해야 한다. 새 계산기는 아직 없다.', '',
//   '## 중요한 구분', '',
//   '- 성능 기록에 측정값 이름이 등장해도 내부 산식을 확보한 것은 아니다. 원본 출력 식과 문맥 의존 여부를 그대로 보존했다.',
//   '- 캡처의 날짜·유형 필터는 과거 기록이며 기본 조회 조건으로 사용하지 않는다.',
//   '- 기존 실행기는 BI에서 SUM·DISTINCTCOUNT·DIVIDE를 계산한다. 신규 앱 계산 구조는 별도 구현해야 한다.',
//   '- average·change·ranking은 정의 대기다. 이름만 등록했다고 실행 지원으로 취급하지 않는다.',
//   '- 조직 캐시는 갱신하지 않았다. 헬스푸드팀을 헬쓰푸드로 임의 치환하지 않는다.',
//   '- PERFORMANCE.md는 데스크톱 자원 최적화 기록이다. 지표 산식 근거는 PowerBIPerformanceData 캡처다.', '',
//   '## 전체 지표 목록', '', '| ID | 항목명 | 기존 처리 | 신규 상태 |', '|---|---|---|---|',
//   ...metrics.map(m => `| ${m.id.replace(/\|/g,'\\|')} | ${m.label.replace(/\|/g,'\\|')} | ${m.legacyAggregation || '사용자 확인 정의'} | 미구현 |`), '',
//   '## 파일과 생성 방법', '',
//   '- src/bi-reference/new-bi-catalog.json: 전체 항목·별칭·산식·캡처 근거·미확인 사항·출처 해시.',
//   '- scripts/build-new-bi-catalog.js: node scripts/build-new-bi-catalog.js로 로컬 자료만 읽어 재생성. 추론·BI 호출 없음.',
//   '- 로컬 data/training/decisions.json 및 data/bi-entity-catalog.json이 필요하다. 생성 JSON에 현재 근거를 보존했다.', '',
//   '## 다음 구현 순서', '',
//   '1. 편성비중 분모 유지 조건 확정.',
//   '2. Gemini 단일 구조화 응답 계약 및 Validator 구현. 모델이 반환한 DAX·코드를 실행하지 않음.',
//   '3. 원천 조회의 페이지 처리와 앱 계산 엔진 구현. 내부 산식 미확인 측정값은 차단 또는 명시적인 기존 BI 참조로 분리.',
//   '4. 로컬 LLM 자동 시작 경로 비활성화, API 설정·대화 맥락·답변 틀·로그 연결.',
//   '5. 사용자 테스트 요청 후 실행 확인. 현재는 코드와 기존 자료의 읽기 검토 및 산출물 생성만 수행.', ''];
// fs.writeFileSync(path.join(root,'docs/new-bi-catalog.md'),lines.join('\n'));
// console.log(`작성: ${output}, docs/new-bi-catalog.md (${catalog.fields.length} fields, ${metrics.length} metrics, ${references.queryCount} captured queries)`);
throw Object.assign(new Error('Legacy local LLM path is disabled during Gemini migration.'), {code:'LEGACY_LLM_DISABLED'});
