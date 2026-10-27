"""Tune abstention on validation; test is reserved for the final report."""
import argparse
import json
from collections import Counter
from pathlib import Path

import joblib
from sklearn.metrics import accuracy_score, f1_score

from prepare_dataset import ROOT, write_json


def score(model, rows, task, threshold):
    if not rows:
        return {'samples': 0, 'accuracy': None, 'accepted': 0, 'coverage': 0, 'acceptedAccuracy': None}
    gold = [r['labels'][task] for r in rows]
    probabilities = model.predict_proba([r['text'] for r in rows])
    predictions = model.classes_[probabilities.argmax(axis=1)]
    accepted = probabilities.max(axis=1) >= threshold
    return {'samples': len(rows), 'accuracy': float(accuracy_score(gold, predictions)), 'macroF1': float(f1_score(gold, predictions, average="macro", zero_division=0)), 'accepted': int(accepted.sum()), 'coverage': float(accepted.mean()), 'acceptedAccuracy': float(accuracy_score([g for g, a in zip(gold, accepted) if a], predictions[accepted])) if accepted.any() else None, 'unseenGoldClasses': sorted(set(gold) - set(model.classes_)), 'predictions': [{'id': r['id'], 'gold': g, 'predicted': str(p), 'confidence': float(c), 'accepted': bool(a)} for r, g, p, c, a in zip(rows, gold, predictions, probabilities.max(axis=1), accepted)]}


def evaluate(model_dir):
    metadata = json.loads((model_dir / 'metadata.json').read_text(encoding='utf-8'))
    dataset = Path(metadata['dataset'])
    manifest = json.loads((dataset / 'manifest.json').read_text(encoding='utf-8'))
    rows = json.loads((dataset / 'dataset.json').read_text(encoding='utf-8'))
    # A hard guard against the same session or linked question crossing splits.
    group_splits = {}
    for r in rows:
        group_splits.setdefault(r['group'], set()).add(r['split'])
    assert all(len(s) == 1 for s in group_splits.values()), 'Group leakage'
    heads = {}
    for task in metadata['heads']:
        model = joblib.load(model_dir / (task + '.joblib'))
        val = [r for r in rows if r['split'] == 'validation' and task in r['labels']]
        test = [r for r in rows if r['split'] == 'test' and task in r['labels']]
        threshold = 1.01  # Disabled unless independent validation supports a threshold.
        for candidate in (.5, .6, .7, .8, .85, .9, .95, .99):
            metrics = score(model, val, task, candidate)
            if metrics['accepted'] >= 20 and metrics['acceptedAccuracy'] >= .95:
                threshold = candidate
                break
        train_labels = [r['labels'][task] for r in rows if r['split'] == 'train' and task in r['labels']]
        majority = Counter(train_labels).most_common(1)[0][0]
        heads[task] = {'threshold': threshold, 'routingEnabled': threshold <= 1, 'validation': score(model, val, task, threshold), 'test': score(model, test, task, threshold), 'majorityBaselineTestAccuracy': sum(r['labels'][task] == majority for r in test) / len(test) if test else None}
    report = {'run': metadata['run'], 'datasetVersion': metadata['datasetVersion'], 'data': manifest, 'heads': heads, 'skippedHeads': metadata['skipped'], 'thresholdPolicy': 'validation only: at least 20 accepted examples and >=95% observed accuracy; insufficient evidence disables routing', 'promotion': {'activated': False, 'eligible': False, 'reasons': ['Experimental dataset is too small for deployment evidence.', 'Full Plan construction and application integration are not implemented.']}, 'geminiComparison': {'available': False, 'reason': 'No matching independently reviewed Gemini labels for this held-out set; no API calls made.'}, 'previousModelComparison': {'available': False, 'reason': 'First linear-model candidate; majority baseline provided instead.'}}
    output = ROOT / 'training/reports' / metadata['run']
    write_json(output / 'evaluation.json', report)
    write_json(model_dir / 'routing.json', {task: {'threshold': v['threshold'], 'enabled': v['routingEnabled']} for task, v in heads.items()})
    lines = ['# 우사기 첫 선형 모델 배치 학습 결과', '', f"Run: {metadata['run']}", '', f"정답 주석 기반 표본 {manifest['samples']}건 (새 형식 확정 {manifest['explicitReviewSamples']}건, 과거 Codex 검토 주석 {manifest['legacyAnnotationSamples']}건).", '', f"분할: {manifest['splitCounts']}; 독립 그룹 {manifest['groups']}개.", '', '| 항목 | 학습 수 | validation 수 | test 수 | test 정확도 | 다수 클래스 기준 |', '|---|---:|---:|---:|---:|---:|']
    for task, head in heads.items():
        accuracy = head['test']['accuracy']
        baseline = head['majorityBaselineTestAccuracy']
        lines.append(f"| {task} | {metadata['heads'][task]['trainSamples']} | {head['validation']['samples']} | {head['test']['samples']} | {f'{accuracy:.1%}' if accuracy is not None else '평가 불가'} | {f'{baseline:.1%}' if baseline is not None else '평가 불가'} |")
    lines += ['', '실제 TF-IDF와 Logistic Regression 계수를 학습해 joblib 모델 파일로 저장했다. 카탈로그·별칭·답변 규칙은 변경하지 않았다.', '', '과거 주석은 사용자 직접 confirmed 데이터와 구분했다. 누락된 Plan 필드는 정답으로 추정하지 않았으며 legacy_operation은 구형 Plan의 aggregate/list 분류다. 신규 수식 operator와 구분한다.', '', '동일 세션, 연결 질문, 정규화 동일 및 유사 질문(문자 유사도 0.88 이상)은 같은 분할에 배치했다. 임계값·모델 선택에 test를 사용하지 않았다. 입력은 질문과 직전 질문 최대 2개이며 정답 Plan·답변은 입력하지 않았다.', '', '소량·편중 데이터이므로 이 정확도를 실제 서비스 성능으로 해석할 수 없다. 일부 클래스는 학습 또는 평가에 없을 수 있다. 전체 Plan 생성 능력을 평가한 결과가 아니다.', '', '검증 표본 부족으로 로컬 자동 처리 임계값은 비활성화했다. Gemini 및 기존 선형 모델과의 직접 비교 근거도 없다. 우사기는 기존 Gemini 경로를 계속 사용하며 이 모델을 자동 배포하지 않았다.']
    output.mkdir(parents=True, exist_ok=True)
    (output / 'REPORT.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    return report, output


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', type=Path, required=True)
    args = parser.parse_args()
    report, output = evaluate(args.model)
    print(json.dumps({'report': str(output), 'heads': {k: {s: v[s] for s in ('threshold', 'routingEnabled')} | {'testAccuracy': v['test']['accuracy'], 'testSamples': v['test']['samples']} for k, v in report['heads'].items()}}, ensure_ascii=False, indent=2))
