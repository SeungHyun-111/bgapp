# 우사기 최종 목표: 검증 로그 기반 로컬 ML과 배치 학습

작성일: 2026-10-27 (Asia/Seoul)

## 목표와 운영 원칙

우사기를 사용하는 동안 정답 데이터를 축적하고, 충분한 데이터가 쌓이면 오프라인에서 TF-IDF + Logistic Regression 또는 Linear SVM을 학습한다. 확신이 높은 질문만 로컬에서 처리하고 나머지는 Gemini에 맡긴다. 모든 실행 Plan은 기존 Validator와 BI 실행 검증을 통과해야 한다.

질문마다 즉시 학습하지 않는다. 별도의 상시 ML 서버나 GPU를 전제로 하지 않는다. Codex는 파이프라인 개발, 로그 정제, 배치 학습, 평가 및 모델 버전 관리를 담당한다.

## Gemini 가이드와 로컬 ML의 역할 및 충돌 처리

이 절은 로컬 모델을 앱에 탑재할 때 적용할 설계 원칙이다. 현재 실험 모델은 실행 경로에 연결하지 않았으므로 우사기는 Gemini 경로를 사용한다.

| 구성 요소 | 역할 |
|---|---|
| 공통 업무 규칙·카탈로그·Plan 계약 | 지표 정의, 조직명, 계산 방식, 허용 Plan의 기준 |
| 로컬 ML | 지원하는 범위에서 intent·metric 등을 예측 |
| Gemini 가이드 | 같은 업무 기준을 참고한 질문 해석, 확인 질문, Plan 생성 및 답변 표현 |
| 공통 Validator·실행기 | Plan 검증과 실제 BI 조회·계산 |
| 답변 생성 | 확정된 Plan과 실제 실행 결과를 바탕으로 설명 |

업무 정의와 실행 계약은 공통 기준으로 관리하고, Gemini 가이드와 로컬 Plan 구성기가 같은 버전을 사용하게 한다. 배치 학습은 모델의 가중치를 학습하는 작업이며 카탈로그·별칭·업무 정의를 자동 추가하거나 변경하는 작업이 아니다. 모델 예측이나 Gemini 답변을 근거로 공통 규칙을 자동 변경하지 않는다.

처리 경로는 하나의 Plan을 선택하여 공통 Validator로 전달한다. 로컬 모델의 신뢰도가 충분하고 지원 범위 안에서 완전한 Plan을 구성할 수 있을 때만 로컬 Plan을 사용한다. 그 외에는 질문과 필요한 문맥을 Gemini로 넘긴다. 모든 질문에 두 엔진을 병렬 호출하는 구조를 전제로 하지 않는다.

로컬 예측과 Gemini 해석의 불일치가 확인되면 서로 다른 엔진의 confidence 숫자를 직접 비교하여 높은 쪽을 실행하지 않는다. Gemini에 원래 질문·문맥과 불일치 정보를 전달하여 재해석을 맡기고, 의미가 여전히 모호하면 사용자에게 확인한다. Validator는 구조·카탈로그·실행 가능성을 검사하지만 사용자의 의도를 항상 판정할 수는 없다. 의미가 해결되지 않은 Plan은 실행하지 않는다.

Gemini의 한국어 말투·설명 가이드는 유지할 수 있다. 다만 결과 설명 단계에서 확정된 지표·대상·기간·계산식·수치를 임의로 바꾸지 않는다. 일반 대화와 확인 질문은 Gemini가 처리하고, 조회 결과의 수치는 실제 실행 결과를 사용한다. 답변 생성 방식을 바꾸더라도 이 원칙을 유지한다.

업무 정의나 Plan 계약이 변경되면 공통 규칙과 Gemini 가이드를 함께 점검한다. 영향을 받는 이전 모델의 로컬 처리는 중지하고 새 기준으로 재평가한 뒤 필요하면 재학습한다. 모델 메타데이터에는 학습 데이터 버전, 카탈로그 버전, Plan 계약 버전, 라벨 추출 규칙 버전을 남기고 실행 시 호환성을 확인한다. 이 호환성 검사와 자동 중지 기능은 후속 구현 대상이다.

