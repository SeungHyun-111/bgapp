# 우사기 Qwen 교정·학습 경로

## 설계 기준

자연어 의미와 정정 대상은 Qwen이 판단한다. 코드에는 사용자 표현별 JS 분기나 문장→지표 대응표를 추가하지 않는다. 카탈로그는 업무 근거, 도구는 탐색 수단이며 검색 결과를 정답으로 자동 선택하지 않는다. 코드는 구조화된 상태 변경·검증·실행과 학습 작업 수명주기를 담당한다.

프롬프트는 역할·JSON/도구 계약·불명확한 경우의 행동·교정 근거 형식으로 줄였다. 확정 업무 정의는 카탈로그와 기존 `data/training/decisions.json`에서 제공한다. 방송횟수는 기존에 확인된 동일 방송일시 DISTINCTCOUNT 정의를 `catalog-additions.json`에 등록했고 범용 count_distinct 실행을 추가했다. 이것은 새로운 표현 규칙이 아니라 실행 능력의 확장이다.

## 실제 채팅 경로

`bi:command → chat-dialogue → QueryPlanner → Qwen / catalog tools → DialogueState → Validator → Executor`

개발 경로의 Executor는 여전히 **가짜 BI 데이터 전용**이다. 실 BI 검색 연결과 Planner의 실 BI 실행 완성은 다른 작업이다. 이번 변경은 BI 로그인이나 조회를 실행하지 않는다.

`searchCatalog`는 현재 로컬 Qwen이 지표/컬럼의 이름·별칭·업무 설명·정의·예시·확정 상태를 비교하는 의미 검색이다. 별도 임베딩 모델을 설치했다고 주장하지 않는다. 기존 문자열 검색도 탐색 도구로 남아 있다. 의미 검색 결과에는 후보와 이유만 있으며 코드가 최고 점수 지표를 선택하지 않는다. 검색 캐시는 학습이 아니다. 배치별 추가 로컬 모델 호출이 필요하므로 지연이 늘 수 있고, 실제 모델의 검색/대화 품질은 아직 재검증하지 않았다.

## 교정의 출처

모델 turn은 `interpretation.kind=correction`, `refersToTurnId`, `fields`를 반환한다. 각 field는 최종 plan의 scalar JSON pointer, 현재 사용자 발언의 정확한 인용, 출처를 가진다.

- `schemaValid`: 출력 형식이 맞음.
- `catalogValid`: 등록된 대상·지표·컬럼·집계와 실행 조건이 맞음.
- `userConfirmed`: Qwen이 사용자 명시적 정정으로 귀속한 필드이며 실제 사용자 인용이 있음.
- `confirmationBasis`: 위 출처를 Qwen이 귀속했다는 사실. 독립적인 의미 정답 검증으로 오해하지 않는다.
- `wholePlanUserConfirmed`: 항상 false. 추정한 다른 조건을 통째로 정답으로 올리지 않는다.

현재 대화 조건은 정상 plan이면 바로 수정·실행한다. 학습 큐는 실행 성공 표시나 침묵을 정답으로 사용하지 않는다. 정정 출처가 모호하면 마지막 발화를 임의로 원래 질문으로 삼지 않는다. `needs_context_review`로 기록해 자동 학습에서 제외한다. 원본 대화는 기존 `conversation-history.jsonl`에 유지하며 아래 큐는 학습용 파생 자료다.

## 파생 데이터와 상태 파일

`data/learning/corrections.jsonl`: 원래 질문·원래 상태·잘못된 해석·사용자 정정·수정 plan·확정된 leaf 필드·실제 추론 문맥·출처 turn ID. 승격 이력도 append-only record로 남긴다.

`status.json`, `last-attempt.json`, `worker.lock`: 학습 상태·실패 재시도·중복 worker 방지. 앱이 닫혀도 후보 작업을 운영 모델과 분리한다. 재시작 시 살아 있는 worker는 중복 실행하지 않고, 완료된 후보가 있으면 승격을 재개한다.

`active-model.json`, `previous-model.json`, `last-rollback.json`: 활성/이전 모델과 복원 기록. 기존 GGUF를 덮어쓰거나 삭제하지 않고 버전별 파일과 manifest를 바꾼다. 현재 대화 요청이 끝난 뒤에만 교체한다.

## 실제 추가학습 코드

`dataset-builder.js`는 원래 질문과 정정 후속 발화 쌍을 함께 묶는다. 동일한 질문/이전 상태는 대화 ID가 달라도 같은 그룹이다. 고정 hash bucket으로 train/holdout을 분리하여 후속 쌍이나 반복 질문이 양쪽에 들어가지 않도록 한다. 의미가 같은 모든 패러프레이즈의 중복까지 자동 판별한다고 주장하지 않는다.

