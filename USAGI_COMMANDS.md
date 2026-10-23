# 우사기 명령과 학습 노트

## 두 가지 입력

**실적 검색**: 상품명·업체명·편성코드를 입력한다. 예를 들어
`58225302 실적`, `홀베리 당근주스 실적`, `에이치엘사이언스 최근 실적`은
대상 이름만 추출해 기존 Power BI 대시보드로 연결한다.
최근 실적 명령은 기존 방송일시 내림차순을 사용하며 특정 날짜 범위를 임의로 만들지 않는다.

**다른 이야기하기**: 기존 명령을 먼저 검사한다. 안녕/도움말은 로컬 응답,
명시적인 상품 실적 명령은 검색으로 전환, 모르는 질문은 로컬 노트에만 저장한다.
일반 질문을 상품명 검색으로 억지 분류하지 않는다. 외부 AI/LLM 연결은 없다.
2번 대화는 로컬 Rasa NLU와 앱의 대화 상태 관리로 연결했다. 설치·학습·질문 라벨링과 현재 지원 범위는 `USAGI_NLU.md`를 참고한다.

## 로컬 파일

현재 개발 앱은 프로젝트의 다음 파일을 사용한다. `data/`는 Git에서 제외한다.

- `data/unhandled-queries.jsonl`: UUID, 한국 시간 timestamp, 원문 input,
  `status: unhandled`, 입력 모드 source. 입력마다 appendFile로 한 줄 추가한다.
- `data/query-status-events.jsonl`: 기능으로 전환한 질문의 ID, timestamp,
  `status: converted`, convertedIntent. 원문 기록을 수정/삭제하지 않고 상태 이력을 추가한다.
- `data/program-codes.json`: Power BI에서 받은 편성코드 자동완성 캐시.

패키지 앱에서는 Electron userData 아래의 `data/`를 사용한다.
로그에는 계정이나 토큰을 자동으로 수집하지 않는다. 인증 정보로 의심되는 사용자 입력도
거부해 기록/BI 조회에 넘기지 않는다. 사용자에게는 원문 대신 차단 응답을 표시한다.

## 자동완성

입력 중 추천은 로컬 캐시만 사용한다. 공백·대괄호를 제외하고 비교하며
앞부분이 일치하는 항목을 먼저, 최대 10개 표시한다. 한글 IME 조합이 끝난 뒤 추천한다.
클릭 또는 ↑↓ + Enter로 편성코드를 선택해 검색한다.

처음에는 **자동완성 목록 갱신**을 눌러 로그인 후 실제 BO 편성코드를 받는다.
이후에는 앱을 다시 열어도 캐시를 읽는다. 매 타이핑마다 BI 조회나 로그인을 하지 않는다.
성공한 검색의 실제 편성코드도 캐시에 추가한다. 전체 목록은 최대 20,000개를 받는다.

CLI로 갱신:

```powershell
npm run bi:codes
```

## 질문을 기능으로 승격하기

현재 질문과 최종 상태 확인:

```powershell
npm run queries:list
```

Codex에서 비슷한 미처리 질문을 묶고 `src/commands/`의 intents, parser,
handlers, responses에 규칙을 추가한다. 실데이터 handler는 확인된 필드로 구현하고
테스트를 통과시킨 뒤 해당 질문을 전환 처리한다.

```powershell
npm run queries:converted -- <질문-UUID> MARGIN
```

원문 JSONL은 그대로 남으며 `queries:list`가 상태 이력을 합쳐
`status: converted`, `convertedIntent: MARGIN`을 보여준다.
아직 handler를 만들지 않은 질문을 자동으로 converted 처리하지 않는다.

## 검증

```powershell
npm run commands:test
```

알려진 명령/미처리 질문 구분, 인증 정보 기록 거부, 동시 append 50건,
원문 보존과 전환 이력, 로컬 자동완성 캐시를 검증한다.
Electron 통합 화면에서는 모드 전환, 미처리 질문의 BI 호출 없음,
한글 조합 및 키보드 자동완성, 기존 대시보드의 초기화 동작도 검증했다.
