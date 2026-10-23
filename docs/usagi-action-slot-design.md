# 우사기 행동·슬롯 설계 (2026-10-23)

현재 작업 상태: 코드와 학습자료를 아래 구조로 전환했고 후보 모델을 학습했다. 정리 질문 15건과 개별 행동 점검은 통과했으나, 연속 대화의 대상 조건 삭제에서 field 개체 신뢰도가 낮아 모델 자동 승격을 보류했다. 기존 활성 모델을 유지한다. 이 체크포인트를 모델 전환 완료로 해석하지 않는다.

이 문서가 현재 NLU 구조의 기준이다. 지표별 intent, 브랜드별 intent, 월별 전용 intent를 만들지 않는다. 지표 추가는 지표 사전과 슬롯 예제 추가로 처리하며 행동 분류 수를 늘리지 않는다.

## 행동 계약

| intent | 상태 처리 |
|---|---|
| query | 명시한 조회 조건 반영. 대화 중 생략된 조건은 유지 |
| modify_condition | 명시한 필드만 교체 |
| add_condition | 기존 지표에 합집합으로 추가. 중복 제거 |
| remove_condition | 지정한 지표 또는 필드만 제거 |
| change_grouping | 집계 축 변경. 대상·기간·지표는 생략 시 유지 |
| confirm | 대기 중인 제안을 확인. 제안이 없으면 상태 유지, 재조회하지 않음 |
| cancel | 대화 상태 초기화. BI 호출 없음 |

`out_of_scope`는 조회 외 입력을 구분하기 위한 별도 분류다. 업무 행동은 위 7개로 고정한다. `nlu_fallback`은 낮은 신뢰도의 모델 결과이며 학습 intent가 아니다.

## 슬롯 계약

Rasa 개체: `metric`(여러 개 가능), `targetType`, `organization`, `brand`, `product`, `scope`, `year`, `month`, `groupBy`, `shareBasis`, `productType`, `limit`, `field`.

- metric: 등록된 BI 지표 ID. 어떤 지표든 같은 add/replace/remove 처리 사용.
- scope: `all_products`, `all_organizations`. 브랜드 전체는 실제 `[브랜드]` 접두사에 해당하는 모든 상품.
- groupBy: `month`, `organization`, `none`.
- field: 제거할 필드 `metric`, `period`, `target`, `scope`, `groupBy`, `productType`.
- limit: 현재 실행 가능한 최상위 1개만 허용. 모델이 임의 순위 로직을 만들 수 없음.

학습형 DIET가 행동과 개체를 예측한다. 날짜 표기 해석·등록 용어의 미추출 구간 보완·실제 상품/조직 검증은 별도 처리한다. 보완 처리는 모델의 추가/삭제 행동을 다른 행동으로 바꿀 수 없다. 시간별 조회, 채널 등 실행기가 지원하지 않는 조건은 지원된다고 간주하지 않는다.

## 파일 책임

- `src/commands/query-capabilities.js`: 행동·필드 허용 목록만 선언. 지표→intent 매핑 금지.
- `src/commands/query-interpreter.js`: 모델 행동·슬롯 해석, 지표/기간/슬롯 값 검증.
- `src/commands/query-state.js`: 순수 상태 처리기. 문장 매칭과 BI 호출 금지.
- `src/commands/dialogue.js`: 실제 대상 확인, 필요한 조건 질문, 상태 처리기 호출, 최종 조건 실행.
- `scripts/lib/nlu-examples.js`: 공통 개체 주석 작성.
- `scripts/generate-bi-training.js`: 모든 지표를 query + metric 개체 예제로 생성.
- `scripts/generate-query-understanding.js`: 7개 행동 예제 및 조건 슬롯 학습자료.
- `scripts/build-reviewed-nlu.js`: 정리된 대화를 같은 행동·슬롯 구조로 변환.
- `scripts/train-reviewed-nlu.js`: 후보 학습·현재 모델 비교·회귀 검증·교체. 기존 모델 보존.

## 검증과 제한

지표 추가/제거 → 기간 변경 → 월별 변경 → 브랜드 조건 제거 → 취소의 연속 대화를 실제 모델과 가짜 BI 실행기로 확인한다. 단순 답변 생성만 통과 조건으로 삼지 않는다. 정리된 대화 재현 검사는 학습 적합 점검이며 독립 평가 정확도가 아니다.

현재 단일 값 필터에 다른 값을 추가하는 다중 조건과 여러 대상 추가는 묵시적으로 덮어쓰지 않고 확인한다. 브랜드 대상 제거는 전체 상품 범위로 명시적으로 확장한다. 지표를 모두 제거하면 조회 항목을 다시 묻고 실행하지 않는다. 코드 상태 점검과 실제 모델 검증을 구분한다.

기존 지표별 자료는 `nlu/archive-data/action-slot-migration-*`에 보관하며 학습 폴더에서는 제외한다. 현재 모델 버전은 `data/training/active-nlu.json`, 검증 결과는 `nlu/results/reviewed-learning.json`을 참조한다.
