# 로컬 Qwen 실행기·지연 조치 — 2026-10-26

## 실제 하드웨어

- Intel Core Ultra 5 125H, 물리 14코어 / 논리 18스레드.
- 시스템 RAM 16,728,895,488바이트(약 15.58GiB).
- GPU: Intel Arc 내장 그래픽. dxdiag 전용 메모리 128MB, 공유 메모리 9,093MB. WMI AdapterRAM의 약 2GB 값을 전용 VRAM으로 해석하지 않았다.
- 기존 b11829 CPU 실행기의 --list-devices: none. CPU 옵션만 바꿔서는 GPU를 사용할 수 없었다.

## 실행기 교체

공식 ggml-org/llama.cpp 릴리스의 기존 실행기와 같은 b11829 Windows x64 Vulkan 패키지를 D드라이브에 받았다.

- 원본: https://github.com/ggml-org/llama.cpp/releases/tag/b11829
- 파일: llama-b11829-bin-win-vulkan-x64.zip (36,876,542바이트).
- GitHub 공개 digest와 다운로드 SHA-256 일치: 839ff55ce9cbee6a099b403b640ca6b694ee5d74b815e39f77fc5d2b20962f0d.
- 설치 경로: data/llm/runtime-vulkan-b11829. 실행기와 DLL만 사용하며, 새 모델·드라이버·oneAPI·외부 API는 추가하지 않았다.
- 기존 data/llm/runtime CPU 실행기는 그대로 남겼다.
- .env의 LOCAL_LLM_RUNTIME_DIR로 새 실행기를 선택했다. 바이너리와 .env는 Git 추적 대상이 아니다.
- Vulkan 실행기의 실제 결과: Vulkan0: Intel(R) Arc(TM) Graphics (9093 MiB, 8383 MiB free).
- SYCL Windows 공식 패키지도 존재하지만 Vulkan이 장치를 인식해 추가 패키지를 설치할 필요가 없었다.

GPU 설정은 device=Vulkan0, gpu-layers=auto, fit=on, fit-target=1024MiB다. 99층처럼 고정하지 않고 실행기 메모리 예산에 따라 배치한다. 실제 프로세스 GPU 공유 메모리 2,258,092,032바이트(약 2.10GiB)를 확인했다. 최종 앱의 verbosity 4 로그에서 `offloaded 29/29 layers to GPU`를 확인했다. 모델 GPU 버퍼 1050.43MiB, GPU KV 버퍼 896MiB, GPU compute 버퍼 15MiB다.

GPU 시작 실패에만 기존 CPU 실행기로 한 차례 재시도하며 이유를 기록한다. Qwen 의미 해석을 Rasa/Fake로 우회하지 않는다.

## CPU·메모리 설정

- 생성 threads=8, 입력 처리 threads-batch=12. 논리 18스레드 전체를 점유하지 않고 여유를 남겼다.
- batch=256, ubatch=128, parallel=1. prompt cache RAM은 256MiB로 제한한다.
- context=8192 유지. 입력 계약·현재 BI 상태·카탈로그 후보가 필요하므로 잘림을 확인하지 않은 임의 축소는 하지 않았다.
- 단순 대화 입력은 실제 측정 141토큰이었다. 대화 입구에서 전체 BI 스키마/카탈로그를 읽히지 않도록 분리했다.
- 모델은 기본적으로 idle 자동 종료 없이 상주하고 앱 종료·명시적 모델 교체 시 종료한다.
- 실제 GPU 서버 Working Set은 약 2.39GB→2.41GB였다. Electron 여러 프로세스의 Working Set 합계는 약 1.38GB였다. 공유 GPU 메모리를 이 숫자에 단순 합산하면 안 된다. 짧은 두 번의 요청만으로 장기 메모리 누수를 판정하지 않았다.

## 기동/추론/준비 단계

앱 UI는 먼저 시작하고 setImmediate에서 비동기로 모델을 준비한다. 동시 start 요청은 동일 promise를 기다린다.
서버 기동 90초와 모델 ready 이후 추론 90초는 별도 예산이다. 대화 전체 요청 타이머도 준비 완료 뒤 시작한다.
초기 GPU 입력 비용을 사용자 질문에 전가하지 않도록, 대화 입구의 실제 프롬프트와 짧은 출력을 앱 시작 준비 단계에서 한 번 처리한다. 이 출력은 사용자 대화나 학습 정답으로 저장하지 않는다.
추론 timeout은 현재 HTTP 요청만 abort하고 /health를 확인한다. 건강한 서버는 유지하며, 응답 불능일 때만 종료해 다음 시작에서 복구한다.

