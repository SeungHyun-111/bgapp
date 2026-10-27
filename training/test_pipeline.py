import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import prepare_dataset as module


class PipelineTests(unittest.TestCase):
    def test_withdrawal_prevents_legacy_reuse_and_sessions_never_cross_splits(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'data/training').mkdir(parents=True)
            records, annotations = [], []
            for i, text in enumerate(('alpha request', 'bravo selection', 'charlie context', 'delta issue', 'echo answer', 'foxtrot question')):
                records.append({'id': str(i), 'input': text, 'conversationId': 'paired' if i < 2 else str(i)})
                annotations.append({'sourceId': str(i), 'input': text, 'category': 'ready', 'reviewedBy': 'curator', 'reviewBasis': 'checked', 'nluIntent': 'query'})
            records.append({'recordType': 'training_review_event', 'id': '5', 'status': 'incorrect', 'timestamp': '2026-10-27'})
            (root / 'data/conversation-history.jsonl').write_text('\n'.join(json.dumps(r) for r in records), encoding='utf-8')
            (root / 'data/training/annotations.json').write_text(json.dumps(annotations), encoding='utf-8')
            with patch.object(module, 'ROOT', root):
                with self.assertRaisesRegex(ValueError, 'three independent groups'):
                    module.prepare(False)
                target, manifest = module.prepare(True)
            rows = json.loads((target / 'dataset.json').read_text(encoding='utf-8'))
            byid = {r['id']: r for r in rows}
            self.assertNotIn('5', byid)
            self.assertEqual(byid['0']['split'], byid['1']['split'])
            self.assertEqual(manifest['explicitReviewSamples'], 0)
            self.assertEqual(set(r['split'] for r in rows), {'train', 'validation', 'test'})
            self.assertNotIn('gold', byid['0']['text'])

    def test_missing_patch_fields_are_not_negative_or_inferred_labels(self):
        labels = module.legacy_labels({'gold': {'action': 'modify', 'patch': {'target': {'kind': 'organization'}}}})
        self.assertNotIn('metric', labels)
        self.assertNotIn('legacy_operation', labels)
        self.assertEqual(labels['entityType'], '["organization"]')


if __name__ == '__main__':
    unittest.main()
