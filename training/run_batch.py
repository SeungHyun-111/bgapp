"""One repeatable offline batch: prepare -> fit -> held-out evaluation."""
import argparse
from prepare_dataset import prepare
from train import train
from evaluate import evaluate

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--include-reviewed-legacy', action='store_true')
    args = parser.parse_args()
    dataset, manifest = prepare(args.include_reviewed_legacy)
    model = train(dataset)
    report, output = evaluate(model)
    print('Dataset:', dataset)
    print('Model:', model)
    print('Report:', output / 'REPORT.md')
    print('Split:', manifest['splitCounts'])
    for task, head in report['heads'].items():
        print(task, 'test accuracy:', head['test']['accuracy'], 'test samples:', head['test']['samples'], 'routing:', head['routingEnabled'])