오류는 MODEL_STARTUP_TIMEOUT / MODEL_PROCESS_EXIT / MODEL_FILE_NOT_FOUND / MODEL_BACKEND_ERROR / MODEL_HEALTH_TIMEOUT / INFERENCE_TIMEOUT / INFERENCE_HTTP_ERROR / INVALID_MODEL_RESPONSE로 구분한다.
data/llm/lifecycle.jsonl과 runtime.log에 준비·spawn·ready·추론 시작·첫 응답·첫 내용 토큰·완료를 기록한다. 각 로그는 크기를 제한하고 API key는 가린다.
SSE streaming으로 첫 토큰 시점을 관측한다. 사용자 UI에 개발 로그를 그대로 출력하지 않는다.

## 실제 실행 측정과 한계

기존 실패는 모델 경로가 기록된 뒤 90초 동안 HTTP 완료 응답을 못 받은 INFERENCE 단계였다. 모델 파일을 못 올렸다는 근거는 없다. 당시 로그는 실행기 출력을 버렸으므로 원래 요청의 prefill/decoding/구조화 출력 비용을 더 세분할 수는 없다.

Vulkan 실제 서버와 실제 LocalLlmClient/대화 코드로 일반 질문만 실행했다. BI는 호출하지 않았다. 모의 모델/가짜 답변은 사용하지 않았다.

| 측정 | 결과 |
| --- | --- |
| 처음 Vulkan 기동 준비 | 49.111초 |
| 첫 일반 질문 “야” | 40.632초 (입력 처리 37.408초, 생성 2.786초) |
| 같은 PID의 후속 질문 | 2.399초 (입력 처리 0.867초, 생성 1.492초) |
| 이후 앱 재시작의 모델 ready | 8.384초 |
| 이후 앱 시작 시 대화 입구 준비 | 3.009초 |
| 최종 앱 재시작 모델 ready | 7.038초 |
| 최종 앱 재시작 대화 입구 준비 | 2.705초 |

마지막 앱은 모델 ready와 대화 입구 준비 완료 로그를 확인했다. 최초 Vulkan 컴파일/캐시 비용은 처음 한 번 여전히 클 수 있으며, 모든 BI 질문이 2.4초라는 의미는 아니다. 실제 PC 부하·후보 검색·BI 조회에 따라 추가 시간이 든다.
UI 자동화 helper가 클릭/캡처 중 간헐적으로 timeout을 일으켜, 화면에서 실제 입력 버튼까지 끝까지 자동 검증했다는 주장은 하지 않는다. 대신 실제 앱 소유의 같은 GPU 서버를 공유해 실제 대화 코드의 응답을 확인했다.
움직이는 펫 창에서는 `window bounds changed`도 발생했다. GUI 입력은 사용자 직접 확인이 남아 있으며, 모델의 실제 답변 성공과 구분한다.

말하기 버튼은 응답 내내 잠그지 않는다. 보낸 말을 즉시 대화에 표시하고 후속 메시지를 계속 입력할 수 있으며, 서버 큐가 순서를 유지한다. 각 요청의 결과·시간은 requestId별로 갱신한다.

## 변경 파일

- llm-runtime.js, local-llm-client.js, llm-stream.js: 실행기 선택/메모리 설정, lifecycle, SSE, timeout, 진단 로그.
- conversation-context.js, conversation-orchestrator.js, chat-dialogue.js: 작은 일반 대화 입구, 비동기 사전 준비와 별도 추론 budget.
- renderer/power-bi.js: 말하기 잠금 제거와 요청별 대기/결과.
- power-bi.js: 바깥 클릭 자동 닫힘 제거, 캐릭터 재클릭 닫기, 다시 열 때 내용 보존.
- .env.example: 설치된 실행기/threads/context 설정 예시.

새 Qwen/GGUF 다운로드, 기존 모델 교체·삭제, 학습 실행, 실제 BI 로그인/조회는 하지 않았다.