불일치 사례는 질문·문맥, 엔진별 제안, 관련 버전, 확인 질문과 사용자 수정, 최종 확정 Plan 및 확인 근거를 연결해 기록한다. Gemini가 재해석했다는 이유만으로 `confirmed=true`로 만들지 않고 명시적인 정답 검토를 거쳐 다음 배치 학습에 사용한다.

탑재 전 우선 작업은 현재 Gemini 가이드와 카탈로그의 업무 규칙·답변 지침을 검토하고, 공통 기준과 각 구성 요소의 책임을 정리하는 것이다.

## 현재 구현: 미래 학습을 위한 로그

Gemini 처리 경로는 기존 저장소(로컬 JSONL 또는 RTDB)에 다음 정보를 저장한다.

- `id`, `turnId`, `conversationId`, `branchId`, `parentTurnId`: 대화 연결
- `question`, `context`, `pendingClarification`: 원래 질문과 질문 직전 분기 문맥
- `initialModelResponse`, `initialGeminiPlan`: 보정 전 최초 응답과 Plan
- `planRepairs`, `geminiPlan`: 검증 보정 과정과 최종 Gemini 제안
- `validator`, `execution`, 기존 실제 조회 조건·계산 결과·오류: 검증과 실행을 분리한 증거
- `candidatePlan`: 검증을 통과한 제안이며 아직 정답이 아님
- `finalAnswer`: 최종 사용자 응답
- `trainingSchemaVersion`, 기존 catalog/model/responseContract 버전: 해석 기준
- `finalPlan`, `labels`, `confirmed`, `confirmation`: 별도 검토로 확정할 정답

실행 성공, 오류 없음, 사용자 무응답, 기존 `review_event`의 검토 완료 표시는 정답 확정이 아니다. 신규 로그의 기본값은 `confirmed=false`, `finalPlan=null`, `labels=null`이다. 과거 로그에 없는 필드를 정답으로 추정해 채우지 않는다.

### 정답 검토 API

`QueryStore.reviewTraining({id, status, finalPlan, reason, reviewer, correction})`를 사용한다. RTDB 저장소도 상속하여 같은 방식으로 동작한다. 현재는 개발용 API이며 사용자용 검토 화면이나 자동 정답 판정은 구현하지 않았다.

상태는 `unreviewed`, `confirmed`, `corrected_confirmed`, `incorrect`, `excluded`이다. 정답 확정에는 명시적인 최종 Plan, 확인 근거, 검토자가 필요하며 수정 후 확정에는 수정 설명도 필요하다. 검토자는 최종 Plan과 결과가 질문에 맞는지 확인해야 한다. 이 API 자체가 BI 실행이나 의미 검증을 대신하지 않는다.

검토는 `training_review_event`로 추가 저장한다. 원본 로그와 이전 검토를 덮어쓰지 않으며, `conversations()`가 최신 검토를 합쳐 보여준다. 오답 처리나 제외로 확정을 철회할 수 있다. labels는 확정 Plan의 명시된 metric 참조, operator, target에서 추출한다. 복합 수식에는 단일 metric이 없을 수 있으며 필드 기반 수식의 의미를 임의로 분류하지 않는다. 실제 모델 학습 전에 항목별 정규화 기준을 정한다.

## 배치 학습 파이프라인 (첫 실험 구현 완료)

2026-10-27에 `training/`의 데이터 준비·TF-IDF + Logistic Regression 학습·평가 코드를 만들고 실제 배치 학습을 실행했다. 카탈로그를 추가하는 작업이 아니라 모델의 계수를 학습하는 작업이다. 아직 앱에 연결하거나 자동 배포하지 않았다.

첫 실험은 사용자 직접 confirmed 데이터가 아닌 과거 Codex 검토 주석을 명시적으로 허용하여 진행했다. 대상 71건을 대화·연결·유사 질문 그룹으로 나눈 결과 train 24건 / validation 7건 / test 40건이었다. intent test 정확도는 42.5%, metric은 test 2건에서 0%, 구형 operation은 test 2건에서 100%였다. 표본 부족으로 배포 근거가 되지 않는다. 신규 operation은 정답 데이터가 없고 entityType은 학습 클래스가 하나라 학습을 보류했다.

