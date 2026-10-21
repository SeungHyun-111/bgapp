# 우사기 Power BI API 연동 — Phase 1

기존 Electron을 유지한다. 투명 캐릭터와 드래그가 이미 구현돼 있고,
Node에서 설치된 MicrosoftPowerBIMgmt.Profile 모듈을 재사용할 수 있어
새 프레임워크나 Entra 앱 등록을 추가할 필요가 없다.

## 실행

이 프로젝트 폴더에서 실행한다.

```powershell
npm run bi:test
```

Microsoft 로그인 창이 나타나면 사용자가 직접 로그인한다.
현재 설치된 모듈(1.3.84)은 WAM 부모 창을 요구하므로,
인증 중에는 `Usagi Power BI - first sign-in` 소유 창을 잠시 표시한다.
인증이 끝나면 숨긴다. 같은 worker의 검색마다 콘솔을 새로 생성하지 않는다.

테스트는 `EVALUATE ROW("test", 1)`을 같은 worker에서 두 번 실행한다.
각 응답을 JSON 객체로 파싱해 `[test] === 1`을 검증하고 worker PID도 비교한다.
테스트 종료 시 worker를 정리한다. 다음 테스트 실행은 별도 세션이다.
프로덕션 앱에서는 bridge 객체를 하나만 생성하고 종료 시 `stop()`을 호출해야 한다.

```javascript
const { PowerBiBridge } = require('./src/power-bi-bridge');
const bridge = new PowerBiBridge();
try {
  const json = await bridge.query('EVALUATE ROW("test", 1)');
  console.log(json.results[0].tables[0].rows);
} finally {
  bridge.stop();
}
```

## 검증 결과

2026-10-21, 이 PC에서 Node → PowerShell → 지정 Dataset 순서로 실제 호출 성공.
두 호출 모두 다음 값을 받았으며, 같은 PowerShell 로그인 세션을 재사용했다.

```json
{"results":[{"tables":[{"rows":[{"[test]":1}]}]}]}
```

비밀번호를 입력받거나 저장하지 않는다. 액세스 토큰을 Node에 전달하거나
평문 파일로 저장하지 않는다. 로그인과 토큰 관리는 Microsoft 모듈/WAM에 맡긴다.
이 구현은 요청마다 프로세스를 재생성하지 않으며, 오류 시 무한 재로그인하지 않는다.

## 파일

- `src/power-bi-bridge.js`: 요청 직렬화, 프로세스 재사용, JSON 응답, 제한시간, 종료 처리.
- `src/power-bi-bridge.ps1`: 로그인, Execute Queries 호출, JSON line 프로토콜.
- `src/power-bi-model.json`: 확인된 모델 식별자. 실제 스키마는 아직 미확인이라 빈 배열이다.
- `scripts/test-power-bi.js`: 실제 연결 통합 테스트.

## 다음 단계: 실제 모델 구조 확인

Execute Queries API는 공식적으로 INFO 함수와 DMV를 지원하지 않는다.
따라서 이 endpoint로 임의 메타데이터 쿼리를 계속 시도하지 않는다.

가장 적은 작업으로 진행하려면 이미 열린 모델 화면에서 테이블을 펼쳐
편성코드·대표업체명·대표상품명·방송일시·필요 실적 측정값의 실제 이름을 확인한다.
모델 정의(TMDL/BIM)가 있다면 로컬에서 파싱해 `power-bi-model.json`에 정리할 수도 있다.
어떤 항목도 화면 표시 이름만 보고 실제 열/측정값이라고 추측하지 않는다.

테이블명 하나가 확인되면 다음 **제한된 행 조회**로 실제 반환 열을 확인할 수 있다.
아래 `<확인한 실제 테이블명>`은 설명용 자리표시자이며 지금 실행할 쿼리가 아니다.

```dax
EVALUATE SAMPLE(1, '<확인한 실제 테이블명>', 1)
```

테이블/열/측정값이 확인된 다음 실제 검색을 검증하고,
성공한 뒤에만 말풍선 UI를 연결한다. 이번 Phase 1에서는 기존 클릭 UI를 바꾸지 않았다.

공식 문서:
https://learn.microsoft.com/en-us/rest/api/power-bi/datasets/execute-queries

## BO 테이블 열 확인

사용자 모델 화면으로 `BO` 테이블명이 확인됐다. 다음 명령은 해당 테이블에서
SAMPLE로 한 행을 받아 응답의 열 이름만 모델 JSON에 저장한다. 행 값은 저장/출력하지 않는다.
자료형, 별도 측정값, 관계는 이 조회만으로 확인할 수 없다.

```powershell
npm run bi:inspect
```
