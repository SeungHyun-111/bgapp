# Local Qwen chat path

`src/main.js` loads the ignored `.env` file. Process environment variables take precedence.

```ini
USE_LLM_PLANNER=true
LOCAL_LLM_MODEL_PATH=<absolute local GGUF path>
LOCAL_LLM_PORT=8080
```

With the flag enabled, the existing `bi:command` IPC handler uses:

`createCommandSystem → chat-dialogue → QueryPlanner → LocalLlmClient → catalog tools → applyTurn → validatePlan → synthetic executor → reply`

The search field retains its existing BI search behavior. The **talk field** uses the local planner. Rasa remains available when the flag is false. Rasa automatic training is paused while the planner flag is enabled, avoiding two model engines competing for memory.

The client starts the local `data/llm/runtime/llama-server.exe`, binds only to loopback, uses an ephemeral authentication key, and runs offline. There is no remote model/API fallback. `LLAMA_SERVER_URL` optionally selects a separately managed loopback server. The owned server stops after five idle minutes or app exit.

## Execution boundary

This development path executes **synthetic fixtures only**, explicitly marked in every result. It never invokes the Power BI bridge. It does not constitute live BI integration or a new trained model. Opaque measures and undefined business metrics are not fabricated.

The planner discovers local metadata with `searchMetrics`, `searchColumns`, `getMetricDefinition`, `searchTargets`, and `getAvailableAggregations`. A compact verified bootstrap supplies common IDs; the full 127-column/153-metric catalog is not put into every prompt. Targets are optional. No downstream keyword parser overrides a generated plan.

`share` composes registered sum metrics and typed filters:

```json
{
  "numerator": {"metric":"weighted_minutes", "filters":[]},
  "denominator": {"metric":"weighted_minutes", "filters":[], "groupBy":[]}
}
```

Both sides require valid bounded date ranges. Numerator rows also respect the main plan filters, target and output grouping. Denominator rows are independently selected from all fixture rows with its own filters and grouping subset. Without an explicit share specification, shares use same-period totals across organizations, brands and types, preserving time buckets only. A zero denominator returns null.

Modifications patch state without re-reading the text in JS. Changing date filters preserves unrelated filter fields. Unknown targets/columns/metrics and invalid operators/dates are rejected before execution. A failed plan leaves the preceding accepted state intact. Clarification can retain partial conditions.

`chat-dialogue.js` appends one record per chat turn to `data/conversation-history.jsonl`, including question, previous state, compact catalog context/tool results, full local raw responses, predicted plan, validation, executed plan, clarification, final answer and errors. Authentication-looking input is blocked before inference/logging. These are training candidates, not automatically accepted ground truth.

## Verification

```sh
node --test scripts/test-bi-planner.js scripts/test-planner-integration.js scripts/test-commands.js
node scripts/check-real-planner.js
```

The second command runs the actual local model through the same command adapter used by talk IPC, with synthetic execution. Verification history is separate under `data/llm/verification/`; model outputs and timings are in `data/llm/real-planner-check.json`. It does not authenticate to BI. Review the actual output; infrastructure tests alone do not prove interpretation accuracy.

`주문금액` currently has no approved mapping in this catalog. A focused clarification is required; substituting `orders` (quantity) or `sales` (expected sales volume) would be an incorrect business assumption.
