// LEGACY DISABLED 2026-10-27: preserved during Gemini migration.
// const fs = require('fs');
// const source = JSON.parse(fs.readFileSync('src/bi-reference/new-bi-catalog.json', 'utf8'));
// const fieldId = value => value ? 'field:' + value.slice(value.indexOf('[') + 1, -1) : null;
// const result = {
//   version: 3,
//   name: '우사기 통합 항목·업무 규칙·앱 계산 카탈로그',
//   date: '2026-10-27',
//   status: 'draft_not_connected_to_runtime',
//   architecture: {
//     flow: ['사용자 질문·대화 문맥·카탈로그 → Gemini', 'Gemini → 필요한 원천 항목·조회 조건·산식·답변 틀 JSON', '앱 Validator → 항목·업무 정의·산식·조회 범위 검증', 'Power BI → 필요한 원천 행과 값 제공', '앱 → 산식 계산·답변 틀 값 삽입·전체 로그 저장'],
//     gemini: '카탈로그 항목과 연산자를 조합해 산식을 제안한다. 고정 산식 ID 선택만으로 제한하지 않는다. 실제 결과 숫자는 만들지 않는다.',
//     app: '검증된 산식을 해석하여 직접 계산한다. 모델의 임의 코드나 문자열을 실행하지 않는다.',
//     powerBI: '원천 데이터 제공. 지표 계산 주체가 아니다.',
//     runtimeStatus: 'Gemini 연결·원천 조회 경로·앱 계산 엔진 미구현'
//   },
//   businessRules: source.businessRules,
//   denominatorConflict: source.denominatorConflict,
//   fields: source.fields.map(f => ({id: fieldId(f.id), table: f.table, name: f.name, dataType: f.type, typeEvidence: f.typeEvidence})),
//   dimensions: {
//     organization: {field: 'field:표준조직', historicalAliasField: 'field:조직명'},
//     brand: {field: 'field:편성코드', rule: '맨 앞 [브랜드]가 정확히 일치하는 모든 상품'},
//     product: {field: 'field:편성코드', rule: '정확한 개별 편성코드'}
//   },
//   entities: source.entities,
//   metrics: source.metrics.map(m => {
//     const formula = m.appCalculation ? structuredClone(m.appCalculation) : null;
//     if (formula?.field) formula.field = fieldId(formula.field);
//     return {id: m.id, name: m.label, aliases: m.aliases || [], unit: m.unit || null,
//       sourceField: fieldId(m.sourceColumn), definition: m.businessMeaning || null,
//       formula, definitionStatus: m.evidenceStatus, appExecutionStatus: 'not_implemented',
//       availability: m.sourceMeasure ? 'blocked_missing_source_formula' : formula ? 'formula_candidate_requires_validation' : 'definition_required',
//       note: m.sourceMeasure ? '기존 측정값 이름만 확인됨. 내부 산식·필요한 원천 항목 미확인. 앱 계산 대상으로 사용하지 않는다.' : m.restriction || null};
//   }),
//   formulaContract: {
//     status: 'design_only_not_implemented',
//     representation: '연산자·인수·필드 ID·각 집계의 조회 범위를 명시하는 JSON 연산 트리',
//     operatorCandidates: ['field', 'metric', 'sum', 'distinct_count', 'add', 'subtract', 'multiply', 'divide', 'average', 'rank'],
//     validation: ['등록된 원천 항목만 사용', '지표 참조 순환 금지', '단위·자료형 호환 검사', '연산 깊이·노드 수·조회량 제한', '분자·분모 각각 필터와 그룹 범위 명시', '원천 행 누락·중복·페이지 처리 확인', '업무 정의가 미확인이면 재질문', '0분모·결측·동률·반올림 정책 확정'],
//     note: '연산자 후보는 실행 지원 목록이 아니다. 평균의 단순/가중 기준, 증감의 비교 기간, 순위의 동률 규칙은 별도 정의해야 한다.',
//     shareDisplay: '비중 내부값은 비율이다. 백분율 표시는 100을 한 번만 곱한다.',
//     example: {
//       plan: {
//         period: {start: '2026-10-01', endExclusive: '2026-11-01', timezone: 'Asia/Seoul'},
//         target: {type: 'organization', requestedName: '헬스푸드팀', value: null, status: 'requires_alias_confirmation'},
//         requiredFields: ['field:방송일시', 'field:표준조직', 'field:유/무형', 'field:가중분'],
//         formula: {operator: 'divide', arguments: [
//           {operator: 'sum', field: 'field:가중분', scope: 'selected_target_and_filters'},
//           {operator: 'sum', field: 'field:가중분', scope: 'same_period_confirmed_denominator_filters'}]},
//         outputFormat: 'percent', denominatorScope: 'requires_confirmation', executionStatus: 'blocked_until_confirmed'
//       },
//       responseTemplate: '우웅, {{periodLabel}} {{targetLabel}} 편성비중은 {{value}}야 🐰',
//       note: 'value에는 앱이 % 기호까지 포함해 형식화한 결과를 넣는다. 예시 숫자는 제공하지 않는다.'
//     }
//   },
//   referenceEvidence: {
//     note: '원문 조회문과 기존 실행용 표현식은 제외했다. 아래는 출처 식별용이다.',
//     sourceFiles: source.capturedEvidence.sources.map(s => s.file),
//     capturedQueryCount: source.capturedEvidence.queryCount,
//     queries: source.capturedEvidence.queries.map(q => ({id: q.id, title: q.title}))
//   },
//   logging: source.loggingContract,
//   unresolved: source.unresolved,
//   workStatus: {
//     performed: ['기존 코드·항목 목록·성능 기록·사용자 확인 산식 읽기', '통합 JSON 파일 생성'],
//     notPerformed: ['테스트', '모델 추론', '실제 BI 조회', 'Gemini 연결', '앱 계산 엔진 구현', '로컬 LLM 시작 경로 변경']
//   },
//   provenance: source.provenance
// };
// fs.writeFileSync('new-bi-catalog.json', JSON.stringify(result, null, 2) + '\n');
// console.log('Created new-bi-catalog.json');
throw Object.assign(new Error('Legacy local LLM path is disabled during Gemini migration.'), {code:'LEGACY_LLM_DISABLED'});