`scripts/qwen_train.py`는 로컬 원본 Qwen을 Transformers로 로드하고 PEFT LoRA 또는 bitsandbytes QLoRA를 실제 학습한다. 전체 teacher JSON을 문맥으로 사용할 수 있지만 **명시적으로 고친 값 토큰에만 label을 주고 나머지는 -100으로 마스킹**한다. 경계를 넘어 다른 값까지 포함하는 토큰은 제외한다. 길이 초과 샘플을 조용히 잘라 교정이 사라지게 하지 않고 작업을 중단한다. adapter의 실제 가중치 변화량이 0이면 실패한다. 원본 모델에는 저장하지 않는다.

`run-qwen-learning-job.js`:

1. 전용 Python의 패키지 존재 확인. 자동 설치/다운로드 없음.
2. 고정 원본에서 별도 LoRA/QLoRA adapter 학습.
3. 원본 비양자화 모델 + adapter 병합.
4. 같은 llama.cpp 소스의 converter로 F16 GGUF 변환.
5. 기존 `llama-quantize.exe`로 Q4_K_M 후보 생성.
6. 현재 GGUF와 후보 GGUF를 각각 별도 loopback 서버에서 순차 평가. BI는 Fake Executor만 사용.
7. 기존 회귀 세트·학습 교정 재현·독립 holdout·실제 후속 발화에서 상태 보존을 평가.
8. 이전에 통과한 사례의 퇴행이 없고, 교정 재현/holdout이 통과하며 실제 개선이 있어야 승격 후보 기록.

학습 재현 점수와 독립 평가 점수는 구분한다. 비어 있는 평가나 scripted 응답을 실제 모델 평가로 인정하지 않는다. 기존 curated 회귀 세트는 업무 정의와 최신 정책에 맞는지 유지 관리해야 하고, 작은 세트의 통과가 일반적인 대화 정확도를 보장하지 않는다.

`promotion.js`는 후보 해시·실제 학습 변화·평가 통과·평가 당시 활성 모델 일치를 확인하고, Qwen 로드/구조화 응답 canary 후 활성 manifest를 바꾼다. 실패하면 이전 파일을 다시 로드하고 pointer를 복원한다. 파일을 버전별로 보존하므로 기존 GGUF 자체는 변하지 않는다. 이 자동 복원은 승격 실패에 대한 복원이며, 나중의 모든 의미 오류를 자동 탐지한다는 뜻은 아니다.

## 현재 실행 상태와 필요한 준비

코드 경로를 구현했지만 **실제 Qwen 추가학습이나 후보 GGUF 생성·승격을 실행한 것은 아니다.** 실제 모델을 다시 질문 테스트하지도 않았다. 오프라인 검사는 scripted provider/가짜 데이터/가짜 모델 파일로 상태·마스킹·큐·승격 차단과 복원을 확인한다.

자동 학습은 기본 비활성이다. 교정 수집은 별도로 동작한다. `.env.example`의 다음 항목을 준비한 뒤에 활성화해야 한다.

- `QWEN_TRAINING_MODEL_PATH`: 이미 반입한 원본 모델 디렉터리.
- `QWEN_TRAINING_PYTHON`: **Rasa와 분리된** Qwen 학습 가상환경 Python.
- `LLAMA_CPP_DIR`: 변환 스크립트/gguf-py를 가진 로컬 llama.cpp 소스. 현재 runtime 바이너리 폴더와 다르다.
- `QWEN_AUTO_TRAIN=true`: 학습 실행 활성화. 현재는 false/미설정 상태로 유지한다.

학습 패키지 제약은 `requirements-qwen.in`에만 기록했으며 설치/검증된 lock으로 표시하지 않는다. 이 PC의 Intel XPU 학습 호환성과 메모리 요구량은 실제로 확인되지 않았다. 기본 사전 조건은 최소 10개 독립 교정 문맥, 고정 holdout 최소 2개, 여유 RAM 6GiB, 디스크 20GiB이며 이는 성공 보장이 아닌 실행 전 최소 차단 조건이다. 실패한 동일 데이터는 매분 반복 학습하지 않는다. 환경 문제를 고친 후 의도적으로 `QWEN_RETRY_TOKEN`을 변경하면 재시도할 수 있다.

```powershell
pnpm run qwen:learning:status  # 읽기 전용 상태 조회
pnpm run qwen:learning:test   # 모델/학습/BI 호출 없는 오프라인 검사
pnpm run qwen:mask-test       # 표준 라이브러리만 쓰는 마스킹 검사
```

주요 파일은 `src/learning/`, `src/planner/semantic-catalog.js`, `catalog-loader.js`, `scripts/qwen_train.py`, `evaluate-qwen-candidate.js`, `run-qwen-learning-job.js`다. Rasa의 `src/commands/learning-loop.js`는 이 경로에 재사용하지 않는다.