로컬 실험 보고서 경로: `training/reports/20261027-141838-982521/REPORT.md`. 로컬 모델·데이터·보고서는 git에서 제외하여 로컬에 보관한다. 코드와 아래 실행법으로 다시 생성할 수 있다.

```powershell
python -m venv .venv-training
.\.venv-training\Scripts\python.exe -m pip install -r training/requirements.txt
.\.venv-training\Scripts\python.exe training/snapshot_history.py
# 현재 첫 실험처럼 과거 검토 주석까지 포함할 때만 이 옵션 사용
.\.venv-training\Scripts\python.exe training/run_batch.py --include-reviewed-legacy
# 새 형식의 명시적 정답 확정 데이터만 사용하는 기본 실행
.\.venv-training\Scripts\python.exe training/run_batch.py
```

기본 실행에는 독립적인 정답 그룹이 최소 3개 필요하다. 아직 새 형식 정답 확정이 0건이므로 기본 실행은 학습을 거부한다. 과거 주석을 조용히 정답 확정으로 승격하지 않는다. 스냅샷 수집은 RTDB 읽기만 수행하며 학습·평가에서는 Gemini나 BI API를 호출하지 않는다.

완성해야 할 후속 기준:

1. 최신 검토가 `confirmed` 또는 `corrected_confirmed`인 로그만 추출한다. 원본 이벤트만 읽어 철회된 정답을 학습하지 않도록 한다.
2. 개인정보·인증정보를 점검하고 오류, 중복, 상충 라벨, 합성 데이터 및 지원하지 않는 Plan을 제외한다.
3. 연결된 대화, 동일·유사 질문은 같은 분할에 두어 train/validation/test 누수를 방지한다. 후속 질문에는 필요한 문맥을 입력으로 사용한다.
4. intent, metric, operation, entityType 등 범위가 명확한 항목부터 선형 모델을 학습한다. 엔티티 값·기간·복합 Plan 전체 생성을 자동 해결한다고 가정하지 않는다.
5. validation으로 confidence threshold를 조정하고 고정 test로 평가한다. Linear SVM의 점수를 곧바로 확률로 취급하지 않는다.
6. 같은 평가 데이터에서 기존 모델과 Gemini 기준 결과를 비교한다. 항목 정확도, Plan 일치율, 높은 신뢰도 구간의 정확도, 로컬 처리율, fallback 비율을 보고한다.
7. 사전에 정한 품질 기준을 만족할 때만 모델을 교체한다. 이전 모델, 데이터 버전·해시, 분할, 학습 설정, 보고서를 보관하여 롤백할 수 있게 한다.

300~500건은 첫 실험을 고려할 수 있는 예시이며 자동 학습·배포 기준이 아니다. 클래스별 데이터 수와 품질을 보고 시점을 정한다. 기존 Rasa/Qwen 학습 스크립트를 이 새 선형 모델 파이프라인이 완성된 것으로 간주하지 않는다.

현재 구조:

```text
training/
  prepare_dataset.py
  train.py
  evaluate.py
  run_batch.py
  snapshot_history.py
  models/
  reports/
```

## 최종 실행 흐름 (아직 미구현)

```text
질문 + 필요한 문맥
  → 로컬 선형 ML
  → 신뢰도와 완전한 Plan 구성 가능 여부 판단
      → 충분하면 로컬 Plan
      → 부족하면 Gemini Plan
  → 공통 Validator → BI 조회·계산 → 답변 → 로그

검증된 로그 축적 → 배치 정제·학습·평가 → 기준 충족 시 버전 교체
```

즉시 우선순위는 좋은 정답 로그를 만드는 것이다. 첫 학습·평가 파이프라인은 구현했으며, 품질 개선·모델 비교·배포와 로컬 fallback은 후속 작업으로 진행한다.
