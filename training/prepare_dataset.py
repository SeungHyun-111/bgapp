"""Offline extraction. Never treats successful execution as a correct answer."""
import argparse
import hashlib
import json
import re
from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TASKS = ('intent', 'metric', 'operation', 'entityType', 'legacy_operation')


def read_jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding='utf-8-sig').splitlines() if line.strip()] if path.exists() else []


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def scalar_set(values):
    return json.dumps(sorted(set(values)), ensure_ascii=False) if isinstance(values, list) and all(isinstance(v, str) for v in values) else None


def explicit_labels(labels):
    labels = labels or {}
    return {k: v for k, v in {
        'intent': labels.get('intent'), 'metric': scalar_set(labels.get('metrics')),
        'operation': scalar_set(labels.get('operations')), 'entityType': scalar_set(labels.get('entityTypes')),
    }.items() if v is not None}


def legacy_labels(annotation):
    # Missing patch fields mean unknown, never negative labels or inherited guesses.
    labels = {}
    if annotation.get('nluIntent'):
        labels['intent'] = 'bi_query' if annotation['nluIntent'] == 'query' else annotation['nluIntent']
    patch = (annotation.get('gold') or {}).get('patch') or {}
    if 'metrics' in patch:
        labels['metric'] = scalar_set(patch['metrics'])
    if patch.get('operation'):
        labels['legacy_operation'] = patch['operation']
    if patch.get('target') and patch['target'].get('kind'):
        labels['entityType'] = scalar_set([patch['target']['kind']])
    return {k: v for k, v in labels.items() if v is not None}


def prepare(include_legacy=False, output=None):
    files = [ROOT / 'data/conversation-history.jsonl', ROOT / 'training/snapshots/rtdb-history.jsonl']
    raw = [row for file in files for row in read_jsonl(file)]
    records = {r.get('id') or r.get('turnId'): r for r in raw if isinstance(r.get('input'), str)}
    reviews = {}
    for r in sorted(raw, key=lambda r: (r.get('timestamp', ''), r.get('eventId', ''))):
        if r.get('recordType') == 'training_review_event':
            reviews[r['id']] = r
    samples, excluded = {}, Counter()
    for key, record in records.items():
        review = reviews.get(key)
        if review and review.get('status') in ('confirmed', 'corrected_confirmed') and review.get('finalPlan') and review.get('reviewer') and review.get('reason'):
            labels = explicit_labels(review.get('labels'))
            if labels:
                samples[key] = {'id': key, 'question': record['input'], 'labels': labels, 'provenance': 'explicit_training_review', 'reviewEventId': review.get('eventId')}
        else:
            excluded['no_explicit_confirmation'] += 1
    annotation_file = ROOT / 'data/training/annotations.json'
    annotations = json.loads(annotation_file.read_text(encoding='utf-8-sig')) if include_legacy and annotation_file.exists() else []
    for a in annotations:
        key = a.get('sourceId')
        if key in samples or key in reviews:
            continue  # Any explicit review, including withdrawal, overrides legacy annotations.
        source = records.get(key)
        if not source or source['input'] != a.get('input') or not a.get('reviewedBy') or not a.get('reviewBasis') or a.get('category') in ('duplicate', 'exclude', 'unreviewed'):
            excluded['legacy_ineligible'] += 1
            continue
        labels = legacy_labels(a)
        if labels:
            samples[key] = {'id': key, 'question': a['input'], 'labels': labels, 'provenance': 'legacy_codex_annotation', 'reviewer': a['reviewedBy'], 'reviewBasis': a['reviewBasis']}
        if a.get('contextFrom'):
            source = dict(source, annotationParent=a['contextFrom'])
            records[key] = source

    # Union full sessions and linked turns, even when an intermediate turn is unlabeled.
    parents = {key: key for key in records}
    def find(key):
        while parents[key] != key:
            parents[key] = parents[parents[key]]
            key = parents[key]
        return key
    def union(a, b):
        if a in parents and b in parents:
            x, y = find(a), find(b)
            parents[max(x, y)] = min(x, y)
    sessions, texts = {}, {}
    aliases = {r.get('turnId'): key for key, r in records.items() if r.get('turnId')}
    for key, r in records.items():
        session = r.get('conversationId')
        if session:
            if session in sessions:
                union(key, sessions[session])
            sessions[session] = key
        for field in ('parentTurnId', 'previousTurnId', 'annotationParent'):
            parent = r.get(field)
            union(key, aliases.get(parent, parent))
        norm = re.sub(r'\W+', '', r['input']).lower()
        for other, text in texts.items():
            if norm == text or (min(len(norm), len(text)) >= 8 and SequenceMatcher(None, norm, text).ratio() >= .88):
                union(key, other)
        texts[key] = norm

    rows = []
    for key, sample in sorted(samples.items()):
        record = records[key]
        previous = record.get('parentTurnId') or record.get('previousTurnId') or record.get('annotationParent')
        previous = aliases.get(previous, previous)
        context = []
        seen = {key}
        while previous in records and previous not in seen and len(context) < 2:
            seen.add(previous)
            prior = records[previous]
            context.insert(0, prior['input'])
            previous = prior.get('parentTurnId') or prior.get('previousTurnId') or prior.get('annotationParent')
            previous = aliases.get(previous, previous)
        # No answer, gold plan or predicted label is used as an input feature.
        sample.update(group=find(key), text='\n'.join(['context: ' + q for q in context] + ['question: ' + sample['question']]))
        rows.append(sample)
    groups = sorted({r['group'] for r in rows}, key=lambda g: hashlib.sha256(('usagi-v1:' + g).encode()).hexdigest())
    if len(groups) < 3:
        raise ValueError('Need at least three independent groups for train/validation/test')
    ntest = max(1, round(len(groups) * .2))
    nval = max(1, round(len(groups) * .2))
    splits = {g: 'test' if i < ntest else 'validation' if i < ntest + nval else 'train' for i, g in enumerate(groups)}
    for row in rows:
        row['split'] = splits[row['group']]
    body = json.dumps(rows, ensure_ascii=False, sort_keys=True).encode()
    version = hashlib.sha256(body).hexdigest()
    target = output or ROOT / 'training/datasets' / version[:16]
    write_json(target / 'dataset.json', rows)
    manifest = {'datasetVersion': version, 'sourceConversations': len(records), 'explicitReviewSamples': sum(r['provenance'] == 'explicit_training_review' for r in rows), 'legacyAnnotationSamples': sum(r['provenance'] == 'legacy_codex_annotation' for r in rows), 'samples': len(rows), 'groups': len(groups), 'splitCounts': dict(Counter(r['split'] for r in rows)), 'excludedReasons': dict(excluded), 'includeReviewedLegacy': include_legacy, 'splitPolicy': 'fixed hashed session/link/near-duplicate groups; no label-based seed search', 'sourceHashes': {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files + ([annotation_file] if include_legacy else []) if p.exists()}, 'labelCounts': {task: dict(Counter(r['labels'][task] for r in rows if task in r['labels'])) for task in TASKS}}
    write_json(target / 'manifest.json', manifest)
    return target, manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--include-reviewed-legacy', action='store_true')
    args = parser.parse_args()
    target, manifest = prepare(args.include_reviewed_legacy)
    print(json.dumps({'dataset': str(target), **manifest}, ensure_ascii=False, indent=2))
