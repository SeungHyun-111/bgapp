# 성능 기록을 우사기에 반영하는 방법

## 파일별 역할

| 위치 | 역할 |
|---|---|
| 프로젝트 루트의 PowerBIPerformanceData*.json | 사용자가 제공한 원본. 수정하지 않는다. |
| captures/*.json | 해시를 포함해 보관한 원본 사본 |
| captures/queries/*.dax | 기록된 42개 DAX 원문 |
| captures/ANALYSIS.md | 시각화·필터·계산식별 분석 |
| src/bi-reference/catalog.json | 출처, 참조 측정값, 출력 식, 필터, 문맥 의존 여부 |
| src/bi-reference/metric-aliases.json | 확인된 측정값과 일상 표현의 연결 |
| src/commands/bi-report-templates.js | 날짜·팀을 매개변수로 받는 편성비중 식 |
| src/commands/bi-query.js | 조건 검증, DAX 생성, 실제 BI 호출, 결과 형식 |
| src/commands/dialogue.js | 비중 기준 질문, 대상·기간 유지 |
| nlu/data/report-queries.yml | 자연어 학습 예시. 모델 재학습과는 별도 |

## 갱신

```powershell
npm run bi:import-captures
node scripts/generate-bi-training.js
npm run bi:reference-test
```

이 명령은 기존 상품 검색의 power-bi-model.json / power-bi-visuals.json을 수정하지 않는다.
카탈로그 추가만으로 새로운 유형의 분석이 자동 구현되지는 않는다. 새 문맥 계산은 별도 템플릿과 테스트를 추가한다.

## 확인한 계산 기준

- 가중분 기준: 해당 팀의 월 가중분 합계 / 같은 월·유/무형 조건 전 조직의 가중분 합계.
- 방송횟수 기준: 해당 팀의 방송일시 고유 개수 / 같은 월·유/무형 조건 전 조직의 방송일시 고유 개수. 같은 시각은 1회다. 여러 팀의 같은 시각이 겹치면 팀별 비율을 더한 값이 100%가 된다는 보장은 없다.
- 비중 원본 식은 ALLSELECTED 문맥에 의존한다. 앱의 기본 분모는 전체 조직이며 보고서에서 조직·MD·상품 등의 추가 슬라이서를 제한했다면 그 화면과 비교 조건이 다를 수 있다.
- 원본 (1)의 2026년 9월 가중분 원형 차트와 앱 계산을 실제 BI에서 대조했다. 헬쓰푸드 표준조직(건강식품 포함) 8,127.75분 / 전 조직 43,185.15분 = 18.8207057287%로 일치했다.
- 같은 기간의 방송일시 기준 비중은 19.9257425743%였고, 새 측정값 참조 11개도 API에서 정상 반환됐다. 이 기록은 2026-10-23 조회 시점이며 후속 데이터 갱신에 따라 변할 수 있다.

화면 단위와 모델 내부 계산식은 성능 기록만으로 확정하지 않는다. 확인되지 않은 단위는 임의 변환하지 않는다.
