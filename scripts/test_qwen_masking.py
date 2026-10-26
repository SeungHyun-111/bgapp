"""Stdlib tests only: does not import torch, load models or train."""
import unittest
from qwen_train import json_spans, masked_tokens


class CharacterTokenizer:
    def apply_chat_template(self, messages, **kwargs):
        return '\n'.join(m['content'] for m in messages)

    def __call__(self, text, **kwargs):
        return {'input_ids': [ord(c) for c in text], 'attention_mask': [1] * len(text),
                'offset_mapping': [(i, i + 1) for i in range(len(text))]}


class MaskingTests(unittest.TestCase):
    def test_only_explicit_metric_tokens_receive_loss(self):
        sample = {'id': 'fixture', 'messages': [{'role': 'user', 'content': 'question'}],
                  'answer': {'action': 'new', 'patch': {'target': {'value': 'unconfirmed-brand'}, 'metrics': ['confirmed_metric']}},
                  'supervisedPaths': ['/patch/metrics/0']}
        row = masked_tokens(sample, CharacterTokenizer(), 2000)
        supervised = ''.join(chr(x) for x in row['labels'] if x != -100)
        self.assertEqual(supervised, '"confirmed_metric"')
        self.assertNotIn('unconfirmed-brand', supervised)

    def test_no_truncation_or_whole_plan_supervision(self):
        sample = {'id': 'fixture', 'messages': [{'role': 'user', 'content': 'question'}],
                  'answer': {'patch': {'metrics': ['metric']}}, 'supervisedPaths': ['/patch/metrics/0']}
        with self.assertRaises(ValueError):
            masked_tokens(sample, CharacterTokenizer(), 3)
        sample['supervisedPaths'] = ['/patch']
        with self.assertRaises(ValueError):
            masked_tokens(sample, CharacterTokenizer(), 2000)

    def test_escaped_pointers_and_values(self):
        text, spans = json_spans({'a/b': {'~key': '한글"value'}})
        a, b = spans['/a~1b/~0key']
        self.assertEqual(text[a:b], '"한글\\"value"')


if __name__ == '__main__':
    unittest.main()
