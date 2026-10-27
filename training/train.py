"""Fit candidate weights on train only; never activate them in the app."""
import argparse
import json
from datetime import datetime

import joblib
import sklearn
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline

from prepare_dataset import ROOT, TASKS, write_json


def train(dataset):
    rows = json.loads((dataset / 'dataset.json').read_text(encoding='utf-8'))
    manifest = json.loads((dataset / 'manifest.json').read_text(encoding='utf-8'))
    run = datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    target = ROOT / 'training/models' / run
    target.mkdir(parents=True)
    heads, skipped = {}, {}
    for task in TASKS:
        examples = [r for r in rows if r['split'] == 'train' and task in r['labels']]
        labels = [r['labels'][task] for r in examples]
        if len(set(labels)) < 2:
            skipped[task] = {'reason': 'fewer_than_two_train_classes', 'trainSamples': len(examples)}
            continue
        model = make_pipeline(TfidfVectorizer(analyzer='char', ngram_range=(2, 5), sublinear_tf=True), LogisticRegression(C=1.0, max_iter=1000, random_state=42))
        model.fit([r['text'] for r in examples], labels)
        joblib.dump(model, target / (task + '.joblib'))
        heads[task] = {'trainSamples': len(examples), 'classes': model.classes_.tolist()}
    if not heads:
        raise ValueError('No head has enough labeled train classes')
    metadata = {'run': run, 'dataset': str(dataset), 'datasetVersion': manifest['datasetVersion'], 'algorithm': 'character TF-IDF (2..5) + LogisticRegression C=1', 'sklearnVersion': sklearn.__version__, 'heads': heads, 'skipped': skipped, 'activated': False}
    write_json(target / 'metadata.json', metadata)
    return target


if __name__ == '__main__':
    from pathlib import Path
    parser = argparse.ArgumentParser()
    parser.add_argument('--dataset', type=Path, required=True)
    args = parser.parse_args()
    print(train(args.dataset))
