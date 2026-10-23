# 대화 원본·정리·모델 학습 사용 관리

실제 대화 원본은 `data/conversation-history.jsonl` 하나에 보존한다. 대화 문장을 삭제하거나 정리된 답변으로 덮어쓰지 않는다. 같은 파일에 `review_event`(정리 이력), `model_usage_event`(실제 모델 사용 이력), 기존 `status_event`(옛 의도 전환 이력)를 추가한다. 대화 목록은 `input`이 있는 원본 레코드만 표시한다.

정리 여부와 실제 학습 사용 여부는 서로 독립적이다.

| 상태 | 뜻 |
|---|---|
| `reviewStatus: unreviewed` | 아직 검토하지 않은 새 대화 |
| `reviewStatus: reviewed` | 의도·수정 사항·보류 사유 등을 정리함. 기능 구현이나 모델 학습이 끝났다는 뜻은 아님 |
| `trainingStatus: not_used` | 모델 학습에 실제로 사용한 이력이 없음. JSONL 내보내기도 여기에 해당 |
| `trainingStatus: used` | 완료된 학습 실행의 모델 버전·데이터셋 버전과 연결된 이력이 있음 |

평가셋에 사용한 이력은 `evaluationRuns`로 별도 관리하며 학습 완료로 처리하지 않는다. `markModelUsage()`는 실제 학습/평가 완료 후에만 호출한다.

## 목록

```powershell
npm run queries:list       # 기본: 아직 정리하지 않은 모든 대화 (성공/실패와 무관)
npm run queries:reviewed   # 정리 완료 대화와 분류·학습 사용 상태
npm run queries:all        # 원본 전체 + 현재 상태
npm run queries:trained    # 실제 학습에 사용한 대화
```

예전 미처리 질문 조회가 필요하면 `node scripts/manage-queries.js unhandled`를 사용한다. 옛 `QueryStore.list()`도 이 호환 용도로 유지한다.

## 정리 반영

`npm run training:prepare`는 학습 초안을 만들고, 성공 후 `posttraining:prepare`에서 검토 완료된 주석을 반영한다. `unreviewed`로 남긴 새 사례는 정리 완료로 바꾸지 않는다. 기존 자료의 상태만 반영하려면 `npm run queries:apply-review`를 실행한다.

각 주석은 `sourceId`와 원문이 실제 대화에 일치하는지 확인한다. 주석 전체는 `data/training/reviews/<SHA-256>.json`에 불변 스냅샷으로 보존한다. 원본의 review_event는 이 파일을 참조하므로 다음 초안을 다시 생성해도 예전 판단을 추적할 수 있다. 개별 주석 버전이 같으면 중복 상태 이벤트를 추가하지 않는다.

정리된 자료 중 `needs_definition`, `needs_capability`는 검토는 끝났으나 정의 확인·실행 기능 확장이 남은 사례다. 다음 미정리 목록에서 제외하되 `queries:reviewed`의 분류로 확인한다. 파생 학습 주석과 모델별 사용 이력은 원본 대화를 대체하지 않는다.

## 실제 로컬 학습 루프

`npm run training:sync` 또는 `npm run nlu:train`이 정리본 → Rasa 예제 → 후보 학습 → 기존/후보 비교 → 회귀 검증 → 교체를 한 번에 실행한다. 앱도 `annotations.json` 변경을 감시해 같은 명령을 실행한다. 원본 질문이 쌓인 것만으로는 정답을 자동 생성하지 않는다. 앱 종료 중 정리한 변경은 다음 실행 때 확인한다.

- `scripts/build-reviewed-nlu.js`: 실행 가능한 정리 항목을 의미별 intent 학습 자료로 변환한다. 방송 날짜 검색과 미구현 복합 브랜드 비율은 보류한다. 조직별 집계/최상위 1팀은 실행 계층 확장을 반영해 포함한다.
- `scripts/train-reviewed-nlu.js`: 별도 후보 학습, 정리 사례 재현 및 기존 표현·후속 대화 회귀 점검, 모델 SHA와 학습 사용 이력, 기존 모델 보관 후 교체를 담당한다. 이미 적용한 동일 자료는 재학습하지 않는다.
- `src/commands/learning-loop.js`: 정리본 변경 감지와 별도 로컬 프로세스 실행만 담당한다.
- `src/commands/rasa-client.js`: 교체된 모델을 다음 입력에서 감지해 불러온다.

결과는 `nlu/results/reviewed-learning.json`, 활성 버전은 `data/training/active-nlu.json`에 남긴다. 정리 사례 자체를 재현하는 검사는 학습 적합 확인이며 미학습 성능 수치가 아니다. 추가 회귀 질문도 개발에 사용한 자료이므로 독립 평가 정확도로 발표하지 않는다. 외부 모델·서비스나 BI 로그인 없이 로컬에서만 실행한다.

`runtime_ready`는 실제 Rasa/BI 조회 경로에서 지원하는 정리 사례다. 개발 중인 별도 Fake Planner의 스키마로 변환하지 않고 NLU 학습에 포함한다. `needs_clarification`은 오타 제안처럼 사용자 확인을 기다리는 사례다. 잘못 기록된 모델 사용 이력은 원본 이벤트를 지우지 않고 `model_usage_retraction`으로 취소한다.
