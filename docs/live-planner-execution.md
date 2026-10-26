# 실제 우사기 채팅의 BI 실행 경로 (2026-10-23)

이 문서는 이전 문서의 “Planner는 Fake BI 전용” 상태를 갱신한다.

실제 앱은 power-bi.js에서 기존 PowerBiBridge.query 함수를 chat-dialogue에 주입한다.
Qwen → QueryPlanner → Validator → live-bi-executor → PowerBiBridge 순서다.
모델 원문이나 사용자 문장에서 DAX를 받지 않는다. 검증된 plan의 컬럼·필터·그룹과 저장소에 등록된 계산식으로 읽기 전용 DAX를 만든다.

조직/브랜드/상품 조건, 대상 없는 전체 조회, 시간 조건, 목록, 조직별·월별 등 그룹 집계와 편성비중을 지원한다.
편성비중의 기본 분모는 같은 기간 전체 조직·브랜드이며, plan에 명시한 분자/분모 구조가 있으면 해당 구조를 사용한다.
집계 방식이 미확정인 raw 지표는 임의 합산하지 않는다.

실제 앱에서 BI query 함수가 없으면 시작에 실패한다. Fake Executor로 자동 대체하지 않는다.
후보 학습 평가와 오프라인 검사는 Fake Executor를 명시적으로 사용하며 실제 BI에 접속하지 않는다.
로그의 executionMode와 synthetic은 실행기 종류를 반영하고, BI 오류는 BI_QUERY_FAILED로 구분한다.

연결 코드와 DAX 생성·응답 변환·오류 구분은 모의 BI 응답으로 검사했다.
개발 중 실제 BI 로그인·조회와 Qwen 추론은 실행하지 않았다. 실제 서비스의 DAX 수용 여부와 자연어 해석 품질은 사용자 테스트가 필요하다.
